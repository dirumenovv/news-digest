import Parser from 'rss-parser';
import { fetchWithTimeout } from './http.js';

const parser = new Parser();

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fetch one RSS/Atom feed and normalize it to the common item shape. */
export async function fetchRss(source, { fetchImpl, timeoutMs } = {}) {
  const res = await fetchWithTimeout(source.url, {
    fetchImpl,
    timeoutMs,
    headers: {
      'User-Agent': 'daily-digest/0.1',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
  });

  const feed = await parser.parseString(await res.text());

  return (feed.items ?? [])
    .filter((item) => item.title)
    .map((item) => ({
      title: item.title.trim(),
      url: item.link ?? null,
      summary: item.contentSnippet ?? '',
      source: source.name,
      publishedAt: toIso(item.isoDate ?? item.pubDate),
    }));
}
