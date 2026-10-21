const cleanups = new Set<() => Promise<unknown>>();
export function registerSignOutCleanup(cleanup: () => Promise<unknown>) {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}
export function runSignOutCleanups(): Promise<unknown> | null {
  if (!cleanups.size) return null;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 3000);
  });
  return Promise.race([
    Promise.allSettled(
      [...cleanups].map((cleanup) => Promise.resolve().then(cleanup)),
    ),
    timeout,
  ]).finally(() => clearTimeout(timer));
}
