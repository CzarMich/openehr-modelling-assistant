import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { Auth } from "../src/auth.mjs";
import { loadConfig } from "../src/config.mjs";
import { createApplication } from "../src/server.mjs";
import { Store } from "../src/store.mjs";

const password = "A-long-http-test-password-2026!";
function totp(secret) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let buffer = 0,
        bits = 0;
    const bytes = [];
    for (const char of secret) {
        buffer = (buffer << 5) | alphabet.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((buffer >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
    const offset = digest.at(-1) & 15;
    return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

test("native owner bootstrap, MFA gate, user administration, invitation and persistent login", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "identity-http-"));
    const config = {
        ...loadConfig(),
        enabled: false,
        reviewEnabled: false,
        identityEnabled: true,
        identityEncryptionKey: "cd".repeat(32),
        localIssuer: "http://localhost/identity/local",
        dataDir: directory,
        maxConcurrentTurns: 1,
        mcpKey: "synthetic-workspace-mcp-key",
    };
    const auth = new Auth(config);
    const server = createApplication(config, { auth, store: new Store(join(directory, "conversations")) });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    config.origin = origin;
    config.localIssuer = origin + "/identity/local";
    auth.identityStore.issuer = config.localIssuer;
    let cookie = "";
    let csrf = "";
    async function request(path, method = "GET", data = undefined) {
        const response = await fetch(origin + path, {
            method,
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(method === "GET"
                    ? {}
                    : { Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" }),
            },
            body: data === undefined ? undefined : JSON.stringify(data),
        });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";")[0];
        return response;
    }
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        rmSync(directory, { recursive: true, force: true });
    });

    const initial = await (await request("/chat/api/session")).json();
    assert.equal(initial.identitySetupRequired, true);
    assert.doesNotMatch(JSON.stringify(initial), /synthetic-workspace-mcp-key/);
    assert.equal((await request("/chat/api/identity/mcp-connection", "POST", {})).status, 401);
    const crossSite = await fetch(origin + "/chat/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
        body: JSON.stringify({ username: "owner.admin", password }),
    });
    assert.equal(crossSite.status, 403);
    const boot = await request("/chat/auth/bootstrap", "POST", {
        token: auth.identityStore.bootstrapToken(),
        username: "owner.admin",
        displayName: "Workspace Owner",
        password,
    });
    assert.equal(boot.status, 201);
    const owner = await boot.json();
    csrf = owner.csrf;
    const setupStatus = await (await request("/chat/api/session")).json();
    assert.equal(setupStatus.authenticated, false);
    assert.equal(setupStatus.mfaSetupRequired, true);
    assert.equal((await request("/chat/api/conversations")).status, 403);
    const ownerMfa = await request("/chat/auth/mfa", "POST", { code: totp(owner.totpSecret) });
    assert.equal(ownerMfa.status, 200);
    const ownerRecovery = await ownerMfa.json();
    const ownerSession = auth.session({ headers: { cookie }, socket: {} });
    csrf = ownerSession.csrf;
    assert.equal((await request("/chat/api/identity/users")).status, 200);
    const keyResponse = await request("/chat/api/identity/mcp-connection", "POST", {});
    assert.equal(keyResponse.status, 200);
    assert.equal((await keyResponse.json()).key, config.mcpKey);
    assert.equal(keyResponse.headers.get("cache-control"), "no-store");
    const keyAudit = auth.identityStore.read().audit;
    assert.ok(keyAudit.some((event) => event.action === "MCP_CONNECTION_KEY_VIEWED"));
    assert.doesNotMatch(JSON.stringify(keyAudit), /synthetic-workspace-mcp-key/);
    const savedCsrf = csrf;
    csrf = "incorrect";
    assert.equal((await request("/chat/api/identity/mcp-connection", "POST", {})).status, 403);
    csrf = savedCsrf;

    const invitationResponse = await request("/chat/api/identity/invitations", "POST", {
        email: "modeller@example.test",
        roles: ["modelling-modeller"],
    });
    assert.equal(invitationResponse.status, 201);
    const invitation = await invitationResponse.json();
    const accepted = await request("/chat/auth/invitations/accept", "POST", {
        token: invitation.token,
        username: "model.author",
        displayName: "Model Author",
        password,
    });
    assert.equal(accepted.status, 201);
    const member = await accepted.json();
    csrf = member.csrf;
    assert.equal((await request("/chat/api/conversations")).status, 403);
    assert.equal((await request("/chat/auth/mfa", "POST", { code: totp(member.totpSecret) })).status, 200);
    const memberSession = auth.session({ headers: { cookie }, socket: {} });
    csrf = memberSession.csrf;
    assert.equal((await request("/chat/api/identity/users")).status, 403);
    assert.equal((await request("/chat/api/identity/mcp-connection", "POST", {})).status, 403);
    assert.equal((await request("/chat/auth/logout", "POST")).status, 200);
    assert.equal(auth.identityStore.localSession(cookie.split("=")[1]), null);

    cookie = "";
    csrf = "";
    const login = await request("/chat/auth/local", "POST", {
        username: "owner.admin",
        password,
        recoveryCode: ownerRecovery.recoveryCodes[0],
    });
    assert.equal(login.status, 200);
    const loginResult = await login.json();
    csrf = loginResult.csrf;
    assert.equal((await request("/chat/api/identity/users")).status, 200);
});
