import { problem } from "./personal-http.mjs";

export function repositoryFolder(value) {
    if (typeof value === "string" && !value.trim().startsWith("/")) value = value.trim().replace(/\/+$/, "");
    if (
        typeof value !== "string" ||
        value.length > 200 ||
        (value !== "" &&
            (!/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(value) ||
                value.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith("."))))
    )
        throw problem(
            "Use a relative repository folder with letters, numbers, hyphens or underscores; leave it empty for the repository root.",
        );
    return value;
}

export function projectFolder(name) {
    return (
        name
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "project"
    );
}

export function requireFolderPath(path, folder) {
    folder = repositoryFolder(folder);
    if (folder && (typeof path !== "string" || !path.startsWith(folder + "/")))
        throw problem(
            "Save inside the selected repository folder. Use the full path shown in the workspace destination, or change Repository folder in Chat settings.",
        );
    return path;
}
