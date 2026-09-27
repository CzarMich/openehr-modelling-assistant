// Run through stdin inside the configured chat container; this probe is not in the runtime image.
import { CodexProvider } from "/app/chat/src/codex.mjs";
import { McpClient } from "/app/chat/src/mcp.mjs";
import { loadConfig } from "/app/chat/src/config.mjs";
import { readFileSync } from "node:fs";

let peak = 0;
const before = readFileSync("/sys/fs/cgroup/pids.events", "utf8");
const timer = setInterval(() => {
    peak = Math.max(peak, Number(readFileSync("/sys/fs/cgroup/pids.current", "utf8")));
}, 100);
try {
    const results = await Promise.allSettled(
        [1, 2, 3].map(async () => {
            const config = loadConfig();
            const signal = AbortSignal.timeout(120000);
            const mcp = new McpClient(config, signal);
            const tools = (await mcp.tools()).filter((t) => t.name === "ckm_sources");
            let called = false;
            const text = await new CodexProvider(config).run({
                messages: [
                    { role: "user", content: "Call ckm_sources and list the configured sources in one sentence." },
                ],
                tools,
                signal,
                callTool: async (name, args) => {
                    const result = await mcp.call(name, args);
                    if (!result?.isError && result?.structuredContent?.success !== false) called = true;
                    return result;
                },
                onEvent: () => {},
            });
            if (!called || !text.trim()) throw new Error("Tool-backed response missing");
        }),
    );
    const after = readFileSync("/sys/fs/cgroup/pids.events", "utf8");
    const ok = results.every((r) => r.status === "fulfilled") && before === after;
    console.log(
        JSON.stringify({
            status: ok ? "PASS" : "FAIL",
            simultaneous_turns: 3,
            successful_turns: results.filter((r) => r.status === "fulfilled").length,
            peak_container_tasks: peak,
            container_task_limit: Number(readFileSync("/sys/fs/cgroup/pids.max", "utf8")),
            new_task_limit_denials: before !== after,
        }),
    );
    if (!ok) process.exitCode = 1;
} finally {
    clearInterval(timer);
}
