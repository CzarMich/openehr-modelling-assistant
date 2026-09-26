# Terminology, value sets and bindings

The platform distinguishes a code system, a versioned value set, a template node and an explicit binding. A code system URL is a canonical identifier; it is not necessarily a network address to fetch. All network calls go to the configured terminology provider. The local provider and FHIR adapter implement the same domain interface.

## AmyTerm and Keycloak

Configure the assistant with `TERMINOLOGY_FHIR_BASE_URL=https://amyterm.sandbox.hygeoniq.com/fhir/`, `TERMINOLOGY_API_KEY` from your secret store and `TERMINOLOGY_API_KEY_HEADER=X-API-Key`. Keep the key outside Git, logs, prompts and provenance. The sandbox accepts the existing service key without browser login. The development hostname currently redirects to login; a credential there does not prove that gateway routing is configured.

AmyTerm itself verifies this API key. No Keycloak client setting is needed for application API keys. On AmyTerm, enable `TERMINOLOGY_API_KEY_ENABLED=true`, configure the same service secret as `TERMINOLOGY_API_KEY`, and ensure its ingress forwards `X-API-Key` to the backend for FHIR requests without an interactive login redirect. Presence of a header alone must never authorize an operation: the backend verifies its value and permissions. Keep browser UI SSO and machine API authentication separate; same DNS, subnet or deployment is not an identity. Do not send forged trusted identity headers.

The inspected legacy AmyTerm CodeSystem validation route accepts `system` instead of standard FHIR `url`. For that deployment set `TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER=system`. The default is `url`; use it once the server accepts the standard parameter. This compatibility option does not change lookup or ValueSet parameters. Lookup/validation success is separate from whether ICD-10-GM or any particular dataset/version is installed.

Keycloak service-account tokens are an alternative. Create a confidential client with client authentication and service accounts enabled, grant only the required API roles, and configure AmyTerm's issuer, JWKS, accepted client IDs and tenant membership/claims. These settings must match AmyTerm's bearer-token validator. Do not enable password grants to make API keys work. See [Keycloak service accounts](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts). The assistant accepts a provisioned `TERMINOLOGY_BEARER_TOKEN` instead of a key; automated token acquisition/refresh is not implemented. Native inbound MCP OIDC is also not implemented; these are separate authentication directions.

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
