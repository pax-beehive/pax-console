export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-3 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}
