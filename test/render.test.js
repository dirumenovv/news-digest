import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDigest } from '../src/render.js';

const config = { title: 'Morning Digest', schedule: { timezone: 'Europe/Sofia' } };
const now = new Date('2026-10-29T05:00:00Z');
const item = (title, extra = {}) => ({ title, url: 'https://example.com/a?x=1&y=2', summary: 'Sum', source: 'S', publishedAt: null, ...extra });
const section = (id, type, items, error = null) => ({ id, title: id, type, items, error });

test('renderDigest returns subject, html and text', async () => {
  const out = await renderDigest([section('rss:A', 'news', [item('Hello world')])], config, { now });
  assert.match(out.subject, /Morning Digest/);
  assert.match(out.html, /<!DOCTYPE html>/);
  assert.match(out.html, /Hello world/);
  assert.match(out.html, /href="https:\/\/example\.com\/a\?x&#x3D;1&amp;y&#x3D;2"/);
  assert.match(out.text, /\* Hello world/);
});

test('feed content is HTML-escaped so it cannot inject markup', async () => {
  const out = await renderDigest([section('rss:A', 'news', [item('<script>alert(1)</script>', { summary: '<img src=x onerror=alert(1)>' })])], config, { now });
  assert.ok(!out.html.includes('<script>alert(1)'));
  assert.ok(!out.html.includes('<img src=x'));
  assert.match(out.html, /&lt;script&gt;/);
});

test('javascript: links are never rendered as hrefs', async () => {
  const out = await renderDigest([section('rss:A', 'news', [item('Bad link', { url: 'javascript:alert(1)' })])], config, { now });
  assert.ok(!out.html.includes('javascript:'));
  assert.match(out.html, /Bad link/);
});

test('unavailable sources are noted in the footer and nothing else breaks', async () => {
  const out = await renderDigest(
    [section('rss:A', 'news', [item('Ok')]), section('rss:Broken', 'news', [], 'HTTP 500')],
    config,
    { now },
  );
  assert.match(out.html, /Some sources were unavailable today: rss:Broken/);
});

test('an empty digest renders a friendly message', async () => {
  const out = await renderDigest([section('rss:A', 'news', [])], config, { now });
  assert.match(out.html, /No new items today/);
});

test('section headers include an inline SVG icon, while feed text stays escaped', async () => {
  const out = await renderDigest(
    [section('weather', 'weather', [item('W')]), section('rss:A', 'news', [item('<svg onload=alert(1)>')])],
    config,
    { now },
  );
  assert.equal((out.html.match(/<svg xmlns/g) ?? []).length, 2);
  assert.ok(!out.html.includes('<svg onload'));
  assert.match(out.html, /&lt;svg onload/);
});
