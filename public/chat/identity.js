"use strict";
const $ = (id) => document.getElementById(id);
const roles = [
    ["modelling-administrator", "Administrator"],
    ["modelling-modeller", "Modeller"],
    ["modelling-reviewer", "Reviewer"],
    ["modelling-approver", "Approver"],
    ["modelling-publisher", "Publisher"],
];
let session = null;
const query = new URLSearchParams(location.hash.slice(1));
function notice(message, admin = false) {
    const target = $(admin ? "identity-admin-notice" : "identity-auth-notice");
    if (target) target.textContent = message || "";
}
async function post(path, data) {
    const response = await fetch("/chat/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.csrf ? { "X-CSRF-Token": session.csrf } : {}) },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
}
async function adminRequest(path, method = "GET", data = undefined) {
    const response = await fetch("/chat/api/identity/" + path, {
        method,
        headers: method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": session?.csrf || "" },
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (response.status === 401) document.dispatchEvent(new Event("workspace:session-expired"));
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
}
function showOnly(formId) {
    for (const id of [
        "local-login",
        "owner-bootstrap",
        "invite-accept",
        "password-reset",
        "account-recovery",
        "mfa-enrollment",
        "recovery-codes",
    ])
        $(id).hidden = id !== formId;
}
function setupMfa(result) {
    authCsrf(result.csrf);
    $("otp-auth-link").href = result.otpAuthUrl;
    $("totp-secret").textContent = result.totpSecret;
    showOnly("mfa-enrollment");
    notice("Keep the setup page private while you enroll your authenticator.");
}
function authCsrf(value) {
    session = { ...(session || {}), csrf: value };
}
function clearTokenFromUrl() {
    history.replaceState(null, "", location.pathname + location.hash);
}
function field(label, type, value = "") {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.readOnly = type === "text";
    wrapper.append(input);
    return { wrapper, input };
}
function button(label, action, className = "secondary-button") {
    const control = document.createElement("button");
    control.type = "button";
    control.className = className;
    control.textContent = label;
    control.onclick = action;
    return control;
}
function linkResult(token, kind) {
    const url = new URL("/chat/", location.origin);
    url.hash = kind + "=" + encodeURIComponent(token);
    revealOneTimeValue(url.href, "One-time link");
}
function revealOneTimeValue(value, label) {
    document.querySelector("label[for='identity-link']").textContent = label;
    $("identity-link").value = value;
    $("identity-link-result").hidden = false;
}
async function loadAdmin() {
    try {
        const data = await adminRequest("users");
        renderUsers(data.users);
        renderServices(data.serviceAccounts || []);
        renderAudit(data.audit?.events || []);
    } catch (error) {
        notice(error.message, true);
    }
}
function renderUsers(users) {
    const root = $("identity-users");
    root.replaceChildren();
    for (const user of users) {
        const row = document.createElement("article");
        row.className = "identity-user";
        const heading = document.createElement("div");
        heading.className = "identity-user-heading";
        const title = document.createElement("strong");
        title.textContent = user.displayName + " · " + user.username;
        const state = document.createElement("span");
        state.textContent = user.status + (user.mfaEnabled ? " · MFA" : " · MFA setup pending");
        heading.append(title, state);
        const email = document.createElement("p");
        email.textContent = user.email || "No email address";
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = "Roles";
        fieldset.append(legend);
        const selectedRoles = new Set(user.roles);
        for (const [role, label] of roles) {
            const item = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = role;
            checkbox.checked = selectedRoles.has(role);
            item.append(checkbox, document.createTextNode(" " + label));
            fieldset.append(item);
        }
        const actions = document.createElement("div");
        actions.className = "identity-actions";
        actions.append(
            button("Save roles", async () => {
                try {
                    const selected = [...fieldset.querySelectorAll("input:checked")].map((input) => input.value);
                    await adminRequest("users/" + user.id + "/roles", "PUT", { roles: selected });
                    notice("Roles updated; affected sessions were revoked.", true);
                    await loadAdmin();
                } catch (error) {
                    notice(error.message, true);
                }
            }),
        );
        actions.append(
            button("Reset password", async () => {
                try {
                    const result = await adminRequest("users/" + user.id + "/reset", "POST", {});
                    linkResult(result.token, "reset");
                    notice(
                        "Password reset link created. Deliver it through your approved channel; email was not sent.",
                        true,
                    );
                } catch (error) {
                    notice(error.message, true);
                }
            }),
        );
        actions.append(
            button("Recover account", async () => {
                try {
                    const result = await adminRequest("users/" + user.id + "/recovery", "POST", {});
                    linkResult(result.token, "recovery");
                    notice(
                        "Account recovery link created. It resets MFA and requires new enrollment; deliver it through your approved channel.",
                        true,
                    );
                } catch (error) {
                    notice(error.message, true);
                }
            }),
        );
        actions.append(
            button("Revoke sessions", async () => {
                try {
                    await adminRequest("users/" + user.id + "/sessions", "DELETE");
                    notice("Sessions revoked.", true);
                } catch (error) {
                    notice(error.message, true);
                }
            }),
        );
        if (user.status === "active")
            actions.append(
                button("Disable user", async () => {
                    try {
                        await adminRequest("users/" + user.id + "/disable", "POST", {});
                        notice("User disabled and sessions revoked.", true);
                        await loadAdmin();
                    } catch (error) {
                        notice(error.message, true);
                    }
                }),
            );
        row.append(heading, email, fieldset, actions);
        root.append(row);
    }
}
function renderServices(accounts) {
    const root = $("identity-services");
    root.replaceChildren();
    for (const account of accounts) {
        const row = document.createElement("div");
        row.className = "identity-service";
        const summary = document.createElement("span");
        summary.textContent =
            account.name + " · " + account.scopes.join(", ") + (account.revoked ? " · revoked" : " · active");
        row.append(summary);
        if (!account.revoked)
            row.append(
                button("Revoke", async () => {
                    try {
                        await adminRequest("service-accounts/" + account.id, "DELETE");
                        await loadAdmin();
                        notice("Service credential revoked.", true);
                    } catch (error) {
                        notice(error.message, true);
                    }
                }),
            );
        root.append(row);
    }
    if (!accounts.length) root.textContent = "No service credentials.";
}
function renderAudit(events) {
    const root = $("identity-audit");
    root.replaceChildren();
    for (const event of [...events].reverse()) {
        const row = document.createElement("li");
        row.textContent = `${event.timestamp} · ${event.action} · ${JSON.stringify(event.details)}`;
        root.append(row);
    }
}
function update(value) {
    session = value;
    const identityEnabled = value.identityEnabled;
    const admin = value.authenticated && identityEnabled && value.user?.roles?.includes("modelling-administrator");
    $("tab-accounts").hidden = !admin;
    $("oidc-login").hidden = identityEnabled && !value.oidcEnabled;
    $("local-login").hidden = true;
    $("owner-bootstrap").hidden = true;
    $("invite-accept").hidden = true;
    $("password-reset").hidden = true;
    $("account-recovery").hidden = true;
    if (value.mfaSetupRequired) {
        $("login-panel").hidden = false;
        setupMfa(value);
        return;
    }
    if (value.authenticated) {
        $("login-panel").hidden = true;
        if (admin && document.body.dataset.section === "accounts") loadAdmin();
        return;
    }
    if (!identityEnabled) return;
    if (query.has("invite")) {
        $("login-panel").hidden = false;
        $("invite-accept").hidden = false;
    } else if (query.has("reset")) {
        $("login-panel").hidden = false;
        $("password-reset").hidden = false;
    } else if (query.has("recovery")) {
        $("login-panel").hidden = false;
        $("account-recovery").hidden = false;
    } else if (value.identitySetupRequired) {
        $("login-panel").hidden = false;
        $("owner-bootstrap").hidden = false;
    } else {
        $("login-panel").hidden = false;
        $("local-login").hidden = false;
    }
}
$("local-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = $("local-code").value.trim();
    try {
        await post("auth/local", {
            username: $("local-username").value,
            password: $("local-password").value,
            ...(code ? (/^\d{6}$/.test(code) ? { otp: code } : { recoveryCode: code }) : {}),
        });
        location.reload();
    } catch (error) {
        notice(error.message);
    }
});
$("owner-bootstrap").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const result = await post("auth/bootstrap", {
            token: $("bootstrap-token").value,
            username: $("bootstrap-username").value,
            displayName: $("bootstrap-name").value,
            password: $("bootstrap-password").value,
        });
        setupMfa(result);
    } catch (error) {
        notice(error.message);
    }
});
$("invite-accept").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const result = await post("auth/invitations/accept", {
            token: query.get("invite"),
            username: $("invite-username").value,
            displayName: $("invite-name").value,
            password: $("invite-password").value,
        });
        clearTokenFromUrl();
        setupMfa(result);
    } catch (error) {
        notice(error.message);
    }
});
$("password-reset").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await post("auth/password-reset", { token: query.get("reset"), password: $("reset-password").value });
        clearTokenFromUrl();
        notice("Password reset. Sign in with your new password and existing MFA.");
        $("password-reset").hidden = true;
        $("local-login").hidden = false;
    } catch (error) {
        notice(error.message);
    }
});
$("account-recovery").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const result = await post("auth/account-recovery", {
            token: query.get("recovery"),
            password: $("recovery-password").value,
        });
        clearTokenFromUrl();
        setupMfa(result);
    } catch (error) {
        notice(error.message);
    }
});
$("mfa-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const result = await post("auth/mfa", { code: $("mfa-code").value });
        authCsrf(result.csrf);
        $("recovery-code-list").textContent = result.recoveryCodes.join("\n");
        showOnly("recovery-codes");
        notice("Multi-factor authentication is active.");
    } catch (error) {
        notice(error.message);
    }
});
$("finish-recovery-codes").onclick = () => location.reload();
$("invite-user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const selected = [...document.querySelectorAll("input[name='invite-role']:checked")].map(
            (input) => input.value,
        );
        const result = await adminRequest("invitations", "POST", { email: $("new-user-email").value, roles: selected });
        linkResult(result.token, "invite");
        $("new-user-email").value = "";
        notice("Invitation link created. Deliver it through your approved channel; email was not sent.", true);
        await loadAdmin();
    } catch (error) {
        notice(error.message, true);
    }
});
$("service-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const scopes = [...document.querySelectorAll("input[name='service-scope']:checked")].map(
            (input) => input.value,
        );
        const result = await adminRequest("service-accounts", "POST", {
            name: $("service-account-name").value,
            scopes,
        });
        $("service-account-name").value = "";
        const token = result.token;
        revealOneTimeValue(token, "One-time service credential");
        notice(
            "Credential created. Copy it now; it will not be shown again. Service credentials cannot approve reviews.",
            true,
        );
        await loadAdmin();
    } catch (error) {
        notice(error.message, true);
    }
});
$("copy-identity-link").onclick = () =>
    navigator.clipboard
        .writeText($("identity-link").value)
        .then(() => notice("Copied.", true))
        .catch(() => notice("Copy is unavailable in this browser.", true));
document.addEventListener("workspace:session", (event) => update(event.detail));
document.addEventListener("workspace:accounts", loadAdmin);
fetch("/chat/api/session")
    .then((response) => response.json())
    .then(update)
    .catch(() => {});
