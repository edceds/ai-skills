// --- Seeded PRNG ---
function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = ReturnType<typeof createRng>;
function pick<T>(rng: Rng, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }
function randInt(rng: Rng, min: number, max: number): number { return Math.floor(rng() * (max - min + 1)) + min; }

// --- Data pools ---
const NAMES = ["Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince", "Ethan Hunt", "Fiona Green", "George Clark", "Hannah Lee"];
const EMAILS = ["alice@example.com", "bob@test.io", "charlie@company.co", "diana@mail.org", "ethan@work.dev"];
const PRODUCT_NAMES = ["Wireless Headphones", "USB-C Hub", "Mechanical Keyboard", "4K Monitor", "Standing Desk", "Webcam Pro", "Noise Cancelling Earbuds"];
const CATEGORIES = ["electronics", "office", "accessories", "furniture", "audio"];
const STATUSES = ["active", "inactive", "pending", "archived"];
const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

function uuid(rng: Rng): string {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if ([8, 13, 18, 23].includes(i)) s += "-";
    else if (i === 14) s += "4";
    else s += h[randInt(rng, 0, 15)];
  }
  return s;
}

function isoDate(rng: Rng): string {
  const d = new Date(2024, randInt(rng, 0, 11), randInt(rng, 1, 28), randInt(rng, 0, 23), randInt(rng, 0, 59));
  return d.toISOString();
}

// --- Guess resource from endpoint ---
function guessResource(endpoint: string): string {
  const cleaned = endpoint.replace(/^\/api\/v\d+/, "").replace(/^\//, "").split("/")[0].split("?")[0];
  return cleaned || "items";
}

function isSingular(endpoint: string): boolean {
  return /\/\d+$|\/\{[^}]+\}$|\/:[a-z]+$/i.test(endpoint);
}

// --- Generate mock record ---
function generateRecord(rng: Rng, resource: string): Record<string, any> {
  const base: Record<string, any> = {
    id: uuid(rng),
    created_at: isoDate(rng),
    updated_at: isoDate(rng),
  };

  switch (resource) {
    case "users":
    case "user": {
      const name = pick(rng, NAMES);
      return { ...base, name, email: name.toLowerCase().replace(" ", ".") + "@example.com", age: randInt(rng, 20, 65), status: pick(rng, STATUSES) };
    }
    case "products":
    case "product":
      return { ...base, name: pick(rng, PRODUCT_NAMES), price: randInt(rng, 10, 500) + 0.99, category: pick(rng, CATEGORIES), stock: randInt(rng, 0, 200), rating: (randInt(rng, 10, 50) / 10) };
    case "orders":
    case "order":
      return { ...base, user_id: uuid(rng), items: randInt(rng, 1, 8), total: randInt(rng, 20, 2000) + 0.99, status: pick(rng, ORDER_STATUSES), currency: "USD" };
    case "posts":
    case "post":
      return { ...base, title: `Post ${randInt(rng, 1, 999)}`, body: "Lorem ipsum dolor sit amet.", author_id: uuid(rng), tags: [pick(rng, ["tech", "news", "guide", "tutorial"])] };
    case "comments":
    case "comment":
      return { ...base, post_id: uuid(rng), author: pick(rng, NAMES), body: "Great article, thanks for sharing!" };
    default:
      return { ...base, name: `${resource}_${randInt(rng, 1, 999)}`, status: pick(rng, STATUSES), value: randInt(rng, 1, 100) };
  }
}

// --- Error responses ---
function errorResponse(status: number): any {
  const errors: Record<number, any> = {
    400: { status: 400, error: "Bad Request", message: "The request body is invalid. Check the required fields." },
    401: { status: 401, error: "Unauthorized", message: "Authentication required. Provide a valid API key." },
    403: { status: 403, error: "Forbidden", message: "You don't have permission to access this resource." },
    404: { status: 404, error: "Not Found", message: "The requested resource was not found." },
    409: { status: 409, error: "Conflict", message: "A resource with this identifier already exists." },
    422: { status: 422, error: "Unprocessable Entity", message: "Validation failed.", details: [{ field: "email", message: "must be a valid email address" }] },
    429: { status: 429, error: "Too Many Requests", message: "Rate limit exceeded. Try again in 60 seconds.", retry_after: 60 },
    500: { status: 500, error: "Internal Server Error", message: "An unexpected error occurred. Please try again later." },
  };
  return errors[status] ?? errors[500];
}

// --- Mock response ---
function mockResponse(endpoint: string, method: string, count: number, rng: Rng, status: number): any {
  if (status >= 400) return errorResponse(status);

  const resource = guessResource(endpoint);
  const singular = isSingular(endpoint);

  if (method === "DELETE") {
    return { message: `${resource} deleted successfully`, deleted: true };
  }

  if (method === "POST") {
    return { ...generateRecord(rng, resource), message: `${resource} created` };
  }

  if (method === "PUT" || method === "PATCH") {
    return { ...generateRecord(rng, resource), message: `${resource} updated` };
  }

  // GET
  if (singular) {
    return generateRecord(rng, resource);
  }

  const items = Array.from({ length: count }, () => generateRecord(rng, resource));
  return {
    data: items,
    meta: {
      total: randInt(rng, count, count * 10),
      page: 1,
      per_page: count,
      total_pages: randInt(rng, 1, 10),
    },
  };
}

// --- OpenAPI spec generator ---
function generateOpenAPI(name: string, endpoints: string, version: string): any {
  const paths: Record<string, any> = {};

  for (const epDef of endpoints.split(";").filter(Boolean)) {
    const [path, methods] = epDef.split(":");
    if (!path || !methods) continue;

    const pathObj: Record<string, any> = {};
    const resource = guessResource(path);
    const singular = isSingular(path);

    for (const method of methods.split(",")) {
      const m = method.trim().toLowerCase();
      const op: any = {
        summary: `${method.trim()} ${path}`,
        operationId: `${m}${resource.charAt(0).toUpperCase() + resource.slice(1)}${singular ? "ById" : ""}`,
        tags: [resource],
        responses: {},
      };

      if (m === "get") {
        op.responses["200"] = {
          description: singular ? `A single ${resource}` : `List of ${resource}`,
          content: { "application/json": { schema: { type: singular ? "object" : "array" } } },
        };
        if (singular) {
          op.responses["404"] = { description: "Not found" };
        }
      } else if (m === "post") {
        op.responses["201"] = { description: `${resource} created` };
        op.responses["400"] = { description: "Validation error" };
        op.requestBody = { required: true, content: { "application/json": { schema: { type: "object" } } } };
      } else if (m === "put" || m === "patch") {
        op.responses["200"] = { description: `${resource} updated` };
        op.responses["404"] = { description: "Not found" };
        op.requestBody = { required: true, content: { "application/json": { schema: { type: "object" } } } };
      } else if (m === "delete") {
        op.responses["204"] = { description: "Deleted" };
        op.responses["404"] = { description: "Not found" };
      }

      pathObj[m] = op;
    }

    // Extract path parameters
    const paramMatches = path.match(/\{(\w+)\}/g);
    if (paramMatches) {
      const parameters = paramMatches.map((p) => ({
        name: p.replace(/[{}]/g, ""),
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
      for (const m of Object.keys(pathObj)) {
        pathObj[m].parameters = parameters;
      }
    }

    paths[path] = pathObj;
  }

  return {
    openapi: "3.0.3",
    info: { title: name, version },
    paths,
    servers: [{ url: "https://api.example.com/v1" }],
  };
}

// --- CRUD endpoint generator ---
function generateEndpoints(resources: string[]): any {
  const endpoints: any[] = [];
  for (const r of resources) {
    const singular = r.endsWith("s") ? r.slice(0, -1) : r;
    endpoints.push(
      { method: "GET", path: `/${r}`, description: `List all ${r}`, response_type: "array" },
      { method: "POST", path: `/${r}`, description: `Create a ${singular}`, response_type: "object" },
      { method: "GET", path: `/${r}/{id}`, description: `Get a ${singular} by ID`, response_type: "object" },
      { method: "PUT", path: `/${r}/{id}`, description: `Update a ${singular}`, response_type: "object" },
      { method: "DELETE", path: `/${r}/{id}`, description: `Delete a ${singular}`, response_type: "null" },
    );
  }
  return { endpoints, total: endpoints.length };
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const op = args[0];

  if (!op || !["response", "openapi", "endpoints"].includes(op)) {
    console.error("Usage: mock.ts <response|openapi|endpoints> [options]");
    process.exit(1);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  switch (op) {
    case "response": {
      const endpoint = get("--endpoint") ?? "/items";
      const method = (get("--method") ?? "GET").toUpperCase();
      const count = parseInt(get("--count") ?? "5");
      const seed = parseInt(get("--seed") ?? String(Date.now()));
      const status = parseInt(get("--status") ?? "200");
      const rng = createRng(seed);
      console.log(JSON.stringify(mockResponse(endpoint, method, count, rng, status), null, 2));
      break;
    }
    case "openapi": {
      const name = get("--name") ?? "API";
      const endpoints = get("--endpoints") ?? "";
      const version = get("--version") ?? "1.0.0";
      console.log(JSON.stringify(generateOpenAPI(name, endpoints, version), null, 2));
      break;
    }
    case "endpoints": {
      const resources = (get("--resources") ?? "").split(",").filter(Boolean);
      if (resources.length === 0) {
        console.error("--resources required (comma-separated)");
        process.exit(1);
      }
      console.log(JSON.stringify(generateEndpoints(resources), null, 2));
      break;
    }
  }
}

main();
