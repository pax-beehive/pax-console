import { TruncatedText } from "./text";

export function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {error.name}: {error.message}
    </TruncatedText>
  );
}
