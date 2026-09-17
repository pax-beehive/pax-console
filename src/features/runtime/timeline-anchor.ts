export type TimelineAnchor = { id: string; offset: number };

export function captureTimelineAnchor(
  container: HTMLElement,
): TimelineAnchor | undefined {
  const top = container.getBoundingClientRect().top;
  for (const row of container.querySelectorAll<HTMLElement>(
    "[data-timeline-id]",
  )) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom > top)
      return { id: row.dataset.timelineId!, offset: rect.top - top };
  }
}

export function restoreTimelineAnchor(
  container: HTMLElement,
  anchor?: TimelineAnchor,
) {
  if (!anchor) return false;
  const row = [
    ...container.querySelectorAll<HTMLElement>("[data-timeline-id]"),
  ].find((element) => element.dataset.timelineId === anchor.id);
  if (!row) return false;
  container.scrollTop +=
    row.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    anchor.offset;
  return true;
}
