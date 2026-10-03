import { createHash } from "node:crypto";
import { join } from "node:path";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { ProviderStore } from "./provider-store.mjs";
import { artifactKind } from "./repository-paths.mjs";
import { problem } from "./personal-http.mjs";

const hash = (content) => createHash("sha256").update(content).digest("hex");
export const isTemplate = (path) => ["oet", "adlTemplates"].includes(artifactKind(path));
export const modelResult = (result) => {
    let value = result?.structuredContent;
    if (!value) {
        try {
            value = JSON.parse(result?.content?.find((item) => item.type === "text")?.text);
        } catch {
            return null;
        }
    }
    if (result?.isError || value?.success === false) return null;
    return value?.result || value;
};

function dependencies(value) {
    if (!Array.isArray(value) || !value.length || value.length > 64)
        throw problem(
            "Include the exact archetypes used by this template (up to 64 dependencies). Rebuild it with template_build_oet or supply dependencies with identifier and content.",
        );
    const seen = new Set();
    const result = value.map((item) => {
        if (
            !item ||
            !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,199}$/.test(item.identifier || "") ||
            typeof item.content !== "string" ||
            !item.content.trim() ||
            item.content.includes("\0") ||
            Buffer.byteLength(item.content) > 1024 * 1024 ||
            seen.has(item.identifier)
        )
            throw problem(
                "Template dependencies must have unique archetype identifiers and bounded, non-empty ADL content.",
            );
        seen.add(item.identifier);
        const sha256 = hash(item.content);
        if (item.sha256 && item.sha256 !== sha256)
            throw problem("An archetype's contents no longer match its source hash.");
        return { identifier: item.identifier, content: item.content, sha256 };
    });
    if (Buffer.byteLength(JSON.stringify(result)) > 6 * 1024 * 1024)
        throw problem("The template dependency package is too large.", 413);
    return result.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

// Retain exact build inputs across browser turns without putting source documents
// into chat history or sharing them with another profile/conversation.
export class TemplatePackages {
    static prune(config) {
        const directory = join(config.dataDir, "template-packages");
        let names;
        try {
            names = readdirSync(directory);
        } catch (error) {
            if (error.code === "ENOENT") return;
            throw error;
        }
        for (const name of names) {
            if (!/^[a-f0-9]{64}-packages\.json$/.test(name)) continue;
            const path = join(directory, name);
            if (statSync(path).mtimeMs < Date.now() - 7 * 86400000) unlinkSync(path);
        }
    }
    constructor(config, identity, conversation) {
        this.identity = identity + "\0" + conversation;
        this.store = config?.providerEncryptionKey
            ? new ProviderStore(join(config.dataDir, "template-packages"), config.providerEncryptionKey, ["packages"])
            : null;
        this.memory = [];
    }
    entries() {
        return (this.store?.get(this.identity, "packages")?.credential || this.memory).filter(
            (entry) => entry.expires > Date.now(),
        );
    }
    delete() {
        this.store?.delete(this.identity, "packages");
        this.memory = [];
    }
    capture(name, args, response) {
        const result = modelResult(response);
        if (!result) return;
        const generated = name === "template_build_oet";
        if (!generated && !["template_compile", "template_validate"].includes(name)) return;
        const content = generated ? result.content : args.content;
        const inputs = generated ? result.dependencies : args.dependencies;
        if (typeof content !== "string" || !inputs?.length) return;
        const entry = {
            hash: hash(content),
            dependencies: dependencies(inputs),
            ...(generated && result.provenance ? { provenance: result.provenance } : {}),
            expires: Date.now() + 7 * 86400000,
        };
        const entries = [entry, ...this.entries().filter((item) => item.hash !== entry.hash)].slice(0, 4);
        while (entries.length > 1 && Buffer.byteLength(JSON.stringify(entries)) > 8 * 1024 * 1024) entries.pop();
        if (this.store) this.store.set(this.identity, "packages", entries);
        else this.memory = entries;
    }
    async files(args, folder, mcp) {
        const cached = this.entries().find((item) => item.hash === hash(args.content));
        const inputs = dependencies(args.dependencies || cached?.dependencies);
        const report = modelResult(
            await mcp.call("template_compile", {
                content: args.content,
                dependencies: inputs.map(({ identifier, content }) => ({ identifier, content })),
            }),
        );
        if (
            report?.valid !== true ||
            !report.output?.sha256 ||
            report.dependencies?.length !== inputs.length ||
            inputs.some(
                (item) =>
                    !report.dependencies.some(
                        (checked) => checked.identifier === item.identifier && checked.sha256 === item.sha256,
                    ),
            )
        )
            throw problem(
                "The template package could not be compiled with these exact archetypes. Resolve missing dependencies or validation findings with template_compile before saving. No files were saved.",
            );
        const prefix = folder ? folder + "/" : "";
        const relative = args.path.slice(prefix.length);
        const sources = inputs.map((item) => ({
            path: prefix + "archetypes/" + item.identifier + ".adl",
            content: item.content,
            identicalOnly: true,
        }));
        const generated = [];
        // Immutable, content-addressed outputs avoid overwriting manually edited
        // OPTs or form schemas. The manifest links each build to its exact source.
        for (const [kind, output] of [
            ["opt", report.output],
            ["web_template", report.web_template],
        ]) {
            if (typeof output?.content !== "string") continue;
            if (hash(output.content) !== output.sha256)
                throw problem("A generated template output failed its integrity check.");
            const name = relative
                .split("/")
                .at(-1)
                .replace(/\.(?:oet(?:\.xml)?|adlt)$/i, "");
            const target =
                kind === "opt"
                    ? "templates/opt/" + name + "." + output.sha256.slice(0, 12) + ".opt"
                    : "data/json/web-templates/" + name + "." + output.sha256.slice(0, 12) + ".webtemplate.json";
            generated.push({ kind, path: target, content: output.content, sha256: output.sha256 });
        }
        const manifest = {
            schema: "openehr-template-package/1",
            status: "DRAFT",
            clinicalApproval: false,
            template: { path: relative, sha256: hash(args.content) },
            archetypes: inputs.map((item) => ({
                identifier: item.identifier,
                path: "archetypes/" + item.identifier + ".adl",
                sha256: item.sha256,
                ...(cached?.dependencies.some(
                    (source) => source.identifier === item.identifier && source.sha256 === item.sha256,
                ) && cached.provenance?.[item.identifier]
                    ? { provenance: cached.provenance[item.identifier] }
                    : {}),
            })),
            generated: generated.map(({ kind, path, sha256 }) => ({ kind, path, sha256 })),
            compilation: {
                profile: report.profile,
                outputSha256: report.output.sha256,
                checks: report.checks,
                limitations: report.limitations,
            },
        };
        return [
            { path: args.path, content: args.content, expectedRevision: args.expectedRevision },
            ...sources,
            ...generated.map((item) => ({ path: prefix + item.path, content: item.content, identicalOnly: true })),
            {
                path:
                    prefix +
                    "data/json/template-packages/" +
                    relative.replace(/^templates\/(?:oet|adl)\//, "") +
                    ".json",
                content: JSON.stringify(manifest, null, 2) + "\n",
            },
        ];
    }
}
