import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ArtifactPreviewTooLargeError,
  readArtifactPreviewBlob,
  readArtifactPreviewText,
} from "./artifact-preview-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readArtifactPreviewText", () => {
  it("fetches a signed artifact URL without credentials or redirects", async () => {
    const signedUrl =
      "https://objects.example.test/artifact?X-Amz-Signature=top-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("hello"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readArtifactPreviewText(signedUrl)).resolves.toMatchObject({
      content: "hello",
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(signedUrl, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  });

  it("redacts the signed URL when the artifact request fails", async () => {
    const signedUrl =
      "https://objects.example.test/artifact?X-Amz-Signature=top-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError(`Failed to fetch ${signedUrl}`)),
    );

    const preview = readArtifactPreviewText(signedUrl);

    await expect(preview).rejects.toThrow("Preview request failed");
    await expect(preview).rejects.not.toThrow(signedUrl);
    await expect(preview).rejects.not.toThrow("top-secret");
  });

  it("redacts the signed URL when the artifact response body fails", async () => {
    const signedUrl =
      "https://objects.example.test/artifact?X-Amz-Signature=top-secret";
    const releaseLock = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: {
          getReader: () => ({
            cancel: vi.fn(),
            read: vi
              .fn()
              .mockRejectedValue(new TypeError(`Read failed for ${signedUrl}`)),
            releaseLock,
          }),
        },
        ok: true,
      } as unknown as Response),
    );

    const preview = readArtifactPreviewText(signedUrl);

    await expect(preview).rejects.toThrow("Preview response could not be read");
    await expect(preview).rejects.not.toThrow(signedUrl);
    await expect(preview).rejects.not.toThrow("top-secret");
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});

describe("readArtifactPreviewBlob", () => {
  it("fetches signed binary content without credentials or redirects", async () => {
    const signedUrl =
      "https://objects.example.test/image?X-Amz-Signature=top-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await readArtifactPreviewBlob(signedUrl);

    expect(blob.size).toBe(3);
    expect(blob.type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(signedUrl, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  });

  it("rejects an oversized declared response before reading its body", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: { cancel },
        headers: new Headers({ "content-length": "4" }),
        ok: true,
        status: 200,
      } as unknown as Response),
    );

    await expect(
      readArtifactPreviewBlob("https://signed.test", 3),
    ).rejects.toBeInstanceOf(ArtifactPreviewTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a response stream as soon as its actual bytes exceed the limit", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4]) });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: { getReader: () => ({ cancel, read, releaseLock }) },
        headers: new Headers(),
        ok: true,
        status: 200,
      } as unknown as Response),
    );

    await expect(
      readArtifactPreviewBlob("https://signed.test", 3),
    ).rejects.toBeInstanceOf(ArtifactPreviewTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("redacts a signed URL when reading the binary response fails", async () => {
    const signedUrl =
      "https://objects.example.test/file?X-Amz-Signature=top-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: {
          getReader: () => ({
            cancel: vi.fn(),
            read: vi
              .fn()
              .mockRejectedValue(new TypeError(`Read failed for ${signedUrl}`)),
            releaseLock: vi.fn(() => {
              throw new TypeError(`Release failed for ${signedUrl}`);
            }),
          }),
        },
        headers: new Headers(),
        ok: true,
        status: 200,
      } as unknown as Response),
    );

    const preview = readArtifactPreviewBlob(signedUrl);

    await expect(preview).rejects.toThrow("Preview response could not be read");
    await expect(preview).rejects.not.toThrow(signedUrl);
    await expect(preview).rejects.not.toThrow("top-secret");
  });
});
