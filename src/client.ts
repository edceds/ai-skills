import type { Agent, AgentSkill, Task, DiscoveryResult, UsageRecord, Workflow, WorkflowRun, WorkflowStep } from "./types.js";

/** SDK client for agents to interact with the marketplace */
export class MarketplaceClient {
  private baseUrl: string;
  agentId: string | null = null;

  constructor(baseUrl: string, agentId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.agentId = agentId ?? null;
  }

  private async fetch<T>(path: string, opts?: { method?: string; body?: any }): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method: opts?.method ?? "GET",
      headers: { "Content-Type": "application/json" },
    };
    if (opts?.body) init.body = JSON.stringify(opts.body);

    const res = await fetch(url, init);
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  // ─── Agent Registration ────────────────────────────────────────────────

  async register(name: string, skills: Omit<AgentSkill, "avg_latency_ms" | "calls_completed">[], opts?: { endpoint?: string; deposit?: number }): Promise<Agent> {
    const agent = await this.fetch<Agent>("/agents", {
      method: "POST",
      body: { name, skills, endpoint: opts?.endpoint, deposit: opts?.deposit },
    });
    this.agentId = agent.id;
    return agent;
  }

  async getAgent(id?: string): Promise<Agent> {
    return this.fetch<Agent>(`/agents/${id ?? this.agentId}`);
  }

  async listAgents(filter?: { status?: string; skill?: string }): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set("status", filter.status);
    if (filter?.skill) params.set("skill", filter.skill);
    const qs = params.toString();
    return this.fetch<Agent[]>(`/agents${qs ? "?" + qs : ""}`);
  }

  async goOnline(): Promise<Agent> {
    return this.fetch<Agent>(`/agents/${this.agentId}/status`, { method: "PATCH", body: { status: "online" } });
  }

  async goOffline(): Promise<Agent> {
    return this.fetch<Agent>(`/agents/${this.agentId}/status`, { method: "PATCH", body: { status: "offline" } });
  }

  async addCredits(amount: number, agentId?: string): Promise<Agent> {
    return this.fetch<Agent>(`/agents/${agentId ?? this.agentId}/credits`, { method: "POST", body: { amount } });
  }

  // ─── Discovery ─────────────────────────────────────────────────────────

  async discover(query: string, opts?: { limit?: number; minReputation?: number; maxPrice?: number }): Promise<DiscoveryResult[]> {
    const params = new URLSearchParams({ q: query });
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.minReputation) params.set("min_rep", String(opts.minReputation));
    if (opts?.maxPrice) params.set("max_price", String(opts.maxPrice));
    return this.fetch<DiscoveryResult[]>(`/discover?${params}`);
  }

  // ─── Task Delegation ───────────────────────────────────────────────────

  /** Delegate a task to another agent (or auto-discover one) */
  async delegate(skill: string, input: any, toAgent?: string): Promise<Task> {
    return this.fetch<Task>("/tasks", {
      method: "POST",
      body: { from_agent: this.agentId, skill, input, to_agent: toAgent },
    });
  }

  async getTask(taskId: string): Promise<Task> {
    return this.fetch<Task>(`/tasks/${taskId}`);
  }

  /** Claim a pending task assigned to this agent */
  async claim(taskId: string): Promise<Task> {
    return this.fetch<Task>(`/tasks/${taskId}/claim`, { method: "POST", body: { agent_id: this.agentId } });
  }

  /** Complete a task with a result */
  async complete(taskId: string, result: any): Promise<Task> {
    return this.fetch<Task>(`/tasks/${taskId}/complete`, { method: "POST", body: { result } });
  }

  /** Fail a task with an error */
  async fail(taskId: string, error: string): Promise<Task> {
    return this.fetch<Task>(`/tasks/${taskId}/fail`, { method: "POST", body: { error } });
  }

  /** Get pending tasks waiting for this agent */
  async pendingTasks(): Promise<Task[]> {
    return this.fetch<Task[]>(`/agents/${this.agentId}/tasks/pending`);
  }

  // ─── Billing ───────────────────────────────────────────────────────────

  async billing(): Promise<{
    balance: number;
    total_earned: number;
    total_spent: number;
    total_fees_paid: number;
    tasks_completed: number;
    tasks_delegated: number;
  }> {
    return this.fetch(`/agents/${this.agentId}/billing`);
  }

  async usage(since?: string): Promise<UsageRecord[]> {
    const qs = since ? `?since=${since}` : "";
    return this.fetch<UsageRecord[]>(`/agents/${this.agentId}/usage${qs}`);
  }

  // ─── Workflows ─────────────────────────────────────────────────────────

  async defineWorkflow(name: string, steps: Omit<WorkflowStep, "id">[]): Promise<Workflow> {
    return this.fetch<Workflow>("/workflows", {
      method: "POST",
      body: { owner: this.agentId, name, steps },
    });
  }

  async runWorkflow(workflowId: string, input: any): Promise<WorkflowRun> {
    return this.fetch<WorkflowRun>(`/workflows/${workflowId}/run`, {
      method: "POST",
      body: { input },
    });
  }

  async getWorkflowRun(runId: string): Promise<WorkflowRun> {
    return this.fetch<WorkflowRun>(`/runs/${runId}`);
  }

  async advanceWorkflow(runId: string): Promise<WorkflowRun> {
    return this.fetch<WorkflowRun>(`/runs/${runId}/advance`, { method: "POST" });
  }
}
