import { Badge } from "./badge";
import { TruncatedText } from "./text";

export function SectionTitle({
  count,
  title,
}: {
  count: number;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-sm font-medium">{title}</TruncatedText>
      <Badge className="min-w-[1.75rem] justify-center font-mono">
        {String(count)}
      </Badge>
    </div>
  );
}
