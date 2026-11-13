import { describe, expect, it } from "vitest";
import { createTranslator, resolveLocale } from "./translate";
import { commonMessages } from "./messages/common";
import { consoleMessages } from "./messages/console";
import { homeMessages } from "./messages/home";
import { resourcesMessages } from "./messages/resources";
import { sessionsMessages } from "./messages/sessions";
import { initializeLocale, useLocaleStore } from "./locale-store";

describe("Given a language preference", () => {
  it("uses an explicit choice ahead of the browser preference", () => {
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
  });
  it("detects supported languages in browser preference order", () => {
    expect(resolveLocale(null, ["zh-TW", "en"])).toBe("zh-CN");
    expect(resolveLocale("invalid", ["ja", "en-GB", "zh-CN"])).toBe("en");
    expect(resolveLocale(null, ["fr"])).toBe("en");
    expect(resolveLocale(null, [])).toBe("en");
  });
});

describe("Given translated interface copy", () => {
  it("preserves the English source and falls back for unknown messages", () => {
    expect(createTranslator("en")("Home")).toBe("Home");
    expect(createTranslator("zh-CN")("Home")).toBe("首页");
    expect(createTranslator("zh-CN")("Unknown server message")).toBe(
      "Unknown server message",
    );
  });
  it("interpolates values once without translating user content", () => {
    expect(
      createTranslator("zh-CN")("Expand {name}", {
        name: "My project {count}",
      }),
    ).toBe("展开My project {count}");
    expect(createTranslator("en")("{count} devices", { count: 2 })).toBe(
      "2 devices",
    );
    expect(createTranslator("en")("Hello {name}")).toBe("Hello {name}");
    expect(createTranslator("en")("{name} {missing}", { name: "$&" })).toBe(
      "$& {missing}",
    );
    expect(
      createTranslator("en")("{count}:{name}", { count: 0, name: "" }),
    ).toBe("0:");
  });
  it("does not treat object prototype names as messages or interpolation values", () => {
    const t = createTranslator("zh-CN");
    expect(t("constructor")).toBe("constructor");
    expect(t("__proto__")).toBe("__proto__");
    expect(t("{toString}", {})).toBe("{toString}");
  });
  it("preserves each message's interpolation parameters in every translation catalog", () => {
    const parameters = (message: string) =>
      [
        ...new Set(
          [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
        ),
      ].sort();
    for (const catalog of [
      commonMessages,
      consoleMessages,
      homeMessages,
      resourcesMessages,
      sessionsMessages,
    ]) {
      for (const [source, translated] of Object.entries(catalog)) {
        expect(parameters(translated), source).toEqual(parameters(source));
      }
    }
  });
  it("does not read browser preferences or change the shared snapshot during server rendering", () => {
    const locale = useLocaleStore.getState().locale;
    expect(() => initializeLocale()).not.toThrow();
    expect(useLocaleStore.getState().locale).toBe(locale);
  });
});
