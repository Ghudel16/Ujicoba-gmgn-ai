import express from "express";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const GMGN_API_KEY = process.env.GMGN_API_KEY;

function cli(args) {
  return new Promise((resolve, reject) => {
    if (!GMGN_API_KEY) return reject(new Error("GMGN_API_KEY is not configured on Railway."));
    const child = spawn("./node_modules/.bin/gmgn-cli", [...args, "--raw"], {
      env: { ...process.env, GMGN_API_KEY },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "", err = "";
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) reject(new Error(err || `gmgn-cli exited with code ${code}`));
      else resolve(out.trim());
    });
  });
}

function jsonResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function makeServer() {
  const server = new McpServer({ name: "Ujicoba GMGN AI", version: "1.0.1" });

  server.tool("gmgn_ping",
    "Check MCP server and whether GMGN API credentials are configured. Does not expose the credential.",
    {},
    async () => jsonResult({ ok: true, gmgn_api_key_configured: Boolean(GMGN_API_KEY), mode: "read-only" })
  );

  server.tool("gmgn_token_info",
    "Read token fundamentals/security using the official GMGN CLI.",
    { chain: z.string(), address: z.string() },
    async ({ chain, address }) => jsonResult(await cli(["token","info","--chain",chain,"--address",address]))
  );

  server.tool("gmgn_market_trending",
    "Read GMGN trending tokens. Official read-only market command.",
    {
      chain: z.string(),
      interval: z.string().default("1h"),
      limit: z.number().int().min(1).max(100).default(20),
      order_by: z.string().optional()
    },
    async ({ chain, interval, limit, order_by }) => {
      const args = ["market","trending","--chain",chain,"--interval",interval,"--limit",String(limit)];
      if (order_by) args.push("--order-by",order_by);
      return jsonResult(await cli(args));
    }
  );

  server.tool("gmgn_market_trenches",
    "Read new/Trenches tokens through the official GMGN CLI.",
    {
      chain: z.string(),
      limit: z.number().int().min(1).max(100).default(50)
    },
    async ({ chain, limit }) => jsonResult(await cli(["market","trenches","--chain",chain,"--limit",String(limit)]))
  );

  server.tool("gmgn_market_kline",
    "Read token K-line/market history.",
    {
      chain: z.string(),
      address: z.string(),
      resolution: z.string().default("1h"),
      from: z.number().int().optional(),
      to: z.number().int().optional()
    },
    async ({ chain, address, resolution, from, to }) => {
      const args = ["market","kline","--chain",chain,"--address",address,"--resolution",resolution];
      if (from !== undefined) args.push("--from",String(from));
      if (to !== undefined) args.push("--to",String(to));
      return jsonResult(await cli(args));
    }
  );

  server.tool("gmgn_market_search",
    "Search tokens by name, symbol, address, or ENS using GMGN.",
    {
      query: z.string(),
      chain: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20)
    },
    async ({ query, chain, limit }) => {
      const args = ["market","search","--query",query,"--limit",String(limit)];
      if (chain) args.push("--chain",chain);
      return jsonResult(await cli(args));
    }
  );

  server.tool("gmgn_market_signal",
    "Read GMGN market/token signals. Read-only.",
    {
      chain: z.string(),
      signal_type: z.array(z.string()).optional(),
      mc_min: z.number().optional(),
      mc_max: z.number().optional()
    },
    async ({ chain, signal_type, mc_min, mc_max }) => {
      const args = ["market","signal","--chain",chain];
      for (const s of signal_type || []) args.push("--signal-type",s);
      if (mc_min !== undefined) args.push("--mc-min",String(mc_min));
      if (mc_max !== undefined) args.push("--mc-max",String(mc_max));
      return jsonResult(await cli(args));
    }
  );

  return server;
}

app.get("/health", (_req,res) => res.json({
  ok:true,
  service:"ujicoba-gmgn-ai-mcp",
  mcp_endpoint:"/mcp",
  mode:"read-only",
  gmgn_api_key_configured:Boolean(GMGN_API_KEY)
}));

app.all("/mcp", async (req,res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({error:e instanceof Error ? e.message : String(e)});
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Ujicoba GMGN AI MCP listening on :${PORT}`));
