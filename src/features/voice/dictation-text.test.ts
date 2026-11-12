import { describe, expect, it } from "vitest";
import {
  composeDictation,
  dictationAnchor,
  joinTranscript,
} from "./dictation-text";

describe("dictationAnchor", () => {
  it("splits the draft at the caret or selection", () => {
    expect(dictationAnchor("hello world", 5, 5)).toEqual({
      before: "hello",
      after: " world",
    });
    expect(dictationAnchor("hello world", 6, 11)).toEqual({
      before: "hello ",
      after: "",
    });
    expect(dictationAnchor("draft")).toEqual({ before: "draft", after: "" });
    expect(dictationAnchor("draft", 99, -1)).toEqual({
      before: "",
      after: "",
    });
  });
});

describe("composeDictation", () => {
  it("separates Latin words but joins Chinese text directly", () => {
    expect(
      composeDictation({ before: "please run", after: "" }, "make lint"),
    ).toEqual({ text: "please run make lint", caret: 20 });
    expect(composeDictation({ before: "run ", after: "now" }, "tests")).toEqual(
      { text: "run tests now", caret: 9 },
    );
    expect(composeDictation({ before: "请", after: "" }, "运行")).toEqual({
      text: "请运行",
      caret: 3,
    });
  });

  it("restores the original draft when nothing was said", () => {
    expect(composeDictation({ before: "a", after: "b" }, "")).toEqual({
      text: "ab",
      caret: 1,
    });
  });
});

describe("joinTranscript", () => {
  it("joins final and partial text like the manager does", () => {
    expect(joinTranscript("Hello world.", "And more")).toBe(
      "Hello world. And more",
    );
    expect(joinTranscript("你好", "世界")).toBe("你好世界");
    expect(joinTranscript("", "draft")).toBe("draft");
    expect(joinTranscript("done", "")).toBe("done");
  });
});
