import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createMarketplaceServer } from "../src/server.js";
import { MarketplaceClient } from "../src/client.js";
import { Marketplace } from "../src/marketplace.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { server: s } = createMarketplaceServer();
  server = s;
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
});

// ─── Unit: Marketplace engine ────────────────────────────────────────────────

describe("Marketplace engine (direct)", () => {
  it("registers agents and assigns IDs, credits, reputation", () => {
    const mp = new Marketplace();
    const agent = mp.registerAgent("DataBot", [
      { name: "csv-analytics", description: "Analyze CSV data", price_per_call: 5, tags: ["data", "csv"] },
    ], { deposit: 100 });
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.name).toBe("DataBot");
    expect(agent.credits).toBe(100);
    expect(agent.reputation).toBe(50);
    expect(agent.skills.length).toBe(1);
    expect(agent.skills[0].calls_completed).toBe(0);
  });

  it("discovery matches skills by query terms and ranks by score", () => {
    const mp = new Marketplace();
    mp.registerAgent("CsvBot", [
      { name: "csv-analytics", description: "Parse and analyze CSV files", price_per_call: 5, tags: ["data", "csv", "analytics"] },
    ]);
    mp.registerAgent("JsonBot", [
      { name: "json-transform", description: "Transform JSON data", price_per_call: 3, tags: ["data", "json"] },
    ]);
    mp.registerAgent("TextBot", [
      { name: "summarize", description: "Summarize text documents", price_per_call: 10, tags: ["text", "nlp"] },
    ]);

    const csvResults = mp.discover("csv analytics data");
    expect(csvResults.length).toBeGreaterThan(0);
    expect(csvResults[0].skill.name).toBe("csv-analytics");

    const jsonResults = mp.discover("json transform");
    expect(jsonResults[0].skill.name).toBe("json-transform");

    // "data" matches both csv and json agents
    const dataResults = mp.discover("data");
    expect(dataResults.length).toBe(2);
  });

  it("full task lifecycle: create → claim → complete → billing", () => {
    const mp = new Marketplace();
    const caller = mp.registerAgent("Caller", [
      { name: "orchestrate", description: "Orchestrate tasks", price_per_call: 0, tags: [] },
    ], { deposit: 100 });
    const provider = mp.registerAgent("Provider", [
      { name: "csv-analytics", description: "Analyze CSV", price_per_call: 10, tags: ["csv"] },
    ]);

    // Delegate task
    const task = mp.createTask(caller.id, "csv-analytics", { file: "data.csv" });
    expect(task.status).toBe("pending");
    expect(task.to_agent).toBe(provider.id);
    expect(task.cost).toBe(10);
    expect(task.platform_fee).toBe(1); // 10%

    // Caller charged
    expect(mp.getBalance(caller.id)).toBe(90);

    // Provider claims
    mp.claimTask(task.id, provider.id);
    expect(mp.getTask(task.id)!.status).toBe("running");

    // Provider completes
    const completed = mp.completeTask(task.id, { rows: 42, avg_age: 35 });
    expect(completed.status).toBe("completed");
    expect(completed.result).toEqual({ rows: 42, avg_age: 35 });

    // Provider earned (10 - 1 fee = 9)
    expect(mp.getBalance(provider.id)).toBe(9);

    // Reputation increased
    expect(mp.getAgent(provider.id)!.reputation).toBe(51);

    // Platform revenue
    const rev = mp.getPlatformRevenue();
    expect(rev.total_fees).toBe(1);
    expect(rev.total_transactions).toBe(1);
  });

  it("failed task refunds caller and dings provider reputation", () => {
    const mp = new Marketplace();
    const caller = mp.registerAgent("Caller", [
      { name: "x", description: "x", price_per_call: 0, tags: [] },
    ], { deposit: 50 });
    const provider = mp.registerAgent("Provider", [
      { name: "buggy-skill", description: "Might fail", price_per_call: 20, tags: ["buggy"] },
    ]);

    const task = mp.createTask(caller.id, "buggy-skill", {});
    expect(mp.getBalance(caller.id)).toBe(30); // 50 - 20

    mp.claimTask(task.id, provider.id);
    mp.failTask(task.id, "Internal error");

    expect(mp.getBalance(caller.id)).toBe(50); // refunded
    expect(mp.getAgent(provider.id)!.reputation).toBe(48); // dinged by 2
  });

  it("insufficient credits blocks task creation", () => {
    const mp = new Marketplace();
    const caller = mp.registerAgent("Broke", [], { deposit: 1 });
    mp.registerAgent("Expensive", [
      { name: "premium", description: "Costly skill", price_per_call: 100, tags: ["premium"] },
    ]);

    expect(() => mp.createTask(caller.id, "premium", {})).toThrow(/Insufficient credits/);
  });

  it("workflow: define and run a 2-step pipeline", () => {
    const mp = new Marketplace();
    const orchestrator = mp.registerAgent("Orchestrator", [], { deposit: 500 });
    const csvAgent = mp.registerAgent("CsvAgent", [
      { name: "csv-stats", description: "CSV statistics", price_per_call: 5, tags: ["csv"] },
    ]);
    const textAgent = mp.registerAgent("TextAgent", [
      { name: "summarize", description: "Summarize results", price_per_call: 8, tags: ["text", "summary"] },
    ]);

    const wf = mp.defineWorkflow(orchestrator.id, "analyze-and-summarize", [
      { skill: "csv-stats", agent: csvAgent.id, input_map: { data: "$input" } },
      { skill: "summarize", agent: textAgent.id, input_map: { text: "$prev" } },
    ]);
    expect(wf.steps.length).toBe(2);

    // Start run — first step gets a task
    const run = mp.startWorkflowRun(wf.id, { file: "sales.csv" });
    expect(run.status).toBe("running");
    expect(run.steps[0].status).toBe("running");
    expect(run.steps[0].task_id).toBeTruthy();

    // Complete step 1
    const step1TaskId = run.steps[0].task_id!;
    mp.claimTask(step1TaskId, csvAgent.id);
    mp.completeTask(step1TaskId, { mean: 42, rows: 100 });

    // Advance workflow — step 2 starts
    const run2 = mp.advanceWorkflow(run.id);
    expect(run2.steps[0].status).toBe("completed");
    expect(run2.steps[1].status).toBe("running");
    expect(run2.steps[1].task_id).toBeTruthy();

    // Complete step 2
    const step2TaskId = run2.steps[1].task_id!;
    mp.claimTask(step2TaskId, textAgent.id);
    mp.completeTask(step2TaskId, { summary: "Average is 42 across 100 rows" });

    // Advance — workflow completes
    const run3 = mp.advanceWorkflow(run.id);
    expect(run3.status).toBe("completed");
    expect(run3.output).toEqual({ summary: "Average is 42 across 100 rows" });

    // Orchestrator spent 5 + 8 = 13 credits
    expect(mp.getBalance(orchestrator.id)).toBe(500 - 13);
  });
});

// ─── Integration: Full HTTP flow with SDK client ─────────────────────────────

describe("Marketplace HTTP API + SDK client", () => {
  it("full agent-to-agent delegation flow over HTTP", async () => {
    // 1. Register two agents: a caller and a provider
    const caller = new MarketplaceClient(baseUrl);
    const callerAgent = await caller.register("CallerBot", [
      { name: "orchestrate", description: "Manages workflows", price_per_call: 0, tags: ["meta"] },
    ], { deposit: 200 });
    expect(callerAgent.id).toMatch(/^agent_/);
    expect(callerAgent.credits).toBe(200);

    const provider = new MarketplaceClient(baseUrl);
    const providerAgent = await provider.register("AnalyticsBot", [
      { name: "csv-analytics", description: "Parse and analyze CSV data files", price_per_call: 15, tags: ["data", "csv", "analytics"] },
    ]);
    expect(providerAgent.credits).toBe(0);

    // 2. Caller discovers skills
    const results = await caller.discover("csv analytics");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].agent.id).toBe(providerAgent.id);
    expect(results[0].skill.name).toBe("csv-analytics");

    // 3. Caller delegates task
    const task = await caller.delegate("csv-analytics", { data: "name,age\nAlice,30\nBob,25" });
    expect(task.status).toBe("pending");
    expect(task.to_agent).toBe(providerAgent.id);
    expect(task.cost).toBe(15);

    // 4. Provider sees pending task
    const pending = await provider.pendingTasks();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(task.id);

    // 5. Provider claims and completes
    const claimed = await provider.claim(task.id);
    expect(claimed.status).toBe("running");

    const completed = await provider.complete(task.id, {
      stats: { age: { mean: 27.5, min: 25, max: 30 } },
    });
    expect(completed.status).toBe("completed");
    expect(completed.result.stats.age.mean).toBe(27.5);

    // 6. Verify billing
    const callerBilling = await caller.billing();
    expect(callerBilling.balance).toBe(185); // 200 - 15
    expect(callerBilling.tasks_delegated).toBe(1);

    const providerBilling = await provider.billing();
    expect(providerBilling.balance).toBe(13.5); // 15 - 1.5 platform fee
    expect(providerBilling.tasks_completed).toBe(1);

    // 7. Caller can fetch completed task
    const final = await caller.getTask(task.id);
    expect(final.status).toBe("completed");
  });

  it("multi-agent discovery: returns best match from multiple providers", async () => {
    const c = new MarketplaceClient(baseUrl);

    // Register several providers
    await c.register("CheapCSV", [
      { name: "csv-parse", description: "Basic CSV parsing", price_per_call: 2, tags: ["csv", "parse"] },
    ]);

    const prem = new MarketplaceClient(baseUrl);
    await prem.register("PremiumCSV", [
      { name: "csv-parse", description: "Advanced CSV parsing with validation", price_per_call: 50, tags: ["csv", "parse", "premium"] },
    ]);

    // Discovery with max price filter
    const cheap = await c.discover("csv parse", { maxPrice: 10 });
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every((r) => r.skill.price_per_call <= 10)).toBe(true);
  });

  it("agent status changes affect discovery", async () => {
    const client = new MarketplaceClient(baseUrl);
    const agent = await client.register("StatusBot", [
      { name: "unique-skill-xyz", description: "A unique skill for testing", price_per_call: 1, tags: ["unique"] },
    ]);

    // Online — discoverable
    let results = await client.discover("unique-skill-xyz");
    expect(results.some((r) => r.agent.id === agent.id)).toBe(true);

    // Go offline — not discoverable
    await client.goOffline();
    results = await client.discover("unique-skill-xyz");
    expect(results.some((r) => r.agent.id === agent.id)).toBe(false);

    // Back online
    await client.goOnline();
    results = await client.discover("unique-skill-xyz");
    expect(results.some((r) => r.agent.id === agent.id)).toBe(true);
  });

  it("credits: deposit and balance tracking", async () => {
    const client = new MarketplaceClient(baseUrl);
    await client.register("CreditsBot", [], { deposit: 50 });

    let agent = await client.getAgent();
    expect(agent.credits).toBe(50);

    await client.addCredits(150);
    agent = await client.getAgent();
    expect(agent.credits).toBe(200);
  });

  it("workflow over HTTP: define → run → advance step by step", async () => {
    // Set up orchestrator + 2 providers
    const orch = new MarketplaceClient(baseUrl);
    const orchAgent = await orch.register("WorkflowOrch", [], { deposit: 1000 });

    const step1Client = new MarketplaceClient(baseUrl);
    const step1Agent = await step1Client.register("Step1Bot", [
      { name: "extract", description: "Extract data from source", price_per_call: 10, tags: ["extract", "data"] },
    ]);

    const step2Client = new MarketplaceClient(baseUrl);
    const step2Agent = await step2Client.register("Step2Bot", [
      { name: "transform", description: "Transform extracted data", price_per_call: 8, tags: ["transform", "data"] },
    ]);

    // Define workflow
    const wf = await orch.defineWorkflow("extract-transform", [
      { skill: "extract", agent: step1Agent.id, input_map: { source: "$input" } },
      { skill: "transform", agent: step2Agent.id, input_map: { data: "$prev" } },
    ]);
    expect(wf.steps.length).toBe(2);

    // Start workflow
    let run = await orch.runWorkflow(wf.id, { url: "https://example.com/data" });
    expect(run.status).toBe("running");
    expect(run.steps[0].status).toBe("running");

    // Step 1: provider claims + completes
    const step1Tasks = await step1Client.pendingTasks();
    expect(step1Tasks.length).toBe(1);
    await step1Client.claim(step1Tasks[0].id);
    await step1Client.complete(step1Tasks[0].id, { records: [1, 2, 3] });

    // Advance
    run = await orch.advanceWorkflow(run.id);
    expect(run.steps[0].status).toBe("completed");
    expect(run.steps[1].status).toBe("running");

    // Step 2: provider claims + completes
    const step2Tasks = await step2Client.pendingTasks();
    expect(step2Tasks.length).toBe(1);
    await step2Client.claim(step2Tasks[0].id);
    await step2Client.complete(step2Tasks[0].id, { transformed: [10, 20, 30] });

    // Advance — workflow done
    run = await orch.advanceWorkflow(run.id);
    expect(run.status).toBe("completed");
    expect(run.output).toEqual({ transformed: [10, 20, 30] });

    // Verify credits flowed correctly
    const orchBilling = await orch.billing();
    expect(orchBilling.balance).toBe(1000 - 10 - 8); // paid for both steps
  });

  it("platform revenue accumulates across transactions", async () => {
    // Hit the platform revenue endpoint
    const res = await fetch(`${baseUrl}/platform/revenue`);
    const data = await res.json() as any;
    expect(data.total_fees).toBeGreaterThan(0);
    expect(data.total_transactions).toBeGreaterThan(0);
  });
});
