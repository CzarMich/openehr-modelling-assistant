import { randomBytes, timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";

export function equal(a, b) {
    return (
        typeof a === "string" &&
        typeof b === "string" &&
        Buffer.byteLength(a) === Buffer.byteLength(b) &&
        timingSafeEqual(Buffer.from(a), Buffer.from(b))
    );
}
function token() {
    return randomBytes(32).toString("hex");
}
export function cookies(req) {
    return Object.fromEntries(
        (req.headers.cookie || "")
            .split(";")
            .map((v) => v.trim().split(/=(.*)/s).slice(0, 2))
            .filter((v) => v.length === 2),
    );
}
export class Auth {
    constructor(config) {
        this.config = config;
        this.sessions = new Map();
        this.transactions = new Map();
        this.discovery = null;
    }
    cookie(name, value, maxAge) {
        return `${this.config.secure ? "__Host-" : ""}${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.secure ? "; Secure" : ""}`;
    }
    value(req, name) {
        return cookies(req)[`${this.config.secure ? "__Host-" : ""}${name}`];
    }
    cleanup() {
        for (const map of [this.sessions, this.transactions])
            for (const [id, data] of map) if (data.expires < Date.now()) map.delete(id);
    }
    async client() {
        if (!this.discovery)
            this.discovery = oidc
                .discovery(new URL(this.config.issuer), this.config.clientId, this.config.clientSecret, undefined, {
                    execute: [oidc.enableNonRepudiationChecks],
                })
                .catch((error) => {
                    this.discovery = null;
                    throw error;
                });
        return this.discovery;
    }
    async login(req, res) {
        this.cleanup();
        if (this.transactions.size >= 1000) throw Object.assign(new Error("Please try again later"), { status: 429 });
        const client = await this.client(),
            id = token(),
            state = oidc.randomState(),
            nonce = oidc.randomNonce(),
            verifier = oidc.randomPKCECodeVerifier();
        const destination =
            !this.config.enabled || new URL(req.url, this.config.origin).searchParams.get("review") === "1"
                ? "/chat/reviews"
                : "/chat/";
        this.transactions.set(id, { state, nonce, verifier, destination, expires: Date.now() + 300000 });
        res.setHeader("Set-Cookie", this.cookie("ModellingLogin", id, 300));
        res.writeHead(302, {
            Location: oidc.buildAuthorizationUrl(client, {
                redirect_uri: this.config.origin + "/chat/auth/callback",
                scope: "openid profile email",
                state,
                nonce,
                code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
                code_challenge_method: "S256",
            }).href,
        });
        res.end();
    }
    async callback(req, res) {
        this.cleanup();
        const id = this.value(req, "ModellingLogin"),
            transaction = this.transactions.get(id);
        this.transactions.delete(id);
        if (!transaction || this.sessions.size >= 1000)
            throw Object.assign(new Error("Sign-in expired. Please try again."), { status: 401 });
        const tokens = await oidc.authorizationCodeGrant(await this.client(), new URL(req.url, this.config.origin), {
            pkceCodeVerifier: transaction.verifier,
            expectedState: transaction.state,
            expectedNonce: transaction.nonce,
            idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (!claims?.sub) throw Object.assign(new Error("Sign-in failed"), { status: 401 });
        if (
            this.config.allowedGroups.length &&
            !this.config.allowedGroups.some((group) => Array.isArray(claims.groups) && claims.groups.includes(group))
        )
            throw Object.assign(new Error("Access is not enabled for this account."), { status: 403 });
        let reviewIdentity;
        if (this.config.reviewEnabled) {
            const claim = (path) =>
                path
                    .split(".")
                    .reduce((value, key) => (value && Object.hasOwn(value, key) ? value[key] : undefined), claims);
            const roles = claim(this.config.reviewRolesClaim) ?? [];
            const tenant = this.config.reviewTenantClaim ? claim(this.config.reviewTenantClaim) : claims.iss;
            if (
                !Array.isArray(roles) ||
                roles.length > 100 ||
                roles.some((role) => typeof role !== "string" || role.length > 200) ||
                typeof tenant !== "string" ||
                !tenant ||
                tenant.length > 300
            )
                throw Object.assign(new Error("Review identity claims are not configured correctly."), { status: 403 });
            reviewIdentity = {
                issuer: claims.iss,
                subject: claims.sub,
                tenant,
                roles,
                started: Math.floor(Date.now() / 1000),
            };
        }
        const sessionId = token();
        this.sessions.set(sessionId, {
            identity: claims.iss + "\n" + claims.sub,
            name: String(claims.name || claims.preferred_username || "User").slice(0, 160),
            csrf: token(),
            reviewIdentity,
            expires: Date.now() + this.config.sessionSeconds * 1000,
        });
        res.setHeader("Set-Cookie", [
            this.cookie("ModellingSession", sessionId, this.config.sessionSeconds),
            this.cookie("ModellingLogin", "", 0),
        ]);
        res.writeHead(302, {
            Location: transaction.destination === "/chat/reviews" || !this.config.enabled ? "/chat/reviews" : "/chat/",
        });
        res.end();
    }
    session(req) {
        this.cleanup();
        return this.sessions.get(this.value(req, "ModellingSession"));
    }
    require(req, mutation = false) {
        const session = this.session(req);
        if (!session) throw Object.assign(new Error("Please sign in to continue."), { status: 401 });
        if (
            mutation &&
            (req.headers.origin !== this.config.origin || !equal(req.headers["x-csrf-token"], session.csrf))
        )
            throw Object.assign(new Error("Request could not be verified"), { status: 403 });
        return session;
    }
    logout(req, res) {
        this.require(req, true);
        this.sessions.delete(this.value(req, "ModellingSession"));
        res.setHeader("Set-Cookie", this.cookie("ModellingSession", "", 0));
    }
}
