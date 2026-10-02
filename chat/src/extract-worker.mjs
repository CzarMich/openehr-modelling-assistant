import { readFileSync } from "node:fs";
import { extname } from "node:path";

const LIMIT = 240000;
export async function extract(path, name) {
    const bytes = readFileSync(path),
        extension = extname(name).toLowerCase();
    let text = "",
        truncated = false;
    const append = (value) => {
        const room = LIMIT - text.length;
        if (value.length > room) truncated = true;
        text += value.slice(0, room);
    };
    if (bytes.subarray(0, 5).toString() === "%PDF-") {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = getDocument({
            data: new Uint8Array(bytes),
            isEvalSupported: false,
            useSystemFonts: false,
            disableFontFace: true,
            useWorkerFetch: false,
            verbosity: 0,
        });
        const doc = await task.promise;
        try {
            for (let page = 1; page <= Math.min(doc.numPages, 200) && text.length < LIMIT; page++) {
                const content = await (await doc.getPage(page)).getTextContent();
                append(
                    `\n[Page ${page}]\n` + content.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join(""),
                );
            }
            if (doc.numPages > 200 || text.length === LIMIT) truncated = true;
        } finally {
            await task.destroy();
        }
        if (!text.replace(/\[Page \d+\]/g, "").trim())
            return {
                text: "",
                status: "no_text",
                note: "No selectable text found. OCR is not available; upload a text version of scanned pages.",
            };
    } else if ([".xlsx", ".xls", ".ods", ".xlsb"].includes(extension)) {
        const XLSX = await import("xlsx");
        const book = XLSX.read(bytes, {
            type: "buffer",
            sheetRows: 5001,
            cellFormula: false,
            cellHTML: false,
            bookVBA: false,
        });
        for (const name of book.SheetNames.slice(0, 30)) {
            const sheet = book.Sheets[name];
            if (sheet["!fullref"] && sheet["!fullref"] !== sheet["!ref"]) truncated = true;
            append(`\n[Sheet: ${name}]\n` + XLSX.utils.sheet_to_csv(sheet));
        }
        if (book.SheetNames.length > 30) truncated = true;
    } else if (extension === ".docx") {
        const { default: mammoth } = await import("mammoth");
        append((await mammoth.extractRawText({ buffer: bytes })).value);
    } else {
        let encoding = "utf-8";
        if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
        if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
        try {
            const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
            if (/[\x00-\x08\x0b\x0e-\x1f]/.test(decoded)) throw new Error("Binary");
            append(decoded);
        } catch {
            return {
                text: "",
                status: "unsupported",
                note: "Original saved. This binary format has no text extractor; upload a PDF, spreadsheet, DOCX or text version to use its content.",
            };
        }
    }
    return {
        text,
        status: truncated ? "partial" : text.trim() ? "ready" : "no_text",
        note: truncated
            ? "Extraction reached a page, row, sheet or text limit. Only the extracted portion is available to the assistant."
            : text.trim()
              ? "Text extracted. Tables and page layout may need review against the original."
              : "No text found in this file.",
    };
}

// A separate, memory-bounded process keeps malformed document work off the HTTP loop.
if (process.send)
    process.once("message", async ({ path, name }) => {
        try {
            process.send(await extract(path, name), () => process.exit(0));
        } catch {
            process.send(
                {
                    text: "",
                    status: "failed",
                    note: "Original saved, but extraction failed. The file may be damaged or password protected.",
                },
                () => process.exit(0),
            );
        }
    });
