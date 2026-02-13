#!/usr/bin/env node

// ai-skills CLI — starts the MCP server.
// Agents connect with: { "command": "npx", "args": ["ai-skills"] }

import("./mcp.js").then(({ createMcpServer }) => {
  const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
});
