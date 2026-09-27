// Deterministic browser test fixture. This file is never included in the runtime image.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { Auth } from "../src/auth.mjs";
import { createApplication } from "../src/server.mjs";
const config = {
    ...loadConfig(),
    enabled: true,
    origin: "http://127.0.0.1:8359",
    port: 8359,
    allowWrites: true,
    dataDir: mkdtempSync(join(tmpdir(), "chat-browser-test-")),
};
const auth = new Auth(config);
auth.login = async (req, res) => {
    auth.sessions.set("browser-test", {
        identity: "fixture-user",
        name: "Test Modeller",
        csrf: "test-csrf",
        expires: Date.now() + 3600000,
    });
    res.setHeader("Set-Cookie", auth.cookie("ModellingSession", "browser-test", 3600));
    res.writeHead(302, { Location: "/chat/" });
    res.end();
};
const provider = {
    run: async ({ messages, callTool, onEvent, signal }) => {
        const text = messages.at(-1).content;
        if (text === "wait")
            return new Promise((resolve, reject) =>
                signal.addEventListener("abort", () => reject(new Error("Stopped")), { once: true }),
            );
        if (text === "save")
            await callTool("model_artifact_save", {
                projectId: "default",
                path: "requirements/example.txt",
                content: "A reviewed draft",
                expectedRevision: "revision-one",
            });
        else if (text === "bindings")
            await callTool("terminology_binding_plan_save", {
                project: "default",
                path: "templates/admission.oet",
                modelRevision: "source-revision",
                expectedRevision: "plan-revision",
                aliases: [],
            });
        else if (text === "terminology")
            await callTool("terminology_catalogue_save", {
                project: "default",
                record: {
                    kind: "value_set",
                    canonical: "https://example.org/sets/feeding",
                    version: "1",
                    name: "Feeding",
                    provenance: { source: "Synthetic browser fixture" },
                    concepts: [],
                },
                expectedRevision: "terminology-revision",
            });
        else if (text === "review")
            await callTool("model_review_request", { branch: "draft/model", title: "Review model" });
        else await callTool("ckm_sources", {});
        const answer =
            text === "save" || text === "terminology" || text === "bindings"
                ? "The draft was saved after your confirmation."
                : text === "review"
                  ? "The draft review was requested after your confirmation."
                  : "The configured source is **default**. Terminology binding is optional.\n```xml\n<draft/>\n```";
        for (const chunk of answer.match(/.{1,12}/gs)) {
            if (signal.aborted) throw new Error("Stopped");
            onEvent({ type: "delta", text: chunk });
            await new Promise((r) => setTimeout(r, 10));
        }
        return answer;
    },
};
const mcpFactory = () => ({
    tools: async () => [
        { name: "ckm_sources", inputSchema: { type: "object" } },
        { name: "model_artifact_save", inputSchema: { type: "object" } },
        { name: "terminology_binding_plan_save", inputSchema: { type: "object" } },
        { name: "terminology_catalogue_save", inputSchema: { type: "object" } },
        { name: "model_review_request", inputSchema: { type: "object" } },
    ],
    call: async () => ({ content: [{ type: "text", text: "Fixture data" }] }),
});
createApplication(config, { auth, provider, mcpFactory }).listen(config.port, "127.0.0.1");
