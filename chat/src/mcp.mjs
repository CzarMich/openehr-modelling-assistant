export const WRITE_TOOLS = new Set([
    "model_traceability_save",
    "governance_prepare",
    "governance_validate",
    "governance_request_review",
    "governance_reopen_draft",
    "model_project_create",
    "model_artifact_save",
    "model_branch_create",
    "model_review_request",
    "terminology_catalogue_save",
    "terminology_binding_plan_save",
]);
export const READ_TOOLS = new Set([
    "model_traceability_get",
    "model_traceability_explain",
    "model_traceability_requirement",
    "governance_get",
    "governance_list",
    "ckm_sources",
    "ckm_archetype_search",
    "ckm_federated_search",
    "ckm_archetype_get",
    "ckm_template_search",
    "ckm_template_get",
    "guide_search",
    "guide_get",
    "guide_adl_idiom_lookup",
    "examples_search",
    "examples_get",
    "type_specification_search",
    "type_specification_get",
    "terminology_resolve",
    "model_repository_info",
    "model_repository_branches",
    "model_repository_diff",
    "model_review_get",
    "model_projects",
    "model_project_get",
    "model_artifact_get",
    "model_artifact_history",
    "model_requirements_coverage",
    "model_validate",
    "model_diff",
    "template_build_oet",
    "model_qa",
    "model_project_qa",
    "terminology_capabilities",
    "terminology_lookup",
    "terminology_validate_code",
    "terminology_expand",
    "terminology_translate",
    "terminology_resource_search",
    "terminology_resource_get",
    "terminology_binding_validate",
    "terminology_diff",
    "terminology_manifest",
    "model_terminology_inspect",
    "terminology_binding_plan",
    "terminology_binding_plan_get",
    "terminology_catalogue_get",
    "terminology_catalogue_search",
    "terminology_catalogue_lookup",
    "terminology_catalogue_validate",
    "terminology_catalogue_expand",
    "terminology_catalogue_translate",
]);
export class McpClient {
    constructor(config, signal) {
        this.config = config;
        this.signal = signal;
        this.sequence = 0;
        this.session = null;
    }
    async rpc(method, params, notification = false) {
        const id = ++this.sequence,
            headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
        if (this.config.mcpKey) headers[this.config.mcpKeyHeader] = this.config.mcpKey;
        if (this.session) {
            headers["Mcp-Session-Id"] = this.session;
            headers["MCP-Protocol-Version"] = "2025-03-26";
        }
        const response = await fetch(this.config.mcpUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, params }),
            signal: AbortSignal.any([this.signal, AbortSignal.timeout(60000)]),
            redirect: "error",
        });
        if (!response.ok) throw new Error("Modelling service unavailable");
        this.session = response.headers.get("mcp-session-id") || this.session;
        const reader = response.body.getReader();
        let size = 0,
            parts = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 16 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("Modelling response too large");
            }
            parts.push(value);
        }
        if (notification) return {};
        const text = Buffer.concat(parts).toString("utf8");
        const result = text.trim().startsWith("{")
            ? JSON.parse(text)
            : text
                  .split("\n")
                  .filter((line) => line.startsWith("data:"))
                  .map((line) => JSON.parse(line.slice(5)))
                  .find((item) => item.id === id);
        if (!result || result.error) throw new Error("Modelling tool request failed");
        return result.result;
    }
    async tools() {
        await this.rpc("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "openehr-browser-chat", version: "1.0" },
        });
        await this.rpc("notifications/initialized", {}, true);
        const tools = [];
        let cursor;
        do {
            const result = await this.rpc("tools/list", cursor ? { cursor } : {});
            tools.push(...result.tools);
            cursor = result.nextCursor;
            if (tools.length > 100) throw new Error("Tool catalogue too large");
        } while (cursor);
        return tools.filter(
            (tool) => READ_TOOLS.has(tool.name) || (this.config.allowWrites && WRITE_TOOLS.has(tool.name)),
        );
    }
    async call(name, args) {
        if (!READ_TOOLS.has(name) && !(this.config.allowWrites && WRITE_TOOLS.has(name)))
            throw new Error("Tool is not available");
        return this.rpc("tools/call", { name, arguments: args });
    }
}
