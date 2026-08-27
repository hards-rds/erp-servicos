export const REPORT_BATCH_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function fetchAllReportRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  batchSize = REPORT_BATCH_SIZE,
  concurrency = 4
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const results = await Promise.all(Array.from({ length: concurrency }, (_, index) => {
      const pageFrom = from + index * batchSize;
      return fetchPage(pageFrom, pageFrom + batchSize - 1);
    }));

    for (const result of results) {
      if (result.error) throw result.error;
      const page = result.data || [];
      rows.push(...page);
      if (page.length < batchSize) return rows;
    }

    from += batchSize * concurrency;
  }
}
