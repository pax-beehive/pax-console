import type { HarnessLoginMethod } from "@/features/api/types";

export type MethodOption = {
  value: HarnessLoginMethod;
  label: string;
  hint: string;
};

/** Native sign-in methods, named by the account the user signs in with. */
export const methodOptions: Record<string, MethodOption[]> = {
  "claude-code": [
    {
      value: "subscription",
      label: "Claude account (Pro / Max)",
      hint: "Opens claude.ai to approve this device.",
    },
    {
      value: "console",
      label: "Anthropic Console (API billing)",
      hint: "Uses your Console organization's API credits.",
    },
  ],
  codex: [
    {
      value: "device",
      label: "ChatGPT account",
      hint: "Opens a ChatGPT page. Enter the code shown here to approve this device.",
    },
    {
      value: "api-key",
      label: "OpenAI API key",
      hint: "Paste a key from platform.openai.com.",
    },
    {
      value: "access-token",
      label: "Access token",
      hint: "For tokens issued by your organization.",
    },
  ],
};

/** Whether PAX can sign this agent type in on a device. */
export function supportsAgentSignIn(agentType: string) {
  return Object.hasOwn(methodOptions, agentType);
}
