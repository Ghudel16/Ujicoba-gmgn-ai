import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const GMGN_API_KEY = process.env.GMGN_API_KEY;
const GMGN_BASE_URL = process.env.GMGN_BASE_URL || "https://api.gmgn.ai";

function requireApiKey() {
  if (!GMGN_API_KEY) throw new Error("GMGN_API_KEY is not configured on the server.");
}

async function gmgnGet(path, params = {}) {
  requireApiKey();
  const url = new URL(path, GMGN_BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${GMGN_API_KEY}`,
      "X-API-KEY": GMGN_API_KEY
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`GMGN API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function makeServer() {
  const server = new McpServer({
    name: "Ujicoba GMGN AI",
    version: "1.0.0"
  });

  server.tool(
    "gmgn_ping",
    "Check MCP server and GMGN credential configuration without exposing the credential.",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify({
        ok: true,
        gmgn_api_key_configured: Boolean(GMGN_API_KEY),
        mode: "read-only research"
      }, null, 2) }]
    })
  );

  server.tool(
    "gmgn_raw_get",
    "Read-only proxy for an approved GMGN OpenAPI GET path. Use only GMGN API paths documented by GMGN.",
    {
      path: z.string().min(1).describe("GMGN OpenAPI GET path"),
      query: z.record(z.string()).optional().describe("Query parameters")
    },
    async ({ path, query }) => {
      if (!path.startsWith("/")) throw new Error("path must start with /");
      if (/^\/(swap|order|cooking|wallet\/manage)/i.test(path)) {
        throw new Error("Trading/order/wallet-management endpoints are disabled in this MCP.");
      }
      const data = await gmgnGet(path, query || {});
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ujicoba-gmgn-ai-mcp",
    mcp_endpoint: "/mcp",
    mode: "read-only",
    gmgn_api_key_configured: Boolean(GMGN_API_KEY)
  });
});

app.all("/mcp", async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true
  });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ujicoba GMGN AI MCP listening on 0.0.0.0:${PORT}`);
});
