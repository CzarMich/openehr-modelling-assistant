# openEHR Modelling Assistant

A self-hosted, configurable openEHR knowledge and modelling service for AI agents.
It helps clinical information modellers and engineers find source archetypes,
draft templates, review ADL and AQL, manage modelling artefacts, and verify
terminology. **Neither a CDR nor a terminology server is required for modelling. Terminology bindings are optional.**

Microsoft Copilot Studio is the primary documented enterprise consumer. The core
speaks standard MCP and contains no Microsoft, OpenAI or Anthropic model client.
Your agent supplies conversational reasoning, whether its permitted model is
Claude, GPT or another model. This service supplies retrieval and deterministic
operations. It does not provide clinical treatment advice, run an EHR, replace
CKM, or operate as a terminology server.

## What it can do

- Chat in a browser with organisation sign-in, streamed replies, private conversation history
  and visible modelling-tool activity. Review and confirm each proposed model write.

- Search and retrieve archetypes and templates directly from multiple configured CKMs.
  Select a named international, national or organisational CKM on each call.
- Supply bundled openEHR specifications, modelling guides, examples and terminology.
- Guide archetype, template, ADL, AQL and simplified-format design/review through MCP prompts.
- Generate a **draft OET** containing a retrieved COMPOSITION and direct ENTRY archetypes,
  retaining actual CKM source identifiers and content hashes.
- Parse XML securely; check an OET/OPT structural profile and ADL headers; compare XML
  structure, constraints and leaf values. These checks do not certify openEHR conformance.
- Persist projects, requirements, artefacts, decisions, metadata and immutable revisions
  using filesystem/SharePoint snapshots or Git, including GitHub/GitLab metadata and draft reviews, with revision conflict detection.
- Represent local/external value sets and bindings, invoke FHIR terminology operations,
  compare terminology changes, and produce declared terminology dependency manifests.
- Report explicit requirements traceability and a QA preflight that identifies unexecuted checks.

There is **no OPT compiler, complete ADL/AQL validator, CDR execution adapter,
visual modeller, or operational clinical approval UI**.
The interfaces and governance policy prepare these extensions. Native OIDC bearer
verification, signed write permissions and tenant storage isolation are implemented;
see [identity configuration and migration](docs/OIDC.md). Full project RBAC remains separate work.
See the [capability matrix](CAPABILITIES.md) and [verification report](docs/IMPLEMENTATION_REPORT.md).

## Chat in your browser

Open the [development chat](https://dev-openehr-modelling.sandbox.hygeoniq.com/chat/),
select **Sign in to start chatting**, and use your organisation account. Try:
“List the configured CKMs and find a blood pressure archetype.”
[Browser chat](docs/BROWSER_CHAT.md) explains use, deployment, identity/model configuration,
privacy, limits and testing. Other deployments enable this optional client separately.
The PHP MCP service remains usable with external AI clients and without browser chat.

## Start locally

Requires Docker Engine and Docker Compose with `env_file.required` support.
Linux containers can run on Linux or Docker Desktop on macOS/Windows; the executable
verification environment is recorded in the evidence report.

```sh
git clone https://github.com/CzarMich/openehr-modelling-assistant.git
cd openehr-modelling-assistant
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:8343/health
curl http://127.0.0.1:8343/ready
```

Connect a Streamable HTTP MCP client to `http://127.0.0.1:8343/mcp`.
The example configuration is local development with no authentication and a loopback
port binding. Enterprise deployment requires authenticated HTTPS through a gateway.
Read [deployment](docs/DEPLOYMENT.md), [configuration](docs/CONFIGURATION.md),
and [security](docs/SECURITY.md) before changing the exposure.

## Agent integration and MCP tools

[Microsoft integration](docs/MICROSOFT_AGENT_INTEGRATION.md) documents Copilot Studio,
Microsoft Agent Framework and Foundry, with tenant tests explicitly distinguished
from repository-side tests. [Generic MCP clients](docs/MCP_CLIENTS.md) covers HTTP
and stdio. [Tool catalogue](docs/MCP_TOOLS.md) contains generated signatures,
return schemas, examples and dependency/failure notes for every exposed tool.

- `guide_get` returns the **full** guide file.
- Existing CKM, guide, example, type-specification and terminology tool names remain stable.
- New project writes require `MODEL_REPOSITORY_WRITE_ENABLED=true`; no MCP tool can approve or release a model.

## Architecture and workflows

```mermaid
flowchart TD
    U[Browser chat] --> W[Chat service: history, streaming and write confirmation]
    W <--> I[OIDC sign-in]
    W <--> AIC[Isolated Codex client]
    W -->|Declared modelling tools over MCP| S[openEHR Modelling Assistant]
    M[Copilot Studio, Codex or another MCP client] -->|MCP| S[openEHR Modelling Assistant]
    S --> ID[Transport identity: local, API key or verified OIDC]
    ID --> TEN[Signed tenant namespace and write permissions]
    S --> K[Multiple named CKM sources]
    S --> B[Bundled specifications and guides]
    S --> D[Modelling services and structural checks]
    D --> R[Model Repository interface]
    R --> F[Filesystem snapshots and revisions]
    R --> SP[SharePoint snapshots and conditional project index]
    R --> G[Git adapter: native model files and commit revisions]
    G --> O[Persistent local Git object store]
    G <--> H[Optional GitHub, GitLab or other Git remote]
    G --> HP[GitHub or GitLab API: metadata, branches and draft reviews]
    A[Archetype Designer: account connection unverified] -.-> H
    D --> T[Optional terminology checks and bindings]
    T --> L[Local value sets]
    T --> E[Optional FHIR terminology server]
    D -. future extension .-> C[CDR adapter]
```

Solid edges show implemented paths. Git works locally or with a configured remote;
filesystem, SharePoint and Git expose the same Model Repository interface. SharePoint passes isolated Graph/OAuth contract checks; live tenant acceptance requires configured access. The shared Git
round trip is verified, while the dotted Archetype Designer connection still needs
an authenticated hosted UI acceptance test. The CDR adapter remains unimplemented.
Modelling and persistence work without a terminology server or terminology bindings.

```mermaid
flowchart TD
    Chat[Browser chat or another MCP client] --> P[Select filesystem, SharePoint or Git storage] --> R[Open project and read current revision]
    R --> D[Retrieve CKM sources and draft model changes]
    D --> V[Run available structural checks and inspect diff]
    V --> T{Terminology binding needed?}
    T -->|No| S[Save DRAFT with expectedRevision]
    T -->|Yes| B[Use local value sets or an optional FHIR server]
    B --> S
    S --> C{Revision or push conflict?}
    C -->|Yes: reread and reconcile| R
    C -->|No| PR[Optional hosted draft review request]
    PR --> H[Independent human review and qualified validation]
```

Saving a draft does not approve or release it. The assistant can request a hosted draft review. Human review and merge take place
in the hosting service; the assistant has no approval endpoint. AQL creation/review
uses the agent plus grounded prompts and paths; execution is not implemented.

Follow the [shared Git model workflow](docs/workflows/shared-git-models.md) or the
[neonatal modelling workflow](docs/workflows/neonatal-admission.md). See the detailed
[architecture](docs/ARCHITECTURE.md), [model repository](docs/MODEL_REPOSITORY.md),
[Archetype Designer integration](docs/ARCHETYPE_DESIGNER_INTEGRATION.md),
[terminology](docs/TERMINOLOGY.md) and [governance](docs/GOVERNANCE.md).

## Development and testing

```sh
make env
make build-dev
make install
make ci
```

Run PHP and Composer inside the development container. Unit tests use mocked
external dependencies. [Testing](docs/testing.md) separates deterministic tests,
MCP/container checks and opt-in live probes. [Baseline audit](docs/BASELINE_AUDIT.md)
records the unmodified upstream results. [Migration](docs/WHITE_LABEL_MIGRATION.md)
records intentional changes and every remaining upstream vendor reference.

## Licence and attribution

The upstream MIT copyright is retained verbatim in [LICENSE](LICENSE), with
[third-party notices](THIRD_PARTY_NOTICES.md). The product name, vendor, descriptions,
URLs and logo are deployment configuration. Branding does not change openEHR standards
or imply authorship of upstream components, EY certification or clinical validation.

Archetype Designer users: see the [integration guide](docs/ARCHETYPE_DESIGNER_INTEGRATION.md) for shared model repositories, file exchange and the current synchronization limits.
