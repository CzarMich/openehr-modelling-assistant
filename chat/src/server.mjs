import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Auth } from "./auth.mjs";
import { Store } from "./store.mjs";
import { McpClient, WRITE_TOOLS } from "./mcp.mjs";
import { Providers } from "./providers.mjs";
import { ReviewClient } from "./reviews.mjs";
import { readModels } from "./models.mjs";

const publicDir = fileURLToPath(new URL("../../public/chat/", import.meta.url));
const json = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
};
async function body(req, allowed, message = "Invalid request fields.") {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
        throw Object.assign(new Error("Expected JSON"), { status: 415 });
    let size = 0,
        parts = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) throw Object.assign(new Error("Message is too large"), { status: 413 });
        parts.push(chunk);
    }
    let input;
    try {
        input = JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
        throw Object.assign(new Error("Invalid JSON"), { status: 400 });
    }
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        (allowed && Object.keys(input).some((key) => !allowed.includes(key)))
    )
        throw Object.assign(new Error(message), { status: 400 });
    return input;
}

// Serialize tool calls so each write confirmation identifies exactly one pending change.
function serialToolCalls(run) {
    let pending = Promise.resolve();
    return (...args) => {
        const result = pending.then(() => run(...args));
        pending = result.catch(() => {});
        return result;
    };
}

export function createApplication(
    config,
    {
        auth = new Auth(config),
        store = new Store(config.dataDir + "/conversations", config.retentionDays),
        provider = new Providers(config),
        mcpFactory = (signal) => new McpClient(config, signal),
        reviews = new ReviewClient(config),
    } = {},
) {
    const active = new Map(),
        rate = new Map(),
        modelReads = new Map();
    store.prune();
    const cleanup = setInterval(() => {
        try {
            store.prune();
        } catch {
            console.error('{"event":"chat_retention_failed"}');
        }
    }, 3600000);
    cleanup.unref();
    const server = http.createServer(async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        );
        const path = new URL(req.url, "http://local").pathname;
        try {
            if (req.method === "GET" && path === "/health")
                return json(res, 200, {
                    status: "alive",
                    enabled: config.enabled,
                    review_enabled: config.reviewEnabled,
                });
            if (
                (config.enabled || config.reviewEnabled || config.identityEnabled) &&
                req.headers.host !== new URL(config.origin).host
            )
                throw Object.assign(new Error("Unknown host"), { status: 421 });
            const assets = {
                "/": ["index.html", "text/html; charset=utf-8"],
                "/chat/": ["index.html", "text/html; charset=utf-8"],
                "/chat/workspace.js": ["workspace.js", "text/javascript"],
                "/chat/workspace.css": ["workspace.css", "text/css"],
                "/chat/app.js": ["app.js", "text/javascript"],
                "/chat/style.css": ["style.css", "text/css"],
                "/chat/reviews.js": ["reviews.js", "text/javascript"],
                "/chat/identity.js": ["identity.js", "text/javascript"],
            };
            if (req.method === "GET" && path === "/chat/reviews") {
                res.writeHead(302, { Location: "/chat/#governance" });
                return res.end();
            }
            if (req.method === "GET" && path === "/chat") {
                res.writeHead(302, { Location: "/chat/" });
                return res.end();
            }
            if (req.method === "GET" && assets[path]) {
                res.writeHead(200, { "Content-Type": assets[path][1] });
                return res.end(readFileSync(publicDir + assets[path][0]));
            }
            if (req.method === "GET" && path === "/chat/api/session") {
                const session = auth.session(req);
                return json(res, 200, {
                    enabled: config.enabled,
                    authenticated: !!session && !session.mfaSetupRequired,
                    user: session
                        ? {
                              name: session.name,
                              ...(session.user ? { id: session.user.id, roles: session.user.roles } : {}),
                          }
                        : null,
                    csrf: session?.csrf,
                    allowWrites: config.allowWrites,
                    reviewEnabled: config.reviewEnabled,
                    identityEnabled: config.identityEnabled,
                    identitySetupRequired: config.identityEnabled && auth.identityStore.read().users.length === 0,
                    oidcEnabled: !!config.issuer,
                    mfaSetupRequired: !!session?.mfaSetupRequired,
                    ...(session?.mfaSetupRequired
                        ? { totpSecret: session.totpSecret, otpAuthUrl: session.otpAuthUrl }
                        : {}),
                    retentionDays: config.retentionDays,
                    providers:
                        session && !session.mfaSetupRequired && config.enabled
                            ? provider.status?.(session.identity) || [
                                  { id: "codex", name: "Codex", connected: true },
                                  { id: "claude", name: "Claude", connected: true },
                              ]
                            : [],
                });
            }
            if (!config.enabled && !config.reviewEnabled && !config.identityEnabled)
                throw Object.assign(
                    new Error(
                        "Browser review is disabled. Configure CHAT_REVIEW_ENABLED=true and the browser OIDC client; CHAT_ENABLED and a model-provider account are only needed for conversational chat.",
                    ),
                    { status: 503 },
                );
            if (req.method === "POST" && path.startsWith("/chat/auth/") && req.headers.origin !== config.origin)
                throw Object.assign(new Error("Request could not be verified"), { status: 403 });
            if (req.method === "POST" && path === "/chat/auth/local") {
                const input = await body(
                    req,
                    ["username", "password", "otp", "recoveryCode"],
                    "Invalid sign-in request.",
                );
                const result = await auth.localLogin(input, req, res);
                return json(res, 200, result);
            }
            if (req.method === "POST" && path === "/chat/auth/bootstrap") {
                const input = await body(
                    req,
                    ["token", "username", "displayName", "password"],
                    "Invalid bootstrap request.",
                );
                return json(res, 201, auth.bootstrap(input, res));
            }
            if (req.method === "POST" && path === "/chat/auth/invitations/accept") {
                const input = await body(
                    req,
                    ["token", "username", "displayName", "password"],
                    "Invalid invitation request.",
                );
                return json(res, 201, auth.acceptInvite(input, res));
            }
            if (req.method === "POST" && path === "/chat/auth/mfa") {
                auth.require(req, true, true);
                const input = await body(req, ["code"], "Invalid MFA request.");
                return json(res, 200, auth.finishMfa(req, input));
            }
            if (req.method === "POST" && path === "/chat/auth/password-reset") {
                if (!auth.identityStore)
                    throw Object.assign(new Error("Local identity is not enabled."), { status: 503 });
                const input = await body(req, ["token", "password"], "Invalid password reset request.");
                auth.identityStore.resetPassword(input.token, input.password);
                return json(res, 200, { success: true });
            }
            if (req.method === "POST" && path === "/chat/auth/account-recovery") {
                const input = await body(req, ["token", "password"], "Invalid account recovery request.");
                return json(res, 200, auth.completeAccountRecovery(input, res));
            }
            if (req.method === "GET" && path === "/chat/auth/login") return await auth.login(req, res);
            if (req.method === "GET" && path === "/chat/auth/callback") return await auth.callback(req, res);
            const mutation = req.method !== "GET";
            const session = auth.require(req, mutation);
            const identity = session.identity;
            if (req.method === "POST" && path === "/chat/auth/logout") {
                for (const [key, turn] of active)
                    if (key.startsWith(store.owner(identity) + ":")) turn.controller.abort();
                provider.cancelLogin?.(identity);
                auth.logout(req, res);
                return json(res, 200, { success: true });
            }
            if (path.startsWith("/chat/api/identity/")) {
                const store = auth.identityStore;
                if (!store) throw Object.assign(new Error("Local identity is not enabled."), { status: 503 });
                const actor = session.user?.id;
                if (!actor)
                    throw Object.assign(new Error("A native administrator account is required."), { status: 403 });
                if (req.method === "GET" && path === "/chat/api/identity/users")
                    return json(res, 200, store.listUsers(actor));
                if (req.method === "GET" && path === "/chat/api/identity/audit")
                    return json(res, 200, store.listUsers(actor).audit);
                if (req.method === "POST" && path === "/chat/api/identity/invitations") {
                    const input = await body(req, ["email", "roles", "expiresSeconds"], "Invalid invitation request.");
                    return json(res, 201, store.invite(actor, input.email, input.roles, input.expiresSeconds));
                }
                const userRoute = path.match(
                    /^\/chat\/api\/identity\/users\/([a-f0-9-]{36})\/(roles|disable|reset|sessions)$/,
                );
                if (userRoute) {
                    const [, userId, action] = userRoute;
                    if (action === "roles" && req.method === "PUT") {
                        const input = await body(req, ["roles"], "Invalid role assignment.");
                        return json(res, 200, { user: store.setRoles(actor, userId, input.roles) });
                    }
                    if (action === "disable" && req.method === "POST")
                        return json(res, 200, { user: store.disableUser(actor, userId) });
                    if (action === "reset" && req.method === "POST")
                        return json(res, 201, store.inviteReset(actor, userId));
                    if (action === "sessions" && req.method === "DELETE")
                        return json(res, 200, { success: store.revokeUserSessions(actor, userId) });
                }
                if (req.method === "POST" && path === "/chat/api/identity/service-accounts") {
                    const input = await body(req, ["name", "scopes"], "Invalid service account request.");
                    return json(res, 201, store.issueServiceAccount(actor, input.name, input.scopes));
                }
                const recoveryRoute = path.match(/^\/chat\/api\/identity\/users\/([a-f0-9-]{36})\/recovery$/);
                if (recoveryRoute && req.method === "POST")
                    return json(res, 201, store.issueAccountRecovery(actor, recoveryRoute[1]));
                const serviceRoute = path.match(/^\/chat\/api\/identity\/service-accounts\/([a-f0-9-]{36})$/);
                if (serviceRoute && req.method === "DELETE")
                    return json(res, 200, { success: store.revokeServiceAccount(actor, serviceRoute[1]) });
                throw Object.assign(new Error("Not found."), { status: 404 });
            }
            if (path === "/chat/api/reviews" || path.startsWith("/chat/api/reviews/")) {
                if (!config.reviewEnabled)
                    throw Object.assign(new Error("Model review is not configured."), { status: 503 });
                const url = new URL(req.url, config.origin);
                const suffix = path.slice("/chat/api/reviews".length);
                if (req.method === "GET" && suffix === "") {
                    const project = url.searchParams.get("project"),
                        offset = url.searchParams.get("offset") || "0";
                    if (
                        !project ||
                        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(project) ||
                        [...url.searchParams.keys()].some((key) => !["project", "offset"].includes(key)) ||
                        url.searchParams.getAll("project").length !== 1 ||
                        url.searchParams.getAll("offset").length > 1 ||
                        !/^\d{1,5}$/.test(offset) ||
                        Number(offset) > 10000
                    )
                        throw Object.assign(new Error("Choose a project."), { status: 400 });
                    return json(
                        res,
                        200,
                        await reviews.request(
                            session,
                            "GET",
                            "/api/v1/reviews?project=" + encodeURIComponent(project) + "&offset=" + Number(offset),
                        ),
                    );
                }
                if (/^\/[a-f0-9]{64}$/.test(suffix) && req.method === "GET" && !url.search)
                    return json(res, 200, await reviews.request(session, "GET", "/api/v1/reviews" + suffix));
                if (/^\/[a-f0-9]{64}\/transitions$/.test(suffix) && req.method === "POST" && !url.search) {
                    const input = await body(req);
                    if (
                        !input ||
                        typeof input !== "object" ||
                        Array.isArray(input) ||
                        Object.keys(input).some(
                            (key) => !["state", "expectedSequence", "comment", "validationDigest"].includes(key),
                        ) ||
                        typeof input.state !== "string" ||
                        !Number.isSafeInteger(input.expectedSequence) ||
                        input.expectedSequence < 1 ||
                        typeof input.comment !== "string" ||
                        !input.comment.trim() ||
                        input.comment.length > 4000
                    )
                        throw Object.assign(new Error("Review the decision and enter a comment."), { status: 400 });
                    return json(res, 200, await reviews.request(session, "POST", "/api/v1/reviews" + suffix, input));
                }
                throw Object.assign(new Error("Not found"), { status: 404 });
            }
            if (path.startsWith("/chat/api/models/")) {
                if (req.method !== "GET")
                    throw Object.assign(new Error("Model browsing is read-only."), { status: 403 });
                const count = modelReads.get(identity) || 0;
                if (count >= 2 || [...modelReads.values()].reduce((a, b) => a + b, 0) >= 16)
                    throw Object.assign(new Error("Repository requests are busy. Please retry shortly."), {
                        status: 429,
                    });
                modelReads.set(identity, count + 1);
                const controller = new AbortController();
                const deadline = setTimeout(() => controller.abort(), 20000);
                const client = mcpFactory(controller.signal);
                try {
                    return json(res, 200, await readModels(client, req.url));
                } finally {
                    clearTimeout(deadline);
                    await client.close?.();
                    const remaining = (modelReads.get(identity) || 1) - 1;
                    if (remaining) modelReads.set(identity, remaining);
                    else modelReads.delete(identity);
                }
            }
            if (!config.enabled)
                throw Object.assign(new Error("Browser chat is not configured on this deployment."), { status: 503 });
            if (path === "/chat/api/providers" && req.method === "GET")
                return json(res, 200, { providers: provider.status(identity) });
            const connection = path.match(/^\/chat\/api\/providers\/(codex|claude)$/);
            if (connection) {
                const name = connection[1];
                if (req.method === "DELETE") {
                    for (const [key, turn] of active)
                        if (key.startsWith(store.owner(identity) + ":") && turn.provider === name)
                            turn.controller.abort();
                    provider.disconnect(identity, name);
                    return json(res, 200, { success: true });
                }
                if (req.method === "POST" && name === "codex") {
                    await body(req, []);
                    return json(res, 200, await provider.startLogin(identity));
                }
                if (req.method === "POST" && name === "claude") {
                    const input = await body(req, ["apiKey"]);
                    provider.connectClaude(identity, input.apiKey);
                    return json(res, 200, { success: true });
                }
                throw Object.assign(new Error("Not found"), { status: 404 });
            }
            if (path === "/chat/api/conversations") {
                if (req.method === "GET") return json(res, 200, { conversations: store.list(identity) });
                if (req.method === "POST") {
                    const input =
                        (req.headers["content-length"] && req.headers["content-length"] !== "0") ||
                        req.headers["transfer-encoding"]
                            ? await body(req, ["provider"])
                            : {};
                    const selected = input.provider || "codex";
                    if (!["codex", "claude"].includes(selected))
                        throw Object.assign(new Error("Choose a provider."), { status: 400 });
                    return json(res, 201, store.create(identity, selected));
                }
            }
            const route = path.match(/^\/chat\/api\/conversations\/([a-f0-9-]{36})(?:\/(messages|stop|approval))?$/);
            if (!route) throw Object.assign(new Error("Not found"), { status: 404 });
            const [, id, action] = route,
                conversation = store.get(identity, id),
                key = store.owner(identity) + ":" + id;
            if (!action && req.method === "GET") return json(res, 200, { ...conversation, running: active.has(key) });
            if (!action && req.method === "DELETE") {
                if (active.has(key))
                    throw Object.assign(new Error("Stop the response before deleting this chat."), { status: 409 });
                store.delete(identity, id);
                return json(res, 200, { success: true });
            }
            if (action === "stop" && req.method === "POST") {
                active.get(key)?.controller.abort();
                return json(res, 200, { success: true });
            }
            if (action === "approval" && req.method === "POST") {
                const input = await body(req),
                    turn = active.get(key);
                if (!turn?.approval || turn.approval.id !== input.id || typeof input.approved !== "boolean")
                    throw Object.assign(new Error("This request is no longer awaiting confirmation."), { status: 409 });
                turn.approval.resolve(input.approved);
                turn.approval = null;
                return json(res, 200, { success: true });
            }
            if (action !== "messages" || req.method !== "POST")
                throw Object.assign(new Error("Not found"), { status: 404 });
            const input = await body(req);
            if (
                typeof input.content !== "string" ||
                !input.content.trim() ||
                input.content.length > 8000 ||
                Object.keys(input).some((k) => k !== "content")
            )
                throw Object.assign(new Error("Enter a message of up to 8,000 characters."), { status: 400 });
            provider.assertConnected?.(identity, conversation.provider || "codex");
            if (active.has(key)) throw Object.assign(new Error("A response is already running."), { status: 409 });
            if (active.size >= config.maxConcurrentTurns)
                throw Object.assign(new Error("The assistant is busy. Please try again shortly."), { status: 429 });
            if (conversation.messages.length >= 80)
                throw Object.assign(new Error("Start a new conversation to continue."), { status: 429 });
            const recent = (rate.get(identity) || []).filter((t) => Date.now() - t < 60000);
            if (recent.length >= 10)
                throw Object.assign(new Error("Please wait before sending another message."), { status: 429 });
            recent.push(Date.now());
            rate.set(identity, recent);
            for (const [user, times] of rate) if (Date.now() - times.at(-1) > 60000) rate.delete(user);
            conversation.messages.push({ role: "user", content: input.content.trim() });
            if (conversation.messages.length === 1) conversation.title = input.content.trim().slice(0, 70);
            store.save(identity, conversation);
            const controller = new AbortController(),
                turn = { controller, approval: null, provider: conversation.provider || "codex" };
            active.set(key, turn);
            const timeout = setTimeout(() => controller.abort(), config.turnTimeoutMs);
            timeout.unref();
            const disconnected = () => {
                if (!res.writableEnded) controller.abort();
            };
            res.on("close", disconnected);
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "X-Accel-Buffering": "no",
                Connection: "keep-alive",
            });
            res.flushHeaders();
            const emit = (event) => {
                if (!res.destroyed) res.write("data: " + JSON.stringify(event) + "\n\n");
            };
            const heartbeat = setInterval(() => {
                if (!res.destroyed) res.write(": keepalive\n\n");
            }, 15000);
            heartbeat.unref();
            let mcp;
            let content = "",
                toolCount = 0,
                toolActivity = [];
            try {
                emit({ type: "status", text: "Connecting to modelling tools…" });
                mcp = mcpFactory(controller.signal);
                const tools = await mcp.tools(),
                    names = new Set(tools.map((t) => t.name));
                const result = await provider.run({
                    identity,
                    provider: turn.provider,
                    messages: conversation.messages,
                    tools,
                    signal: controller.signal,
                    onEvent: (event) => {
                        if (event.type === "delta") content += event.text;
                        emit(event);
                    },
                    callTool: serialToolCalls(async (name, args) => {
                        if (!names.has(name) || ++toolCount > 16 || controller.signal.aborted)
                            throw new Error("Tool is unavailable");
                        const trace = { id: randomUUID(), name, status: "running" };
                        toolActivity.push(trace);
                        emit({ type: "tool", ...trace });
                        try {
                            if (WRITE_TOOLS.has(name)) {
                                const approved = await new Promise((resolve) => {
                                    const approvalId = randomUUID();
                                    let timer;
                                    const finish = (value) => {
                                        clearTimeout(timer);
                                        controller.signal.removeEventListener("abort", deny);
                                        resolve(value);
                                    };
                                    const deny = () => finish(false);
                                    timer = setTimeout(deny, 120000);
                                    timer.unref();
                                    controller.signal.addEventListener("abort", deny, { once: true });
                                    turn.approval = { id: approvalId, resolve: finish };
                                    emit({ type: "approval", id: approvalId, tool: name, arguments: args });
                                });
                                turn.approval = null;
                                if (!approved || controller.signal.aborted) throw new Error("Change was not confirmed");
                            }
                            const result = await mcp.call(name, args);
                            trace.status =
                                result?.isError || result?.structuredContent?.success === false
                                    ? "failed"
                                    : "completed";
                            emit({ type: "tool", ...trace });
                            return result;
                        } catch (error) {
                            trace.status = "failed";
                            emit({ type: "tool", ...trace });
                            throw error;
                        }
                    }),
                });
                if (!content) content = result || "No response was returned. Please try again.";
                conversation.messages.push({ role: "assistant", content, tools: toolActivity });
                store.save(identity, conversation);
                emit({ type: "done", conversationId: id });
            } catch {
                const stopped = controller.signal.aborted;
                const message = stopped
                    ? "Response stopped. You can send another message."
                    : "The assistant could not complete this response. Please retry.";
                conversation.messages.push({
                    role: "assistant",
                    content: content ? content + "\n\n" + message : message,
                    tools: toolActivity,
                    error: true,
                });
                store.save(identity, conversation);
                emit({ type: "error", message });
                console.error(
                    JSON.stringify({ event: "chat_turn_failed", code: stopped ? "STOPPED" : "PROVIDER_OR_TOOL_ERROR" }),
                );
            } finally {
                clearTimeout(timeout);
                clearInterval(heartbeat);
                await mcp?.close?.();
                active.delete(key);
                turn.approval?.resolve(false);
                res.off("close", disconnected);
                res.end();
            }
        } catch (error) {
            if (res.headersSent) {
                res.end();
                return;
            }
            if (typeof error.message === "string" && error.message.startsWith("IDENTITY_")) {
                error.status =
                    error.status ||
                    (/ADMIN_REQUIRED/.test(error.message)
                        ? 403
                        : /NOT_FOUND/.test(error.message)
                          ? 404
                          : /EXISTS|LAST_ADMIN|OWNER_ALREADY/.test(error.message)
                            ? 409
                            : /BUSY|CORRUPT|CHAIN_INVALID/.test(error.message)
                              ? 503
                              : /LOGIN_INVALID/.test(error.message)
                                ? 401
                                : 400);
                error.message = /LOGIN_INVALID|BOOTSTRAP_INVALID|INVITATION_INVALID|RESET_INVALID/.test(error.message)
                    ? "The sign-in or one-time link is invalid or expired."
                    : /ADMIN_REQUIRED/.test(error.message)
                      ? "Administrator permission is required."
                      : /LAST_ADMIN/.test(error.message)
                        ? "At least one active administrator must remain."
                        : "The identity request could not be completed.";
            }
            const status = [400, 401, 403, 404, 409, 413, 415, 421, 429, 503].includes(error.status)
                ? error.status
                : 500;
            json(res, status, {
                error: status === 500 ? "The service could not complete the request." : error.message,
            });
        }
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    server.maxHeadersCount = 40;
    server.on("close", () => {
        clearInterval(cleanup);
        provider.close?.();
        for (const turn of active.values()) turn.controller.abort();
    });
    return server;
}
