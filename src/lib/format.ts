export function compactId(value: string, head = 10, tail = 6) {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
