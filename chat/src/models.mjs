// Read-only browser adapter over the same repository tools used by automation clients.
export async function readModels(client, requestUrl) {
    const url = new URL(requestUrl, "http://workspace"),
        route = url.pathname.slice("/chat/api/models".length),
        params = url.searchParams;
    let name, args;
    if (route === "/projects" && !url.search) {
        name = "model_projects";
        args = {};
    } else if (["/project", "/artifact"].includes(route)) {
        const allowed = route === "/project" ? ["project"] : ["project", "path", "revision"];
        if ([...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1))
            throw Object.assign(new Error("Invalid model request."), { status: 400 });
        const project = params.get("project");
        if (!project || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(project))
            throw Object.assign(new Error("Choose a valid project."), { status: 400 });
        args = { project };
        name = "model_project_get";
        if (route === "/artifact") {
            const path = params.get("path"),
                revision = params.get("revision");
            if (
                !path ||
                path.length > 240 ||
                !/^(requirements|archetypes|templates|terminology|aql|tests|validation|decisions|documentation)\/[A-Za-z0-9_./-]+$/.test(
                    path,
                ) ||
                path.includes("..") ||
                path.includes("//") ||
                path.endsWith("/") ||
                (revision !== null && !/^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))
            )
                throw Object.assign(new Error("Choose a valid model revision."), { status: 400 });
            args = { project, path, ...(revision === null ? {} : { revision }) };
            name = "model_artifact_get";
        }
    } else throw Object.assign(new Error("Model operation not found."), { status: 404 });
    const catalogue = await client.tools();
    if (!catalogue.some((tool) => tool.name === name))
        throw Object.assign(new Error("Model browsing is not available on this deployment."), { status: 503 });
    const response = await client.call(name, args);
    let envelope = response.structuredContent;
    if (!envelope) {
        try {
            envelope = JSON.parse(response.content?.find((item) => item.type === "text")?.text);
        } catch {
            throw Object.assign(new Error("The repository returned an invalid response."), { status: 503 });
        }
    }
    if (response.isError || envelope?.success !== true || !envelope.result || typeof envelope.result !== "object") {
        const missing = ["PROJECT_NOT_FOUND", "ARTIFACT_NOT_FOUND", "VERSION_NOT_FOUND"].includes(
            envelope?.error?.code,
        );
        throw Object.assign(
            new Error(
                missing
                    ? "This project or model revision is no longer available. Refresh the list."
                    : "The repository could not complete the request. Please retry.",
            ),
            { status: missing ? 404 : 503 },
        );
    }
    const result = envelope.result;
    if (
        (name === "model_projects" && !Array.isArray(result.projects)) ||
        (name === "model_artifact_get" &&
            ["path", "revision", "sha256", "content", "status"].some((key) => typeof result[key] !== "string"))
    )
        throw Object.assign(new Error("The repository returned an invalid response."), { status: 503 });
    if (name === "model_project_get") {
        if (!Array.isArray(result.artifacts))
            throw Object.assign(new Error("Invalid project response."), { status: 503 });
        return {
            ...result,
            artifacts: result.artifacts.map(({ path, revision, status, sha256, updated_at }) => ({
                path,
                revision,
                status,
                sha256,
                updated_at,
            })),
        };
    }
    return result;
}
