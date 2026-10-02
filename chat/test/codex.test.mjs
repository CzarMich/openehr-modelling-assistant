import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { CodexProvider } from "../src/codex.mjs";
import { loadConfig } from "../src/config.mjs";
const config = {
    ...loadConfig(),
    codexWorkDir: "/tmp",
    codexBinary: fileURLToPath(new URL("./fake-codex.mjs", import.meta.url)),
};
const tools = [{ name: "ckm_sources", description: "List sources", inputSchema: { type: "object" } }];
test("Codex protocol isolates secrets, declines native approvals and forwards only declared tool calls", async () => {
    process.env.CHAT_MCP_API_KEY = "fixture-secret-must-not-reach-codex";
    process.env.CHAT_REVIEW_SIGNING_KEY = "fixture-governance-key-must-not-reach-codex";
    const events = [],
        calls = [];
    try {
        const result = await new CodexProvider(config).run({
            messages: [{ role: "user", content: "List CKMs" }],
            tools,
            signal: AbortSignal.timeout(5000),
            onEvent: (event) => events.push(event),
            callTool: async (name, args) => {
                calls.push({ name, args });
                return { text: "fixture-result" };
            },
        });
        assert.equal(result, "Verified response");
        assert.deepEqual(calls, [{ name: "ckm_sources", args: {} }]);
        assert.equal(events.filter((e) => e.type === "delta").length, 2);
    } finally {
        delete process.env.CHAT_MCP_API_KEY;
        delete process.env.CHAT_REVIEW_SIGNING_KEY;
    }
});
test("cancellation terminates an active Codex turn", async () => {
    await assert.rejects(
        () =>
            new CodexProvider(config).run({
                messages: [{ role: "user", content: "WAIT" }],
                tools,
                signal: AbortSignal.timeout(100),
                onEvent: () => {},
                callTool: async () => ({}),
            }),
        { name: "AbortError" },
    );
});

test("Codex device sign-in uses an isolated credential directory and completes without inference", async (t) => {
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const directory = mkdtempSync(join(tmpdir(), "codex-login-test-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    let login;
    await new CodexProvider({ ...config, codexHome: directory }).run({
        signal: AbortSignal.timeout(5000),
        onLogin: (result) => {
            login = result;
        },
    });
    assert.equal(login.userCode, "TEST-CODE");
    assert.equal(JSON.parse(readFileSync(join(directory, "auth.json"))).token, "personal-fixture");
});
