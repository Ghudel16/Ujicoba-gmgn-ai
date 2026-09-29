# Ujicoba GMGN AI — Read-only MCP

Remote MCP server for GMGN AI research.

## Endpoints

- GET /health
- POST/GET /mcp

## Deploy

Set these Railway variables:

- GMGN_API_KEY = your GMGN API key
- GMGN_BASE_URL = https://api.gmgn.ai

The API key is intentionally not stored in this repository.

## Scope

This first version is read-only. It exposes a safe generic GET proxy and blocks trading/order/wallet-management paths.

Next step: map the official GMGN Skills commands into dedicated MCP tools (market, token, portfolio, wallet, holder/trader analysis, tracking) after confirming the exact OpenAPI paths from the GMGN documentation.
