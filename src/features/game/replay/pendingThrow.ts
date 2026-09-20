export const THROW_ID_WAIT_MS = 1500;

export async function awaitThrowId(
  pending: Promise<string | null> | null,
  timeoutMs: number = THROW_ID_WAIT_MS,
): Promise<string | undefined> {
  if (!pending) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return (await Promise.race([pending, timeout])) ?? undefined;
  } finally {
    clearTimeout(timer);
  }
}
