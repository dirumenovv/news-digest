import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, normalizeUrl, processSections } from '../src/processing.js';

const item = (title, extra = {}) => ({ title, url: null, summary: '', source: 'S', publishedAt: null, ...extra });
const news = (id, items) => ({ id, title: id, type: 'news', items, error: null });
const baseConfig = (over = {}) => ({
  maxItemsPerSource: 5,
  maxSummaryChars: 200,
  filters: { includeKeywords: [], excludeKeywords: [] },
  sources: { rss: [] },
  ...over,
});

test('cleanText strips HTML and entities and collapses whitespace', () => {
  assert.equal(cleanText('<p>Tom &amp; Jerry\n\n  <b>run</b></p>'), 'Tom & Jerry run');
});

test('cleanText truncates at a word boundary with an ellipsis', () => {
  const out = cleanText('the quick brown fox jumps over the lazy dog', 20);
  assert.equal(out, 'the quick brown fox…');
});

test('normalizeUrl removes tracking params, hash, www and trailing slash', () => {
  assert.equal(normalizeUrl('https://www.Example.com/post/?utm_source=x&id=7#top'), 'https://example.com/post?id=7');
  assert.equal(normalizeUrl(null), null);
});

test('duplicates are removed across sections by URL and by title', () => {
  const a = news('rss:A', [item('Big News', { url: 'https://x.com/1?utm_source=a' })]);
  const b = news('rss:B', [
    item('Other title', { url: 'https://www.x.com/1' }),
    item('BIG news!', { url: 'https://y.com/2' }),
    item('Fresh', { url: 'https://y.com/3' }),
  ]);
  const { sections, stats } = processSections([a, b], baseConfig());
  assert.deepEqual(sections[0].items.map((i) => i.title), ['Big News']);
  assert.deepEqual(sections[1].items.map((i) => i.title), ['Fresh']);
  assert.equal(stats.duplicates, 2);
});

test('includeKeywords match whole words only, case-insensitively', () => {
  const s = news('rss:A', [item('AI model released'), item('He said hello'), item('New ai tool')]);
  const { sections, stats } = processSections([s], baseConfig({ filters: { includeKeywords: ['AI'], excludeKeywords: [] } }));
  assert.deepEqual(sections[0].items.map((i) => i.title), ['AI model released', 'New ai tool']);
  assert.equal(stats.filtered, 1);
});

test('excludeKeywords drop items that match in title or summary', () => {
  const s = news('rss:A', [item('Good', { summary: 'sponsored content' }), item('Fine')]);
  const { sections } = processSections([s], baseConfig({ filters: { includeKeywords: [], excludeKeywords: ['Sponsored'] } }));
  assert.deepEqual(sections[0].items.map((i) => i.title), ['Fine']);
});

test('items are sorted newest first with undated items last', () => {
  const s = news('rss:A', [
    item('undated'),
    item('old', { publishedAt: '2026-10-01T00:00:00.000Z' }),
    item('new', { publishedAt: '2026-10-29T00:00:00.000Z' }),
  ]);
  const { sections } = processSections([s], baseConfig());
  assert.deepEqual(sections[0].items.map((i) => i.title), ['new', 'old', 'undated']);
});

test('per-source maxItems overrides the global limit', () => {
  const items = ['a', 'b', 'c', 'd'].map((t) => item(t));
  const config = baseConfig({ maxItemsPerSource: 3, sources: { rss: [{ name: 'A', maxItems: 1 }] } });
  const { sections, stats } = processSections([news('rss:A', items), news('rss:B', items.map((i) => ({ ...i, title: i.title + '2' })))], config);
  assert.equal(sections[0].items.length, 1);
  assert.equal(sections[1].items.length, 3);
  assert.equal(stats.limited, 3 + 1);
});

test('weather and failed sections pass through unfiltered', () => {
  const weather = { id: 'weather', title: 'Weather', type: 'weather', items: [item('Sofia: 12°C')], error: null };
  const failed = { id: 'rss:X', title: 'X', type: 'news', items: [], error: 'HTTP 500' };
  const config = baseConfig({ filters: { includeKeywords: ['nomatch'], excludeKeywords: [] } });
  const { sections } = processSections([weather, failed], config);
  assert.equal(sections[0].items.length, 1);
  assert.equal(sections[1].error, 'HTTP 500');
});

test('processSections does not mutate its input', () => {
  const s = news('rss:A', [item('<b>Hi</b>')]);
  processSections([s], baseConfig());
  assert.equal(s.items[0].title, '<b>Hi</b>');
});

test('long summaries are trimmed to maxSummaryChars', () => {
  const s = news('rss:A', [item('T', { summary: 'word '.repeat(100) })]);
  const { sections } = processSections([s], baseConfig({ maxSummaryChars: 50 }));
  assert.ok(sections[0].items[0].summary.length <= 51);
  assert.ok(sections[0].items[0].summary.endsWith('…'));
});
