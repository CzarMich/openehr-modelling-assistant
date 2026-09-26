# Testing

Run offline unit, schema and regression checks with `make ci`. Tests mock external HTTP. Coverage spans preserved upstream tools/prompts/resources, configuration, auth rejection, named CKMs, secure XML, draft provenance, storage traversal/concurrency/history, governance refusal, traceability and local/FHIR terminology. `make conformance` runs the official MCP suite; its documented expected-failure file records unsupported SDK features, not silently successful tests.

Run the independent protocol client against a running container:

```bash
python3 scripts/mcp-smoke.py --url http://127.0.0.1:8343/mcp --evidence /tmp/http-smoke.json
python3 scripts/mcp-smoke.py --url http://127.0.0.1:8343/mcp --live-ckm --live-terminology --evidence /tmp/live-smoke.json
```

The second command requires configured external services and network access. `AUTH_API_KEY`/`AUTH_API_KEY_HEADER` in the client environment authenticate the MCP connection. Terminology credentials belong in the server environment. `--writes` creates a uniquely named project and checks revision conflicts; use a disposable verification volume. `--catalogue` exports public tool schemas. A missing dependency or assertion failure exits nonzero; live failures are not reported as offline unit-test failures or quietly passed.

Live terminology defaults exercise an available SNOMED example and an implicit value set. Override `SMOKE_TERMINOLOGY_SYSTEM`, `SMOKE_TERMINOLOGY_CODE` and `SMOKE_VALUESET` for installed content. A canonical URI alone does not imply a dataset exists. Preserve response status, scope, timestamp and version confirmation; do not commit keys, expanded restricted terminology or clinical data.

Before delivery also build production and development images, check liveness/readiness, exercise API-key rejection/acceptance, allowed hosts/origins, request limits, stdio initialization, restart persistence, and startup without CDR/terminology settings. Run `composer audit` in the development container. Store sanitized execution metadata under `docs/evidence/`; keep repeatable procedures here.
