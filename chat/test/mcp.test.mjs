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

test("MCP negotiation is retained in subsequent requests", async (t) => {
    const original = globalThis.fetch;
    t.after(() => (globalThis.fetch = original));
    const calls = [];
    globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        calls.push({ request, headers: options.headers });
        if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
        const result = request.method === "initialize" ? { protocolVersion: "2025-06-18" } : { tools: [] };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
            headers: { "Mcp-Session-Id": "fixture-session" },
        });
    };
    const client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    await client.tools();
    assert.equal(calls[0].request.params.protocolVersion, "2025-11-25");
    assert.equal(calls[1].headers["MCP-Protocol-Version"], "2025-06-18");
    assert.equal(calls[2].headers["MCP-Protocol-Version"], "2025-06-18");
});

test("MCP client rejects mismatched responses and unsupported negotiation", async (t) => {
    const original = globalThis.fetch;
    t.after(() => (globalThis.fetch = original));
    globalThis.fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 9, result: {} }));
    let client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    await assert.rejects(client.tools(), /Modelling tool request failed/);
    globalThis.fetch = async () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "future" } }));
    client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    await assert.rejects(client.tools(), /Unsupported modelling protocol version/);
});

test("MCP SSE accepts empty priming events before its matching response", async (t) => {
    const original = globalThis.fetch;
    t.after(() => (globalThis.fetch = original));
    globalThis.fetch = async () =>
        new Response('id: initial\ndata: \n\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n');
    const client = new McpClient({ mcpUrl: "https://modelling.example/mcp" }, new AbortController().signal);
    assert.deepEqual(await client.rpc("ping", {}), { ok: true });
});
