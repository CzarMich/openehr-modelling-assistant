import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ProviderStore } from "./provider-store.mjs";
import { httpsUrl, personalRequest, problem } from "./personal-http.mjs";

const canonical = (value) => {
    const url = httpsUrl(value);
    return url.origin + url.pathname.replace(/\/+$/, "");
};
const visible = ({ token, ...connection }) => ({ ...connection, authenticated: !!token });

export function unpack(result) {
    if (result?.isError || result?.structuredContent?.success === false)
        throw problem("The modelling service could not list enterprise connections.", 503);
    let data = result.structuredContent;
    if (!data) {
        try {
            data = JSON.parse(result.content.find((item) => item.type === "text").text);
        } catch {
            throw problem("The modelling service could not list enterprise connections.", 503);
        }
    }
    return data.result || data;
}

export class PersonalConnections {
    constructor(config, { request = personalRequest, store } = {}) {
        this.config = config;
        this.request = request;
        this.store =
            store ||
            (config.providerEncryptionKey
                ? new ProviderStore(join(config.dataDir, "connections"), config.providerEncryptionKey, ["workspace"])
                : null);
    }
    all(identity) {
        return this.store?.get(identity, "workspace")?.credential || [];
    }
    list(identity) {
        return this.all(identity).map(visible);
    }
    get(identity, id, kind) {
        const item = this.all(identity).find((c) => c.id === id && (!kind || c.kind === kind));
        if (!item) throw problem("Personal connection not found.", 404);
        return item;
    }
    async enterprise(mcp) {
        const data = unpack(await mcp.call("ckm_sources", {}));
        if (!data.sources || typeof data.sources !== "object" || Array.isArray(data.sources))
            throw problem("The enterprise CKM list is unavailable.", 503);
        return Object.entries(data.sources).map(([id, url]) => ({
            id,
            label: id,
            url,
            kind: "ckm",
            scope: "enterprise",
        }));
    }
    add(identity, input, enterprise = []) {
        if (!this.store) throw problem("Personal connections are not configured.", 503);
        if (
            !["ckm", "github", "gitlab"].includes(input.kind) ||
            typeof input.label !== "string" ||
            !input.label.trim() ||
            input.label.length > 80 ||
            typeof input.url !== "string" ||
            (input.token !== undefined &&
                (typeof input.token !== "string" || !/^[\x21-\x7e]{1,2000}$/.test(input.token)))
        )
            throw problem("Enter a name, a supported connection type and a valid access token if needed.");
        let url = canonical(input.url);
        const items = this.all(identity);
        if (input.kind === "ckm") {
            const existing = enterprise.find((item) => canonical(item.url) === url);
            if (existing) return { connection: existing, duplicate: true };
        } else {
            const parsed = new URL(url);
            if (input.kind === "github" && parsed.hostname !== "github.com")
                throw problem("Use a github.com repository URL.");
            const path = parsed.pathname.replace(/\.git$/, "");
            if (
                !/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(path) ||
                path.split("/").some((p) => p === "." || p === "..") ||
                (input.kind === "github" && path.split("/").length !== 3)
            )
                throw problem("Enter the repository URL, without a branch or file path.");
            url = parsed.origin + path;
            if (
                typeof input.branch !== "string" ||
                !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(input.branch) ||
                /\.\.|\/\/|\/$|\.lock$/.test(input.branch)
            )
                throw problem("Enter a valid target branch.");
        }
        const duplicate = items.find(
            (item) => item.kind === input.kind && item.url === url && (item.branch || "") === (input.branch || ""),
        );
        if (duplicate) {
            if (input.kind !== "ckm" && input.token !== undefined) {
                duplicate.token = input.token;
                duplicate.label = input.label.trim();
                this.store.set(identity, "workspace", items);
                return { connection: visible(duplicate), duplicate: true, updated: true };
            }
            return { connection: visible(duplicate), duplicate: true };
        }
        if (items.length >= 20) throw problem("Remove an unused connection before adding another (limit 20).", 429);
        const connection = {
            id: randomUUID(),
            kind: input.kind,
            label: input.label.trim(),
            url,
            token: input.token || "",
            ...(input.kind !== "ckm" ? { branch: input.branch } : {}),
        };
        this.store.set(identity, "workspace", [...items, connection]);
        return { connection: visible(connection), duplicate: false };
    }
    remove(identity, id) {
        this.get(identity, id);
        this.store.set(
            identity,
            "workspace",
            this.all(identity).filter((item) => item.id !== id),
        );
    }
    async remote(connection, suffix, options = {}) {
        const response = await this.request(connection.url + suffix, {
            ...options,
            token: connection.token,
            allowedHosts: this.config.personalAllowedHosts || [],
        });
        if (![200, 201, 404].includes(response.status))
            throw problem(
                response.status === 409 || response.status === 422
                    ? "Repository changed. Read the current revision and retry."
                    : "The personal connection refused the request. Check the URL, branch and token permissions.",
                response.status === 409 || response.status === 422 ? 409 : 503,
            );
        return response;
    }
    async ckm(identity, args, signal) {
        const source = this.get(identity, args.source, "ckm");
        if (!["archetypes", "templates"].includes(args.kind)) throw problem("Choose archetypes or templates.");
        let suffix = "/v1/" + args.kind;
        if (args.cid !== undefined) {
            if (typeof args.cid !== "string" || !/^\d+(?:\.\d+){1,5}$/.test(args.cid))
                throw problem("Use a CID returned by this CKM.");
            const format = args.kind === "archetypes" ? "adl" : "oet";
            suffix += "/" + args.cid + "/" + format;
        } else {
            if (typeof args.keyword !== "string" || !args.keyword.trim() || args.keyword.length > 200)
                throw problem("Enter a CKM search term.");
            suffix +=
                "?" +
                new URLSearchParams({
                    "search-text": args.keyword,
                    size: "20",
                    offset: "0",
                    "restrict-search-to-main-data": "true",
                    "require-all-search-words": "true",
                    "sort-key": "RELEVANCE",
                });
        }
        const result = await this.remote(source, suffix, { signal });
        if (result.status === 404) throw problem("CKM resource not found.", 404);
        let content = result.text;
        if (!args.cid) {
            try {
                content = JSON.parse(content);
            } catch {
                throw problem("Invalid CKM search response.", 503);
            }
            if (!Array.isArray(content)) throw problem("Invalid CKM search response.", 503);
            content = content.slice(0, 20);
        }
        return { source: visible(source), content, ...(args.cid ? {} : { limit: 20, windowed: true }) };
    }
    repoApi(repo) {
        const url = new URL(repo.url);
        return {
            ...repo,
            url:
                repo.kind === "github"
                    ? "https://api.github.com/repos" + url.pathname
                    : url.origin + "/api/v4/projects/" + encodeURIComponent(url.pathname.slice(1)),
        };
    }
    validatePath(path) {
        if (
            typeof path !== "string" ||
            path.length > 300 ||
            !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(path) ||
            path.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith("."))
        )
            throw problem("Use a relative artifact path without hidden directories or traversal.");
        if (!/\.(adl|adls|adlf|oet|opt|xml|json|aql|csv|md|txt|yaml|yml)$/i.test(path))
            throw problem("Choose a modelling artifact file extension.");
        return path;
    }
    async listRepository(identity, args, signal) {
        const repo = this.get(identity, args.repository);
        if (repo.kind === "ckm") throw problem("Choose a repository.");
        const suffix =
            repo.kind === "github"
                ? "/git/trees/" + encodeURIComponent(repo.branch) + "?recursive=1"
                : "/repository/tree?recursive=true&per_page=100&ref=" + encodeURIComponent(repo.branch);
        const response = await this.remote(this.repoApi(repo), suffix, { signal });
        if (response.status === 404) throw problem("Repository or branch not found.", 404);
        let data;
        try {
            data = JSON.parse(response.text);
        } catch {
            throw problem("Invalid repository response.", 503);
        }
        const rows = repo.kind === "github" ? data.tree : data;
        if (!Array.isArray(rows)) throw problem("Invalid repository response.", 503);
        return {
            repository: visible(repo),
            items: rows
                .slice(0, 100)
                .map((item) => ({ path: item.path, type: item.type, revision: item.sha || item.id })),
            windowed: repo.kind === "github" ? !!data.truncated || rows.length > 100 : rows.length === 100,
            limit: 100,
        };
    }
    async readRepository(identity, args, signal) {
        const repo = this.get(identity, args.repository);
        if (repo.kind === "ckm") throw problem("Choose a repository.");
        const path = this.validatePath(args.path);
        const suffix =
            repo.kind === "github"
                ? "/contents/" +
                  path.split("/").map(encodeURIComponent).join("/") +
                  "?ref=" +
                  encodeURIComponent(repo.branch)
                : "/repository/files/" + encodeURIComponent(path) + "?ref=" + encodeURIComponent(repo.branch);
        const response = await this.remote(this.repoApi(repo), suffix, { signal });
        if (response.status === 404) return { exists: false, revision: null, path, repository: visible(repo) };
        let data;
        try {
            data = JSON.parse(response.text);
        } catch {
            throw problem("Invalid repository response.", 503);
        }
        if (
            (data.type && data.type !== "file") ||
            data.encoding !== "base64" ||
            typeof data.content !== "string" ||
            data.size > 1024 * 1024
        )
            throw problem("The repository file is unavailable or too large.", 413);
        const revision = repo.kind === "github" ? data.sha : data.last_commit_id;
        if (typeof revision !== "string" || !/^[a-f0-9]{40,64}$/.test(revision))
            throw problem("Invalid repository revision.", 503);
        return {
            exists: true,
            revision,
            path,
            content: Buffer.from(data.content, "base64").toString("utf8"),
            repository: visible(repo),
        };
    }
    async publish(identity, args, signal) {
        if (!this.config.allowWrites) throw problem("Repository writes are disabled.", 403);
        const repo = this.get(identity, args.repository);
        if (repo.kind === "ckm" || !repo.token) throw problem("Choose a repository with a personal write token.");
        const path = this.validatePath(args.path);
        if (
            typeof args.content !== "string" ||
            !args.content.trim() ||
            Buffer.byteLength(args.content) > 1024 * 1024 ||
            !(
                args.expectedRevision === null ||
                (typeof args.expectedRevision === "string" && /^[a-f0-9]{40,64}$/.test(args.expectedRevision))
            ) ||
            typeof args.message !== "string" ||
            !args.message.trim() ||
            args.message.length > 200
        )
            throw problem(
                "Supply artifact content, a commit message and the exact previous revision (null for a new file).",
            );
        const current = await this.readRepository(identity, args, signal);
        if (current.revision !== args.expectedRevision)
            throw problem("Repository changed. Read the current revision and retry.", 409);
        let suffix, body, method;
        if (repo.kind === "github") {
            suffix = "/contents/" + path.split("/").map(encodeURIComponent).join("/");
            method = "PUT";
            body = {
                branch: repo.branch,
                message: args.message,
                content: Buffer.from(args.content).toString("base64"),
                ...(current.exists ? { sha: current.revision } : {}),
            };
        } else {
            suffix = "/repository/files/" + encodeURIComponent(path);
            method = current.exists ? "PUT" : "POST";
            body = {
                branch: repo.branch,
                commit_message: args.message,
                content: args.content,
                ...(current.exists ? { last_commit_id: current.revision } : {}),
            };
        }
        const response = await this.remote(this.repoApi(repo), suffix, { method, body, signal });
        if (response.status === 404) throw problem("Repository or branch not found.", 404);
        let receipt = {};
        try {
            receipt = JSON.parse(response.text);
        } catch {}
        const commit = repo.kind === "github" ? receipt?.commit?.sha : receipt?.commit_id;
        return {
            saved: true,
            repository: visible(repo),
            path,
            status: "DRAFT",
            clinicalApproval: false,
            ...(typeof commit === "string" && /^[a-f0-9]{40,64}$/.test(commit) ? { commit } : {}),
            url:
                repo.url +
                (repo.kind === "github" ? "/blob/" : "/-/blob/") +
                encodeURIComponent(repo.branch) +
                "/" +
                path.split("/").map(encodeURIComponent).join("/"),
        };
    }
}
