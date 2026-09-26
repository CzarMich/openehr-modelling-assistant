# Terminology, value sets and bindings

The platform distinguishes a code system, a versioned value set, a template node and an explicit binding. A code system URL is a canonical identifier; it is not necessarily a network address to fetch. All network calls go to the configured terminology provider. The local provider and FHIR adapter implement the same domain interface.

## Optional FHIR terminology server

Leave `TERMINOLOGY_FHIR_BASE_URL`, `TERMINOLOGY_API_KEY` and `TERMINOLOGY_BEARER_TOKEN` empty to run without an external server. Models need no terminology binding. Local value sets and bundled openEHR terminology remain available; requested remote operations return `NOT_EXECUTED` with `valid: null`.

To enable an external server, set `TERMINOLOGY_FHIR_BASE_URL=https://terminology.example.org/fhir/` and its supported authentication. Use either `TERMINOLOGY_API_KEY` with `TERMINOLOGY_API_KEY_HEADER`, or `TERMINOLOGY_BEARER_TOKEN`. Keep credentials outside Git, logs, prompts and provenance. A canonical code-system URL is an identifier, not necessarily the API base.

The terminology server verifies API keys; an identity provider normally does not need a client setting for a key validated by that server. Its gateway must forward the configured key header to the backend without an interactive login redirect. Header presence alone never grants access. Preserve browser-session authentication for interactive API documentation and separate it from machine credentials. Sharing DNS, a subnet or a deployment is not an identity.

CodeSystem validation uses standard FHIR `url` for GET/POST. Keep `TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER=url` by default; select `system` only for a verified legacy provider. This setting does not change lookup or ValueSet parameters. Dataset and version visibility depend on the authenticated principal.

For a terminology server supporting Keycloak service-account tokens, configure a confidential client, service accounts, minimum API roles and matching issuer/audience/tenant claims. See [Keycloak service accounts](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts). The assistant accepts a provisioned bearer token; token acquisition/refresh is not currently automatic. Native inbound MCP OIDC is a separate capability.

## Operations

`terminology_capabilities` reads `/metadata`; advertised operations are not assumed to work. `terminology_lookup` calls `CodeSystem/$lookup`. `terminology_validate_code` uses `CodeSystem/$validate-code` or `ValueSet/$validate-code`. `terminology_expand` requests at most 500 concepts and preserves expansion paging metadata. Full expansion, hierarchy, subsumption, concept-map translation and federated discovery are not implemented. [FHIR R4 terminology operations](https://hl7.org/fhir/R4/terminology-service.html) define the adapter contract.

An absent provider, redirect, authentication failure, timeout, invalid response or missing deterministic result returns `NOT_EXECUTED`, `valid:null`, and `TERMINOLOGY VALIDATION NOT EXECUTED`. `VALIDATED` means the requested provider operation ran; code membership still requires `valid:true`. A negative result remains negative. Requested and returned versions are separate. Missing version confirmation is a warning; mismatched versions fail. Never infer a release edition from a generic system URI returned as `version`.

## Explicit records

A local value set can be stored at `terminology/valuesets/feeding.json`:

```json
{"id":"feeding","system":"https://example.org/terminology/local/feeding","version":"1","source":"local","concepts":[{"code":"mixed","display":"Mixed feeding"}]}
```

Local codes remain local. They are not SNOMED or LOINC identifiers. An external reference instead uses `source:"external"`, a canonical URL, explicit `version`, and optional `code_system_version`. Store references rather than redistributing restricted expansions.

A binding record can be stored at `terminology/bindings/feeding.json`:

```json
{"id":"feeding-binding","artifact":"templates/admission.oet","node":"/data[at0001]","strength":"REQUIRED","system":"https://example.org/terminology/local/feeding","value_set":"feeding","value_set_version":"1","codes":["mixed"],"requirements":["REQ-NEO-1"]}
```

The node in this example is a placeholder and must be replaced with an actual model path. REQUIRED, EXTENSIBLE, PREFERRED and EXAMPLE are platform review policies; they are not claimed as native openEHR syntax. `terminology_binding_validate` checks explicit XML path presence, value-set references and selected codes against the local or external provider. It cannot resolve inherited archetype nodes, verify contextual path uniqueness, apply native constraints or prove OET/OPT preservation. Overall validity stays PARTIAL/null. Save its timestamp, content hash, source endpoint and version results as evidence.

`terminology_diff` compares additions, removals, changed displays/properties, inactive codes and replacement suggestions. It never replaces codes automatically. Hierarchy change analysis is NOT_EXECUTED. `model_diff` reports XML attribute/leaf changes including serialized binding changes, but cannot infer external dependency changes; run both comparisons.

`terminology_manifest` emits only bindings explicitly linked to the requested artifact, including requirement IDs. It declares dependencies; it does not certify a release. Repository revisions allow review of records and reports together. Native binding application, cross-project impact indexing, terminology approval/publication and Git PR/MR workflows remain extension work. The client may propose candidates, but must use deterministic checks before treating a code as verified.
