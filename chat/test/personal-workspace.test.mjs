import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { Store } from "../src/store.mjs";
import { PersonalConnections } from "../src/personal-connections.mjs";
import { publicAddress, personalRequest } from "../src/personal-http.mjs";
import { Attachments, extractFile } from "../src/attachments.mjs";
import { Shares } from "../src/shares.mjs";
import { WorkspaceTools } from "../src/workspace-tools.mjs";
import { loadConfig } from "../src/config.mjs";
import { Auth } from "../src/auth.mjs";
import { createApplication } from "../src/server.mjs";

function setup(t, request) {
    const directory = mkdtempSync(join(tmpdir(), "personal-workspace-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const config = {
        ...loadConfig(),
        enabled: true,
        dataDir: directory,
        providerEncryptionKey: "ab".repeat(32),
        allowWrites: true,
    };
    const store = new Store(join(directory, "conversations"));
    return {
        directory,
        config,
        store,
        connections: new PersonalConnections(config, { request }),
        attachments: new Attachments(store),
        shares: new Shares(store),
    };
}
const github = {
    kind: "github",
    label: "My models",
    url: "https://github.com/alice/models.git",
    branch: "draft/renal",
    token: "private-test-token",
};

test("personal CKMs deduplicate enterprise URLs and remain encrypted and owner-bound", (t) => {
    const { connections, directory } = setup(t);
    const ckm = { kind: "ckm", label: "Regional", url: "https://MODELS.example/ckm/rest/", token: "private-token" };
    const enterprise = [{ id: "regional", kind: "ckm", url: "https://models.example/ckm/rest", scope: "enterprise" }];
    assert.equal(connections.add("alice", ckm, enterprise).duplicate, true);
    assert.deepEqual(connections.list("alice"), []);
    const added = connections.add("alice", ckm).connection;
    assert.equal(connections.add("alice", ckm).duplicate, true);
    assert.equal(connections.list("alice").length, 1);
    assert.deepEqual(connections.list("bob"), []);
    assert.throws(() => connections.get("bob", added.id), /not found/);
    assert.throws(() => connections.remove("bob", added.id), /not found/);
    const file = readdirSync(join(directory, "connections"))[0];
    assert.doesNotMatch(readFileSync(join(directory, "connections", file), "utf8"), /private-token|Regional/);
    assert.doesNotMatch(JSON.stringify(added), /private-token/);
    assert.throws(() => connections.add("alice", { ...ckm, url: "https://user:password@models.example/" }));
    connections.remove("alice", added.id);
    assert.deepEqual(connections.list("alice"), []);
});

test("personal HTTP denies local, reserved, mapped IPv6 and non-HTTPS targets", async () => {
    for (const address of [
        "127.0.0.1",
        "10.1.2.3",
        "169.254.169.254",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "fe80::1",
        "fc00::1",
    ])
        assert.equal(publicAddress(address), false, address);
    assert.equal(publicAddress("8.8.8.8"), true);
    assert.throws(() => personalRequest("https://127.0.0.1/test"));
    assert.throws(() => personalRequest("http://example.org/test"));
    await assert.rejects(personalRequest("https://localhost/test"), /could not complete/);
});

test("personal CKM requests bind only the owner's token and return source provenance", async (t) => {
    const calls = [];
    const { connections } = setup(t, async (url, options) => {
        calls.push({ url, ...options });
        return { status: 200, text: url.includes("?") ? JSON.stringify([{ cid: "123.4.5" }]) : "archetype content" };
    });
    const source = connections.add("alice", {
        kind: "ckm",
        label: "Private",
        url: "https://models.example/ckm/rest/",
        token: "alice-ckm",
    }).connection.id;
    const result = await connections.ckm("alice", { source, kind: "archetypes", keyword: "renal care" });
    assert.equal(result.content[0].cid, "123.4.5");
    assert.match(calls[0].url, /search-text=renal\+care/);
    assert.equal(calls[0].token, "alice-ckm");
    assert.doesNotMatch(JSON.stringify(result), /alice-ckm/);
    await connections.ckm("alice", { source, kind: "templates", cid: "123.4.5" });
    assert.match(calls[1].url, /v1\/templates\/123.4.5\/oet$/);
    await assert.rejects(connections.ckm("bob", { source, kind: "archetypes", keyword: "renal" }), /not found/);
    await assert.rejects(connections.ckm("alice", { source, kind: "archetypes", cid: "../secrets" }));
    assert.equal(calls.length, 2);
});

for (const kind of ["github", "gitlab"])
    test(`${kind} saves use the exact branch, owner token and revision and refuse stale updates`, async (t) => {
        const calls = [],
            revision = "a".repeat(40);
        const { connections } = setup(t, async (url, options) => {
            calls.push({ url, ...options });
            return {
                status: 200,
                text: options.method
                    ? "{}"
                    : JSON.stringify({
                          type: "file",
                          encoding: "base64",
                          content: Buffer.from("old draft").toString("base64"),
                          sha: revision,
                          last_commit_id: revision,
                      }),
            };
        });
        const repo = connections.add("alice", {
            ...github,
            kind,
            url: kind === "github" ? github.url : "https://gitlab.com/team/subgroup/models",
        }).connection;
        const args = {
            repository: repo.id,
            path: "templates/kidney.oet",
            content: "<template/>",
            message: "Draft renal care",
            expectedRevision: revision,
        };
        await assert.rejects(connections.publish("bob", args), /not found/);
        await assert.rejects(connections.publish("alice", { ...args, expectedRevision: null }), /changed/);
        assert.equal(calls.filter((call) => call.method).length, 0);
        const saved = await connections.publish("alice", args);
        assert.equal(saved.status, "DRAFT");
        const write = calls.at(-1);
        assert.equal(write.token, "private-test-token");
        assert.equal(write.body.branch, "draft/renal");
        assert.equal(kind === "github" ? write.body.sha : write.body.last_commit_id, revision);
        assert.match(
            write.url,
            kind === "github"
                ? /api.github.com\/repos\/alice\/models\/contents\/templates\/kidney.oet$/
                : /api\/v4\/projects\/team%2Fsubgroup%2Fmodels\/repository\/files\/templates%2Fkidney.oet$/,
        );
        for (const path of ["../bad.xml", ".github/workflows/test.yml", "a/../bad.xml", "a//b.xml", "script.js"])
            await assert.rejects(connections.publish("alice", { ...args, path }));
    });

test("text, PDF and spreadsheets are extracted with exact originals and explicit binary/partial status", async (t) => {
    const { attachments, store, directory } = setup(t);
    const conversation = store.create("alice");
    const item = await attachments.add(
        "alice",
        conversation,
        "renal.csv",
        Buffer.from("field,unit\ncreatinine,mmol/L\n"),
    );
    assert.equal(item.status, "ready");
    assert.match(attachments.read("alice", conversation, { attachment: item.id }).text, /creatinine/);
    assert.equal(attachments.bytes("alice", conversation, item.id).toString(), "field,unit\ncreatinine,mmol/L\n");
    assert.throws(() => attachments.read("alice", store.create("alice"), { attachment: item.id }), /not found/);
    const binary = await attachments.add("alice", conversation, "image.bin", Buffer.from([0, 1, 2, 255]));
    assert.equal(binary.status, "unsupported");
    assert.equal(binary.characters, 0);
    const long = await attachments.add("alice", conversation, "long.txt", Buffer.from("a".repeat(250000)));
    assert.equal(long.status, "partial");
    assert.equal(attachments.read("alice", conversation, { attachment: long.id }).nextOffset, 12000);
    assert.throws(() => attachments.read("alice", conversation, { attachment: item.id, offset: -1 }));
    for (const bookType of ["xlsx", "xls", "ods"]) {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
            book,
            XLSX.utils.aoa_to_sheet([
                ["Requirement", "Unit"],
                ["Urine volume", "mL"],
            ]),
            "Renal evidence",
        );
        const path = join(directory, "sheet." + bookType);
        writeFileSync(path, XLSX.write(book, { type: "buffer", bookType }));
        const result = await extractFile(path, "sheet." + bookType);
        assert.equal(result.status, "ready", result.note);
        assert.match(result.text, /Renal evidence[\s\S]*Urine volume/);
    }
    const pdfPath = join(directory, "publication.pdf");
    // Minimal independent PDF fixture, with a text page and standard font.
    const stream = "BT /F1 12 Tf 20 100 Td (Renal publication evidence) Tj ET";
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n",
        offsets = [0];
    objects.forEach((object, i) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf +=
        `xref\n0 6\n0000000000 65535 f \n` +
        offsets
            .slice(1)
            .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
            .join("") +
        `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    writeFileSync(pdfPath, pdf);
    const extractedPdf = await extractFile(pdfPath, "publication.pdf");
    assert.equal(extractedPdf.status, "ready", extractedPdf.note);
    assert.match(extractedPdf.text, /\[Page 1\][\s\S]*Renal publication evidence/);
    const docx = await extractFile(fileURLToPath(new URL("./fixtures/source.docx", import.meta.url)), "source.docx");
    assert.equal(docx.status, "ready", docx.note);
    assert.match(docx.text, /Synthetic renal care requirements/);
    const dir = attachments.directory("alice", conversation.id);
    store.delete("alice", conversation.id);
    assert.equal(existsSync(dir), false);
});

test("share snapshots omit originals, remain fixed, and expire on revocation, deletion and retention", (t) => {
    const { store, shares } = setup(t);
    const conversation = store.create("alice");
    conversation.messages = [{ role: "user", content: "Draft requirements", tools: [{ token: "never-share" }] }];
    conversation.attachments = [{ name: "private.pdf", id: "private" }];
    const link = shares.create("alice", conversation);
    conversation.messages.push({ role: "assistant", content: "Later message" });
    store.save("alice", conversation);
    assert.equal(shares.get(link.token).messages.length, 1);
    assert.doesNotMatch(JSON.stringify(shares.get(link.token)), /private.pdf|never-share|Later message/);
    shares.revoke("alice", conversation);
    assert.throws(() => shares.get(link.token), /not found/);
    const next = shares.create("alice", conversation);
    store.delete("alice", conversation.id);
    assert.throws(() => shares.get(next.token), /not found/);
    const stale = store.create("alice"),
        staleLink = shares.create("alice", stale);
    const old = new Date(Date.now() - 31 * 86400000);
    utimesSync(store.path("alice", stale.id), old, old);
    assert.throws(() => shares.get(staleLink.token), /not found/);
});

test("selecting a personal repository disables enterprise writes and cannot publish to a different repository", async (t) => {
    const f = setup(t);
    const repo = f.connections.add("alice", github).connection;
    const conversation = f.store.create("alice");
    conversation.repository = repo.id;
    const workspace = new WorkspaceTools(
        { tools: async () => [{ name: "model_artifact_save" }, { name: "model_validate" }] },
        f.connections,
        f.attachments,
        "alice",
        conversation,
        new AbortController().signal,
        true,
    );
    const tools = await workspace.tools();
    assert.equal(
        tools.some((t) => t.name === "model_artifact_save"),
        false,
    );
    assert.equal(
        tools.some((t) => t.name === "personal_repository_save"),
        true,
    );
    await assert.rejects(
        workspace.call("personal_repository_save", {
            repository: "someone-else",
            path: "draft.xml",
            content: "draft",
            message: "draft",
            expectedRevision: null,
        }),
        /selected repository/,
    );
    assert.match(workspace.context([{ role: "user", content: "Make a model" }])[0].content, /draft\/renal/);
    assert.doesNotMatch(
        JSON.stringify(workspace.context([{ role: "user", content: "Make a model" }])),
        /private-test-token/,
    );
});

async function httpFixture(t, run, requestRemote) {
    const f = setup(t, requestRemote);
    const auth = new Auth(f.config);
    for (const identity of ["alice", "bob"])
        auth.sessions.set(identity, { identity, name: identity, csrf: identity, expires: Date.now() + 60000 });
    const server = createApplication(f.config, {
        ...f,
        auth,
        provider: { run },
        mcpFactory: () => ({
            tools: async () => [],
            call: async () => ({ structuredContent: { sources: { default: "https://ckm.example/rest/" } } }),
        }),
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    f.config.origin = "http://127.0.0.1:" + server.address().port;
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const request = (path, { method = "GET", user = "alice", data, bytes, csrf = true } = {}) =>
        fetch(f.config.origin + "/chat/api/" + path, {
            method,
            headers: {
                ...(user ? { Cookie: "ModellingSession=" + user } : {}),
                Origin: f.config.origin,
                ...(csrf ? { "X-CSRF-Token": user } : {}),
                "Content-Type": bytes ? "application/octet-stream" : "application/json",
                "X-File-Name": "evidence.csv",
            },
            body: bytes || (data === undefined ? undefined : JSON.stringify(data)),
        });
    return { ...f, request };
}

test("HTTP uploads feed the provider through tools, enforce ownership/CSRF, and sharing remains read-only", async (t) => {
    let attachmentId;
    const f = await httpFixture(t, async ({ messages, callTool }) => {
        assert.match(messages.at(-1).content, /evidence.csv/);
        const result = await callTool("attachment_read", { attachment: attachmentId });
        assert.match(result.structuredContent.text, /renal/);
        return "Source-grounded draft";
    });
    const conversation = f.store.create("alice"),
        base = "conversations/" + conversation.id;
    const bytes = Buffer.from("concept\nrenal");
    assert.equal((await f.request(base + "/attachments", { method: "POST", bytes, csrf: false })).status, 403);
    assert.equal((await f.request(base + "/attachments", { method: "POST", bytes, user: "bob" })).status, 404);
    const added = await f.request(base + "/attachments", { method: "POST", bytes });
    assert.equal(added.status, 201);
    attachmentId = (await added.json()).id;
    assert.equal((await f.request(base + "/attachments/" + attachmentId, { user: "bob" })).status, 404);
    assert.deepEqual(Buffer.from(await (await f.request(base + "/attachments/" + attachmentId)).arrayBuffer()), bytes);
    const turn = await f.request(base + "/messages", { method: "POST", data: { content: "Model these requirements" } });
    assert.match(await turn.text(), /"type":"done"/);
    const link = await (await f.request(base + "/share", { method: "POST", data: {} })).json();
    assert.equal((await f.request("shares/" + link.token, { user: "" })).status, 401);
    const snapshot = await (await f.request("shares/" + link.token, { user: "bob" })).json();
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.attachments, undefined);
    assert.equal((await f.request(base + "/share", { method: "DELETE", user: "bob" })).status, 404);
    await f.request(base + "/share", { method: "DELETE" });
    assert.equal((await f.request("shares/" + link.token, { user: "bob" })).status, 404);
});

test("personal commits wait for owner confirmation of the destination and cannot execute after cancellation", async (t) => {
    let repository;
    const writes = [];
    const f = await httpFixture(
        t,
        async ({ callTool }) => {
            await callTool("personal_repository_save", {
                repository,
                path: "templates/renal.oet",
                content: "<draft/>",
                message: "Draft renal model",
                expectedRevision: null,
            });
            return "Committed draft";
        },
        async (url, options) => {
            if (options.method) {
                writes.push({ url, ...options });
                return { status: 201, text: "{}" };
            }
            return { status: 404, text: "{}" };
        },
    );
    repository = f.connections.add("alice", github).connection.id;
    for (const approved of [false, true]) {
        const conversation = f.store.create("alice");
        conversation.repository = repository;
        f.store.save("alice", conversation);
        const base = "conversations/" + conversation.id;
        const response = await f.request(base + "/messages", { method: "POST", data: { content: "Save this draft" } });
        const reader = response.body.getReader();
        let content = "",
            approval;
        while (!approval) {
            const part = await reader.read();
            assert.equal(part.done, false);
            content += new TextDecoder().decode(part.value);
            for (const line of content.split("\n"))
                if (line.startsWith("data: ")) {
                    const event = JSON.parse(line.slice(6));
                    if (event.type === "approval") approval = event;
                }
        }
        assert.equal(writes.length, 0);
        assert.equal(approval.arguments.destination.url, "https://github.com/alice/models");
        assert.equal(approval.arguments.destination.branch, "draft/renal");
        assert.doesNotMatch(JSON.stringify(approval), /private-test-token/);
        assert.equal(
            (
                await f.request(base + "/approval", {
                    user: "bob",
                    method: "POST",
                    data: { id: approval.id, approved: true },
                })
            ).status,
            404,
        );
        assert.equal(
            (await f.request(base + "/approval", { method: "POST", data: { id: approval.id, approved } })).status,
            200,
        );
        while (!(await reader.read()).done) {
            /* Drain the turn so persistence and cleanup finish. */
        }
        assert.equal(writes.length, approved ? 1 : 0);
    }
});

test("an in-flight extraction blocks conflicting conversation mutations", async (t) => {
    const f = await httpFixture(t, async () => "Draft");
    let started, finish;
    const waiting = new Promise((resolve) => (started = resolve));
    f.attachments.extractor = () => {
        started();
        return new Promise((resolve) => (finish = resolve));
    };
    const conversation = f.store.create("alice"),
        base = "conversations/" + conversation.id;
    const upload = f.request(base + "/attachments", { method: "POST", bytes: Buffer.from("source") });
    await waiting;
    for (const [path, method, data] of [
        [base, "DELETE"],
        [base + "/messages", "POST", { content: "draft" }],
        [base + "/settings", "PUT", { repository: null }],
        [base + "/share", "POST", {}],
    ]) {
        assert.equal((await f.request(path, { method, data })).status, 409);
    }
    finish({ text: "source", status: "ready", note: "Extracted" });
    assert.equal((await upload).status, 201);
    assert.equal(f.store.get("alice", conversation.id).attachments.length, 1);
});
