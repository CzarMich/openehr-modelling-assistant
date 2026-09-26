# Implementation and verification report

## Delivered scope

The standalone project is named **openEHR Modelling Assistant**, with repository `CzarMich/openehr-modelling-assistant` and directory `/home/hyq/workspace/openehr-modelling-assistant`. Original MIT copyright and attribution remain intact. The application is independent of the CDR checkout, upstream hosting, client plugins, model-provider SDKs and a CDR.

The implementation exposes 31 MCP tools, preserves all 14 original prompts, 91 concrete resources and three resource templates, and keeps the bundled guides, BMM definitions, examples and terminology. It adds configurable branding, named CKM sources, provider-neutral projects with persistent revisions, bounded validation/diff/draft OET services, explicit terminology/value-set/binding records and a local/FHIR provider boundary. See the complete [capability matrix](../CAPABILITIES.md) and [generated tool catalogue](MCP_TOOLS.md).

## Incremental changes

1. Captured the upstream surface and ran the baseline before refactoring: 536 tests / 2640 assertions, PHPStan and spec-check passing. Recorded the original dependency advisories.
2. Replaced runtime/vendor-specific naming with deployment settings, retained existing modelling resources/tool contracts, upgraded affected dependencies, and introduced domain/storage/terminology interfaces.
3. Added filesystem persistence and concurrency, secure XML/preflight/diff, source-grounded draft generation, explicit terminology records and conservative governance/QA policy.
4. Hardened transports, upstream clients, resource paths, logs and containers; corrected real SAPI Host duplication and unknown body-size handling found by HTTP integration tests.
5. Documented installation, configuration, environments, Microsoft/generic clients, tools, repository/terminology workflows, limits and future integrations. Added independent protocol/security probes and CI deployment automation.

## Executed checks

Execution metadata belongs in [evidence](evidence/), including the baseline and final command logs.

| Check | Result / evidence |
|---|---|
| PHP 8.4 unit and regression suite | PASS: 648 tests / 2959 assertions; `git-unit-tests.txt` |
| PHPStan level 8 and requirement drift gate | PASS in the same final log |
| Composer dependency audit | No known advisories after compatible dependency updates |
| Production app/ingress and development image build | PASS; readiness confirmed through Caddy/FPM |
| HTTP initialization, all intended tools, prompts/resources/read/get and invalid inputs | PASS: `http-smoke.json`, `development-smoke.json` |
| Independent stdio initialization and tool discovery | PASS: `stdio.json` |
| Production API-key acceptance/rejection, Host/Origin enforcement, body limit | PASS: `http-security.json` |
| Startup and tools without CDR or external terminology | PASS: `authenticated-no-cdr-smoke.json` |
| Project creation, immutable revisions and stale-write rejection | PASS: `live-smoke.json` |
| Artifact content and history after container restart | PASS: `restart-persistence.json` |
| Live international CKM archetype/template search and retrieval | PASS: `live-smoke.json` |
| Draft OET generated from retrieved COMPOSITION/ENTRY archetypes | PASS for documented draft scope; no compilation/clinical approval |
| Live terminology server capability, lookup, CodeSystem validation, bounded expansion and ValueSet membership | PASS: `live-smoke.json`; service key kept outside the repository |
| Official MCP conformance suite | Expected-failure baseline passed: 8 checks passed, 23 failed as explicitly expected. This is not full suite conformance. See `mcp-conformance.txt`. |
| Microsoft tenant integration | NOT TESTED: no Copilot tenant test performed; official-source configuration is documented |

The official suite expects synthetic tools/resources/prompts not provided by this product, plus optional sampling/elicitation/subscription features. Its localhost-Origin success assertion conflicts with the deployment's default deny-browser-origin policy; its malicious Host assertion passes. Product-specific resource, prompt and tool paths are exercised separately. No baseline entry was added to hide a new failure.

Multiple named CKMs are configuration- and unit-tested; only the international CKM was live-tested. terminology server initially required an explicit `system` compatibility parameter for CodeSystem validation. The fix in `CzarMich/AmTerminology` is deployed to development, the server and Kubernetes. Live development/server probes verify GET/POST standard `url` validation, API-key authentication, browser-session ICD-10-GM lookup, Swagger security schemes and rejected credentials; see `amyterm-deployed-verification.json`. A service key sees its configured namespaces; a missing code is not proof of missing content for every user. No restricted expansion or patient content is committed as evidence.

## Validation and platform limits

XML well-formedness is deterministic. OET/OPT structural checks and ADL header checks are partial. The draft generator handles only a retrieved COMPOSITION with direct ENTRY placements. Full ADL/AQL grammar validation, schema/RM/dependency validation, nested template editing, native binding application/preservation, OPT compilation, composition validation and AQL execution are not implemented. Missing stages are NOT_EXECUTED and QA never marks a draft release-eligible.

Filesystem snapshots and generic Git storage are implemented. Git supports ordinary model files, GitHub/GitLab remotes, commit history, remote conflict detection and offline operation. Hosted Git review APIs, SharePoint storage, native inbound OIDC, user/tenant RBAC, persisted approvals, visual editing, CDR adapters and model-release automation are not implemented. Interfaces and rejection behaviour are documented; selecting an unsupported provider or OIDC mode fails clearly. One API key is one deployment principal, not a human approval identity. Requirement coverage represents explicit links, not clinical correctness or executed tests.

## Deployment and operations

Target MCP endpoint: `https://openehr-modelling.sandbox.hygeoniq.com/mcp`. `.github/workflows/pr-validation.yml` gates delivery with tests/audit/image and protocol checks; `deploy-vps.yml` deploys only a successfully validated main SHA. `scripts/watch-ci.sh` watches every run for the exact commit and reports failures. The initial production rollout and all its GitHub checks succeeded. Exact accepted revisions, workflow links and environment results are recorded in `evidence/deployment.json`. Public live tools and integration checks passed in `deployed-live-smoke.json`. Public authentication, Origin and request-size checks are in `deployed-public-security.json`; the Host check runs separately against the deployed application listener in `deployed-listener-security.json`, because an invalid Host selects another virtual host at the shared public proxy. Security probes refuse redirects so credentials cannot follow a redirect to another host.

The server uses `/opt/openehr-modelling-assistant`, an existing valid wildcard TLS certificate, loopback-bound Compose services and a dedicated model volume. Runtime secrets live in `config/runtime.env`; local client credentials are in `/home/hyq/.config/openehr-modelling-assistant/client.env` with restrictive permissions. Secret values are never included here. See [deployment](DEPLOYMENT.md), [configuration](CONFIGURATION.md), [security](SECURITY.md) and [Microsoft integration](MICROSOFT_AGENT_INTEGRATION.md).

terminology server delivery now builds images on the hosted acceptance runner, transfers checksummed artifacts to the trusted publisher, then verifies GitOps, development and server rollout. It no longer rebuilds on the Kubernetes host. This followed a measured disk-pressure outage; raising guards, restoring ingress and reclaiming unused images/cache restored all cluster deployments. Cleanup preserved containers, persistent volumes and rollback images. Harbor garbage collection completed successfully. The exact cleanup counts are in the deployment evidence.

The active GitHub repository was recreated independently with a new repository identity, preserving Git history. GitHub confirms `fork:false` and no parent. The former fork is read-only at `CzarMich/openehr-modelling-assistant-fork-archive`; its deployment credentials were removed. Historical workflow evidence links point to that archive. Required MIT attribution remains intact. See [Archetype Designer integration](ARCHETYPE_DESIGNER_INTEGRATION.md) for the verified repository connection path and current adapter limits.

## Git and development integration

Real Git tests exercise local history, two independent remote writers, rejected stale writes, native-file round trips through an external Git client, rejected pushes without advancing the accepted local branch, branch/diff operations, remote history rewrites, symlink rejection and disabled writes. The authenticated development deployment uses Git with no external terminology server; its HTTP evidence verifies persistence, history, conflict rejection and empty terminology manifests. This is not evidence of a hosted Designer account connection or a clinical model round trip.
