#!/usr/bin/env python3
"""Independent, standard-library MCP HTTP client. No LLM SDK or server internals.
Secrets are read from environment; evidence excludes headers, sessions and model content.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


class RpcError(Exception):
    def __init__(self, method, code):
        self.code = code
        super().__init__(f"{method}: JSON-RPC error {code}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, url, bearer=None):
        self.url, self.session, self.sequence = url, None, 0
        self.opener = urllib.request.build_opener(NoRedirect())
        self.headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
        if bearer is not None:
            self.headers["Authorization"] = "Bearer " + bearer
        elif os.getenv("AUTH_API_KEY"):
            self.headers[os.getenv("AUTH_API_KEY_HEADER", "X-API-Key")] = os.environ["AUTH_API_KEY"]

    def rpc(self, method, params=None, notify=False):
        self.sequence += 1
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        if not notify:
            payload["id"] = self.sequence
        headers = dict(self.headers)
        if self.session:
            headers.update({"Mcp-Session-Id": self.session, "MCP-Protocol-Version": "2025-03-26"})
        request = urllib.request.Request(self.url, data=json.dumps(payload).encode(), headers=headers)
        with self.opener.open(request, timeout=90) as response:
            self.session = response.headers.get("Mcp-Session-Id", self.session)
            raw = response.read(16 * 1024 * 1024 + 1)
            if len(raw) > 16 * 1024 * 1024:
                raise RuntimeError("MCP response exceeds the smoke client's size limit")
            body = raw.decode()
        if notify or not body:
            return {}
        if body.lstrip().startswith("{"):
            result = json.loads(body)
        else:
            events = [json.loads(line[5:].strip()) for line in body.splitlines() if line.startswith("data:")]
            result = next(e for e in events if e.get("id") == self.sequence)
        if "error" in result:
            raise RpcError(method, result["error"].get("code"))
        return result["result"]

    def listing(self, method, key):
        result, cursor = [], None
        while True:
            page = self.rpc(method, {"cursor": cursor} if cursor else {})
            result.extend(page.get(key, []))
            cursor = page.get("nextCursor")
            if not cursor:
                return result

    def tool(self, name, arguments=None, error=False):
        try:
            result = self.rpc("tools/call", {"name": name, "arguments": arguments or {}})
        except RpcError as exc:
            if error and exc.code == -32602:
                return {"rejected": True}
            raise
        if error:
            assert result.get("isError") or result.get("structuredContent", {}).get("success") is False
            return result
        assert not result.get("isError"), f"{name}: tool error"
        if "structuredContent" in result:
            data = result["structuredContent"]
        else:
            text = "\n".join(c["text"] if c.get("type") == "text" else c.get("resource", {}).get("text", "") for c in result.get("content", []))
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                data = text
        if isinstance(data, dict) and "success" in data:
            assert data["success"], f"{name}: {data.get('error', {}).get('code')}"
            data = data["result"]
        return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8343/mcp")
    parser.add_argument("--evidence", type=Path)
    parser.add_argument("--catalogue", type=Path, help="Write discovered public tool schemas")
    parser.add_argument("--live-ckm", action="store_true")
    parser.add_argument("--live-terminology", action="store_true")
    parser.add_argument("--without-terminology", action="store_true", help="Assert optional external terminology is unconfigured")
    parser.add_argument("--writes", action="store_true", help="Create an isolated smoke project; requires enabled writes")
    args = parser.parse_args()
    client, checks = Client(args.url), []

    def record(name, detail=None):
        checks.append({"check": name, "status": "PASS", "detail": detail})
        print("PASS " + name, flush=True)

    try:
        init = client.rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                          "clientInfo": {"name": "independent-smoke-client", "version": "1.0"}})
        assert init["serverInfo"]["name"] == os.getenv("MCP_SERVER_NAME", "openehr-modelling-assistant")
        client.rpc("notifications/initialized", notify=True)
        record("initialize", init["serverInfo"])
        tools = client.listing("tools/list", "tools")
        expected = {'ckm_sources', 'ckm_archetype_search', 'ckm_archetype_get', 'ckm_template_search', 'ckm_template_get', 'guide_search', 'guide_get', 'guide_adl_idiom_lookup', 'examples_search', 'examples_get', 'type_specification_search', 'type_specification_get', 'terminology_resolve', 'model_projects', 'model_project_get', 'model_project_create', 'model_artifact_get', 'model_artifact_save', 'model_artifact_history', 'model_requirements_coverage', 'model_validate', 'model_diff', 'template_build_oet', 'model_qa', 'terminology_capabilities', 'terminology_lookup', 'terminology_validate_code', 'terminology_expand', 'terminology_binding_validate', 'terminology_diff', 'terminology_manifest'}
        assert expected <= {t['name'] for t in tools}, 'Required tool missing from discovery'
        assert len({t['name'] for t in tools}) == len(tools)
        assert all(t['inputSchema'].get('additionalProperties') is False for t in tools)
        record("tools/list", [t['name'] for t in tools])
        if args.catalogue:
            args.catalogue.parent.mkdir(parents=True, exist_ok=True)
            args.catalogue.write_text(json.dumps(tools, indent=2) + "\n")
        prompts = client.listing("prompts/list", "prompts")
        assert len(prompts) == 14
        record("prompts/list", len(prompts))
        resources = client.listing("resources/list", "resources")
        assert resources
        record("resources/list", len(resources))
        templates = client.listing("resources/templates/list", "resourceTemplates")
        assert templates
        record("resources/templates/list", len(templates))
        item = next(r for r in resources if r['uri'].startswith('openehr://guides/'))
        assert client.rpc("resources/read", {"uri": item['uri']})['contents']
        record("resources/read")
        prompt = prompts[0]
        arguments = {a['name']: 'Explain a draft openEHR model' for a in prompt.get('arguments', []) if a.get('required')}
        assert client.rpc("prompts/get", {"name": prompt['name'], "arguments": arguments})['messages']
        record("prompts/get")
        sources = client.tool("ckm_sources")
        assert sources['default'] in sources['sources']
        record("configured CKMs", list(sources['sources']))
        for name, arguments in [("guide_search", {}), ("guide_get", {"category":"howto", "name":"spec-lookup"}),
                                ("examples_search", {}), ("type_specification_search", {"namePattern":"DV_TEXT"}),
                                ("terminology_resolve", {"input":"433"})]:
            assert client.tool(name, arguments), name + ': empty response'
            record(name)
        client.tool("model_validate", {"content": "<a/>", "format": "xml", "unexpected": True}, error=True)
        record("invalid input rejected")
        valid = client.tool("model_validate", {"content":"<a/>", "format":"xml"})
        assert valid['valid'] is True
        bad = client.tool("model_validate", {"content":"<!DOCTYPE a [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><a>&x;</a>","format":"xml"})
        assert bad['valid'] is False
        record("XML validation and entity rejection")
        qa = client.tool("model_qa", {"content":"SELECT e/ehr_id/value FROM EHR e", "format":"aql"})
        assert qa['release_eligible'] is False
        record("unavailable checks cannot certify release")
        assert client.tool("model_projects")['capabilities']['storage']
        record("repository capability discovery")
        if args.writes:
            project = 'smoke-' + str(time.time_ns())
            created = client.tool('model_project_create', {'id': project, 'name':'Integration smoke'})
            first = client.tool('model_artifact_save', {'project':project,'path':'requirements/smoke.md','content':'Explicit test requirement','metadata':{'source':'synthetic integration check'}})
            got = client.tool('model_artifact_get', {'project':project,'path':'requirements/smoke.md'})
            assert got['content'] == 'Explicit test requirement'
            assert got['metadata']['source'] == 'synthetic integration check'
            second = client.tool('model_artifact_save', {'project':project,'path':'requirements/smoke.md','content':'Revised explicit test requirement','expectedRevision':first['revision']})
            assert first['revision'] != second['revision']
            client.tool('model_artifact_save', {'project':project,'path':'requirements/smoke.md','content':'stale','expectedRevision':first['revision']},error=True)
            assert len(client.tool('model_artifact_history', {'project':project,'path':'requirements/smoke.md'})['versions']) == 2
            record('persistent project, revisions, stale-write rejection', project)
        if args.live_ckm:
            for name, arguments in [('ckm_archetype_search', {'keyword':'body weight','maxResults':2}),
                                    ('ckm_archetype_get', {'identifier':'openEHR-EHR-OBSERVATION.body_weight.v2','format':'adl'}),
                                    ('ckm_template_search', {'keyword':'encounter','maxResults':2}),
                                    ('ckm_template_get', {'identifier':'1013.26.1','format':'oet'})]:
                assert client.tool(name, arguments)
                record('live '+name)
            draft = client.tool('template_build_oet', {'name':'Integration draft','composition':'openEHR-EHR-COMPOSITION.encounter.v1','entries':['openEHR-EHR-OBSERVATION.body_weight.v2']})
            assert draft['status'] == 'DRAFT'
            record('live CKM draft OET generation')
        if args.without_terminology:
            for name, arguments in [('terminology_capabilities', {}),
                                    ('terminology_lookup', {'system':'http://snomed.info/sct','code':'404684003'}),
                                    ('terminology_validate_code', {'system':'http://snomed.info/sct','code':'404684003'})]:
                result = client.tool(name, arguments)
                assert result['status'] == 'NOT_EXECUTED', name
            manifest = client.tool('terminology_manifest', {'artifact':'templates/unbound.oet','bindings':[]})
            assert manifest['terminology_dependencies'] == []
            record('modelling without terminology server or bindings')
        if args.live_terminology:
            capabilities = client.tool('terminology_capabilities')
            assert capabilities['status'] == 'VALIDATED'
            system = os.getenv('SMOKE_TERMINOLOGY_SYSTEM','http://snomed.info/sct')
            code = os.getenv('SMOKE_TERMINOLOGY_CODE','404684003')
            lookup = client.tool('terminology_lookup', {'system':system,'code':code})
            assert lookup['status'] == 'VALIDATED', lookup.get('errors')
            record('live terminology lookup', {'returned_version':lookup.get('returned_version')})
            valid = client.tool('terminology_validate_code', {'system':system,'code':code})
            assert valid['valid'] is True, valid.get('errors')
            record('live CodeSystem validation')
            vs = os.getenv('SMOKE_VALUESET','http://snomed.info/sct?fhir_vs=isa/404684003')
            expanded = client.tool('terminology_expand', {'valueSet':vs,'count':2})
            assert expanded['status'] == 'VALIDATED', expanded.get('errors')
            members = expanded['result']['expansion']['contains']
            assert members
            record('live bounded ValueSet expansion', {'count':len(members), 'total':expanded['result']['expansion'].get('total')})
            member = members[0]
            result = client.tool('terminology_validate_code', {'system':member['system'],'code':member['code'],'valueSet':vs})
            assert result['valid'] is True, result.get('errors')
            record('live ValueSet membership')
    except Exception as exc:
        checks.append({'check':'smoke stopped', 'status':'FAIL', 'detail':str(exc)})
        print('FAIL ' + str(exc), file=sys.stderr)
        return 1
    finally:
        if args.evidence:
            args.evidence.parent.mkdir(parents=True, exist_ok=True)
            args.evidence.write_text(json.dumps({'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),'checks':checks}, indent=2)+'\n')
    return 0

if __name__ == '__main__':
    sys.exit(main())
