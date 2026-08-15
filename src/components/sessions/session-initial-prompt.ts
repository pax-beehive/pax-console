export function mergeRecoveredInitialPromptDraft(
  initialPrompt: string,
  currentDraft: string,
) {
  const recoveredPrompt = initialPrompt.trim();
  if (!recoveredPrompt) {
    return currentDraft;
  }

  const existingDraft = currentDraft.trim();
  if (!existingDraft) {
    return recoveredPrompt;
  }
  if (existingDraft === recoveredPrompt) {
    return currentDraft;
  }

  return `${recoveredPrompt}\n\n${currentDraft}`;
}
