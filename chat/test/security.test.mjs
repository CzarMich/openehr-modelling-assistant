import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { generateKeyPairSync, sign } from "node:crypto";
import * as oidc from "openid-client";
import { loadConfig } from "../src/config.mjs";
import { Auth, equal } from "../src/auth.mjs";
import { Store } from "../src/store.mjs";
import { createApplication } from "../src/server.mjs";
import { McpClient } from "../src/mcp.mjs";

async function fixture(t, { provider, mcp } = {}) {
    const directory = mkdtempSync(join(tmpdir(), "modelling-chat-"));
    const config = { ...loadConfig(), enabled: true, dataDir: directory, allowWrites: true, maxConcurrentTurns: 3 };
    const auth = new Auth(config),
        store = new Store(directory);
    auth.sessions.set("alice", {
        identity: "issuer\nalice",
        name: "Alice",
        csrf: "alice-csrf",
        expires: Date.now() + 60000,
    });
    auth.sessions.set("bob", { identity: "issuer\nbob", name: "Bob", csrf: "bob-csrf", expires: Date.now() + 60000 });
    const tools = [
        { name: "ckm_sources", inputSchema: { type: "object" } },
        { name: "model_artifact_save", inputSchema: { type: "object" } },
    ];
    const calls = [];
    const service = mcp || {
        tools: async () => tools,
        call: async (name, args) => {
            calls.push({ name, args });
            return { content: [{ type: "text", text: "Real fixture result" }] };
        },
    };
    const defaultProvider = {
        run: async ({ onEvent, callTool }) => {
            await callTool("ckm_sources", {});
            onEvent({ type: "delta", text: "Grounded response" });
            return "Grounded response";
        },
    };
    const server = createApplication(config, {
        auth,
        store,
        provider: provider || defaultProvider,
        mcpFactory: () => service,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + server.address().port;
    // The production configuration is immutable; this test owns its explicitly injected configuration.
    config.origin = origin;
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        rmSync(directory, { recursive: true, force: true });
    });
    async function request(path, { user = "alice", method = "GET", data, csrf = true, originHeader = origin } = {}) {
        return fetch(origin + path, {
            method,
            headers: {
                ...(user ? { Cookie: "ModellingSession=" + user } : {}),
                ...(method === "GET"
                    ? {}
                    : {
                          "Content-Type": "application/json",
                          Origin: originHeader,
                          ...(csrf ? { "X-CSRF-Token": user + "-csrf" } : {}),
                      }),
            },
            body: data === undefined ? undefined : JSON.stringify(data),
        });
    }
    return { request, store, auth, config, calls, origin };
}

test("configuration refuses non-TLS public origins, embedded credentials, missing OIDC and invalid limits", () => {
    assert.throws(() => loadConfig({ CHAT_PUBLIC_URL: "http://example.org" }));
    assert.throws(() => loadConfig({ CHAT_PUBLIC_URL: "https://user:password@example.org" }));
    assert.throws(() => loadConfig({ CHAT_ENABLED: "true" }));
    assert.throws(() => loadConfig({ CHAT_TURN_TIMEOUT_SECONDS: "invalid" }));
    assert.equal(loadConfig().enabled, false);
    assert.equal(equal("a", "é"), false);
});

test("authentication, same-origin CSRF and response redaction", async (t) => {
    const f = await fixture(t);
    assert.equal((await f.request("/chat/api/conversations", { user: null })).status, 401);
    assert.equal((await f.request("/chat/api/conversations", { method: "POST", csrf: false })).status, 403);
    assert.equal(
        (await f.request("/chat/api/conversations", { method: "POST", originHeader: "https://evil.example" })).status,
        403,
    );
    const session = await (await f.request("/chat/api/session")).json();
    assert.deepEqual(session.user, { name: "Alice" });
    assert.equal(session.csrf, "alice-csrf");
    assert.equal(JSON.stringify(session).includes("issuer"), false);
    assert.equal(JSON.stringify(session).includes("mcpKey"), false);
    const expired = f.auth.sessions.get("alice");
    expired.expires = 0;
    assert.equal((await f.request("/chat/api/conversations")).status, 401);
});

test("conversation IDs do not authorize another user to read, write, delete, stop or approve", async (t) => {
    const f = await fixture(t),
        created = await (await f.request("/chat/api/conversations", { method: "POST" })).json();
    const base = "/chat/api/conversations/" + created.id;
    for (const [path, method, data] of [
        [base, "GET"],
        [base, "DELETE"],
        [base + "/messages", "POST", { content: "read it" }],
        [base + "/stop", "POST"],
        [base + "/approval", "POST", { id: "x", approved: true }],
    ]) {
        assert.equal((await f.request(path, { user: "bob", method, data })).status, 404);
    }
    assert.deepEqual((await (await f.request("/chat/api/conversations", { user: "bob" })).json()).conversations, []);
    assert.throws(() => f.store.get("issuer\nalice", "../../etc/passwd"));
});

test("actual tool execution streams an answer and persists it for the owning user", async (t) => {
    const f = await fixture(t),
        created = await (await f.request("/chat/api/conversations", { method: "POST" })).json();
    const response = await f.request("/chat/api/conversations/" + created.id + "/messages", {
        method: "POST",
        data: { content: "Which CKMs are configured?" },
    });
    const text = await response.text();
    assert.match(text, /Grounded response/);
    assert.match(text, /"type":"done"/);
    assert.equal(f.calls[0].name, "ckm_sources");
    const saved = await (await f.request("/chat/api/conversations/" + created.id)).json();
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[1].tools[0].status, "completed");
    const second = await f.request("/chat/api/conversations/" + created.id + "/messages", {
        method: "POST",
        data: { content: "Continue", identity: "bob" },
    });
    assert.equal(second.status, 400);
});

test("write confirmation binds the user, conversation, call and exact arguments", async (t) => {
    const args = { projectId: "default", path: "archetypes/example.adl", content: "draft", expectedRevision: "abc" };
    const f = await fixture(t, {
        provider: {
            run: async ({ callTool, onEvent }) => {
                await callTool("model_artifact_save", args);
                onEvent({ type: "delta", text: "Saved after confirmation" });
                return "Saved after confirmation";
            },
        },
    });
    const created = await (await f.request("/chat/api/conversations", { method: "POST" })).json();
    const base = "/chat/api/conversations/" + created.id;
    const response = await f.request(base + "/messages", { method: "POST", data: { content: "Save draft" } });
    const reader = response.body.getReader();
    let buffer = "",
        approval;
    while (!approval) {
        const next = await reader.read();
        assert.equal(next.done, false);
        buffer += new TextDecoder().decode(next.value);
        for (const line of buffer.split("\n"))
            if (line.startsWith("data: ")) {
                try {
                    const e = JSON.parse(line.slice(6));
                    if (e.type === "approval") approval = e;
                } catch {}
            }
    }
    assert.equal(f.calls.length, 0);
    assert.deepEqual(approval.arguments, args);
    assert.equal(
        (
            await f.request(base + "/approval", {
                method: "POST",
                user: "bob",
                data: { id: approval.id, approved: true },
            })
        ).status,
        404,
    );
    assert.equal(
        (await f.request(base + "/approval", { method: "POST", data: { id: "forged", approved: true } })).status,
        409,
    );
    assert.equal(
        (await f.request(base + "/approval", { method: "POST", data: { id: approval.id, approved: true } })).status,
        200,
    );
    while (!(await reader.read()).done) {}
    assert.deepEqual(f.calls, [{ name: "model_artifact_save", args }]);
    assert.equal(
        (await f.request(base + "/approval", { method: "POST", data: { id: approval.id, approved: true } })).status,
        409,
    );
});

test("declined changes never reach the repository", async (t) => {
    const f = await fixture(t, {
        provider: {
            run: async ({ callTool }) => {
                await callTool("model_artifact_save", { content: "unapproved" });
                return "";
            },
        },
    });
    const created = await (await f.request("/chat/api/conversations", { method: "POST" })).json(),
        base = "/chat/api/conversations/" + created.id;
    const response = await f.request(base + "/messages", { method: "POST", data: { content: "Draft" } }),
        reader = response.body.getReader();
    let buffer = "",
        approval;
    while (!approval) {
        const { value } = await reader.read();
        buffer += new TextDecoder().decode(value);
        for (const line of buffer.split("\n"))
            if (line.startsWith("data: ")) {
                try {
                    const e = JSON.parse(line.slice(6));
                    if (e.type === "approval") approval = e;
                } catch {}
            }
    }
    await f.request(base + "/approval", { method: "POST", data: { id: approval.id, approved: false } });
    while (!(await reader.read()).done) {}
    assert.equal(f.calls.length, 0);
});

test("stop aborts a running response and concurrent turns do not race", async (t) => {
    const f = await fixture(t, {
        provider: {
            run: async ({ signal }) =>
                new Promise((resolve, reject) =>
                    signal.addEventListener("abort", () => reject(new Error("Stopped")), { once: true }),
                ),
        },
    });
    const created = await (await f.request("/chat/api/conversations", { method: "POST" })).json(),
        base = "/chat/api/conversations/" + created.id;
    const response = await f.request(base + "/messages", { method: "POST", data: { content: "Run" } });
    assert.equal((await f.request(base + "/messages", { method: "POST", data: { content: "Race" } })).status, 409);
    assert.equal((await f.request(base, { method: "DELETE" })).status, 409);
    await f.request(base + "/stop", { method: "POST" });
    assert.match(await response.text(), /Response stopped/);
});

test("MCP tool filtering fails closed for new or disabled write tools", async () => {
    const client = new McpClient({ ...loadConfig(), allowWrites: false }, new AbortController().signal);
    client.rpc = async (method) =>
        method === "tools/list"
            ? { tools: [{ name: "ckm_sources" }, { name: "model_artifact_save" }, { name: "delete_all_models" }] }
            : {};
    assert.deepEqual(
        (await client.tools()).map((t) => t.name),
        ["ckm_sources"],
    );
    await assert.rejects(() => client.call("model_artifact_save", {}));
    await assert.rejects(() => client.call("delete_all_models", {}));
});

function oidcFixture(claimOverride = {}, badSignature = false) {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = keys.publicKey.export({ format: "jwk" });
    jwk.kid = "test-key";
    jwk.alg = "RS256";
    jwk.use = "sig";
    const issuer = "https://identity.example/realm";
    const metadata = {
        issuer,
        authorization_endpoint: issuer + "/auth",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/keys",
    };
    const config = new oidc.Configuration(metadata, "browser", "client-secret");
    oidc.enableNonRepudiationChecks(config);
    config[oidc.customFetch] = async (url, options) => {
        if (String(url).endsWith("/keys"))
            return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
        assert.equal(new URLSearchParams(options.body).get("code_verifier"), "test-verifier");
        const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
        const claims = {
            iss: issuer,
            sub: "user-a",
            aud: "browser",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 600,
            nonce: "test-nonce",
            name: "Test User",
            ...claimOverride,
        };
        const value = enc({ alg: "RS256", kid: "test-key" }) + "." + enc(claims);
        const key = badSignature ? generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey : keys.privateKey;
        const jwt = value + "." + sign("RSA-SHA256", Buffer.from(value), key).toString("base64url");
        return new Response(
            JSON.stringify({ access_token: "test-access", token_type: "Bearer", expires_in: 600, id_token: jwt }),
            { headers: { "Content-Type": "application/json" } },
        );
    };
    const auth = new Auth({
        ...loadConfig(),
        origin: "https://chat.example",
        secure: true,
        issuer,
        clientId: "browser",
    });
    auth.client = async () => config;
    auth.transactions.set("transaction", {
        state: "test-state",
        nonce: "test-nonce",
        verifier: "test-verifier",
        expires: Date.now() + 60000,
    });
    const req = {
        headers: { cookie: "__Host-ModellingLogin=transaction" },
        url: "/chat/auth/callback?code=test-code&state=test-state&iss=" + encodeURIComponent(issuer),
    };
    const headers = {},
        res = {
            setHeader: (k, v) => (headers[k] = v),
            writeHead: (status, h) => {
                res.status = status;
                Object.assign(headers, h);
            },
            end: () => {},
        };
    return { auth, req, res, headers };
}

test("OIDC verifies signed identity and issues only secure opaque cookies", async () => {
    const f = oidcFixture();
    await f.auth.callback(f.req, f.res);
    assert.equal(f.res.status, 302);
    assert.equal(f.auth.sessions.size, 1);
    assert.match(f.headers["Set-Cookie"][0], /HttpOnly; SameSite=Lax; Max-Age=3600; Secure/);
    assert.equal(JSON.stringify(f.headers).includes("test-access"), false);
    await assert.rejects(() => f.auth.callback(f.req, f.res));
});
for (const [name, claims, bad] of [
    ["nonce", { nonce: "wrong" }],
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "other" }],
    ["expiry", { exp: 1 }],
    ["signature", {}, true],
]) {
    test("OIDC rejects wrong " + name, async () => {
        const f = oidcFixture(claims, bad);
        await assert.rejects(() => f.auth.callback(f.req, f.res));
        assert.equal(f.auth.sessions.size, 0);
        assert.equal(f.auth.transactions.size, 0);
    });
}
test("OIDC rejects forged state and unapproved groups", async () => {
    const f = oidcFixture();
    f.req.url = f.req.url.replace("test-state", "forged");
    await assert.rejects(() => f.auth.callback(f.req, f.res));
    assert.equal(f.auth.sessions.size, 0);
    const g = oidcFixture({ groups: ["outsiders"] });
    g.auth.config.allowedGroups = ["modellers"];
    await assert.rejects(() => g.auth.callback(g.req, g.res));
    assert.equal(g.auth.sessions.size, 0);
});

test("retention removes stale conversations even when their owners do not return", async (t) => {
    const { utimesSync } = await import("node:fs");
    const f = await fixture(t);
    const old = f.store.create("inactive-user"),
        recent = f.store.create("active-user");
    const expired = new Date(Date.now() - 31 * 86400000);
    utimesSync(f.store.path("inactive-user", old.id), expired, expired);
    f.store.prune();
    assert.throws(() => f.store.get("inactive-user", old.id));
    assert.equal(f.store.get("active-user", recent.id).id, recent.id);
});
