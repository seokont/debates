import type { NewsItem } from './arxiv.source';

export async function fetchHackerNewsTop(limit = 5): Promise<NewsItem[]> {
  const response = await fetch(
    'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&numericFilters=points>100',
    { signal: AbortSignal.timeout(10_000) },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as {
    hits?: Array<{ title?: string; url?: string; objectID?: string; points?: number }>;
  };

  return (data.hits ?? [])
    .filter((h) => h.title && h.url)
    .slice(0, limit)
    .map((h) => ({
      title: h.title!,
      url: h.url!,
      summary: `HackerNews story with ${h.points ?? 0} points`,
      source: 'HackerNews',
    }));
}
