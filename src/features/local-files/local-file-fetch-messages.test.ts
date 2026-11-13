import { describe, expect, it } from "vitest";
import { ApiError } from "@/features/api/errors";
import { createTranslator } from "@/features/i18n/translate";
import {
  localFileDenialMessage,
  localFileFetchErrorMessage,
  localFilePublicationFailureMessage,
} from "./local-file-fetch-messages";

const zh = createTranslator("zh-CN");
describe("Given local file interface messages in Chinese", () => {
  it("localizes known denials while preserving command paths and unknown remote text", () => {
    const path = "/Users/Home/中文资料.txt";
    expect(
      localFileDenialMessage(
        { code: "owner_only_denied", message: "" },
        path,
        zh,
      ),
    ).toContain(`chmod 644 ${path}`);
    expect(
      localFileDenialMessage(
        { code: "hidden_path_denied", message: "" },
        path,
        zh,
      ),
    ).toBe("无法获取隐藏文件和文件夹。");
    expect(
      localFileDenialMessage({ code: "custom", message: "Home" }, path, zh),
    ).toBe("Home");
  });
  it("retains the English default and preserves raw upload details inside localized copy", () => {
    expect(localFileFetchErrorMessage(new Error("network"))).toBe(
      "Couldn't reach the file fetch service. Try again.",
    );
    expect(localFilePublicationFailureMessage("custom", "Home", zh)).toBe(
      "上传失败：Home",
    );
    expect(
      localFilePublicationFailureMessage("secret_detected", "API_TOKEN", zh),
    ).toContain("API_TOKEN");
    expect(
      localFilePublicationFailureMessage("node_offline", undefined, zh),
    ).toBe("智能体所在设备已离线。");
  });
  it("localizes HTTP failures without changing status codes", () => {
    expect(
      localFileFetchErrorMessage(new ApiError("failed", 503, undefined), zh),
    ).toBe("智能体所在设备已离线。");
    expect(
      localFileFetchErrorMessage(new ApiError("failed", 409, undefined), zh),
    ).toBe("端到端加密会话暂不支持获取文件。");
    expect(
      localFileFetchErrorMessage(new ApiError("failed", 500, undefined), zh),
    ).toBe("无法连接文件获取服务（HTTP 500）。");
  });
});
