"use strict";
const $ = (id) => document.getElementById(id);
let session = null,
    current = null,
    running = false,
    controller = null;
let uploading = false,
    uploadQueue = [],
    sharedView = false,
    personalConnections = [];
const toolLabels = {
    attachment_read: "Read source file",
    personal_connections: "Personal connections",
    personal_ckm_search: "Search personal CKM",
    personal_ckm_get: "Retrieve personal CKM model",
    personal_repository_get: "Read personal repository",
    personal_repository_list: "Browse personal repository",
    personal_repository_save: "Save to personal repository",
    model_traceability_save: "Save requirements traceability",
    model_traceability_get: "Requirements and evidence graph",
    model_traceability_explain: "Explain model element",
    model_traceability_requirement: "Requirement coverage trail",
    governance_prepare: "Prepare model review",
    governance_validate: "Record validation evidence",
    governance_request_review: "Request human review",
    governance_reopen_draft: "Reopen draft",
    governance_get: "Model review and audit",
    governance_list: "Project reviews",
    ckm_sources: "CKM sources",
    ckm_federated_search: "Search configured CKMs",
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
    template_compile_project: "Compile and save OPT draft",
    model_project_create: "Create project",
    model_validate: "Structural checks",
    model_qa: "Document quality checks",
    model_project_qa: "Project model quality and evidence",
    terminology_binding_plan_save: "Save draft binding plan",
    terminology_binding_plan: "Plan terminology bindings",
    terminology_binding_plan_get: "Read binding plan",
    model_terminology_inspect: "Inspect model terminology",
    terminology_catalogue_save: "Save draft terminology",
    terminology_catalogue_search: "Project terminology search",
    terminology_catalogue_get: "Terminology record",
    terminology_catalogue_lookup: "Project code lookup",
    terminology_catalogue_validate: "Terminology validation",
    terminology_catalogue_expand: "Value set members",
    terminology_catalogue_translate: "Mapping candidates",
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
    const ready = !!session?.authenticated && session.enabled && !sharedView;
    const connected = session?.providers?.some((p) => p.id === $("chat-provider").value && p.connected);
    $("chat-provider").disabled =
        running || uploading || sharedView || !!current?.messages?.length || !!current?.attachments?.length;
    $("sign-out").disabled = uploading;
    document.querySelectorAll(".conversation-row button").forEach((button) => (button.disabled = running || uploading));
    $("message").disabled = !ready || running;
    $("send").disabled = !ready || !connected || running || uploading || !$("message").value.trim();
    $("new-chat").disabled = !ready || running || uploading;
    if (sharedView) $("new-chat").disabled = false;
    $("upload-files").disabled = !ready || running || uploading;
    $("attach-files").disabled = !ready || running || uploading;
    $("save-destination").disabled = !ready || running || uploading;
    $("share-chat").disabled = !ready || running || uploading || !current?.messages?.length;
    document.querySelectorAll(".attachment-remove").forEach((button) => (button.disabled = running || uploading));
    $("stop").hidden = !running;
    document
        .querySelectorAll(".suggestion")
        .forEach((button) => (button.disabled = !ready || !connected || running || uploading));
    $("composer-hint").textContent = running
        ? "Working with your modelling tools…"
        : ready
          ? connected
              ? "Enter to send · Shift + Enter for a new line"
              : "Connect your account in My AI connections"
          : "Sign in to begin";
}
async function loadSession() {
    session = await api("api/session");
    $("login-panel").hidden =
        !!session.authenticated || !(session.enabled || session.reviewEnabled || session.identityEnabled);
    $("sign-out").hidden = !session.authenticated;
    $("user-name").textContent = session.user?.name || "";
    renderProviders();
    controls();
    document.dispatchEvent(new CustomEvent("workspace:session", { detail: session }));
    if (!session.enabled && !session.reviewEnabled && !session.identityEnabled)
        notice("Browser chat is not configured on this deployment.");
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
        button.disabled = running || uploading;
        button.onclick = () => open(c.id).catch((e) => notice(e.message));
        const remove = document.createElement("button");
        remove.className = "delete-chat";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Delete " + c.title);
        remove.disabled = running || uploading;
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
    sharedView = false;
    uploadQueue = [];
    $("attachment-list").replaceChildren();
    $("conversation-file-list").replaceChildren();
    $("conversation-files").hidden = true;
    $("upload-status").textContent = "";
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
    title.textContent = message.role === "user" ? (sharedView ? "Participant" : "You") : "Modelling Assistant";
    const content = document.createElement("div");
    content.className = "message-content";
    format(content, message.content || "");
    const tools = document.createElement("div");
    tools.className = "tool-list";
    for (const tool of message.tools || []) toolChip(tools, tool);
    article.append(title, tools, content);
    if (message.attachments?.length && !sharedView) {
        const files = document.createElement("div");
        files.className = "attachment-list message-attachments";
        files.setAttribute("aria-label", "Attached files");
        for (const item of message.attachments) files.append(attachmentCard(item, false));
        article.insertBefore(files, content);
    }
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
    if (running || uploading) return;
    current = await api("api/conversations/" + id);
    sharedView = false;
    renderAttachments();
    renderDestinations();
    $("chat-provider").value = current.provider || "codex";
    controls();
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
    yes.textContent = ["model_review_request", "governance_request_review"].includes(event.tool)
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
    if (running || uploading || sharedView || !text.trim()) return;
    notice("");
    if (!session?.providers?.some((p) => p.id === $("chat-provider").value && p.connected)) {
        $("provider-settings").open = true;
        notice("Connect your provider account before sending a message.");
        return;
    }
    await ensureConversation();
    $("welcome").hidden = true;
    $("thread").hidden = false;
    $("message").value = "";
    const message = { role: "user", content: text, attachments: pendingAttachments() };
    current.messages.push(message);
    bubble(message);
    renderAttachments();
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
$("toggle-sidebar").onclick = () => {
    const expanded = $("sidebar").classList.toggle("open");
    $("toggle-sidebar").setAttribute("aria-expanded", String(expanded));
};
document
    .querySelectorAll(".suggestion")
    .forEach((button) => (button.onclick = () => send(button.dataset.prompt).catch((e) => notice(e.message))));
let providerPoll;
function renderProviders() {
    $("provider-bar").hidden = !session?.authenticated || !session.enabled;
    for (const provider of session?.providers || []) {
        $(provider.id + "-status").textContent = provider.connected
            ? "Connected"
            : provider.signingIn
              ? "Waiting for sign-in…"
              : "Not connected";
        $("connect-" + provider.id).disabled = provider.connected || provider.signingIn;
        $("disconnect-" + provider.id).hidden = !provider.connected && !provider.signingIn;
    }
    if (!session?.providers?.some((p) => p.signingIn)) {
        clearTimeout(providerPoll);
        $("codex-device").hidden = true;
    }
}
$("chat-provider").onchange = () => {
    if (!current?.messages?.length) current = null;
    controls();
};
$("connect-codex").onclick = async () => {
    $("connect-codex").disabled = true;
    try {
        const result = await api("api/providers/codex", { method: "POST", data: {} });
        await loadSession();
        $("codex-verification").href = result.verificationUrl;
        $("codex-code").textContent = result.userCode;
        $("codex-device").hidden = false;
        const poll = async () => {
            try {
                await loadSession();
                if (session.providers.some((p) => p.signingIn)) providerPoll = setTimeout(poll, 3000);
            } catch (error) {
                notice(error.message);
            }
        };
        providerPoll = setTimeout(poll, 3000);
    } catch (error) {
        notice(error.message);
        $("connect-codex").disabled = false;
    }
};
$("claude-connection").onsubmit = async (event) => {
    event.preventDefault();
    const apiKey = $("claude-key").value.trim();
    $("claude-key").value = "";
    try {
        await api("api/providers/claude", { method: "POST", data: { apiKey } });
        await loadSession();
    } catch (error) {
        notice(error.message);
    }
};
for (const name of ["codex", "claude"])
    $("disconnect-" + name).onclick = async () => {
        try {
            await api("api/providers/" + name, { method: "DELETE" });
            await loadSession();
        } catch (error) {
            notice(error.message);
        }
    };
loadSession()
    .then(async () => {
        if (session.authenticated && session.enabled) {
            await loadConnections();
            await list();
            if (!location.hash.startsWith("#share=") && sessionStorage.getItem("pending-share"))
                location.hash = sessionStorage.getItem("pending-share");
            sessionStorage.removeItem("pending-share");
            if (location.hash.startsWith("#share=")) await showShared();
        } else if (location.hash.startsWith("#share=")) {
            sessionStorage.setItem("pending-share", location.hash);
        }
    })
    .catch(() => notice("The chat service is currently unavailable. Please try again shortly."));

document.addEventListener("workspace:discuss", (event) => {
    $("message").value = event.detail.prompt;
    controls();
    $("message").focus();
});

async function ensureConversation() {
    if (!current) {
        const repository = $("save-destination").value;
        current = await api("api/conversations", { method: "POST", data: { provider: $("chat-provider").value } });
        if (repository)
            current = await api("api/conversations/" + current.id + "/settings", {
                method: "PUT",
                data: { repository },
            });
    }
    return current;
}
function renderDestinations() {
    const selected = current ? current.repository || "" : $("save-destination").value;
    $("save-destination").replaceChildren(new Option("Enterprise repository", ""));
    for (const connection of personalConnections.filter((c) => c.kind !== "ckm"))
        $("save-destination").add(new Option(connection.label + " · " + connection.branch, connection.id));
    if (selected && !personalConnections.some((c) => c.id === selected))
        $("save-destination").add(new Option("Saved personal repository (load My sources to view)", selected));
    $("save-destination").value = selected || "";
}
async function loadConnections() {
    const data = await api("api/connections");
    if (data.enterpriseUnavailable)
        notice(
            "Enterprise CKMs could not be listed. Personal repositories remain available; retry before adding a CKM.",
        );
    personalConnections = data.personal;
    $("connection-list").replaceChildren();
    for (const item of [...data.enterprise, ...data.personal]) {
        const row = document.createElement("div"),
            text = document.createElement("span");
        row.setAttribute("role", "listitem");
        text.textContent =
            item.label +
            " · " +
            (item.scope === "enterprise" ? "Enterprise" : "Personal") +
            " · " +
            item.url +
            (item.branch ? " · " + item.branch : "");
        row.append(text);
        if (item.scope !== "enterprise") {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove " + item.label;
            remove.onclick = async () => {
                try {
                    await api("api/connections/" + item.id, { method: "DELETE" });
                    await loadConnections();
                } catch (e) {
                    notice(e.message);
                }
            };
            row.append(remove);
        }
        $("connection-list").append(row);
    }
    renderDestinations();
}
$("personal-settings").ontoggle = () => {
    if ($("personal-settings").open) loadConnections().catch((e) => notice(e.message));
};
$("connection-kind").onchange = () => {
    const isCkm = $("connection-kind").value === "ckm";
    $("repository-fields").hidden = isCkm;
    $("connection-url").placeholder = isCkm
        ? "https://models.example.org/ckm/rest/"
        : "https://github.com/owner/models";
};
$("personal-connection").onsubmit = async (event) => {
    event.preventDefault();
    const data = {
        kind: $("connection-kind").value,
        label: $("connection-label").value,
        url: $("connection-url").value,
        ...($("connection-token").value ? { token: $("connection-token").value } : {}),
    };
    if (data.kind !== "ckm") data.branch = $("connection-branch").value;
    $("connection-token").value = "";
    try {
        const result = await api("api/connections", { method: "POST", data });
        await loadConnections();
        notice(
            result.duplicate
                ? "This connection is already available. No duplicate was added."
                : "Personal connection added.",
        );
    } catch (e) {
        notice(e.message);
    }
};
$("save-destination").onchange = async () => {
    if (!current) return;
    try {
        current = await api("api/conversations/" + current.id + "/settings", {
            method: "PUT",
            data: { repository: $("save-destination").value || null },
        });
    } catch (e) {
        $("save-destination").value = current.repository || "";
        notice(e.message);
    }
};
function pendingAttachments() {
    const sent = new Set(
        (current?.messages || []).flatMap((message) => (message.attachments || []).map((item) => item.id)),
    );
    return (current?.attachments || []).filter((item) => !sent.has(item.id));
}
function fileSize(size) {
    return size >= 1024 * 1024
        ? (size / (1024 * 1024)).toFixed(1) + " MiB"
        : Math.max(1, Math.ceil(size / 1024)) + " KiB";
}
function attachmentCard(item, removable = true, queued = false) {
    const card = document.createElement("div");
    card.className = "attachment-card";
    card.dataset.status = item.status;
    const available = queued || current?.attachments?.some((file) => file.id === item.id);
    const url = available && !queued ? "/chat/api/conversations/" + current.id + "/attachments/" + item.id : null;
    if (item.image && url) {
        const preview = document.createElement("button"),
            image = document.createElement("img");
        preview.type = "button";
        preview.className = "attachment-thumbnail";
        preview.setAttribute("aria-label", "Preview " + item.name);
        image.src = url + "/preview";
        image.alt = "";
        image.loading = "lazy";
        preview.append(image);
        preview.onclick = () => {
            $("attachment-preview-title").textContent = item.name;
            $("attachment-preview-image").src = image.src;
            $("attachment-preview-image").alt = "Preview of " + item.name;
            $("attachment-preview-note").textContent = item.note;
            $("attachment-preview-download").href = url;
            $("attachment-preview-download").download = item.name;
            $("attachment-preview").showModal();
        };
        card.append(preview);
    } else {
        const icon = document.createElement("span");
        icon.className = "attachment-file-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML =
            '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';
        card.append(icon);
    }
    const description = document.createElement("div"),
        name = document.createElement(url ? "a" : "span"),
        info = document.createElement("span");
    description.className = "attachment-description";
    name.className = "attachment-name";
    name.textContent = item.name;
    name.title = item.name;
    if (url) {
        name.href = url;
        name.download = item.name;
    }
    const statuses = {
        ready: "Text ready",
        image: "Image ready",
        partial: "Partly read",
        no_text: "No text found",
        unsupported: "Original only",
        failed: "Needs attention",
        uploading: "Uploading…",
        queued: "Waiting…",
    };
    info.className = "attachment-status";
    info.textContent =
        fileSize(item.size) + " · " + (available ? statuses[item.status] || item.status : "Removed from chat");
    description.append(name, info);
    if (item.note && !["ready", "image"].includes(item.status)) {
        const note = document.createElement("span");
        note.className = "attachment-note";
        note.textContent = item.note;
        description.append(note);
    }
    card.title = item.note || item.name;
    card.append(description);
    if (removable) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "attachment-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Remove " + item.name);
        remove.disabled = running || uploading;
        remove.onclick = async () => {
            try {
                if (queued) uploadQueue = uploadQueue.filter((entry) => entry !== item);
                else {
                    const result = await api("api/conversations/" + current.id + "/attachments/" + item.id, {
                        method: "DELETE",
                    });
                    current.attachments = result.attachments;
                    renderThread();
                }
                renderAttachments();
            } catch (error) {
                notice(error.message);
            }
        };
        card.append(remove);
    }
    return card;
}
function renderThread() {
    $("thread").replaceChildren();
    for (const message of current?.messages || []) bubble(message);
}
function renderAttachments() {
    $("attachment-list").replaceChildren();
    const pending = pendingAttachments();
    for (const item of pending) $("attachment-list").append(attachmentCard(item));
    for (const item of uploadQueue) $("attachment-list").append(attachmentCard(item, true, true));
    const sent = (current?.attachments || []).filter((item) => !pending.includes(item));
    $("conversation-files").hidden = !sent.length || sharedView;
    $("conversation-files-title").textContent = "Files in this chat (" + sent.length + ")";
    $("conversation-file-list").replaceChildren();
    for (const item of sent) $("conversation-file-list").append(attachmentCard(item));
}
async function uploadFiles(files) {
    if (!files.length || running || uploading || sharedView || !session?.authenticated || !session.enabled) return;
    uploading = true;
    uploadQueue = files.map((file) => ({ file, name: file.name, size: file.size, status: "queued" }));
    controls();
    renderAttachments();
    let added = 0;
    try {
        await ensureConversation();
        for (const entry of [...uploadQueue]) {
            entry.status = "uploading";
            $("upload-status").textContent = "Adding " + entry.name + "… You can keep writing your message.";
            renderAttachments();
            try {
                if (entry.size > 10 * 1024 * 1024) throw new Error("This file exceeds the 10 MiB limit.");
                if (!entry.size) throw new Error("This file is empty.");
                const existing = current.attachments || [];
                if (
                    existing.length >= 10 ||
                    existing.reduce((sum, item) => sum + item.size, 0) + entry.size > 30 * 1024 * 1024
                )
                    throw new Error("A chat supports 10 files and 30 MiB in total. Remove a file or start a new chat.");
                const response = await fetch("/chat/api/conversations/" + current.id + "/attachments", {
                    method: "POST",
                    headers: {
                        "X-CSRF-Token": session.csrf,
                        "X-File-Name": encodeURIComponent(entry.name),
                        "Content-Type": "application/octet-stream",
                    },
                    body: entry.file,
                });
                const item = await response.json();
                if (!response.ok) throw new Error(item.error || "File upload failed.");
                current.attachments = [...existing, item];
                uploadQueue = uploadQueue.filter((item) => item !== entry);
                added++;
            } catch (error) {
                entry.status = "failed";
                entry.note = error.message;
                delete entry.file;
            }
            renderAttachments();
        }
        $("upload-status").textContent =
            added +
            (added === 1 ? " file added." : " files added.") +
            (uploadQueue.length ? " Some files need attention." : " Ready to send with your instructions.");
        await list();
    } catch (error) {
        uploadQueue = uploadQueue.map(({ file, ...item }) => ({ ...item, status: "failed", note: error.message }));
        $("upload-status").textContent = "Files could not be added. Check the message on each card.";
    } finally {
        uploading = false;
        controls();
        renderAttachments();
    }
}
$("attach-files").onclick = () => $("upload-files").click();
$("upload-files").onchange = () => {
    const files = Array.from($("upload-files").files);
    $("upload-files").value = "";
    uploadFiles(files);
};
$("close-attachment-preview").onclick = () => $("attachment-preview").close();
$("attachment-preview").addEventListener("close", () => $("attachment-preview-image").removeAttribute("src"));
let dragDepth = 0;
const composer = $("chat-form");
const fileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
composer.addEventListener("dragenter", (event) => {
    if (fileDrag(event)) {
        event.preventDefault();
        dragDepth++;
        composer.classList.add("drag-over");
    }
});
composer.addEventListener("dragover", (event) => {
    if (fileDrag(event)) event.preventDefault();
});
composer.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
        dragDepth = 0;
        composer.classList.remove("drag-over");
    }
});
composer.addEventListener("drop", (event) => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    composer.classList.remove("drag-over");
    uploadFiles(Array.from(event.dataTransfer.files));
});
$("message").addEventListener("paste", (event) => {
    const images = Array.from(event.clipboardData?.files || []).filter((file) =>
        ["image/png", "image/jpeg"].includes(file.type),
    );
    if (images.length) {
        event.preventDefault();
        uploadFiles(images);
    }
});
$("share-chat").onclick = () => {
    $("share-url").value = "";
    $("share-status").textContent = current.share
        ? "An existing link expires on " +
          new Date(current.share.expiresAt).toLocaleString() +
          ". Creating another link revokes it."
        : "No active link.";
    $("revoke-share").disabled = !current.share;
    $("share-dialog").showModal();
};
$("close-share").onclick = () => $("share-dialog").close();
$("create-share").onclick = async () => {
    try {
        const result = await api("api/conversations/" + current.id + "/share", { method: "POST", data: {} });
        $("share-url").value = location.origin + "/chat/#share=" + result.token;
        $("share-status").textContent =
            "Snapshot created. Copy the link above. It expires on " + new Date(result.expiresAt).toLocaleString() + ".";
        current.share = result;
        $("revoke-share").disabled = false;
        $("share-url").select();
    } catch (e) {
        $("share-status").textContent = e.message;
    }
};
$("revoke-share").onclick = async () => {
    try {
        await api("api/conversations/" + current.id + "/share", { method: "DELETE" });
        delete current.share;
        $("share-url").value = "";
        $("share-status").textContent = "Link revoked.";
        $("revoke-share").disabled = true;
    } catch (e) {
        $("share-status").textContent = e.message;
    }
};
async function showShared() {
    if (running || uploading || !session?.authenticated || !location.hash.startsWith("#share=")) return;
    try {
        const snapshot = await api("api/shares/" + encodeURIComponent(location.hash.slice(7)));
        reset();
        sharedView = true;
        $("welcome").hidden = true;
        $("thread").hidden = false;
        for (const message of snapshot.messages) bubble(message);
        notice("Shared snapshot: " + snapshot.title + ". Read-only; later messages and original files are not shared.");
        controls();
    } catch (e) {
        notice(e.message);
    }
}
window.addEventListener("hashchange", () => showShared());
