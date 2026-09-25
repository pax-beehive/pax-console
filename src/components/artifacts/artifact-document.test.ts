import { describe, expect, it } from "vitest";
import {
  artifactDocumentFromPublication,
  artifactDocumentFromSessionArtifact,
  artifactPreviewPageHref,
  builtinArtifactRendererRegistry,
  resolveArtifactRenderer,
} from "./artifact-document";
import { parseCsvPreview, parseJsonlPreview } from "./artifact-preview-data";

describe("artifact document renderer registry", () => {
  it("uses filenames for blank titles from either artifact source", () => {
    const file = {
      artifact_id: "artifact_1",
      kind: "file",
      schema_version: 1,
      title: "  ",
      status: "available",
      contents: [{ ref: "main", filename: "report.md" }],
    };
    expect(artifactDocumentFromSessionArtifact(file).title).toBe("report.md");
    expect(
      artifactDocumentFromPublication({
        contentRef: "main",
        fallbackTitle: "Untitled artifact",
        publicationId: "pub_1",
        state: {
          publication: {
            publication_id: "pub_1",
            status: "available",
            title: " ",
          },
          artifact: file,
        },
      }).title,
    ).toBe("report.md");
  });

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

  it.each([
    ["README.md", "builtin:markdown"],
    ["events.jsonl", "builtin:jsonl"],
    ["metrics.csv", "builtin:csv"],
    ["report.json", "builtin:json"],
    ["preview.html", "builtin:html"],
  ])(
    "lets the structured %s filename override generic text metadata",
    (filename, expected) => {
      expect(
        resolveArtifactRenderer(
          { filename },
          {
            contentType: "text/plain",
            filename,
            previewKind: "text",
          },
        ).id,
      ).toBe(expected);
    },
  );

  it.each([
    ["text/html", "report.html", "builtin:html"],
    ["application/octet-stream", "report.html", "builtin:html"],
    ["text/plain", "report.html", "builtin:html"],
    ["text/csv", "report.csv", "builtin:csv"],
    ["application/octet-stream", "archive.zip", "builtin:download"],
  ])(
    "resolves download hints for %s / %s",
    (contentType, filename, expected) => {
      expect(
        resolveArtifactRenderer(
          { filename, contentType },
          {
            previewKind: "download",
            contentType,
            filename,
          },
        ).id,
      ).toBe(expected);
    },
  );

  it("builds protected standalone preview links for both sources", () => {
    expect(
      artifactPreviewPageHref("publication", "publication_1", "report draft"),
    ).toBe("/artifacts/publications/publication_1?ref=report+draft");
    expect(artifactPreviewPageHref("session_artifact", "artifact_1")).toBe(
      "/artifacts/files/artifact_1?ref=main",
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
