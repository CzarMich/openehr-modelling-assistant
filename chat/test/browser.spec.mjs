import { test, expect } from "@playwright/test";
let browserErrors;
test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
});

test("administrator accounts workspace is role-gated and usable on mobile", async ({ page }) => {
    await page.route("**/chat/api/session", async (route) =>
        route.fulfill({
            json: {
                enabled: false,
                authenticated: true,
                user: { id: "owner-id", name: "Workspace Owner", roles: ["modelling-administrator"] },
                csrf: "fixture-csrf",
                reviewEnabled: true,
                identityEnabled: true,
                identitySetupRequired: false,
                oidcEnabled: false,
            },
        }),
    );
    await page.route("**/chat/api/identity/users", async (route) =>
        route.fulfill({ json: { users: [], serviceAccounts: [], audit: { events: [] } } }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat/");
    await page.getByRole("tab", { name: "Accounts" }).click();
    await expect(page.getByRole("heading", { name: "Accounts and access" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite a user" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Service credential", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test.afterEach(async () => {
    expect(browserErrors).toEqual([]);
});
async function login(page) {
    await page.goto("/chat/");
    await page.getByRole("link", { name: "Sign in to start chatting" }).click();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}
async function send(page, message) {
    await page.getByRole("textbox", { name: "Message the modelling assistant" }).fill(message);
    const response = page.waitForResponse(
        (response) => response.request().method() === "POST" && response.url().endsWith("/messages"),
    );
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    expect((await response).status()).toBe(200);
}

test("sign in, tool-backed chat, code rendering, history and sign out", async ({ page }) => {
    await login(page);
    await send(page, "Which CKMs are configured?");
    await expect(page.locator(".message.assistant")).toContainText("Terminology binding is optional.");
    await expect(page.getByRole("button", { name: "Stop response", exact: true })).toBeHidden();
    await expect(page.locator(".tool-chip")).toContainText("CKM sources");
    await expect(page.locator(".message-content strong")).toHaveText("default");
    await expect(page.locator("pre code")).toContainText("<draft/>");
    await page.reload();
    await page
        .getByRole("navigation", { name: "Your conversations" })
        .getByRole("button", { name: "Which CKMs are configured?", exact: true })
        .click();
    await expect(page.locator(".message.assistant")).toContainText("default");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("link", { name: "Sign in to start chatting" })).toBeVisible();
    await expect(page.locator(".message")).toHaveCount(0);
});

test("model writes wait for an explicit browser confirmation", async ({ page }) => {
    await login(page);
    await send(page, "save");
    await expect(page.getByRole("heading", { name: "Save draft" })).toBeVisible();
    await expect(page.locator(".approval pre")).toContainText("revision-one");
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop response", exact: true })).toBeHidden();
    await expect(page.locator(".message.assistant")).toContainText("saved after your confirmation");
});

test("stopping a turn allows another message", async ({ page }) => {
    await login(page);
    await send(page, "wait");
    await expect(page.getByRole("button", { name: "Stop response", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop response", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop response", exact: true })).toBeHidden();
    await expect(page.locator(".message.assistant")).toContainText("Response stopped");
    await send(page, "Which sources?");
    await expect(page.locator(".message.assistant").last()).toContainText("default");
});

test("mobile layout and untrusted markup remain safe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await send(page, '<img src=x onerror="window.__executed=true"> [unsafe](javascript:alert(1))');
    await expect(page.getByRole("button", { name: "Stop response", exact: true })).toBeHidden();
    await expect(page.locator(".message.user")).toContainText("<img");
    expect(await page.evaluate(() => window.__executed)).toBeUndefined();
    await expect(page.locator(".message img")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Toggle conversations", exact: true }).click();
    await expect(page.locator("#new-chat")).toBeVisible();
});

test("hosted draft reviews require an explicit review confirmation", async ({ page }) => {
    await login(page);
    await send(page, "review");
    await expect(page.getByRole("button", { name: "Confirm review request", exact: true })).toBeVisible();
    await expect(page.locator(".approval")).toContainText("draft/model");
    await page.getByRole("button", { name: "Confirm review request", exact: true }).click();
    await expect(page.locator(".message.assistant")).toContainText(
        "draft review was requested after your confirmation",
    );
});

test("terminology saves present the exact version and revision for confirmation", async ({ page }) => {
    await login(page);
    await send(page, "terminology");
    await expect(page.getByRole("heading", { name: "Save draft terminology" })).toBeVisible();
    await expect(page.locator(".approval pre")).toContainText("terminology-revision");
    await expect(page.locator(".approval pre")).toContainText("https://example.org/sets/feeding");
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page.locator(".message.assistant")).toContainText("saved after your confirmation");
});

test("binding plan confirmation includes both source and plan revisions", async ({ page }) => {
    await login(page);
    await send(page, "bindings");
    await expect(page.getByRole("heading", { name: "Save draft binding plan" })).toBeVisible();
    await expect(page.locator(".approval pre")).toContainText("source-revision");
    await expect(page.locator(".approval pre")).toContainText("plan-revision");
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page.locator(".message.assistant")).toContainText("saved after your confirmation");
});

test("human review shows exact evidence, confirms the decision, and blocks incomplete approval", async ({ page }) => {
    await login(page);
    await page.goto("/chat/reviews");
    await expect(page.locator("#review-signed-in-user")).toContainText("Signed in as");
    await page.getByRole("button", { name: "templates/review.oet · REVIEW_REQUESTED" }).click();
    await expect(page.locator("#review-identity")).toContainText("source-review-revision");
    await expect(page.locator("#review-validation-status")).toContainText("approval and publication are blocked");
    await expect(page.locator("#review-source")).toContainText("<script>");
    expect(await page.evaluate(() => window.__reviewInjected)).toBeUndefined();
    await expect(page.getByRole("option", { name: "Approve exact revision" })).toHaveCount(0);
    await page.getByLabel("Review comment").fill("Reviewed the exact synthetic revision; technical gates remain open.");
    await page.getByRole("button", { name: "Review decision", exact: true }).click();
    await expect(page.getByRole("region", { name: "Confirm model decision" })).toBeVisible();
    await expect(page.locator("#review-confirmation-details")).toContainText("source-review-revision");
    await expect(page.locator("#review-confirmation-details")).toContainText('"expectedSequence": 3');
    await expect(page.locator("#review-state")).toHaveText("REVIEW_REQUESTED");
    await page.getByRole("button", { name: "Confirm decision", exact: true }).click();
    await expect(page.locator("#review-state")).toHaveText("REVIEWED");
    await expect(page.locator("#review-notice")).toContainText("recorded for the displayed revision");
    await expect(page.getByRole("button", { name: "Review decision", exact: true })).toBeDisabled();
});

test("review workspace fits mobile and cancellation does not submit a decision", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat/reviews");
    await page.getByRole("button", { name: "templates/review.oet · REVIEW_REQUESTED" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Review comment").fill("Do not submit this decision.");
    await page.getByRole("button", { name: "Review decision", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("region", { name: "Confirm model decision" })).toBeHidden();
    await expect(page.locator("#review-state")).toHaveText("REVIEW_REQUESTED");
});

test("requirements graph writes require exact graph and revision confirmation", async ({ page }) => {
    await login(page);
    await send(page, "traceability");
    await expect(page.getByRole("heading", { name: "Save requirements traceability" })).toBeVisible();
    await expect(page.locator(".approval pre")).toContainText("R-023");
    await expect(page.locator(".approval pre")).toContainText("graph-revision");
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page.locator(".message.assistant")).toContainText("saved after your confirmation");
});

test("one workspace preserves chat and exact model context across tabs", async ({ page, context }) => {
    await login(page);
    await expect(page.locator(".context-badge")).toHaveCount(0);
    await expect(page.locator("#section-title")).toHaveText("Clinical modelling");
    await send(page, "Which CKMs are configured?");
    await expect(page.locator(".message.assistant")).toContainText("Terminology binding is optional.");
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("button", { name: /admission.oet/ }).click();
    await expect(page.locator("#model-source")).toContainText("<script>");
    expect(await page.evaluate(() => window.__modelInjected)).toBeUndefined();
    await expect(page.locator("#model-revision")).toContainText("d".repeat(40));
    await page.getByRole("button", { name: "Discuss in chat", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message the modelling assistant" })).toHaveValue(
        /admission.oet.*exact revision/,
    );
    await expect(page.locator(".message.assistant")).toContainText("Terminology binding is optional.");
    await page.getByRole("tab", { name: "Governance", exact: true }).click();
    await expect(page.locator("#review-signed-in-user")).toContainText("Test Modeller");
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await expect(page.locator("#model-source")).toContainText("<template>");
    expect(context.pages()).toHaveLength(1);
    await page.screenshot({ path: "test-results/unified-workspace-desktop.png", fullPage: true });
});

test("original binary source downloads with exact bytes and stays in the workspace", async ({ page, context }) => {
    await login(page);
    const bytes = Buffer.from([0x50, 0x4b, 0, 0xff]),
        artifact = {
            path: "originals/" + "a".repeat(64) + "/Original ü.zip",
            revision: "b".repeat(40),
            sha256: "c".repeat(64),
            content: null,
            content_base64: bytes.toString("base64"),
            content_encoding: "base64",
            size_bytes: bytes.length,
            metadata: { kind: "original_source" },
            status: "DRAFT",
        };
    await page.route("**/chat/api/models/project?*", (route) =>
        route.fulfill({ json: { project: { id: "default" }, artifacts: [artifact] } }),
    );
    await page.route("**/chat/api/models/artifact?*", (route) => route.fulfill({ json: artifact }));
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("button", { name: /Original ü.zip/ }).click();
    await expect(page.locator("#model-source")).toContainText("Original binary file · 4 bytes");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download source", exact: true }).click();
    const download = await downloadPromise,
        stream = await download.createReadStream(),
        chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(download.suggestedFilename()).toBe("Original ü.zip");
    expect(context.pages()).toHaveLength(1);
});

test("workspace tabs support keyboard navigation and fit a narrow viewport", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Chat", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Models", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /admission.oet/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Filter models").fill("no-match");
    await expect(page.locator("#model-list")).toContainText("No models match");
    await page.getByRole("tab", { name: "Governance", exact: true }).click();
    await expect(page.locator("#review-project")).toHaveValue("default");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/unified-workspace-mobile.png", fullPage: true });
});

test("repository outage has a recoverable error and keeps navigation available", async ({ page }) => {
    await login(page);
    await page.route("**/chat/api/models/projects", (route) =>
        route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Repository is temporarily unavailable." }),
        }),
    );
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await expect(page.locator("#model-notice")).toContainText("temporarily unavailable");
    await expect(page.getByRole("button", { name: "Refresh projects" })).toBeEnabled();
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message the modelling assistant" })).toBeEnabled();
});

test("workspace has no detected WCAG AA accessibility violations in its primary views", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    await login(page);
    for (const name of ["Chat", "Models", "Governance"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        if (name === "Models") await page.getByRole("button", { name: /admission.oet/ }).click();
        if (name === "Governance")
            await page.getByRole("button", { name: "templates/review.oet · REVIEW_REQUESTED" }).click();
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(
            result.violations.map(({ id, description, nodes }) => ({
                id,
                description,
                targets: nodes.map((n) => n.target),
            })),
        ).toEqual([]);
    }
});

test("saved compilation confirms exact template and dependency revisions", async ({ page }) => {
    await login(page);
    await send(page, "compile");
    await expect(page.getByRole("heading", { name: "Compile and save OPT draft" })).toBeVisible();
    await expect(page.locator(".approval pre")).toContainText("template-revision");
    await expect(page.locator(".approval pre")).toContainText("dependency-revision");
    await expect(page.locator(".approval pre")).toContainText("openEHR-EHR-COMPOSITION.engine_fixture.v1.0.0");
    await expect(page.locator(".message.assistant")).not.toContainText("saved after your confirmation");
    await page.getByRole("button", { name: "Confirm save", exact: true }).click();
    await expect(page.locator(".message.assistant")).toContainText("saved after your confirmation");
});

test("provider choice is retained per conversation and connection controls explain personal accounts", async ({
    page,
}) => {
    await page.goto("/chat/");
    await page.getByRole("link", { name: /Sign in to start/ }).click();
    await page.locator("#chat-provider").selectOption("claude");
    await page.locator("#message").fill("List sources");
    await page.locator("#send").click();
    await expect(page.locator("#thread")).toContainText("configured source");
    await expect(page.locator("#chat-provider")).toBeDisabled();
    await expect(page.locator("#chat-provider")).toHaveValue("claude");
    await page.getByText("My AI connections", { exact: true }).click();
    await expect(page.locator("#claude-connection")).toContainText("billed separately from a Claude subscription");
    await page.locator("#new-chat").click();
    await expect(page.locator("#chat-provider")).toBeEnabled();
    await page.locator("#chat-provider").selectOption("codex");
    await page.locator("#conversations button", { hasText: "List sources" }).click();
    await expect(page.locator("#chat-provider")).toHaveValue("claude");
});

test("disconnected users connect a personal Claude key before chatting", async ({ page }) => {
    let connected = false;
    await page.route("**/chat/api/session", async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        data.providers = [
            { id: "codex", name: "Codex", connected: false },
            { id: "claude", name: "Claude", connected },
        ];
        await route.fulfill({ response, json: data });
    });
    await page.route("**/chat/api/providers/claude", async (route) => {
        if (route.request().method() === "POST") {
            expect(route.request().postDataJSON().apiKey).toBe("sk-ant-browser-fixture");
            connected = true;
        } else connected = false;
        await route.fulfill({ json: { success: true } });
    });
    await page.goto("/chat/");
    await page.getByRole("link", { name: /Sign in to start/ }).click();
    await page.locator("#chat-provider").selectOption("claude");
    await page.locator("#message").fill("List sources");
    await expect(page.locator("#send")).toBeDisabled();
    await page.getByText("My AI connections", { exact: true }).click();
    await page.locator("#claude-key").fill("sk-ant-browser-fixture");
    await page.locator("#connect-claude").click();
    await expect(page.locator("#claude-key")).toHaveValue("");
    await expect(page.locator("#claude-status")).toHaveText("Connected");
    await expect(page.locator("#send")).toBeEnabled();
    await page.locator("#disconnect-claude").click();
    await expect(page.locator("#claude-status")).toHaveText("Not connected");
    await expect(page.locator("#send")).toBeDisabled();
});
