export const HISTORY_LOAD_THRESHOLD_PX = 96;

type HistoryScrollState = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  scrollTop: number;
};

type ScrollSnapshot = {
  scrollHeight: number;
  scrollTop: number;
};

export function shouldLoadEarlierHistory({
  hasNextPage,
  isFetchingNextPage,
  scrollTop,
}: HistoryScrollState) {
  return (
    hasNextPage && !isFetchingNextPage && scrollTop <= HISTORY_LOAD_THRESHOLD_PX
  );
}

export function restoredScrollTop(
  snapshot: ScrollSnapshot,
  nextScrollHeight: number,
) {
  return snapshot.scrollTop + nextScrollHeight - snapshot.scrollHeight;
}
