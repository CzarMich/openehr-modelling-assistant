import test from "node:test";
import assert from "node:assert/strict";
import { draftAql } from "../src/aql-drafting.mjs";

const input = {
    provider: "codex",
    intent: "Return measured weight",
    model: { content: "synthetic OPT", format: "opt14" },
    paths: ["/content[at0001]"],
};
const query = "SELECT m/content[at0001] FROM COMPOSITION m LIMIT 100";
function fixture(run) {
    const calls = [];
    return {
        calls,
        options: {
            input: structuredClone(input),
            identity: "alice",
            session: { identity: "alice" },
            signal: new AbortController().signal,
            provider: { run },
            cdr: {
                request: async (session, operation, args) => {
                    calls.push({ session, operation, args });
                    if (operation === "inspect")
                        return {
                            valid: true,
                            identifier: "Weight",
                            inspection: {
                                paths: [
                                    { path: "/", rm_type: "COMPOSITION" },
                                    { path: "/content[at0001]", rm_type: "DV_QUANTITY", label: "Weight" },
                                ],
                            },
                        };
                    assert.equal(operation, "validate", "drafting must never read or execute CDR data");
                    assert.deepEqual(args.templates, [
                        { identifier: "selected_template", content: input.model.content },
                    ]);
                    return { valid: !args.query.includes("missing"), ast: { limit: 100 } };
                },
            },
        },
    };
}
test("isolated AQL drafting sees model fields only and returns one validated draft to the editor", async () => {
    const f = fixture(async ({ messages, tools, callTool, instructions }) => {
        assert.match(instructions, /only the user can run/i);
        assert.equal(messages.length, 1);
        const context = JSON.parse(messages[0].content);
        assert.deepEqual(Object.keys(context).sort(), ["intent", "model", "selectedPaths"]);
        assert(!JSON.stringify(context).includes(input.model.content), "raw source is not provider context");
        assert.deepEqual(
            tools.map((tool) => tool.name),
            ["model_paths", "submit_aql"],
        );
        for (const name of [
            "aql_execute",
            "aql_history",
            "aql_saved_get",
            "cdr_connection_list",
            "shell",
            "personal_repository_get",
        ])
            await assert.rejects(callTool(name, {}), /only inspect model paths/);
        const paths = await callTool("model_paths", { filter: "weight" });
        assert.equal(paths.items[0].label, "Weight");
        assert(
            (
                await callTool("submit_aql", {
                    query: "SELECT m/missing FROM COMPOSITION m LIMIT 100",
                    parameters: {},
                    explanation: "",
                })
            ).isError,
        );
        await callTool("submit_aql", {
            query,
            parameters: { template_id: "Weight", ehr: null },
            explanation: "Review this model-based draft.",
        });
        return "Ignored prose, not a second query.";
    });
    const draft = await draftAql(f.options);
    assert.equal(draft.query, query);
    assert.equal(draft.executed, false);
    assert.deepEqual(
        f.calls.map((call) => call.operation),
        ["inspect", "validate", "validate"],
    );
});
test("drafting rejects query/result injection and never accepts unvalidated provider prose or patient parameter values", async () => {
    const f = fixture(async ({ callTool }) => {
        await assert.rejects(
            callTool("submit_aql", { query, parameters: { ehr: "synthetic-patient-id" }, explanation: "" }),
            /null parameter/,
        );
        return query;
    });
    for (const field of ["query", "results", "parameters", "history", "credentials", "messages"]) {
        await assert.rejects(
            draftAql({ ...f.options, input: { ...input, [field]: "synthetic-private-canary" } }),
            /Inspect a model/,
        );
    }
    assert.equal(f.calls.length, 0);
    await assert.rejects(draftAql(f.options), /did not produce a validated query/);
    assert.deepEqual(
        f.calls.map((call) => call.operation),
        ["inspect"],
    );
});
