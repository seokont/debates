export type NewsItem = {
  title: string;
  url: string;
  summary: string;
  source: string;
};

export async function fetchArxivLatest(query: string, maxResults = 5): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    search_query: query,
    max_results: String(maxResults),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });

  const response = await fetch(
    `https://export.arxiv.org/api/query?${params.toString()}`,
    { signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) return [];

  const xml = await response.text();
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

  return entries.slice(0, maxResults).map((entry) => {
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
    const summary = entry
      .match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400) ?? '';
    const url = entry.match(/<id>(https?:\/\/[^<]+)<\/id>/)?.[1]?.trim() ?? '';

    return { title, url, summary, source: 'arXiv' };
  }).filter((item) => item.title && item.url);
}
