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

export function compactDate(value?: string) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function compactDateTime(value?: string) {
  if (!value) {
    return "now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}
