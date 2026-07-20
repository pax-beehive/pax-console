export function compactId(
  value: string | null | undefined,
  head = 10,
  tail = 6,
  fallback = "unknown",
) {
  if (!value) {
    return fallback;
  }

  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
