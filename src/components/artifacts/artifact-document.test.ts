import { describe, expect, it } from "vitest";
import {
  artifactDocumentFromSessionArtifact,
  builtinArtifactRendererRegistry,
  resolveArtifactRenderer,
} from "./artifact-document";
import { parseCsvPreview, parseJsonlPreview } from "./artifact-preview-data";

describe("artifact document renderer registry", () => {
  it("prefers explicit preview kind over content type and filename", () => {
    expect(
      resolveArtifactRenderer(
        {
          contentType: "application/json",
          filename: "report.csv",
          previewKind: "markdown",
        },
        { previewKind: "pdf" },
      ).id,
    ).toBe("builtin:pdf");
  });

  it.each([
    ["image/png", "asset.bin", "builtin:image"],
    ["application/pdf", "asset.bin", "builtin:pdf"],
    ["text/html; charset=utf-8", "asset.bin", "builtin:html"],
    ["application/x-ndjson", "asset.bin", "builtin:jsonl"],
    ["application/octet-stream", "report.csv", "builtin:csv"],
    ["application/octet-stream", "notes.log", "builtin:text"],
    ["application/octet-stream", "archive.zip", "builtin:download"],
  ])("resolves %s / %s to %s", (contentType, filename, expected) => {
    expect(resolveArtifactRenderer({ contentType, filename }).id).toBe(
      expected,
    );
  });

  it("registers every builtin document renderer exactly once", () => {
    expect(
      new Set(builtinArtifactRendererRegistry.map(({ id }) => id)).size,
    ).toBe(9);
  });

  it("adapts session artifacts to the shared document contract", () => {
    expect(
      artifactDocumentFromSessionArtifact(
        {
          artifact_id: "artifact_1",
          kind: "spreadsheet",
          schema_version: 1,
          status: "available",
          title: "Metrics",
          contents: [
            {
              ref: "main",
              filename: "metrics.csv",
              content_type: "text/csv",
              size_bytes: 42,
            },
          ],
        },
        "/download",
      ),
    ).toMatchObject({
      id: "artifact_1",
      sourceType: "session_artifact",
      previewMode: "document",
      filename: "metrics.csv",
      contentType: "text/csv",
      downloadHref: "/download",
    });
  });
});

describe("structured artifact preview parsing", () => {
  it("parses quoted CSV cells and embedded newlines", () => {
    expect(
      parseCsvPreview('name,note\n"PAX","hello, world"\nAgent,"two\nlines"'),
    ).toEqual({
      header: ["name", "note"],
      rows: [
        ["PAX", "hello, world"],
        ["Agent", "two\nlines"],
      ],
      truncated: false,
    });
  });

  it("formats valid JSONL records and preserves invalid records", () => {
    expect(parseJsonlPreview('{"ok":true}\nnot-json')).toEqual({
      records: [
        { content: '{\n  "ok": true\n}' },
        { content: "not-json", invalid: true },
      ],
      truncated: false,
    });
  });
});
