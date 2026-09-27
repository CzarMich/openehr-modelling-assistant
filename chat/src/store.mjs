import { createHash, randomUUID } from "node:crypto";
import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    renameSync,
    readdirSync,
    unlinkSync,
    statSync,
    lstatSync,
    rmdirSync,
} from "node:fs";
import { join } from "node:path";

export class Store {
    constructor(directory, retentionDays = 30) {
        this.directory = directory;
        this.retentionMs = retentionDays * 86400000;
        mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    prune() {
        for (const owner of readdirSync(this.directory)) {
            if (!/^[a-f0-9]{64}$/.test(owner)) continue;
            const directory = join(this.directory, owner);
            if (!lstatSync(directory).isDirectory()) continue;
            for (const file of readdirSync(directory)) {
                if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
                const path = join(directory, file);
                if (Date.now() - lstatSync(path).mtimeMs > this.retentionMs) unlinkSync(path);
            }
            if (readdirSync(directory).length === 0) rmdirSync(directory);
        }
    }
    owner(identity) {
        return createHash("sha256").update(identity).digest("hex");
    }
    directoryFor(identity) {
        const directory = join(this.directory, this.owner(identity));
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        return directory;
    }
    path(identity, id) {
        if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error("Conversation not found"), { status: 404 });
        return join(this.directoryFor(identity), id + ".json");
    }
    list(identity) {
        const directory = this.directoryFor(identity),
            items = [];
        for (const file of readdirSync(directory)) {
            if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
            const path = join(directory, file);
            if (Date.now() - statSync(path).mtimeMs > this.retentionMs) {
                unlinkSync(path);
                continue;
            }
            const conversation = JSON.parse(readFileSync(path, "utf8"));
            items.push({ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt });
        }
        return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    create(identity) {
        if (this.list(identity).length >= 100)
            throw Object.assign(new Error("Conversation limit reached. Delete an older chat."), { status: 429 });
        const conversation = {
            id: randomUUID(),
            title: "New conversation",
            messages: [],
            updatedAt: new Date().toISOString(),
        };
        this.save(identity, conversation);
        return conversation;
    }
    get(identity, id) {
        try {
            return JSON.parse(readFileSync(this.path(identity, id), "utf8"));
        } catch {
            throw Object.assign(new Error("Conversation not found"), { status: 404 });
        }
    }
    save(identity, conversation) {
        conversation.updatedAt = new Date().toISOString();
        const path = this.path(identity, conversation.id),
            temp = path + "." + randomUUID() + ".tmp";
        writeFileSync(temp, JSON.stringify(conversation), { mode: 0o600 });
        renameSync(temp, path);
    }
    delete(identity, id) {
        this.get(identity, id);
        unlinkSync(this.path(identity, id));
    }
}
