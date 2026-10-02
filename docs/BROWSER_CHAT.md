# Browser chat

Open `/chat/`, sign in to the modelling workspace, and open **My AI connections**.
Each user connects their own provider account. Choose **Codex** or **Claude** before
starting a conversation; a conversation keeps that provider when reopened.

- **Codex:** select **Connect Codex**, open the displayed sign-in link and enter the
  one-time code. Complete sign-in with your ChatGPT account. Device-code access must
  be enabled for that account or organisation.
- **Claude:** enter an Anthropic API key. Claude API usage is billed separately from
  a Claude subscription. Subscription sign-in is not offered in this application.
- **Disconnect** removes that connection from the modelling service and stops its
  active responses. To revoke access at the provider too, use that provider's account
  settings. Signing out of the workspace leaves the saved connection available for
  your next sign-in.

Codex uses its [official app-server device flow](https://learn.chatgpt.com/docs/app-server).
Anthropic requires approval to offer Claude subscription sign-in in third-party
applications; its [supported integration](https://code.claude.com/docs/en/agent-sdk/overview)
uses API credentials. External Claude and Codex clients can independently use the
[same MCP endpoint](MCP_CLIENTS.md).

## Conversations

Ask to find an archetype, inspect a project, explain guidance, review a draft or plan
a template. For example: “List the CKM sources and find a blood pressure archetype.”
Replies stream into the conversation; activity badges show modelling-tool calls.

Enter sends a message; Shift+Enter adds a line. **New conversation** starts another
topic or lets you select a different provider. Conversations are private to the
signed-in identity; the model repository can be shared with other authorised users.
Older conversation context is bounded, so restate details needed in long discussions.

Model writes require **Confirm save** for the exact proposed change. Cancelling or
stopping a response prevents further calls; a completed write stays in repository
history. Saving a draft does not approve or release a model. The **Models** and
**Governance** tabs work without a provider connection. See the
[workspace guide](BROWSER_WORKSPACE.md).

## Deployment

1. Copy `.env.chat.example` to a protected file outside Git and set
   `MODELLING_CHAT_ENV_FILE` to that path.
2. Configure [OIDC or native workspace identity](IDENTITY_AND_ACCESS.md). For OIDC,
   register the exact callback `https://<host>/chat/auth/callback` with PKCE S256.
3. Set `CHAT_MCP_URL` and its service credential. Allow the internal hostname in
   `MCP_ALLOWED_HOSTS` when using Docker-internal HTTP.
4. Generate a separate encryption key with `openssl rand -hex 32` and store it as
   `CHAT_PROVIDER_ENCRYPTION_KEY`. Back it up separately from `chat-data`.
5. Set `MODELLING_BROWSER_TARGET=chat` and `CHAT_ENABLED=true`, then rebuild with
   `docker compose up -d --build --wait`.
6. Sign in, connect a personal provider and request a read-only tool call. A healthy
   container does not prove that an account can generate a reply.

The default `reviews` image supports model browsing and human review without the
Codex executable. The `chat` image adds the pinned Codex runtime. Claude uses the
pinned Anthropic SDK. The PHP MCP service remains independent of both.

The development override `deploy/compose.chat-dev.yml` adds the private CA and
identity routing. It needs `MODELLING_CHAT_ENV_FILE` and `MODELLING_CA_FILE`.
Certificate verification stays enabled.

### Migrating the shared-account deployment

Set the new encryption key before rebuilding an enabled chat service. The service
no longer reads `/run/secrets/codex-auth.json` or the shared `chat-codex` volume.
Existing conversations and model data remain intact; each user must connect their
own provider before continuing. Old conversations belong to Codex. The old credential
volume is left untouched by the upgrade and can be retired separately after migration.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CHAT_ENABLED` | `false` | Enable authenticated chat |
| `CHAT_PUBLIC_URL` | `http://localhost:8350` | Exact origin; HTTPS except loopback development |
| `CHAT_OIDC_ISSUER`, `CHAT_OIDC_CLIENT_ID`, `CHAT_OIDC_CLIENT_SECRET` | empty | Workspace OIDC client |
| `CHAT_ALLOWED_GROUPS` | empty | Optional signed group allowlist |
| `CHAT_LOCAL_IDENTITY_ENABLED` | `false` | Enable native accounts; see [identity configuration](IDENTITY_AND_ACCESS.md) |
| `CHAT_LOCAL_IDENTITY_ISSUER` | `<origin>/identity/local` | Stable native identity issuer |
| `CHAT_LOCAL_IDENTITY_ENCRYPTION_KEY` | empty | Separate native TOTP encryption key |
| `CHAT_PROVIDER_ENCRYPTION_KEY` | empty | Required 32-byte hex key for personal provider credentials |
| `CHAT_MCP_URL` | `http://ingress:8343/mcp` | Fixed MCP endpoint |
| `CHAT_MCP_API_KEY`, `CHAT_MCP_API_KEY_HEADER` | empty, `X-API-Key` | Server-side MCP credential |
| `CHAT_ALLOW_WRITES` | `false` | Enable confirmed writes; MCP write permission is also required |
| `CHAT_MODEL` | `gpt-6-sol` | Codex model |
| `CHAT_CLAUDE_MODEL` | `claude-sonnet-5-5` | Claude model available to the user's API account |
| `CHAT_TURN_TIMEOUT_SECONDS` | `240` | Turn deadline, bounded to 30–600 seconds |
| `CHAT_DATA_DIR` | `/data/chat` | Private identity, conversations and encrypted connections |
| `CHAT_CODEX_WORK_DIR`, `CHAT_CODEX_BINARY` | `/workspace`, `codex` | Isolated working directory and executable |
| `CHAT_PORT` | `8350` | Internal HTTP port |

Review settings are documented in [review deployment](REVIEW_DEPLOYMENT.md).

## Privacy and limits

Both providers receive the conversation and selected tool results. Neither receives
the MCP service key. Credentials are encrypted using AES-256-GCM and bound to the
verified workspace identity and provider. They are never returned by status endpoints.
Codex receives a private temporary credential directory per operation, removed after
the process exits. Refreshed credentials cannot restore a disconnected account.
There is no shared-account fallback.

The browser and provider use the same tool allowlist, call limits and write-confirmation
path. Native shell, files, external plugins and agent delegation are disabled in Codex;
Claude receives only the declared modelling tools. The container has no Docker socket,
source checkout or model-storage mount.

Sessions use HttpOnly, SameSite cookies with Secure on HTTPS. Mutations require
same-origin requests and a session CSRF token. Limits include 100 conversations per
user, 80 messages per conversation, 8,000 characters per message, 16 tool calls per
turn and three simultaneous turns. A user can run one Codex turn at a time to avoid
refresh-token races. Up to three device sign-ins can run at once, each for ten minutes.

Conversation files expire after 30 days without activity. Backups have their own
retention. Protect `chat-data` and the encryption keys; restore them together.
This file-backed browser service supports one instance, not multiple replicas.

## Verification

```sh
npm ci --prefix chat
npm --prefix chat test
npm --prefix chat run check:format
npm --prefix chat run test:browser
```

Tests cover provider isolation and encryption, cancellation, tool results and errors,
write confirmation, sessions, CSRF, history, mobile layout and accessibility. Provider
fixtures use no live accounts. Live acceptance requires each user's sign-in or API
key; a simulated reply is not provider acceptance.
