---
name: api-mocker
description: Generate mock API responses, OpenAPI 3.0 specs, and endpoint stubs from natural language descriptions. Use when the user needs fake API data, wants to prototype an API, or needs an OpenAPI specification generated.
---

# API Mocker

Generate mock API responses, OpenAPI specs, and endpoint definitions. No external dependencies.

## Quick start

```bash
npx tsx scripts/mock.ts response --endpoint "/users" --method GET --count 5 --seed 42
npx tsx scripts/mock.ts response --endpoint "/users/1" --method GET
npx tsx scripts/mock.ts openapi --name "User Service" --endpoints "/users:GET,POST;/users/{id}:GET,PUT,DELETE;/orders:GET,POST"
npx tsx scripts/mock.ts endpoints --resources "users,orders,products"
```

## Operations

### response
Generate a realistic mock JSON response for an endpoint.

- `--endpoint <path>` — e.g. `/users`, `/users/1`, `/products?category=electronics`
- `--method GET|POST|PUT|DELETE` — HTTP method (default: GET)
- `--count <n>` — number of items for list endpoints (default: 5)
- `--seed <n>` — deterministic output
- `--status <code>` — HTTP status to simulate (200, 201, 400, 404, 500)

### openapi
Generate an OpenAPI 3.0 specification.

- `--name <title>` — API title
- `--endpoints <def>` — semicolon-separated: `/path:METHOD1,METHOD2;/path2:METHOD`
- `--version <v>` — API version (default: 1.0.0)

### endpoints
Generate full CRUD endpoint definitions for resources.

- `--resources <comma-separated>` — resource names (auto-generates standard REST endpoints)

## Output
JSON to stdout.
