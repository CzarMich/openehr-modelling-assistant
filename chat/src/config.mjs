import { resolve } from "node:path";

export function loadConfig(env = process.env) {
    const enabled = env.CHAT_ENABLED === "true";
    const publicUrl = new URL(env.CHAT_PUBLIC_URL || "http://localhost:8350");
    if (publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash)
        throw new Error("Invalid CHAT_PUBLIC_URL");
    if (
        publicUrl.protocol !== "https:" &&
        !(["localhost", "127.0.0.1"].includes(publicUrl.hostname) && publicUrl.protocol === "http:")
    )
        throw new Error("Chat requires HTTPS");
    const config = {
        enabled,
        port: Number(env.CHAT_PORT || 8350),
        origin: publicUrl.origin,
        secure: publicUrl.protocol === "https:",
        dataDir: resolve(env.CHAT_DATA_DIR || "/data/chat"),
        issuer: env.CHAT_OIDC_ISSUER || "",
        clientId: env.CHAT_OIDC_CLIENT_ID || "",
        clientSecret: env.CHAT_OIDC_CLIENT_SECRET || "",
        allowedGroups: (env.CHAT_ALLOWED_GROUPS || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        mcpUrl: env.CHAT_MCP_URL || "http://ingress:8343/mcp",
        mcpKey: env.CHAT_MCP_API_KEY || "",
        mcpKeyHeader: env.CHAT_MCP_API_KEY_HEADER || "X-API-Key",
        allowWrites: env.CHAT_ALLOW_WRITES === "true",
        model: env.CHAT_MODEL || "gpt-6-sol",
        codexBinary: env.CHAT_CODEX_BINARY || "codex",
        codexWorkDir: resolve(env.CHAT_CODEX_WORK_DIR || "/workspace"),
        turnTimeoutMs: Math.min(600, Math.max(30, Number(env.CHAT_TURN_TIMEOUT_SECONDS || 240))) * 1000,
        sessionSeconds: 3600,
        retentionDays: 30,
        maxConcurrentTurns: 3,
    };
    if (enabled && (!config.issuer.startsWith("https://") || !config.clientId || !config.clientSecret))
        throw new Error("Chat requires an OIDC client");
    const mcp = new URL(config.mcpUrl);
    if (!["http:", "https:"].includes(mcp.protocol) || mcp.username || mcp.password || mcp.search || mcp.hash)
        throw new Error("Invalid CHAT_MCP_URL");
    if (!Number.isInteger(config.port) || !Number.isFinite(config.turnTimeoutMs))
        throw new Error("Invalid chat limits");
    return Object.freeze(config);
}
