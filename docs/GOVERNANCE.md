# Modelling governance and evidence

All MCP artifact saves create DRAFT revisions. Agents cannot set validation, approval or release metadata through the repository tool. There is no MCP approval/release operation. A validated XML document is not a clinically approved model.

The pure `Governance` policy defines DRAFT → IN_REVIEW → VALIDATED → APPROVED → RELEASED → DEPRECATED, with CHANGES_REQUESTED returning to DRAFT. Promotion requires a deterministic validation report matching the current content hash and explicitly permitting release. Approval/release additionally require a trusted human approver distinct from the author. The current QA pipeline cannot produce release eligibility. Persisted governance transitions, trusted human identity, role administration and review UI are not implemented; this policy is a tested boundary for a future authenticated application.

Keep explicit decisions under `decisions/` with ID, artifact, requirement, proposed change, rationale, sources, timestamp and known authors/reviewers. Caller-supplied names are assertions, not authenticated approvals. Missing reviewers stay unresolved. Future roles may include clinical reviewer, modeller, terminology reviewer, technical reviewer and approver without organisational job-title assumptions.

Store requirements as Markdown, JSON or YAML under `requirements/`; structured coverage currently accepts JSON objects supplied to `model_requirements_coverage`. Each link names a requirement, existing artifact, node/path, rationale and coverage classification. Coverage reports full, partial, unresolved and intentional exclusions with reasons. It measures explicit declarations, not clinical correctness, valid paths or passing tests. Save validation and test references with links and review them independently.

QA executes the documented preflight and lists missing grammar, dependency, terminology, compilation, composition and AQL stages as NOT_EXECUTED. Run terminology checks separately and preserve their report. Do not publish a successful release because the unavailable stages were skipped. Future provider integrations must join code/model changes, requirements, diffs, terminology impacts and evidence in a review package before human approval.

Native OIDC supplies verified issuer/subject/tenant identity and signed permissions for draft writes. Bearer tokens remain delegable to agents, so even MFA claims do not authorize a human approval. Persisted governance must collect a separate authenticated interactive approval for the exact revision; see [the identity boundary](OIDC.md).

Binding-plan candidate membership, local code validation and `CURRENT` freshness are separate from clinical approval. Plans are DRAFT evidence. Existing references remain preserved, unresolved choices stay explicit, and no plan automatically widens constraints, substitutes codes or selects binding strength. See [binding plans](TERMINOLOGY_BINDING_PLANS.md).
