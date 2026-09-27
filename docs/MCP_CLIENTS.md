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

## Codex

Codex is an MCP client: it supplies reasoning and calls this service's tools. The service does not embed Codex or require an OpenAI API key. See the [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

For an HTTP connection add this to your local `~/.codex/config.toml`:

```toml
[mcp_servers.openehr_modelling]
url = "https://modelling.example.org/mcp"
env_http_headers = { "X-API-Key" = "OPENEHR_MODELLING_API_KEY" }
startup_timeout_sec = 30
tool_timeout_sec = 120
```

Supply `OPENEHR_MODELLING_API_KEY` to the Codex process from your secret manager. Do not paste it into a repository configuration file. Recent Codex versions also support `http_headers_helper`, an absolute local command that returns a JSON header map. A helper can read a private credential file, avoiding a secret in TOML or dependence on the launching shell's environment. Do not run the helper interactively or log its output. Verify support with the installed Codex version.

The configured development connection is named `openehr_modelling_dev` and uses `https://dev-openehr-modelling.sandbox.hygeoniq.com/mcp`. On the development machine a private credential helper supplies its separate dev API key. The installed Codex app-server successfully initialized and discovered the tools; evidence is in `evidence/codex-dev-connection.json`. New Codex sessions load this configuration. An already-running conversation may need to reconnect before the tools appear.

Check configuration with `codex mcp get openehr_modelling_dev`; verify discovery in Codex's MCP status view. The service root links to the optional [browser chat](BROWSER_CHAT.md), which provides its own protected chat interface. The local Codex connection remains independent. For hosted clients, local hosts-file mappings do not provide network reachability: their execution environment must resolve and reach the endpoint and trust its certificate authority.
