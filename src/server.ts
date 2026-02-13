import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Marketplace } from "./marketplace.js";

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

/** Zero-dep HTTP server wrapping the Marketplace engine */
export function createMarketplaceServer(marketplace?: Marketplace) {
  const mp = marketplace ?? new Marketplace();
  const routes: Route[] = [];

  function route(method: string, path: string, handler: Handler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    routes.push({ method, pattern: new RegExp(`^${pattern}$`), paramNames, handler });
  }

  function json(res: ServerResponse, data: any, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
  }

  function error(res: ServerResponse, msg: string, status = 400) {
    json(res, { error: msg }, status);
  }

  // ─── Routes ────────────────────────────────────────────────────────────

  // Agents
  route("POST", "/agents", (_req, res, _p, body) => {
    try {
      const agent = mp.registerAgent(body.name, body.skills, { endpoint: body.endpoint, deposit: body.deposit });
      json(res, agent, 201);
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/agents", (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const filter: any = {};
    if (url.searchParams.get("status")) filter.status = url.searchParams.get("status");
    if (url.searchParams.get("skill")) filter.skill = url.searchParams.get("skill");
    json(res, mp.listAgents(filter));
  });

  route("GET", "/agents/:id", (_req, res, params) => {
    const agent = mp.getAgent(params.id);
    if (!agent) return error(res, "Agent not found", 404);
    json(res, agent);
  });

  route("PATCH", "/agents/:id/status", (_req, res, params, body) => {
    try {
      const agent = mp.updateAgentStatus(params.id, body.status);
      json(res, agent);
    } catch (e: any) { error(res, e.message); }
  });

  route("POST", "/agents/:id/credits", (_req, res, params, body) => {
    try {
      const agent = mp.addCredits(params.id, body.amount);
      json(res, agent);
    } catch (e: any) { error(res, e.message); }
  });

  // Discovery
  route("GET", "/discover", (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const q = url.searchParams.get("q") ?? "";
    const maxResults = Number(url.searchParams.get("limit")) || undefined;
    const minReputation = Number(url.searchParams.get("min_rep")) || undefined;
    const maxPrice = Number(url.searchParams.get("max_price")) || undefined;
    json(res, mp.discover(q, { maxResults, minReputation, maxPrice }));
  });

  // Tasks
  route("POST", "/tasks", (_req, res, _p, body) => {
    try {
      const task = mp.createTask(body.from_agent, body.skill, body.input, body.to_agent);
      json(res, task, 201);
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/tasks/:id", (_req, res, params) => {
    const task = mp.getTask(params.id);
    if (!task) return error(res, "Task not found", 404);
    json(res, task);
  });

  route("POST", "/tasks/:id/claim", (_req, res, params, body) => {
    try {
      const task = mp.claimTask(params.id, body.agent_id);
      json(res, task);
    } catch (e: any) { error(res, e.message); }
  });

  route("POST", "/tasks/:id/complete", (_req, res, params, body) => {
    try {
      const task = mp.completeTask(params.id, body.result);
      json(res, task);
    } catch (e: any) { error(res, e.message); }
  });

  route("POST", "/tasks/:id/fail", (_req, res, params, body) => {
    try {
      const task = mp.failTask(params.id, body.error);
      json(res, task);
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/agents/:id/tasks/pending", (_req, res, params) => {
    json(res, mp.getPendingTasks(params.id));
  });

  // Billing
  route("GET", "/agents/:id/billing", (_req, res, params) => {
    try {
      json(res, mp.getBilling(params.id));
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/agents/:id/usage", (req, res, params) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const since = url.searchParams.get("since") ?? undefined;
    json(res, mp.getUsage(params.id, since));
  });

  route("GET", "/platform/revenue", (_req, res) => {
    json(res, mp.getPlatformRevenue());
  });

  // Workflows
  route("POST", "/workflows", (_req, res, _p, body) => {
    try {
      const wf = mp.defineWorkflow(body.owner, body.name, body.steps);
      json(res, wf, 201);
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/workflows/:id", (_req, res, params) => {
    const wf = mp.getWorkflow(params.id);
    if (!wf) return error(res, "Workflow not found", 404);
    json(res, wf);
  });

  route("POST", "/workflows/:id/run", (_req, res, params, body) => {
    try {
      const run = mp.startWorkflowRun(params.id, body.input);
      json(res, run, 201);
    } catch (e: any) { error(res, e.message); }
  });

  route("GET", "/runs/:id", (_req, res, params) => {
    const run = mp.getWorkflowRun(params.id);
    if (!run) return error(res, "Run not found", 404);
    json(res, run);
  });

  route("POST", "/runs/:id/advance", (_req, res, params) => {
    try {
      const run = mp.advanceWorkflow(params.id);
      json(res, run);
    } catch (e: any) { error(res, e.message); }
  });

  // ─── Server ────────────────────────────────────────────────────────────

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      return res.end();
    }

    // Parse body for POST/PATCH/PUT
    let body: any = {};
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise<any>((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      });
    }

    const url = req.url?.split("?")[0] ?? "/";
    const method = req.method ?? "GET";

    for (const r of routes) {
      if (r.method !== method) continue;
      const match = url.match(r.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => (params[name] = match[i + 1]));
      return r.handler(req, res, params, body);
    }

    error(res, "Not found", 404);
  });

  return { server, marketplace: mp };
}

// Run standalone
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createMarketplaceServer();
  server.listen(port, () => console.log(`Agent marketplace running on :${port}`));
}
