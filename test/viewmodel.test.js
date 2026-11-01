import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViewModel, renderText, safeUrl } from '../src/viewmodel.js';
import { sectionIcon } from '../src/icons.js';

const config = { title: 'Morning Digest', schedule: { timezone: 'Europe/Sofia' } };
const now = new Date('2026-10-29T05:00:00Z');
const item = (title, extra = {}) => ({ title, url: 'https://example.com/a', summary: '', source: 'S', publishedAt: null, ...extra });
const section = (id, type, items, error = null) => ({ id, title: id, type, items, error });

test('safeUrl allows http(s) only', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(null), null);
});

test('view model has a dated subject in the configured timezone', () => {
  const vm = buildViewModel([section('rss:A', 'news', [item('x')])], config, { now });
  assert.match(vm.dateLabel, /Thursday,? 29 October 2026/);
  assert.match(vm.subject, /^Morning Digest · /);
});

test('weather is ordered first, empty sections are skipped, failures are listed', () => {
  const vm = buildViewModel(
    [
      section('rss:A', 'news', [item('News')]),
      section('rss:Empty', 'news', []),
      section('rss:Broken', 'news', [], 'HTTP 500'),
      section('weather', 'weather', [item('Sofia: 12°C')]),
    ],
    config,
    { now },
  );
  assert.deepEqual(vm.sections.map((s) => s.title), ['weather', 'rss:A']);
  assert.deepEqual(vm.unavailable, ['rss:Broken']);
  assert.equal(vm.totalItems, 2);
  assert.equal(vm.isEmpty, false);
});

test('unsafe links are dropped from the view model but the item stays', () => {
  const vm = buildViewModel([section('rss:A', 'news', [item('Bad', { url: 'javascript:alert(1)' })])], config, { now });
  assert.equal(vm.sections[0].items[0].url, null);
  assert.equal(vm.sections[0].items[0].title, 'Bad');
});

test('item dates are formatted in the configured timezone', () => {
  const vm = buildViewModel([section('rss:A', 'news', [item('T', { publishedAt: '2026-10-29T05:30:00.000Z' })])], config, { now });
  assert.match(vm.sections[0].items[0].meta, /29 Oct,? 07:30/);
});

test('an invalid timezone falls back to UTC instead of crashing', () => {
  const vm = buildViewModel([section('rss:A', 'news', [item('T')])], { title: 'D', schedule: { timezone: 'Mars/Base' } }, { now });
  assert.match(vm.dateLabel, /29 October 2026/);
});

test('an all-empty digest says so', () => {
  const vm = buildViewModel([section('rss:A', 'news', [])], config, { now });
  assert.equal(vm.isEmpty, true);
  assert.match(renderText(vm), /No new items today/);
});

test('plain text contains titles, summaries, links and unavailable sources', () => {
  const vm = buildViewModel(
    [
      section('rss:A', 'news', [item('Hello', { summary: 'A summary' })]),
      section('rss:Broken', 'news', [], 'boom'),
    ],
    config,
    { now },
  );
  const text = renderText(vm);
  assert.match(text, /\* Hello/);
  assert.match(text, /A summary/);
  assert.match(text, /https:\/\/example\.com\/a/);
  assert.match(text, /Unavailable sources today: rss:Broken/);
});

test('activity sections come after news sections', () => {
  const vm = buildViewModel(
    [section('github:o/r', 'activity', [item('Commit')]), section('rss:A', 'news', [item('News')])],
    config,
    { now },
  );
  assert.deepEqual(vm.sections.map((s) => s.title), ['rss:A', 'github:o/r']);
});

test('each section type gets its own SVG icon, with a fallback for unknown types', () => {
  assert.match(sectionIcon('weather'), /^<svg /);
  assert.notEqual(sectionIcon('weather'), sectionIcon('news'));
  assert.notEqual(sectionIcon('news'), sectionIcon('activity'));
  assert.equal(sectionIcon('something-else'), sectionIcon('news'));
  assert.match(sectionIcon('news'), /aria-hidden="true"/);
});

test('section view models carry the icon for their type', () => {
  const vm = buildViewModel([section('weather', 'weather', [item('W')]), section('rss:A', 'news', [item('N')])], config, { now });
  assert.equal(vm.sections[0].icon, sectionIcon('weather'));
  assert.equal(vm.sections[1].icon, sectionIcon('news'));
});
