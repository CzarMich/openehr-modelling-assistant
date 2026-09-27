"use strict";
const $ = (id) => document.getElementById(id);
let session = null,
    current = null,
    running = false,
    controller = null;
const toolLabels = {
    ckm_sources: "CKM sources",
    ckm_archetype_search: "Archetype search",
    ckm_archetype_get: "Archetype retrieval",
    guide_get: "Modelling guide",
    guide_search: "Guide search",
    model_repository_info: "Repository details",
    model_repository_branches: "Repository branches",
    model_repository_diff: "Git revision comparison",
    model_branch_create: "Create branch",
    model_review_request: "Request draft review",
    model_review_get: "Review details",
    model_projects: "Model projects",
    model_project_get: "Project details",
    model_artifact_get: "Model artifact",
    model_artifact_save: "Save draft",
    model_project_create: "Create project",
    model_validate: "Structural checks",
    model_qa: "Quality preflight",
};
function notice(message) {
    $("notice").textContent = message || "";
    $("notice").hidden = !message;
}
async function api(path, { method = "GET", data } = {}) {
    const response = await fetch("/chat/" + path, {
        method,
        headers: method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": session?.csrf || "" },
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
        if (response.status === 401) await loadSession();
        throw new Error(result.error || "Request failed");
    }
    return result;
}
function controls() {
    const ready = !!session?.authenticated && session.enabled;
    $("message").disabled = !ready || running;
    $("send").disabled = !ready || running || !$("message").value.trim();
    $("new-chat").disabled = !ready || running;
    $("stop").hidden = !running;
    document.querySelectorAll(".suggestion").forEach((button) => (button.disabled = !ready || running));
    $("composer-hint").textContent = running
        ? "Working with your modelling tools…"
        : ready
          ? "Enter to send · Shift + Enter for a new line"
          : "Sign in to begin";
}
async function loadSession() {
    session = await api("api/session");
    $("login-panel").hidden = !!session.authenticated || !session.enabled;
    $("sign-out").hidden = !session.authenticated;
    $("user-name").textContent = session.user?.name || "";
    controls();
    if (!session.enabled) notice("Browser chat is not configured on this deployment.");
}
async function list() {
    const result = await api("api/conversations");
    $("conversations").replaceChildren();
    if (!result.conversations.length) {
        const p = document.createElement("p");
        p.className = "empty-list";
        p.textContent = "Your conversations will appear here.";
        $("conversations").append(p);
    }
    for (const c of result.conversations) {
        const row = document.createElement("div");
        row.className = "conversation-row" + (current?.id === c.id ? " selected" : "");
        const button = document.createElement("button");
        button.textContent = c.title;
        button.title = c.title;
        button.disabled = running;
        button.onclick = () => open(c.id).catch((e) => notice(e.message));
        const remove = document.createElement("button");
        remove.className = "delete-chat";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Delete " + c.title);
        remove.disabled = running;
        remove.onclick = async () => {
            if (!confirm("Delete this conversation and its messages?")) return;
            try {
                await api("api/conversations/" + c.id, { method: "DELETE" });
                if (current?.id === c.id) reset();
                await list();
            } catch (e) {
                notice(e.message);
            }
        };
        row.append(button, remove);
        $("conversations").append(row);
    }
}
function reset() {
    current = null;
    $("thread").replaceChildren();
    $("thread").hidden = true;
    $("welcome").hidden = false;
    $("activity").textContent = "";
    notice("");
    controls();
}
function format(container, text) {
    container.replaceChildren();
    const parts = text.split(/(```[\s\S]*?(?:```|$))/g);
    for (const part of parts) {
        if (part.startsWith("```")) {
            const pre = document.createElement("pre"),
                code = document.createElement("code");
            code.textContent = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
            pre.append(code);
            container.append(pre);
        } else {
            const span = document.createElement("span");
            const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
            let position = 0;
            for (const match of part.matchAll(pattern)) {
                span.append(document.createTextNode(part.slice(position, match.index)));
                const value = match[0];
                let element;
                if (value.startsWith("`")) {
                    element = document.createElement("code");
                    element.textContent = value.slice(1, -1);
                } else if (value.startsWith("**")) {
                    element = document.createElement("strong");
                    element.textContent = value.slice(2, -2);
                } else {
                    const link = value.match(/^\[(.*?)\]\((.*?)\)$/);
                    element = document.createElement("a");
                    element.textContent = link[1];
                    element.href = link[2];
                    element.target = "_blank";
                    element.rel = "noopener noreferrer";
                }
                span.append(element);
                position = match.index + value.length;
            }
            span.append(document.createTextNode(part.slice(position)));
            container.append(span);
        }
    }
}
function bubble(message) {
    const article = document.createElement("article");
    article.className = "message " + message.role;
    const title = document.createElement("div");
    title.className = "message-header";
    title.textContent = message.role === "user" ? "You" : "Modelling Assistant";
    const content = document.createElement("div");
    content.className = "message-content";
    format(content, message.content || "");
    const tools = document.createElement("div");
    tools.className = "tool-list";
    for (const tool of message.tools || []) toolChip(tools, tool);
    article.append(title, tools, content);
    if (message.role === "assistant") {
        const copy = document.createElement("button");
        copy.className = "copy-button";
        copy.textContent = "Copy response";
        copy.onclick = () =>
            navigator.clipboard
                .writeText(content.textContent)
                .then(() => {
                    copy.textContent = "Copied";
                })
                .catch(() => notice("Copy is unavailable in this browser."));
        article.append(copy);
    }
    $("thread").append(article);
    return { article, content, tools, text: message.content || "" };
}
function toolChip(container, tool) {
    let chip = Array.from(container.children).find((node) => node.dataset.id === tool.id);
    if (!chip) {
        chip = document.createElement("span");
        chip.className = "tool-chip";
        chip.dataset.id = tool.id;
        container.append(chip);
    }
    chip.dataset.status = tool.status;
    chip.textContent =
        (tool.status === "completed" ? "✓ " : tool.status === "failed" ? "! " : "◌ ") +
        (toolLabels[tool.name] || tool.name.replaceAll("_", " "));
}
async function open(id) {
    if (running) return;
    current = await api("api/conversations/" + id);
    $("welcome").hidden = true;
    $("thread").hidden = false;
    $("thread").replaceChildren();
    for (const m of current.messages) bubble(m);
    $("thread").scrollTop = $("thread").scrollHeight;
    $("sidebar").classList.remove("open");
    await list();
    if (current.running)
        notice("A response is running in another browser tab. Refresh this conversation when it finishes.");
    else notice("");
}
function approval(event, target) {
    const card = document.createElement("section");
    card.className = "approval";
    const h = document.createElement("h3");
    h.textContent = toolLabels[event.tool] || "Review this model change";
    const p = document.createElement("p");
    p.textContent =
        "Confirm the exact repository action below before it is executed. This does not approve a model for clinical use.";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(event.arguments, null, 2);
    const yes = document.createElement("button");
    yes.textContent =
        event.tool === "model_review_request"
            ? "Confirm review request"
            : event.tool === "model_branch_create"
              ? "Confirm branch creation"
              : "Confirm save";
    const no = document.createElement("button");
    no.className = "decline";
    no.textContent = "Cancel change";
    const decide = async (approved) => {
        yes.disabled = true;
        no.disabled = true;
        try {
            await api("api/conversations/" + current.id + "/approval", {
                method: "POST",
                data: { id: event.id, approved },
            });
            card.replaceChildren();
            const text = document.createElement("p");
            text.textContent = approved ? "Change confirmed. Applying the repository action…" : "Change cancelled.";
            card.append(text);
        } catch (e) {
            notice(e.message);
        }
    };
    yes.onclick = () => decide(true);
    no.onclick = () => decide(false);
    card.append(h, p, pre, yes, no);
    target.article.append(card);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function send(text) {
    if (running || !text.trim()) return;
    notice("");
    if (!current) current = await api("api/conversations", { method: "POST" });
    $("welcome").hidden = true;
    $("thread").hidden = false;
    $("message").value = "";
    bubble({ role: "user", content: text });
    const target = bubble({ role: "assistant", content: "" });
    $("thread").scrollTop = $("thread").scrollHeight;
    running = true;
    controls();
    await list();
    controller = new AbortController();
    try {
        const response = await fetch("/chat/api/conversations/" + current.id + "/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf },
            body: JSON.stringify({ content: text }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "The message could not be sent.");
        }
        const reader = response.body.getReader(),
            decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                for (const line of frame.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    const event = JSON.parse(line.slice(6));
                    if (event.type === "delta") {
                        const thread = $("thread");
                        const follow = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
                        target.text += event.text;
                        format(target.content, target.text);
                        if (follow) thread.scrollTop = thread.scrollHeight;
                    } else if (event.type === "status") $("activity").textContent = event.text;
                    else if (event.type === "tool") {
                        toolChip(target.tools, event);
                        $("activity").textContent =
                            event.status === "running"
                                ? "Using " + (toolLabels[event.name] || event.name.replaceAll("_", " ")) + "…"
                                : "Preparing the response…";
                    } else if (event.type === "approval") {
                        approval(event, target);
                        $("activity").textContent = "Waiting for your confirmation";
                    } else if (event.type === "error") {
                        notice(event.message);
                    } else if (event.type === "done") $("activity").textContent = "";
                }
            }
        }
    } catch (error) {
        if (error.name !== "AbortError") notice(error.message);
    } finally {
        running = false;
        controller = null;
        $("activity").textContent = "";
        controls();
        await open(current.id);
        $("message").focus();
    }
}
$("chat-form").onsubmit = (event) => {
    event.preventDefault();
    send($("message").value).catch((e) => notice(e.message));
};
$("message").oninput = controls;
$("message").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        $("chat-form").requestSubmit();
    }
};
$("new-chat").onclick = () => {
    reset();
    list().catch((e) => notice(e.message));
    $("message").focus();
};
$("stop").onclick = async () => {
    try {
        await api("api/conversations/" + current.id + "/stop", { method: "POST" });
    } catch (e) {
        notice(e.message);
    }
};
$("sign-out").onclick = async () => {
    try {
        if (running) await api("api/conversations/" + current.id + "/stop", { method: "POST" });
        await api("auth/logout", { method: "POST" });
        location.reload();
    } catch (e) {
        notice(e.message);
    }
};
$("toggle-sidebar").onclick = () => $("sidebar").classList.toggle("open");
document
    .querySelectorAll(".suggestion")
    .forEach((button) => (button.onclick = () => send(button.dataset.prompt).catch((e) => notice(e.message))));
loadSession()
    .then(() => {
        if (session.authenticated) return list();
    })
    .catch(() => notice("The chat service is currently unavailable. Please try again shortly."));
