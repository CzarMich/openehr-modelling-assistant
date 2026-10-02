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

## Personal workspace

### Personal sources and repositories

Open **My sources and repositories** to add a CKM REST base URL or a GitHub/GitLab
repository URL. Connections and optional personal tokens belong only to your signed-in
profile; tokens are encrypted and never exposed to the assistant. An enterprise CKM
with the same normalized URL is reused without storing another connection. If the
enterprise catalogue is unavailable, retry before adding a CKM. Existing private
connections and repository setup remain usable independently.

Personal CKMs support the compatible CKM REST API with anonymous or bearer-token
access; enterprise CKMs retain their configured authentication methods. Ask the
assistant to search your personal CKMs or to browse/read a connected repository.
Searches return a bounded candidate window and preserve the source URL and CID.

Choose **Save artifacts to** before requesting a save. The selected repository and
branch are saved with the conversation. **Enterprise repository** retains the existing
modelling workflow. A personal destination offers confirmed commits through
`personal_repository_save`, while enterprise write tools are omitted for that turn.
Confirmations display the destination, branch, path, full content and prior revision.
Existing files require their current revision; concurrent modifications fail without
overwriting them. Personal commits remain drafts and do not enter the enterprise
governance ledger. The **Models** and **Governance** tabs still browse enterprise data.

GitHub.com and GitLab (including self-hosted HTTPS installations) are supported;
arbitrary SSH remotes and other Git hosting APIs are not personal connectors. Create
the target repository and branch first. Use a repository-scoped token with GitHub
Contents write permission or GitLab API write access; SSO and branch protections
still apply. Public repositories can be read without a token. Remove and re-add a
connection to rotate its token or change its branch. API contracts:
[GitHub contents](https://docs.github.com/en/rest/repos/contents),
[GitLab repository files](https://docs.gitlab.com/api/repository_files/).

### Source uploads

Use **Attach files**, then describe what to model from the evidence. The assistant
receives filenames, hashes and extraction status, and reads extracted text in bounded
chunks through `attachment_read`. Cite/check the original publication, page or sheet
when reviewing derived requirements; extraction does not establish clinical validity.

PDF with selectable text, Excel XLS/XLSX/XLSB, ODS, DOCX, UTF-8/UTF-16 text, CSV, XML,
JSON and other text formats are supported. Every format can be attached and downloaded
as its original bytes, but unsupported binary formats, scanned PDFs, damaged or
password-protected documents clearly report missing extraction. OCR is not included.
Formulas, macros, scripts and external document references are not executed. Layout
and tables can lose structure during text extraction; verify against the original.

Limits: 10 MiB per file, 10 files and 30 MiB per conversation. Extraction has a 20-second
deadline, a 192 MiB JavaScript heap, 240,000 text characters, 200 PDF pages, 30 sheets
and 5,001 rows per sheet. A reached limit is reported as partial extraction. Tool reads
return 12,000 characters plus the next offset; ordinary turn/tool limits still apply.
The reverse proxy grants the larger request limit only to upload endpoints. Additional
deployment proxies must also allow 10 MiB there.

Originals and extracted text belong to the conversation, are private to its owner,
and are removed on file/chat deletion or the conversation's 30-day retention expiry.
Removing a file does not erase text already quoted in messages or sent to a provider.
Uploads are source evidence, separate from the immutable model-import/governance API.

### Sharing conversations

**Share chat** creates a snapshot of the current messages. Anyone authenticated in
the same workspace with its unguessable link can read it for seven days. Later
messages, uploaded originals, connection credentials and tool arguments are excluded;
source text already quoted in messages remains visible. Review messages before
creating a link. The viewer cannot continue or edit the owner's chat. **Revoke link**,
creating a replacement link, deleting the chat, or retention expiry invalidates access.
Signing out does not revoke an existing link.

Copilot Studio remains supported as an external MCP client through the
[existing Microsoft integration](MICROSOFT_AGENT_INTEGRATION.md). An enterprise
subscription alone does not configure that connection; tenant policy and acceptance
testing still apply. The browser assistant selector remains Claude/Codex.

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
| `CHAT_ALLOW_WRITES` | `false` | Enable confirmed writes; enterprise saves also require MCP write permission |
| `CHAT_MODEL` | `gpt-6-sol` | Codex model |
| `CHAT_CLAUDE_MODEL` | `claude-sonnet-5-5` | Claude model available to the user's API account |
| `CHAT_TURN_TIMEOUT_SECONDS` | `240` | Turn deadline, bounded to 30–600 seconds |
| `CHAT_DATA_DIR` | `/data/chat` | Private identity, conversations and encrypted connections |
| `CHAT_CODEX_WORK_DIR`, `CHAT_CODEX_BINARY` | `/workspace`, `codex` | Isolated working directory and executable |
| `CHAT_PORT` | `8350` | Internal HTTP port |
| `CHAT_PERSONAL_ALLOWED_HOSTS` | empty | Comma-separated exact internal HTTPS hostnames allowed for personal CKM/GitLab connections |

Review settings are documented in [review deployment](REVIEW_DEPLOYMENT.md).

## Privacy and limits

Both providers receive the conversation and selected tool results. Neither receives
the MCP service key. Credentials are encrypted using AES-256-GCM and bound to the
verified workspace identity and provider. They are never returned by status endpoints.
Codex receives a private temporary credential directory per operation, removed after
the process exits. Refreshed credentials cannot restore a disconnected account.
There is no shared-account fallback.

Personal connection secrets use the same encryption key in a separate store and
authenticated namespace. Public HTTPS destinations are resolved and checked at the
socket boundary; local, private, link-local and reserved addresses are denied unless
an administrator lists the exact host in `CHAT_PERSONAL_ALLOWED_HOSTS`. Redirects are
never followed. Enterprise service credentials are never reused for personal URLs.
Each response is bounded to 4 MiB, with 20 connections per profile. Do not allow
metadata or administrative hosts. TLS verification remains enabled.

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
