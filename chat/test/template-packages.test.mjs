import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonalConnections } from "../src/personal-connections.mjs";
import { WorkspaceTools, PERSONAL_WRITE } from "../src/workspace-tools.mjs";
import { TemplatePackages } from "../src/template-packages.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const gitHash = (value) =>
    createHash("sha1")
        .update("blob " + Buffer.byteLength(value) + "\0" + value)
        .digest("hex");
const source = { identifier: "openEHR-EHR-COMPOSITION.encounter.v1", content: "exact ADL source bytes\n" };
const envelope = (result) => ({ structuredContent: { success: true, result } });
function fixture(t, kind = "github") {
    const directory = mkdtempSync(join(tmpdir(), "template-packages-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const config = { dataDir: directory, providerEncryptionKey: "ab".repeat(32), allowWrites: true };
    const state = { head: "a".repeat(40), files: {}, writes: [], race: false, fail: "", valid: true };
    const result = (data, status = 200) => ({ status, text: JSON.stringify(data) });
    const connections = new PersonalConnections(config, {
        request: async (url, options) => {
            const path = new URL(url).pathname;
            assert.equal(options.token, "owner-token");
            if (options.method) {
                state.writes.push({ path, ...options });
                if (state.fail && path.endsWith(state.fail))
                    return result({ message: "Resource not accessible by personal access token" }, 403);
            }
            if (path.includes("/git/ref/heads/") || path.includes("/repository/branches/"))
                return result({ object: { sha: state.head }, commit: { id: state.head } });
            if (path.includes("/contents/") || path.includes("/repository/files/")) {
                assert.equal(new URL(url).searchParams.get("ref"), state.head);
                const name = decodeURIComponent(path.split(kind === "github" ? "/contents/" : "/repository/files/")[1]);
                const file = state.files[name];
                return file === undefined
                    ? result({}, 404)
                    : result({
                          type: "file",
                          encoding: "base64",
                          content: Buffer.from(file).toString("base64"),
                          sha: "b".repeat(40),
                          last_commit_id: "b".repeat(40),
                      });
            }
            if (path.includes("/git/commits/") && !options.method) return result({ tree: { sha: "c".repeat(40) } });
            if (path.includes("/git/trees/") && !options.method)
                return result({
                    tree: Object.entries(state.files).map(([path, content]) => ({
                        path,
                        type: "blob",
                        mode: "100644",
                        sha: gitHash(content),
                    })),
                });
            if (path.includes("/git/blobs/") && !options.method)
                return {
                    status: 200,
                    text: Object.values(state.files).find((content) => gitHash(content) === path.split("/").at(-1)),
                };
            if (path.endsWith("/git/trees")) {
                state.pending = options.body.tree;
                return result({ sha: "d".repeat(40) }, 201);
            }
            if (path.endsWith("/git/commits")) {
                assert.deepEqual(options.body.parents, ["a".repeat(40)]);
                return result({ sha: "e".repeat(40) }, 201);
            }
            if (path.includes("/git/refs/heads/")) {
                assert.equal(options.body.force, false);
                if (state.race) return result({}, 422);
                for (const file of state.pending) state.files[file.path] = file.content;
                state.head = options.body.sha;
                return result({ object: { sha: state.head } });
            }
            if (path.endsWith("/repository/commits")) {
                if (state.race) return result({}, 409);
                for (const file of options.body.actions) state.files[file.file_path] = file.content;
                state.head = "e".repeat(40);
                return result({ id: state.head }, 201);
            }
            throw new Error("Unexpected request " + path);
        },
    });
    const repo = connections.add("alice", {
        kind,
        url: kind === "github" ? "https://github.com/alice/models" : "https://gitlab.com/alice/models",
        branch: "draft/renal",
        token: "owner-token",
        label: "My models",
    }).connection;
    const chat = { id: "conversation-one", repository: repo.id, folder: "AKI" };
    const mcp = {
        tools: async () => [],
        call: async (name, args) => {
            if (name === "template_build_oet")
                return envelope({
                    content: "<template/>",
                    dependencies: [{ ...source, sha256: hash(source.content) }],
                });
            assert.equal(name, "template_compile");
            assert.deepEqual(args.dependencies, [source]);
            return envelope({
                valid: state.valid,
                dependencies: [{ identifier: source.identifier, sha256: hash(source.content) }],
                profile: "fixture",
                output: { sha256: "f".repeat(64) },
                ...(state.generated
                    ? {
                          output: {
                              format: "opt14_xml",
                              content: state.generated.opt,
                              sha256: hash(state.generated.opt),
                          },
                          web_template: {
                              format: "web_template_json",
                              content: state.generated.web,
                              sha256: hash(state.generated.web),
                          },
                      }
                    : {}),
            });
        },
    };
    const makeWorkspace = (identity = "alice", conversation = chat) =>
        new WorkspaceTools(mcp, connections, null, identity, conversation, AbortSignal.timeout(10000), true);
    const args = {
        repository: repo.id,
        path: "AKI/templates/oet/renal.oet",
        content: "<template/>",
        expectedRevision: null,
        message: "Save draft template package",
    };
    return { config, directory, state, connections, repo, chat, makeWorkspace, args, mcp };
}

for (const kind of ["github", "gitlab"])
    test(`${kind} saves linked form outputs in separate folders without overwriting earlier builds`, async (t) => {
        const f = fixture(t, kind);
        f.state.generated = {
            opt: "<template>" + "x".repeat(1080000) + "</template>",
            web: '{"templateId":"Synthetic","tree":{}}',
        };
        const workspace = f.makeWorkspace();
        await workspace.tools();
        const args = { ...f.args, dependencies: [source] };
        const plan = await workspace.prepareWrite(PERSONAL_WRITE, args);
        assert.equal(plan.files.length, 5);
        await workspace.call(PERSONAL_WRITE, args);
        const manifest = JSON.parse(f.state.files[plan.files.at(-1).path]);
        assert.equal(manifest.generated.length, 2);
        for (const output of manifest.generated) {
            const actual = f.state.files["AKI/" + output.path];
            assert.equal(hash(actual), output.sha256);
            assert(output.path.startsWith(output.kind === "opt" ? "templates/opt/" : "data/json/web-templates/"));
        }
        assert.equal(f.state.files["AKI/" + manifest.generated[0].path], f.state.generated.opt);
    });

for (const kind of ["github", "gitlab"])
    test(`${kind} saves the template and exact archetype bytes together with a relative hash manifest`, async (t) => {
        const f = fixture(t, kind),
            workspace = f.makeWorkspace();
        await workspace.tools();
        const args = { ...f.args, dependencies: [source] };
        const plan = await workspace.prepareWrite(PERSONAL_WRITE, args);
        assert.equal(f.state.writes.length, 0, "preparation is read-only");
        assert.equal(plan.files.length, 3);
        assert.equal(plan.files[1].path, "AKI/archetypes/" + source.identifier + ".adl");
        const saved = (await workspace.call(PERSONAL_WRITE, args)).structuredContent;
        assert.equal(saved.files.length, 3);
        assert.equal(saved.commit, f.state.head);
        assert.equal(f.state.files[f.args.path], f.args.content);
        assert.equal(f.state.files[plan.files[1].path], source.content);
        const manifest = JSON.parse(f.state.files[plan.files[2].path]);
        assert.equal(manifest.template.path, "templates/oet/renal.oet");
        assert.equal(manifest.archetypes[0].sha256, hash(source.content));
        assert.equal(manifest.archetypes[0].path, "archetypes/" + source.identifier + ".adl");
        assert.equal(manifest.clinicalApproval, false);
        assert.equal(f.state.writes.filter((item) => item.path.includes("/contents/")).length, 0);
        if (kind === "gitlab") {
            const write = f.state.writes.at(-1);
            assert.equal(write.body.actions.length, 3);
            assert.equal(write.body.branch, "draft/renal");
            assert.equal(write.body.force, false);
        }
    });

test("generated exact dependencies survive turns encrypted and isolated by profile and conversation", async (t) => {
    const f = fixture(t),
        first = f.makeWorkspace();
    await first.tools();
    await first.call("template_build_oet", {});
    const next = f.makeWorkspace();
    await next.tools();
    assert.equal((await next.prepareWrite(PERSONAL_WRITE, f.args)).files[1].content, source.content);
    const cachePath = join(f.directory, "template-packages", readdirSync(join(f.directory, "template-packages"))[0]);
    assert.doesNotMatch(readFileSync(cachePath, "utf8"), /exact ADL|COMPOSITION/);
    for (const [owner, chat] of [
        ["bob", "conversation-one"],
        ["alice", "conversation-two"],
    ]) {
        const cache = new TemplatePackages(f.config, owner, chat);
        await assert.rejects(cache.files(f.args, "AKI", f.mcp), /exact archetypes/);
    }
    await assert.rejects(
        next.prepareWrite(PERSONAL_WRITE, { ...f.args, content: "<changed-template/>" }),
        /exact archetypes/,
    );
    new TemplatePackages(f.config, "alice", f.chat.id).delete();
    assert.deepEqual(readdirSync(join(f.directory, "template-packages")), []);
});

test("missing, duplicate, changed or unvalidated dependencies never write an OET", async (t) => {
    const f = fixture(t),
        workspace = f.makeWorkspace();
    await workspace.tools();
    await assert.rejects(workspace.call(PERSONAL_WRITE, f.args), /exact archetypes/);
    await assert.rejects(workspace.call(PERSONAL_WRITE, { ...f.args, dependencies: [source, source] }), /unique/);
    f.state.valid = false;
    await assert.rejects(
        workspace.call(PERSONAL_WRITE, { ...f.args, dependencies: [source] }),
        /could not be compiled/,
    );
    f.state.valid = true;
    f.state.files["AKI/archetypes/" + source.identifier + ".adl"] = "another revision";
    await assert.rejects(workspace.call(PERSONAL_WRITE, { ...f.args, dependencies: [source] }), /different contents/);
    assert.equal(f.state.writes.length, 0);
});

for (const kind of ["github", "gitlab"])
    test(`${kind} reuses identical archetypes and refuses concurrent repository changes`, async (t) => {
        const f = fixture(t, kind),
            workspace = f.makeWorkspace();
        await workspace.tools();
        const path = "AKI/archetypes/" + source.identifier + ".adl";
        f.state.files[path] = source.content;
        const args = { ...f.args, dependencies: [source] };
        const plan = await workspace.prepareWrite(PERSONAL_WRITE, args);
        assert.equal(plan.files[1].changed, false);
        f.state.head = "9".repeat(40);
        await assert.rejects(workspace.call(PERSONAL_WRITE, args), /Repository changed/);
        assert.equal(f.state.writes.length, 0);
        f.state.head = plan.base;
        f.state.race = true;
        await assert.rejects(workspace.call(PERSONAL_WRITE, args));
        assert.deepEqual(f.state.files, { [path]: source.content });
        if (kind === "gitlab") {
            const unchanged = f.state.writes.at(-1).body.actions.find((file) => file.file_path === path);
            assert.equal(unchanged.last_commit_id, "b".repeat(40));
        }
    });

test("a bundle permission refusal retains the precise access failure and leaves the branch unchanged", async (t) => {
    const f = fixture(t),
        workspace = f.makeWorkspace();
    await workspace.tools();
    f.state.fail = "/git/trees";
    await assert.rejects(
        workspace.call(PERSONAL_WRITE, { ...f.args, dependencies: [source] }),
        /Contents: Read and write/,
    );
    assert.equal(f.connections.list("alice")[0].lastWriteError.code, "GITHUB_CONTENTS_WRITE_REQUIRED");
    assert.deepEqual(f.state.files, {});
    assert.equal(f.state.head, "a".repeat(40));
});

test("MCP text envelopes retain generator sources and compile dependencies without truncating browser output", async (t) => {
    const f = fixture(t);
    const call = f.mcp.call;
    f.mcp.call = async (...args) => ({
        content: [{ type: "text", text: JSON.stringify((await call(...args)).structuredContent) }],
    });
    const workspace = f.makeWorkspace();
    await workspace.tools();
    const generated = await workspace.call("template_build_oet", {});
    assert.equal(generated.structuredContent.result.dependencies[0].content, undefined);
    assert.match(generated.structuredContent.result.repository_package, /automatically/);
    assert.equal((await workspace.prepareWrite(PERSONAL_WRITE, f.args)).files[1].content, source.content);
    f.mcp.call = async () => ({ content: [{ type: "text", text: JSON.stringify({ success: false, result: null }) }] });
    await assert.rejects(f.makeWorkspace().prepareWrite(PERSONAL_WRITE, { ...f.args }), /could not be compiled/);
});
