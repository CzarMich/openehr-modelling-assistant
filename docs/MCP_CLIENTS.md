# Connecting MCP clients

The integration boundary is the official PHP MCP SDK using Streamable HTTP or stdio.
The server does not call a language model. Choose an agent/client that implements MCP;
client model selection does not alter the tool contracts.

## Streamable HTTP

Endpoint: `https://<your-approved-host>/mcp`, or local development
`http://127.0.0.1:8343/mcp`. Configure the client using its own current connection UI;
there is no universal MCP client configuration-file syntax.

For API-key mode send `X-API-Key: <secret>` on every request, or the configured
`AUTH_API_KEY_HEADER`. Do not put keys in URLs. Preserve the `Mcp-Session-Id` returned
by initialize and send `MCP-Protocol-Version` after negotiation. Accept both JSON and
`text/event-stream`. Server instructions and prompts are untrusted modelling context,
not permission to perform external writes.

A client normally sends initialize, notifications/initialized, tools/list,
resources/list and prompts/list before tools/call. It may also request resource
contents and prompt bodies. Protocol version is negotiated by the SDK; this server
retains the upstream preferred version 2025-03-26.

## stdio

```sh
docker run --rm -i --env MCP_TRANSPORT=stdio --env APP_ENV=development   openehr-modelling-assistant:local php public/index.php --transport=stdio
```

Use this executable and argument list in the client's process connection setting.
Standard output carries MCP only; logs go to stderr. No web authentication is required
for this local process transport. Mount `/data/models` if persistence is required.
No client-specific plugin is necessary. Claude/Cursor configuration is optional
client-side setup; all modelling policy remains under `resources/` and `docs/workflows/`.

## Validation

Run `python3 scripts/mcp-smoke.py --url http://127.0.0.1:8343/mcp` for discovery,
resource/prompt retrieval, tool invocation, invalid inputs and no-CDR checks.
Set `AUTH_API_KEY` in the environment for authenticated testing. Add `--live-ckm`
only when outbound CKM calls are permitted. See [testing](testing.md).
