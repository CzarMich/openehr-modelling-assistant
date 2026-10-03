import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { CdrClient } from "../src/cdr.mjs";
import { WorkspaceTools } from "../src/workspace-tools.mjs";

const config = {
    cdrEnabled: true,
    origin: "https://models.example",
    reviewApiOrigin: "https://internal.example",
    reviewKeyId: "active",
    reviewSigningKey: "a".repeat(64),
    sessionSeconds: 3600,
};
const session = {
    reviewIdentity: {
        issuer: "https://identity.example",
        subject: "alice",
        tenant: "https://identity.example",
        roles: [],
        started: Math.floor(Date.now() / 1000),
    },
};
test("CDR assertions bind purpose, actor, operation and body, with no ambient credentials", async () => {
    const client = new CdrClient(config, async (url, request) => {
        assert.equal(url.href, "https://internal.example/api/v1/cdr/execute-metadata");
        const [encodedHeader, encodedClaims, signature] = request.headers.Authorization.slice(7).split(".");
        const header = JSON.parse(Buffer.from(encodedHeader, "base64url")),
            claims = JSON.parse(Buffer.from(encodedClaims, "base64url"));
        assert.equal(header.typ, "openehr-cdr+jwt");
        assert.equal(claims.aud, "openehr-modelling-cdr");
        assert.equal(claims.sub, "alice");
        assert.equal(claims.body_sha256, createHash("sha256").update(request.body).digest("hex"));
        assert.equal(
            signature,
            createHmac("sha256", config.reviewSigningKey)
                .update(encodedHeader + "." + encodedClaims)
                .digest("base64url"),
        );
        assert.equal(request.redirect, "error");
        assert.equal(request.headers.Cookie, undefined);
        return Response.json({ count: 3, results_sent_to_ai: false });
    });
    const result = await client.tool(session, "aql_execute", { connection_id: "dev", query: "SELECT e FROM EHR e" });
    assert.equal(result.structuredContent.result.count, 3);
    assert.equal(result.structuredContent.result.rows, undefined);
});
test("CDR client hides raw upstream errors and rejects expired sessions before making requests", async () => {
    const client = new CdrClient(config, async () =>
        Response.json(
            { error: { code: "CDR_AUTHENTICATION_FAILED", secret: "private-fixture-token" } },
            { status: 502 },
        ),
    );
    await assert.rejects(
        client.request(session, "connection-test", { id: "dev" }),
        (error) => error.code === "CDR_AUTHENTICATION_FAILED" && !error.message.includes("private-fixture-token"),
    );
    await assert.rejects(
        client.request({ reviewIdentity: { ...session.reviewIdentity, started: 0 } }, "connections"),
        (error) => error.status === 401,
    );
    await assert.rejects(client.request(session, "../reviews", {}), (error) => error.status === 400);
});
test("browser tools route CDR calls through the human profile instead of the shared MCP identity", async () => {
    let called = false;
    const mcp = {
        tools: async () => [{ name: "cdr_connection_list" }],
        call: async () => {
            throw new Error("Shared identity must not be used");
        },
    };
    const client = {
        tool: async (identity, name) => {
            assert.equal(identity, session);
            assert.equal(name, "cdr_connection_list");
            called = true;
            return { items: [] };
        },
    };
    const workspace = new WorkspaceTools(mcp, {}, {}, "alice", {}, new AbortController().signal, false, {
        client,
        session,
    });
    assert((await workspace.tools()).some((tool) => tool.name === "cdr_connection_list"));
    await workspace.call("cdr_connection_list", {});
    assert(called);
    const disabled = new WorkspaceTools(mcp, {}, {}, "alice", {}, new AbortController().signal, false);
    assert(!(await disabled.tools()).some((tool) => tool.name === "cdr_connection_list"));
});

test("CDR tools reject inline credentials before making a request", async () => {
    const client = new CdrClient(config, async () => {
        throw new Error("Inline credentials must never reach the transport");
    });
    await assert.rejects(
        client.tool(session, "aql_execute", {
            connection_id: "dev",
            query: "SELECT e FROM EHR e",
            token: "private-token",
        }),
        /arguments/i,
    );
});
