import test from "node:test";
import assert from "node:assert/strict";
import { McpClient } from "../src/mcp.mjs";

test("bounded MCP responses can carry a terminology record and its structured/content representations", async (t) => {
    const original = globalThis.fetch;
    t.after(() => (globalThis.fetch = original));
    const text = "x".repeat(3 * 1024 * 1024);
    globalThis.fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { text } }));
    const client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    assert.equal((await client.rpc("tools/call", {})).text.length, text.length);
});

test("MCP response streaming cancels at the finite response limit", async (t) => {
    const original = globalThis.fetch;
    t.after(() => (globalThis.fetch = original));
    let cancelled = false;
    const body = new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
            cancelled = true;
        },
    });
    globalThis.fetch = async () => new Response(body);
    const client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    await assert.rejects(client.rpc("tools/call", {}), /Modelling response too large/);
    assert.equal(cancelled, true);
});
