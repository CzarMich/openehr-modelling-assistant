#!/usr/bin/env node
// Protocol fixture, never shipped in the runtime image.
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
const args = process.argv.slice(2).join(" ");
for (const flag of [
    "features.shell_tool=false",
    "features.unified_exec=false",
    "features.multi_agent=false",
    "features.view_image=false",
    "features.image_generation=false",
    "features.code_mode_host=true",
])
    assert.ok(args.includes(flag), flag);
assert.equal(process.env.CHAT_MCP_API_KEY, undefined);
assert.equal(process.env.CHAT_REVIEW_SIGNING_KEY, undefined);
assert.equal(process.env.TOKIO_WORKER_THREADS, "2");
assert.equal(process.env.RAYON_NUM_THREADS, "2");
const send = (data) => process.stdout.write(JSON.stringify(data) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
    const m = JSON.parse(line);
    if (m.method === "initialize") send({ id: m.id, result: { userAgent: "fixture" } });
    if (m.method === "thread/start") {
        assert.equal(m.params.sandbox, "read-only");
        assert.equal(m.params.approvalPolicy, "never");
        assert.equal(m.params.ephemeral, true);
        assert.equal(m.params.dynamicTools[0].name, "ckm_sources");
        send({ id: m.id, result: { thread: { id: "fixture-thread" } } });
    }
    if (m.method === "turn/start") {
        send({ id: m.id, result: { turn: { id: "fixture-turn" } } });
        if (m.params.input[0].text.includes("WAIT")) return;
        send({
            id: 100,
            method: "item/commandExecution/requestApproval",
            params: { threadId: "fixture-thread", turnId: "fixture-turn" },
        });
    }
    if (m.id === 100) {
        assert.equal(m.result.decision, "decline");
        send({
            id: 101,
            method: "item/tool/call",
            params: {
                threadId: "fixture-thread",
                turnId: "fixture-turn",
                callId: "call",
                namespace: null,
                tool: "ckm_sources",
                arguments: {},
            },
        });
    }
    if (m.id === 101) {
        assert.equal(m.result.success, true);
        assert.ok(m.result.contentItems[0].text.includes("fixture-result"));
        send({ method: "item/agentMessage/delta", params: { itemId: "reply", delta: "Verified " } });
        send({ method: "item/agentMessage/delta", params: { itemId: "reply", delta: "response" } });
        send({ method: "turn/completed", params: { turn: { id: "fixture-turn", status: "completed" } } });
    }
});
