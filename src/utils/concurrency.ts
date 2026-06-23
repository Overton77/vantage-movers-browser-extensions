// Generic async concurrency helpers shared across workflows.
//
// `mapWithConcurrency` is a bounded worker pool: it runs at most `limit`
// async mappers at a time while preserving input order in the results. It
// exists to keep request fan-out (e.g. the Form Leads preview pass, which
// issues one Vantage request per scanned row) from opening dozens of
// simultaneous connections and saturating the upstream database's connection
// limit. Prefer this over `Promise.all(items.map(...))` whenever each mapper
// makes a network/API call and the input size is unbounded.

/**
 * Maps `items` through `mapper` with at most `limit` invocations in flight at
 * once. Results are returned in the same order as `items`, regardless of which
 * mapper settles first.
 *
 * Semantics match `Promise.all` for errors: if any mapper rejects, the
 * returned promise rejects with that error (in-flight work is allowed to
 * settle but no further items are started). `limit` is clamped to at least 1.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) {
    return results;
  }

  const concurrency = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await mapper(items[current], current);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
