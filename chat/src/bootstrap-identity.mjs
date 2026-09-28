import { chmodSync, existsSync, openSync, closeSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { loadConfig } from "./config.mjs";
import { IdentityStore } from "./identity-store.mjs";

const config = loadConfig();
if (!config.identityEnabled) throw new Error("Enable CHAT_LOCAL_IDENTITY_ENABLED before bootstrapping local identity.");
const store = new IdentityStore(config.dataDir + "/identity", {
    issuer: config.localIssuer,
    sessionSeconds: config.sessionSeconds,
    encryptionKey: config.identityEncryptionKey,
});
if (store.read().users.length) throw new Error("An owner account already exists; bootstrap is permanently closed.");
const path = config.dataDir + "/owner-bootstrap.token";
if (existsSync(path) && !process.argv.includes("--rotate"))
    throw new Error("A bootstrap token file already exists. Use --rotate only if the current token was not accepted.");
const value = store.bootstrapToken();
const temporary = path + ".tmp";
try {
    unlinkSync(temporary);
} catch {}
const fd = openSync(temporary, "wx", 0o600);
try {
    writeFileSync(fd, value, "utf8");
} finally {
    closeSync(fd);
}
chmodSync(temporary, 0o600);
renameSync(temporary, path);
console.log(JSON.stringify({ event: "identity_bootstrap_token_created", path }));
