import { randomUUID } from "node:crypto";
import type {
  Agent, AgentSkill, Task, TaskStatus, UsageRecord,
  Workflow, WorkflowStep, WorkflowRun, WorkflowStepRun, DiscoveryResult,
} from "./types.js";

const PLATFORM_FEE_RATE = 0.10; // 10% cut on every transaction

export class Marketplace {
  agents = new Map<string, Agent>();
  tasks = new Map<string, Task>();
  workflows = new Map<string, Workflow>();
  workflowRuns = new Map<string, WorkflowRun>();
  usage: UsageRecord[] = [];

  // ─── Agent Registry ──────────────────────────────────────────────────────

  registerAgent(name: string, skills: Omit<AgentSkill, "avg_latency_ms" | "calls_completed">[], opts?: { endpoint?: string; deposit?: number }): Agent {
    const agent: Agent = {
      id: `agent_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      name,
      endpoint: opts?.endpoint ?? null,
      skills: skills.map((s) => ({ ...s, avg_latency_ms: 0, calls_completed: 0 })),
      credits: opts?.deposit ?? 0,
      reputation: 50,
      status: "online",
      created_at: new Date().toISOString(),
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id) ?? null;
  }

  listAgents(filter?: { status?: string; skill?: string }): Agent[] {
    let list = [...this.agents.values()];
    if (filter?.status) list = list.filter((a) => a.status === filter.status);
    if (filter?.skill) list = list.filter((a) => a.skills.some((s) => s.name === filter.skill));
    return list;
  }

  updateAgentStatus(agentId: string, status: Agent["status"]): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    agent.status = status;
    return agent;
  }

  addCredits(agentId: string, amount: number): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    agent.credits += amount;
    this.usage.push({
      id: randomUUID(),
      agent_id: agentId,
      task_id: "",
      skill: "",
      credits: amount,
      type: "deposit",
      timestamp: new Date().toISOString(),
    });
    return agent;
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  discover(query: string, opts?: { maxResults?: number; minReputation?: number; maxPrice?: number }): DiscoveryResult[] {
    const terms = query.toLowerCase().split(/\s+/);
    const results: DiscoveryResult[] = [];
    const minRep = opts?.minReputation ?? 0;
    const maxPrice = opts?.maxPrice ?? Infinity;

    for (const agent of this.agents.values()) {
      if (agent.status !== "online") continue;
      if (agent.reputation < minRep) continue;

      for (const skill of agent.skills) {
        if (skill.price_per_call > maxPrice) continue;

        // Score: how well does this skill match the query?
        const haystack = `${skill.name} ${skill.description} ${skill.tags.join(" ")}`.toLowerCase();
        let hits = 0;
        for (const term of terms) {
          if (haystack.includes(term)) hits++;
        }
        if (hits === 0) continue;

        const relevance = hits / terms.length;
        // Composite score: relevance * reputation weight * price efficiency
        const score = relevance * (agent.reputation / 100) * (1 / (1 + skill.price_per_call * 0.01));
        results.push({ agent, skill, score: Math.round(score * 1000) / 1000 });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, opts?.maxResults ?? 20);
  }

  // ─── Task Delegation ─────────────────────────────────────────────────────

  createTask(fromAgentId: string, skill: string, input: any, toAgentId?: string): Task {
    const from = this.agents.get(fromAgentId);
    if (!from) throw new Error(`Agent ${fromAgentId} not found`);

    // Auto-discover if no target specified
    let targetId = toAgentId ?? null;
    let price = 0;

    if (targetId) {
      const target = this.agents.get(targetId);
      if (!target) throw new Error(`Agent ${targetId} not found`);
      const sk = target.skills.find((s) => s.name === skill);
      if (!sk) throw new Error(`Agent ${targetId} doesn't have skill "${skill}"`);
      price = sk.price_per_call;
    } else {
      // Find best available agent
      const found = this.discover(skill, { maxResults: 1 });
      if (found.length === 0) throw new Error(`No agent found with skill "${skill}"`);
      targetId = found[0].agent.id;
      price = found[0].skill.price_per_call;
    }

    // Check balance (caller needs enough credits)
    const totalCost = price;
    if (from.credits < totalCost) {
      throw new Error(`Insufficient credits: need ${totalCost}, have ${from.credits}`);
    }

    // Escrow: deduct from caller immediately
    from.credits -= totalCost;

    const task: Task = {
      id: `task_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      from_agent: fromAgentId,
      to_agent: targetId,
      skill,
      input,
      status: "pending",
      result: null,
      error: null,
      cost: price,
      platform_fee: Math.round(price * PLATFORM_FEE_RATE * 100) / 100,
      created_at: new Date().toISOString(),
      claimed_at: null,
      completed_at: null,
    };

    this.tasks.set(task.id, task);

    // Record charge
    this.usage.push({
      id: randomUUID(),
      agent_id: fromAgentId,
      task_id: task.id,
      skill,
      credits: -totalCost,
      type: "charge",
      timestamp: new Date().toISOString(),
    });

    return task;
  }

  /** Provider agent claims a pending task */
  claimTask(taskId: string, agentId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "pending") throw new Error(`Task ${taskId} is ${task.status}, not pending`);
    if (task.to_agent !== agentId) throw new Error(`Task ${taskId} is not assigned to ${agentId}`);

    task.status = "running";
    task.claimed_at = new Date().toISOString();

    const agent = this.agents.get(agentId);
    if (agent) agent.status = "busy";

    return task;
  }

  /** Provider completes a task with result */
  completeTask(taskId: string, result: any): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "running" && task.status !== "claimed") {
      throw new Error(`Task ${taskId} is ${task.status}, cannot complete`);
    }

    task.status = "completed";
    task.result = result;
    task.completed_at = new Date().toISOString();

    // Pay provider (cost minus platform fee)
    const provider = this.agents.get(task.to_agent!);
    if (provider) {
      const earning = task.cost - task.platform_fee;
      provider.credits += earning;
      provider.status = "online";

      // Update skill stats
      const sk = provider.skills.find((s) => s.name === task.skill);
      if (sk) {
        sk.calls_completed++;
        const elapsed = Date.now() - new Date(task.claimed_at!).getTime();
        sk.avg_latency_ms = sk.calls_completed === 1
          ? elapsed
          : Math.round((sk.avg_latency_ms * (sk.calls_completed - 1) + elapsed) / sk.calls_completed);
      }

      // Boost reputation (small increment per success, capped at 100)
      provider.reputation = Math.min(100, provider.reputation + 1);

      this.usage.push({
        id: randomUUID(),
        agent_id: provider.id,
        task_id: taskId,
        skill: task.skill,
        credits: earning,
        type: "earning",
        timestamp: new Date().toISOString(),
      });
    }

    // Record platform fee
    this.usage.push({
      id: randomUUID(),
      agent_id: "platform",
      task_id: taskId,
      skill: task.skill,
      credits: task.platform_fee,
      type: "fee",
      timestamp: new Date().toISOString(),
    });

    return task;
  }

  /** Provider fails a task — refund the caller */
  failTask(taskId: string, error: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = "failed";
    task.error = error;
    task.completed_at = new Date().toISOString();

    // Refund caller
    const caller = this.agents.get(task.from_agent);
    if (caller) caller.credits += task.cost;

    // Ding provider reputation
    const provider = task.to_agent ? this.agents.get(task.to_agent) : null;
    if (provider) {
      provider.reputation = Math.max(0, provider.reputation - 2);
      provider.status = "online";
    }

    return task;
  }

  getTask(taskId: string): Task | null {
    return this.tasks.get(taskId) ?? null;
  }

  /** Get pending tasks for a provider agent */
  getPendingTasks(agentId: string): Task[] {
    return [...this.tasks.values()].filter(
      (t) => t.to_agent === agentId && t.status === "pending"
    );
  }

  // ─── Billing / Metering ──────────────────────────────────────────────────

  getBalance(agentId: string): number {
    return this.agents.get(agentId)?.credits ?? 0;
  }

  getUsage(agentId: string, since?: string): UsageRecord[] {
    let records = this.usage.filter((u) => u.agent_id === agentId);
    if (since) {
      const cutoff = new Date(since).getTime();
      records = records.filter((u) => new Date(u.timestamp).getTime() >= cutoff);
    }
    return records;
  }

  getBilling(agentId: string): {
    balance: number;
    total_earned: number;
    total_spent: number;
    total_fees_paid: number;
    tasks_completed: number;
    tasks_delegated: number;
  } {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const records = this.usage.filter((u) => u.agent_id === agentId);
    const earned = records.filter((u) => u.type === "earning").reduce((s, u) => s + u.credits, 0);
    const spent = records.filter((u) => u.type === "charge").reduce((s, u) => s + Math.abs(u.credits), 0);

    const completed = [...this.tasks.values()].filter((t) => t.to_agent === agentId && t.status === "completed").length;
    const delegated = [...this.tasks.values()].filter((t) => t.from_agent === agentId).length;

    return {
      balance: agent.credits,
      total_earned: earned,
      total_spent: spent,
      total_fees_paid: Math.round(spent * PLATFORM_FEE_RATE * 100) / 100,
      tasks_completed: completed,
      tasks_delegated: delegated,
    };
  }

  /** Platform revenue: sum of all fees collected */
  getPlatformRevenue(): { total_fees: number; total_transactions: number } {
    const fees = this.usage.filter((u) => u.agent_id === "platform" && u.type === "fee");
    return {
      total_fees: fees.reduce((s, u) => s + u.credits, 0),
      total_transactions: fees.length,
    };
  }

  // ─── Workflows ───────────────────────────────────────────────────────────

  defineWorkflow(owner: string, name: string, steps: Omit<WorkflowStep, "id">[]): Workflow {
    if (!this.agents.has(owner)) throw new Error(`Agent ${owner} not found`);

    const workflow: Workflow = {
      id: `wf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name,
      owner,
      steps: steps.map((s, i) => ({ ...s, id: `step_${i}` })),
      created_at: new Date().toISOString(),
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  getWorkflow(id: string): Workflow | null {
    return this.workflows.get(id) ?? null;
  }

  /** Start a workflow run — creates tasks for each step sequentially */
  startWorkflowRun(workflowId: string, input: any): WorkflowRun {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    const run: WorkflowRun = {
      id: `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      workflow_id: workflowId,
      status: "running",
      input,
      output: null,
      steps: wf.steps.map((s) => ({
        step_id: s.id,
        task_id: null,
        status: "pending",
        output: null,
      })),
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    this.workflowRuns.set(run.id, run);

    // Kick off first step
    this._advanceWorkflow(run, wf, input);
    return run;
  }

  getWorkflowRun(runId: string): WorkflowRun | null {
    return this.workflowRuns.get(runId) ?? null;
  }

  /** Called after a task completes to advance the workflow to the next step */
  advanceWorkflow(runId: string): WorkflowRun {
    const run = this.workflowRuns.get(runId);
    if (!run) throw new Error(`Workflow run ${runId} not found`);
    const wf = this.workflows.get(run.workflow_id)!;

    // Find current step
    const currentIdx = run.steps.findIndex((s) => s.status === "running");
    if (currentIdx === -1) return run;

    const currentStep = run.steps[currentIdx];
    const task = currentStep.task_id ? this.tasks.get(currentStep.task_id) : null;

    if (!task || task.status === "running" || task.status === "pending" || task.status === "claimed") {
      return run; // still in progress
    }

    if (task.status === "failed") {
      currentStep.status = "failed";
      run.status = "failed";
      run.completed_at = new Date().toISOString();
      return run;
    }

    if (task.status === "completed") {
      currentStep.status = "completed";
      currentStep.output = task.result;

      // Is there a next step?
      const nextIdx = currentIdx + 1;
      if (nextIdx >= wf.steps.length) {
        // Workflow done
        run.status = "completed";
        run.output = task.result;
        run.completed_at = new Date().toISOString();
        return run;
      }

      // Build input for next step
      const nextStepDef = wf.steps[nextIdx];
      const nextInput = this._resolveInputMap(nextStepDef.input_map, run);
      this._createStepTask(run, wf, nextIdx, nextInput);
    }

    return run;
  }

  private _advanceWorkflow(run: WorkflowRun, wf: Workflow, input: any): void {
    const stepDef = wf.steps[0];
    const resolvedInput = Object.keys(stepDef.input_map).length > 0
      ? this._resolveInputMap(stepDef.input_map, run)
      : input;
    this._createStepTask(run, wf, 0, resolvedInput);
  }

  private _createStepTask(run: WorkflowRun, wf: Workflow, stepIdx: number, input: any): void {
    const stepDef = wf.steps[stepIdx];
    const stepRun = run.steps[stepIdx];

    try {
      const task = this.createTask(wf.owner, stepDef.skill, input, stepDef.agent ?? undefined);
      stepRun.task_id = task.id;
      stepRun.status = "running";
    } catch (err: any) {
      stepRun.status = "failed";
      run.status = "failed";
      run.completed_at = new Date().toISOString();
    }
  }

  private _resolveInputMap(inputMap: Record<string, string>, run: WorkflowRun): any {
    const result: Record<string, any> = {};
    for (const [key, ref] of Object.entries(inputMap)) {
      if (ref.startsWith("$input.")) {
        const field = ref.slice(7);
        result[key] = run.input?.[field];
      } else if (ref.startsWith("$prev.")) {
        const field = ref.slice(6);
        const lastCompleted = [...run.steps].reverse().find((s) => s.status === "completed");
        result[key] = lastCompleted?.output?.[field];
      } else if (ref === "$prev") {
        const lastCompleted = [...run.steps].reverse().find((s) => s.status === "completed");
        result[key] = lastCompleted?.output;
      } else if (ref === "$input") {
        result[key] = run.input;
      } else {
        result[key] = ref; // literal
      }
    }
    return result;
  }
}
