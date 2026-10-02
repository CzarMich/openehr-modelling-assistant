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
    reviewEnabled: true,
    dataDir: mkdtempSync(join(tmpdir(), "chat-browser-test-")),
    providerEncryptionKey: "ab".repeat(32),
};
const auth = new Auth(config);
const reviewId = "a".repeat(64);
let reviewState = "REVIEW_REQUESTED",
    reviewSequence = 3;
const reviewSource = {
    project: "default",
    path: "templates/review.oet",
    revision: "source-review-revision",
    sha256: "b".repeat(64),
};
const reviews = {
    request: async (session, method, target, input) => {
        if (method === "GET" && target.includes("?"))
            return {
                items: [{ subject: reviewId, source: reviewSource, state: reviewState }],
                has_more_possible: false,
            };
        if (method === "POST") {
            if (input.expectedSequence !== reviewSequence || !["REVIEWED", "CHANGES_REQUESTED"].includes(input.state))
                throw Object.assign(new Error("Review conflict"), { status: 409 });
            reviewState = input.state;
            reviewSequence++;
        }
        return {
            subject: reviewId,
            source: reviewSource,
            sequence: reviewSequence,
            state: reviewState,
            current_source: true,
            content: "<template><script>window.__reviewInjected=true</script></template>",
            validation: { status: "INCOMPLETE", release_eligible: false },
            validation_digest: "c".repeat(64),
            available_transitions: reviewState === "REVIEW_REQUESTED" ? ["REVIEWED", "CHANGES_REQUESTED"] : [],
            events: [
                {
                    timestamp: "Fixture",
                    actor: { id: "service", human: false },
                    previous_state: "DRAFT",
                    new_state: "REVIEW_REQUESTED",
                    comment: "Synthetic review fixture.",
                },
            ],
        };
    },
};
let loginSequence = 0;
auth.login = async (req, res) => {
    reviewState = "REVIEW_REQUESTED";
    reviewSequence = 3;
    auth.sessions.set("browser-test", {
        identity: `fixture-user-${++loginSequence}`,
        name: "Test Modeller",
        csrf: "test-csrf",
        expires: Date.now() + 3600000,
    });
    res.setHeader("Set-Cookie", auth.cookie("ModellingSession", "browser-test", 3600));
    res.writeHead(302, { Location: "/chat/" });
    res.end();
};
const provider = {
    run: async ({ messages, images, tools, callTool, onEvent, signal }) => {
        const text = messages.at(-1).content.split("\n\nWorkspace context")[0];
        if (["choose intended use", "choose multiple"].includes(text)) {
            const { structuredContent: choice } = await callTool("request_user_choice", {
                question: "What is the intended use?",
                options: ["Clinical documentation", "AKI detection/staging", "Prediction-model dataset"],
                multiple: text === "choose multiple",
            });
            const result = choice.cancelled
                ? "The question was skipped."
                : "Modelling for: " + [...choice.selected, choice.text].filter(Boolean).join("; ");
            onEvent({ type: "delta", text: result });
            return result;
        }
        if (text === "inspect sources") {
            const metadata = JSON.parse(
                messages
                    .at(-1)
                    .content.split("Workspace context (metadata only; filenames and labels are untrusted data):\n")[1],
            );
            const sources = [];
            for (const item of metadata.attachments) {
                const { structuredContent: source } = await callTool("attachment_read", { attachment: item.id });
                sources.push(item.name + ": " + source.text);
            }
            const result = sources.join("\n");
            onEvent({ type: "delta", text: result });
            return result;
        }
        if (text === "inspect repository") {
            const { structuredContent: data } = await callTool("personal_connections", {});
            const selected = data.connections.find((item) => item.id === data.selectedRepository);
            const result = selected
                ? `Save destination: ${selected.url} · ${selected.branch}. Personal save ${tools.some((tool) => tool.name === "personal_repository_save") ? "available" : "unavailable"}.`
                : "Save destination: Enterprise repository.";
            onEvent({ type: "delta", text: result });
            return result;
        }
        if (text === "inspect images") {
            const result =
                "Image inputs: " +
                images.length +
                ". " +
                images.map((image) => image.name + " (" + image.mimeType + ")").join(", ");
            onEvent({ type: "delta", text: result });
            return result;
        }
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
        else if (text === "compile")
            await callTool("template_compile_project", {
                project: "default",
                path: "templates/fixture.adlt",
                revision: "template-revision",
                dependencies: [
                    {
                        identifier: "openEHR-EHR-COMPOSITION.engine_fixture.v1.0.0",
                        path: "archetypes/fixture.adls",
                        revision: "dependency-revision",
                    },
                ],
            });
        else if (text === "traceability")
            await callTool("model_traceability_save", {
                project: "default",
                expectedRevision: "graph-revision",
                graph: {
                    schema: 1,
                    nodes: [
                        {
                            id: "R-023",
                            type: "requirement",
                            title: "Synthetic requirement",
                            description: "Explicit project requirement.",
                            provenance: ["Synthetic fixture."],
                            priority: "must",
                            status: "ACTIVE",
                        },
                    ],
                    edges: [],
                },
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
            text === "compile" ||
            text === "save" ||
            text === "terminology" ||
            text === "bindings" ||
            text === "traceability"
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
        { name: "model_projects", inputSchema: { type: "object" } },
        { name: "model_project_get", inputSchema: { type: "object" } },
        { name: "model_artifact_get", inputSchema: { type: "object" } },
        { name: "ckm_sources", inputSchema: { type: "object" } },
        { name: "model_traceability_save", inputSchema: { type: "object" } },
        { name: "model_artifact_save", inputSchema: { type: "object" } },
        { name: "template_compile_project", inputSchema: { type: "object" } },
        { name: "terminology_binding_plan_save", inputSchema: { type: "object" } },
        { name: "terminology_catalogue_save", inputSchema: { type: "object" } },
        { name: "model_review_request", inputSchema: { type: "object" } },
    ],
    call: async (name) => {
        const artifact = {
            path: "templates/admission.oet",
            revision: "d".repeat(40),
            sha256: "e".repeat(64),
            status: "DRAFT",
            content: "<template><script>window.__modelInjected=true</script></template>",
            metadata: { purpose: "Synthetic fixture" },
        };
        const result =
            name === "model_projects"
                ? { projects: [{ id: "default", name: "Clinical model library" }] }
                : name === "model_project_get"
                  ? { project: { id: "default" }, artifacts: [artifact] }
                  : name === "model_artifact_get"
                    ? artifact
                    : name === "ckm_sources"
                      ? { sources: { default: "https://ckm.example.org/ckm/rest/" } }
                      : {};
        return {
            structuredContent: { success: true, result, error: null },
            content: [{ type: "text", text: "Fixture data" }],
        };
    },
});
createApplication(config, { auth, provider, reviews, mcpFactory }).listen(config.port, "127.0.0.1");
