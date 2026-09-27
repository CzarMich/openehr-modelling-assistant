import { test, expect } from "@playwright/test";
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
    await page.getByRole("button", { name: "templates/review.oet · REVIEW_REQUESTED" }).click();
    await expect(page.locator("#identity")).toContainText("source-review-revision");
    await expect(page.locator("#validation-status")).toContainText("approval and publication are blocked");
    await expect(page.locator("#source")).toContainText("<script>");
    expect(await page.evaluate(() => window.__reviewInjected)).toBeUndefined();
    await expect(page.getByRole("option", { name: "Approve exact revision" })).toHaveCount(0);
    await page.getByLabel("Review comment").fill("Reviewed the exact synthetic revision; technical gates remain open.");
    await page.getByRole("button", { name: "Review decision", exact: true }).click();
    await expect(page.getByRole("region", { name: "Confirm model decision" })).toBeVisible();
    await expect(page.locator("#confirmation-details")).toContainText("source-review-revision");
    await expect(page.locator("#confirmation-details")).toContainText('"expectedSequence": 3');
    await expect(page.locator("#state")).toHaveText("REVIEW_REQUESTED");
    await page.getByRole("button", { name: "Confirm decision", exact: true }).click();
    await expect(page.locator("#state")).toHaveText("REVIEWED");
    await expect(page.locator("#notice")).toContainText("recorded for the displayed revision");
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
    await expect(page.locator("#state")).toHaveText("REVIEW_REQUESTED");
});
