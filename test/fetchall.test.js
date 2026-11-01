import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRss } from '../src/fetchers/rss.js';
import { fetchAll } from '../src/fetchers/index.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>First post</title><link>https://example.com/1</link><description>Hello &lt;b&gt;world&lt;/b&gt;</description><pubDate>Wed, 29 Oct 2026 07:00:00 GMT</pubDate></item>
<item><title>Second post</title><link>https://example.com/2</link></item>
<item><link>https://example.com/no-title</link></item>
</channel></rss>`;

const res = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test('fetchRss normalizes items and skips untitled ones', async () => {
  const items = await fetchRss({ name: 'Blog', url: 'https://example.com/feed' }, { fetchImpl: async () => res(RSS) });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'First post');
  assert.equal(items[0].source, 'Blog');
  assert.equal(items[0].publishedAt, '2026-10-29T07:00:00.000Z');
  assert.equal(items[1].publishedAt, null);
});

const config = {
  sources: {
    rss: [{ name: 'Blog', url: 'https://example.com/feed' }],
    weather: { locationName: 'Sofia', latitude: 42.69, longitude: 23.32 },
  },
};

test('fetchAll isolates failures: one broken source does not affect the others', async () => {
  const fetchImpl = async (url) => (url.includes('open-meteo') ? res({}, 500) : res(RSS));
  const sections = await fetchAll(config, {}, { fetchImpl });
  assert.equal(sections.length, 2);
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[0].error, null);
  assert.match(sections[1].error, /HTTP 500/);
  assert.deepEqual(sections[1].items, []);
});

test('fetchAll reports every source as failed when the network is down', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const sections = await fetchAll(config, {}, { fetchImpl });
  assert.ok(sections.every((s) => s.error));
});
