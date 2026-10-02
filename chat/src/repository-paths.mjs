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

// Keep generated model classes separate while retaining any user subfolders.
export function artifactPath(path, folder = "") {
    folder = repositoryFolder(folder);
    const relative = folder && path.startsWith(folder + "/") ? path.slice(folder.length + 1) : path;
    const category = /\.oet(?:\.xml)?$/i.test(path)
        ? "templates/oet"
        : /\.opt(?:\.xml)?$/i.test(path)
          ? "templates/opt"
          : /\.adlt$/i.test(path)
            ? "templates/adl"
            : /\.(adl|adls|adlf)$/i.test(path)
              ? "archetypes"
              : null;
    if (!category) return (folder ? folder + "/" : "") + relative;
    const name = relative.replace(/^(?:archetypes|templates\/(?:oet|opt|adl)|templates|oets?|opts?)\//i, "");
    return (folder ? folder + "/" : "") + category + "/" + name;
}
