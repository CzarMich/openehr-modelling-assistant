# Platform completion audit and execution record

The autonomous A–Z mandate resumes the implementation. The earlier pause is superseded. Engineering autonomy does not grant runtime agents clinical approval or production-release authority.

[The machine-readable queue](COMPLETION_QUEUE.json) records IMPLEMENTED, PARTIAL, NOT IMPLEMENTED and BLOCKED EXTERNALLY separately. A phase is not complete because its interfaces exist. Update the queue with delivered evidence as each increment passes its checks. External acceptance and adapter implementation are separate entries; missing tenant credentials do not justify leaving an adapter unimplemented.

## Audited surface

The audit covers the README, capability matrix, configuration, architecture, implementation and continuation records; domain/repository/terminology contracts and their implementations; all exposed tools/prompts/resources; authentication and HTTP boundaries; repository and CKM integrations; validation/governance/QA; TODO/FIXME and unsupported branches; skipped tests; the official MCP expected-failure evidence; and deployment/CI definitions.

The starting implementation has no hidden compiler: `TemplateCompiler` is an interface. `GitModelRepository::createReview` throws an unsupported-operation error. Provider selection reserves GitHub, GitLab and SharePoint. Native OIDC previously fails closed at startup, while browser OIDC is an independent client boundary. The saved identity checkpoint is unaccepted work, with an uninitialized security fixture and missing discovery. QA explicitly cannot certify a release. Existing ADL checks are header checks, and AQL execution/parsing are absent. XML diff is structural rather than a complete semantic model diff. These are execution tasks, not capabilities to relabel.

The conditional spec-digest skip concerns absent bundled source files; the baseline currently executes all available fixtures. Official MCP expected failures include suite-specific synthetic tools and optional protocol features. Product interoperability probes are kept distinct from full official-suite conformance. Review each expectation before changing it; never suppress new failures to pass a gate.

## Baseline and first increment

The unchanged baseline passes specification traceability, PHPStan level 8 and 651 PHP tests / 2978 assertions; see [the baseline log](evidence/completion-baseline-tests.txt). Existing browser and deployed integration evidence remains under `evidence/`.

Native identity is the first increment because persisted governance depends on verified actors. Complete discovery, pinned trust, signature/time/audience checks, rotation and negative tests before accepting it. Bearer credentials remain delegated credentials: an `amr` claim alone must never authorize clinical approval. Preserve existing local and API-key deployments and the separate browser client.

Phase 1 also completes hosted repository capabilities and SharePoint, terminology/binding services, bounded structural validation, persisted governance, traceability and formal QA. Its gate applies to that defined scope; genuine language/semantic conformance and OPT compilation follow in Phase 2 through a qualified engine. Do not claim them from Phase 1 structural checks. The remaining phase ordering and scope are retained in the queue through visual modelling, releases, interoperability, policy, search, portability, observability and complete CI acceptance.

## Delivery rules

For each increment: implement the domain/adapters, execute meaningful positive/negative/contract/security checks, update documentation and diagrams, commit, push, watch every workflow for the exact SHA, correct failures, verify deployment, then continue. Keep deployment secrets, patient data, private provider responses and personal credentials outside evidence. Record live external tests as unexecuted where the relevant account is unavailable; mocked contract tests are never described as live acceptance.

Hosted Git completion adds configured-repository metadata, branches/protection and draft review APIs over the existing Git storage, with a shared application service and closed MCP schemas. Real GitHub acceptance passed and cleaned up its synthetic branch/review. GitLab contract checks pass; live acceptance is explicitly external. SharePoint followed this increment; its acceptance boundary is recorded below.

SharePoint now implements the logical snapshot repository contract with conditional Graph writes, OAuth credentials and tenant storage boundaries. Production-container HTTPS fixtures and stateful concurrency/security tests pass; live Microsoft tenant acceptance remains external. Existing filesystem storage keeps its format. Terminology is the next Phase 1 capability.

The governance increment replaces the illustrative transition helper with a persisted exact-revision application service, append-only audit storage, trusted interactive human identity, role-gated browser decisions and a versioned OpenAPI contract. Real incomplete validation still blocks approval/publication. The default browser image now excludes the optional model-provider executable. Remaining formal QA, requirements graph and qualified-engine work stays explicit in the queue.

The traceability increment adds a persistent typed graph, exact source/audit references, XML/JSON anchor checks, deterministic why/coverage queries and unresolved/stale findings across all repository providers. Explicit coverage declarations remain separate from executed validation and clinical satisfaction. Native openEHR path semantics belong to the qualified engine phase.

Staged validation and formal project QA now cover the Phase 1 document/evidence scope: XML/JSON parsing, OET/OPT and simplified-data profiles, exact source/provenance/requirement/audit checks and explicit unavailable-check findings. Qualified RM/native-path/dependency semantics remain Phase 2 work. Continue CKM and protocol completion without relabelling unavailable conformance.

The CKM increment adds source-bound service credentials, mounted rotation and bounded federated discovery with distinct version/source identities and explicit failures/truncation. Public international/Norwegian retrieval and isolated authenticated HTTPS contracts pass; private account acceptance needs organisation credentials.

The Phase 1 gate now includes explicit MCP capabilities, supported-version negotiation, production HTTP/stdio product probes and applicable pinned official scenarios. Whole demonstration-suite diagnostics are not a universal conformance claim. Proceed to Phase 2 native engine integration; structural/evidence checks remain distinct from clinical-model qualification.

The native engine increment now supplies ADL 2-to-OPT 2 compilation, native AOM/RM inspection and AQL syntax parsing, with exact-revision saved build evidence. Qualified release integration and legacy OET-to-OPT 1.4 remain separate work. The expanded external modelling exchange mandate is captured in [its execution queue](EXTERNAL_MODELLING_REQUIREMENTS.json); its entries are requirements, not implemented-capability claims. See [compiler acceptance](evidence/engine-verification.json).
