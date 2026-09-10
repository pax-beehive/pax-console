export function ContextUsageGauge({
  usedTokens,
  windowTokens,
}: {
  usedTokens?: number;
  windowTokens?: number;
}) {
  const ratio =
    typeof usedTokens === "number" &&
    typeof windowTokens === "number" &&
    Number.isFinite(usedTokens) &&
    Number.isFinite(windowTokens) &&
    usedTokens >= 0 &&
    windowTokens > 0
      ? Math.min(1, usedTokens / windowTokens)
      : undefined;
  const angle = ratio === undefined ? undefined : -90 + ratio * 180;
  const color =
    ratio === undefined ? undefined : `hsl(${120 * (1 - ratio)} 75% 55%)`;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      data-context-percent={
        ratio === undefined ? "unknown" : Math.round(ratio * 100)
      }
      className="h-4 w-4 text-ink-tertiary"
    >
      <path d="M3 18a9 9 0 0 1 18 0" opacity="0.3" />
      {ratio !== undefined && ratio > 0 && (
        <path
          data-testid="usage-arc"
          d="M3 18a9 9 0 0 1 18 0"
          pathLength="1"
          stroke={color}
          strokeDasharray={`${ratio} 1`}
        />
      )}
      {angle === undefined ? (
        <path d="M10 18h4" />
      ) : (
        <path
          data-testid="usage-needle"
          d="M12 18V10"
          stroke={color}
          transform={`rotate(${angle} 12 18)`}
        />
      )}
      <circle
        cx="12"
        cy="18"
        r="1"
        fill={color ?? "currentColor"}
        stroke={color}
      />
    </svg>
  );
}
