export const REPORT_BATCH_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function fetchAllReportRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  batchSize = REPORT_BATCH_SIZE
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + batchSize - 1);
    if (result.error) throw result.error;

    const page = result.data || [];
    rows.push(...page);
    if (page.length < batchSize) return rows;

    from += batchSize;
  }
}
