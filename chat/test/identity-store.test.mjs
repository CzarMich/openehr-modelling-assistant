import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { IdentityStore } from "../src/identity-store.mjs";

const password = "A-long-test-password-2026!";
const encryptionKey = "ab".repeat(32);
function code(secret) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let buffer = 0,
        bits = 0;
    const bytes = [];
    for (const char of secret) {
        buffer = (buffer << 5) | alphabet.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((buffer >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
    const offset = digest.at(-1) & 15;
    return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
function fixture() {
    const directory = mkdtempSync(join(tmpdir(), "identity-test-"));
    const store = new IdentityStore(directory, { issuer: "https://example.test/identity/local", encryptionKey });
    return { directory, store, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test("one-time bootstrap, MFA enrollment, persistent login and logout revocation", async (t) => {
    const { store, close } = fixture();
    t.after(close);
    const bootstrap = store.bootstrapToken();
    const owner = store.bootstrap(bootstrap, "owner.admin", "Workspace Owner", password);
    assert.throws(() => store.bootstrapToken(), /IDENTITY_OWNER_ALREADY_EXISTS/);
    assert.equal(store.localSession(owner.sessionToken), null);
    const enrolled = store.verifyMfaSetup(owner.sessionToken, code(owner.totpSecret));
    assert.equal(enrolled.recoveryCodes.length, 10);
    assert.notEqual(store.localSession(owner.sessionToken), null);
    assert.equal(store.localSession(owner.sessionToken).reviewIdentity.issuer, "https://example.test/identity/local");

    const login = await store.login("owner.admin", password, null, enrolled.recoveryCodes[0], "127.0.0.1");
    const restarted = new IdentityStore(store.directory, {
        issuer: "https://example.test/identity/local",
        encryptionKey,
    });
    assert.notEqual(restarted.localSession(login.sessionToken), null);
    restarted.revokeSession(login.sessionToken);
    assert.equal(restarted.localSession(login.sessionToken), null);
});

test("invitation is single-use and account recovery codes are one-use", async (t) => {
    const { store, close } = fixture();
    t.after(close);
    const bootstrap = store.bootstrapToken();
    const owner = store.bootstrap(bootstrap, "owner.admin", "Workspace Owner", password);
    store.verifyMfaSetup(owner.sessionToken, code(owner.totpSecret));
    const invitation = store.invite(owner.user.id, "modeller@example.test", ["modelling-modeller"]);
    const member = store.acceptInvite(invitation.token, "model.author", "Model Author", password);
    assert.throws(
        () => store.acceptInvite(invitation.token, "model.other", "Another Author", password),
        /IDENTITY_INVITATION_INVALID/,
    );
    const recovery = store.verifyMfaSetup(member.sessionToken, code(member.totpSecret)).recoveryCodes[0];
    const recovered = await store.login("model.author", password, null, recovery, "127.0.0.1");
    assert.ok(recovered.sessionToken);
    await assert.rejects(store.login("model.author", password, null, recovery, "127.0.0.1"), /IDENTITY_LOGIN_INVALID/);
});

test("last administrator cannot be removed and audit chain detects tampering", (t) => {
    const { store, directory, close } = fixture();
    t.after(close);
    const bootstrap = store.bootstrapToken();
    const owner = store.bootstrap(bootstrap, "owner.admin", "Workspace Owner", password);
    assert.throws(
        () => store.setRoles(owner.user.id, owner.user.id, ["modelling-modeller"]),
        /IDENTITY_LAST_ADMIN_REQUIRED/,
    );
    const path = join(directory, "identity.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.audit[0].action = "TAMPERED";
    writeFileSync(path, JSON.stringify(state));
    assert.throws(() => store.read(), /IDENTITY_AUDIT_CHAIN_INVALID/);
});

test("MFA setup attempts are persisted and capped", (t) => {
    const { store, close } = fixture();
    t.after(close);
    const owner = store.bootstrap(store.bootstrapToken(), "owner.admin", "Workspace Owner", password);
    for (let attempt = 0; attempt < 8; attempt++)
        assert.throws(() => store.verifyMfaSetup(owner.sessionToken, "000000"), /IDENTITY_MFA_INVALID/);
    assert.throws(() => store.verifyMfaSetup(owner.sessionToken, code(owner.totpSecret)), /IDENTITY_MFA_INVALID/);
    assert.equal(store.localSession(owner.sessionToken), null);
});

test("password reset, MFA recovery and service credentials remain scoped and non-human", async (t) => {
    const { store, close } = fixture();
    t.after(close);
    const owner = store.bootstrap(store.bootstrapToken(), "owner.admin", "Workspace Owner", password);
    const enrolled = store.verifyMfaSetup(owner.sessionToken, code(owner.totpSecret));
    const invitation = store.invite(owner.user.id, "modeller@example.test", ["modelling-modeller"]);
    const member = store.acceptInvite(invitation.token, "model.author", "Model Author", password);
    store.verifyMfaSetup(member.sessionToken, code(member.totpSecret));

    const reset = store.inviteReset(owner.user.id, member.user.id);
    assert.equal(store.resetPassword(reset.token, "A-new-and-different-password-2026!"), true);
    await assert.rejects(store.login("model.author", password, null, null, "reset-check"), /IDENTITY_LOGIN_INVALID/);

    const recovery = store.issueAccountRecovery(owner.user.id, member.user.id);
    const recovered = store.completeAccountRecovery(recovery.token, "A-recovery-password-2026!");
    assert.equal(store.localSession(recovered.sessionToken), null);
    store.verifyMfaSetup(recovered.sessionToken, code(recovered.totpSecret));

    const credential = store.issueServiceAccount(owner.user.id, "Build agent", ["modelling.read"]);
    assert.equal(store.authenticateServiceAccount(credential.token).human, false);
    assert.deepEqual(store.authenticateServiceAccount(credential.token).scopes, ["modelling.read"]);
    store.revokeServiceAccount(owner.user.id, credential.account.id);
    assert.equal(store.authenticateServiceAccount(credential.token), null);
    assert.ok(enrolled.recoveryCodes.length === 10);
});
