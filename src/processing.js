const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|ref$)/i;

/** Strip HTML tags and entities, collapse whitespace, truncate at a word boundary. */
export function cleanText(text, maxChars = Infinity) {
  const plain = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxChars) return plain;

  let cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Canonical form of a URL for duplicate detection (no tracking params, hash, www or trailing slash). */
export function normalizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

const titleKey = (title) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Case-insensitive whole-word/phrase matchers, so "AI" does not match "said". */
function compileKeywords(keywords = []) {
  return keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    });
}

const byNewest = (a, b) => {
  if (a.publishedAt === b.publishedAt) return 0;
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return a.publishedAt < b.publishedAt ? 1 : -1;
};

/**
 * Clean, dedupe, filter, sort and limit the fetched sections.
 * Pure: returns new sections plus stats, never mutates the input.
 * Weather sections and failed sections pass through (weather items are only cleaned).
 */
export function processSections(sections, config) {
  const maxSummary = config.maxSummaryChars ?? 200;
  const include = compileKeywords(config.filters?.includeKeywords);
  const exclude = compileKeywords(config.filters?.excludeKeywords);
  const limits = new Map((config.sources?.rss ?? []).map((s) => [`rss:${s.name}`, s.maxItems]));

  const stats = { duplicates: 0, filtered: 0, limited: 0 };
  const seenUrls = new Set();
  const seenTitles = new Set();

  const processed = sections.map((section) => {
    const items = section.items.map((item) => ({
      ...item,
      title: cleanText(item.title, 160),
      summary: cleanText(item.summary, maxSummary),
    }));

    if (section.error || section.type === 'weather') return { ...section, items };

    // 1. Deduplicate across all sections (first occurrence wins)
    const unique = items.filter((item) => {
      const url = normalizeUrl(item.url);
      const title = titleKey(item.title);
      if ((url && seenUrls.has(url)) || (title && seenTitles.has(title))) {
        stats.duplicates += 1;
        return false;
      }
      if (url) seenUrls.add(url);
      if (title) seenTitles.add(title);
      return true;
    });

    // 2. Keyword filters (news only; commits are never filtered)
    const kept =
      section.type === 'news'
        ? unique.filter((item) => {
            const text = `${item.title} ${item.summary}`;
            const ok =
              (include.length === 0 || include.some((re) => re.test(text))) &&
              !exclude.some((re) => re.test(text));
            if (!ok) stats.filtered += 1;
            return ok;
          })
        : unique;

    // 3. Newest first, then limit
    const limit = limits.get(section.id) ?? config.maxItemsPerSource ?? 5;
    const sorted = [...kept].sort(byNewest);
    stats.limited += Math.max(0, sorted.length - limit);

    return { ...section, items: sorted.slice(0, limit) };
  });

  return { sections: processed, stats };
}
