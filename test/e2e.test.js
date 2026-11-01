import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDigest } from '../src/pipeline.js';
import { main } from '../src/index.js';
import {
  silentLogger, res, makeFetch, fakeTransport, rssXml, happyRoutes, configObject,
  loadTestConfig, writeConfigFile, smtpEnv, liveEnv, dryEnv, fixedNow, weatherBody, githubBody, feedB,
} from './helpers.js';

const tmpOut = () => mkdtemp(join(tmpdir(), 'digest-out-'));
const count = (haystack, needle) => haystack.split(needle).length - 1;

test('dry run: full pipeline produces a correct, deduplicated, filtered digest and sends nothing', async () => {
  const config = await loadTestConfig();
  const fetchImpl = makeFetch(happyRoutes());
  const transport = fakeTransport();
  const outDir = await tmpOut();

  const result = await runDigest(config, dryEnv, { dryRun: true, logger: silentLogger, fetchImpl, transport, now: fixedNow, outDir });

  assert.equal(result.status, 'ok');
  assert.equal(result.delivery, null);
  assert.equal(transport.calls.length, 0);
  assert.equal(fetchImpl.calls.length, 4); // 2 feeds + weather + github

  const { html, text, subject } = result.digest;
  assert.match(subject, /^Test Digest · Thursday,? 29 October 2026$/);
  assert.equal(count(html, 'Node 25 released'), 1); // duplicate across feeds removed
  assert.ok(!html.includes('Sponsored')); // excluded keyword
  assert.match(html, /Unique B story/);
  assert.match(html, /Sofia: 12°C, partly cloudy/);
  assert.match(html, /Fix flaky test/);
  assert.ok(html.indexOf('Sofia:') < html.indexOf('Node 25 released')); // weather first
  assert.match(text, /\* Node 25 released/);
  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.stats.filtered, 1);

  assert.equal(await readFile(join(outDir, 'digest-preview.html'), 'utf8'), html);
  assert.equal(await readFile(join(outDir, 'digest-preview.txt'), 'utf8'), text);
});

test('live run: one message per recipient with the rendered digest', async () => {
  const config = await loadTestConfig();
  const transport = fakeTransport();

  const result = await runDigest(config, liveEnv, {
    logger: silentLogger, fetchImpl: makeFetch(happyRoutes()), transport, now: fixedNow, retryDelayMs: 0,
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.delivery.sent, ['a@example.com', 'b@example.com']);
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0].from, 'Digest <d@example.com>');
  assert.equal(transport.calls[0].subject, result.digest.subject);
  assert.match(transport.calls[0].html, /Node 25 released/);
  assert.match(transport.calls[1].text, /Unique B story/);
});

test('resilience: a failing source is reported in the digest and the rest still goes out', async () => {
  const config = await loadTestConfig();
  const routes = happyRoutes().map(([m, r]) => (m === 'open-meteo' ? [m, res({}, 500)] : [m, r]));
  const transport = fakeTransport();

  const result = await runDigest(config, liveEnv, {
    logger: silentLogger, fetchImpl: makeFetch(routes), transport, now: fixedNow, retryDelayMs: 0,
  });

  assert.equal(result.status, 'ok');
  assert.equal(transport.calls.length, 2);
  assert.match(result.digest.html, /Some sources were unavailable today: Weather/);
  assert.match(result.digest.html, /Node 25 released/);
  assert.ok(!result.digest.html.includes('Sofia:'));
});

test('when every source fails nothing is rendered or sent', async () => {
  const config = await loadTestConfig();
  const transport = fakeTransport();

  const result = await runDigest(config, liveEnv, {
    logger: silentLogger, fetchImpl: makeFetch([]), transport, retryDelayMs: 0,
  });

  assert.equal(result.status, 'all-sources-failed');
  assert.equal(result.digest, null);
  assert.equal(transport.calls.length, 0);
});

test('a rejected recipient is reported as a delivery failure while others still receive the digest', async () => {
  const config = await loadTestConfig();
  const transport = fakeTransport(['a@example.com']);

  const result = await runDigest(config, liveEnv, {
    logger: silentLogger, fetchImpl: makeFetch(happyRoutes()), transport, now: fixedNow, retryDelayMs: 0,
  });

  assert.equal(result.status, 'delivery-failed');
  assert.deepEqual(result.delivery.sent, ['b@example.com']);
  assert.equal(result.delivery.failed[0].recipient, 'a@example.com');
});

test('security: hostile feed content is escaped and unsafe links are removed end to end', async () => {
  const config = await loadTestConfig();
  const hostile = rssXml([
    { title: '&lt;script&gt;alert(1)&lt;/script&gt;', link: 'javascript:alert(1)', description: '&lt;img src=x onerror=alert(1)&gt;', pubDate: 'Thu, 29 Oct 2026 06:00:00 GMT' },
  ]);
  const routes = [
    ['a.test/feed', res(hostile)],
    ['b.test/feed', res(feedB)],
    ['open-meteo', res(weatherBody)],
    ['api.github.com', res(githubBody)],
  ];

  const result = await runDigest(config, dryEnv, {
    dryRun: true, logger: silentLogger, fetchImpl: makeFetch(routes), now: fixedNow, outDir: await tmpOut(),
  });

  const { html } = result.digest;
  assert.ok(!/<script>alert/.test(html));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
});

test('CLI dry run: reads a real config file, prints the digest and exits 0', async (t) => {
  const { path } = await writeConfigFile();
  const printed = [];
  t.mock.method(console, 'log', (...args) => printed.push(args.join(' ')));

  const code = await main(['--dry-run', '-c', path], {
    fetchImpl: makeFetch(happyRoutes()), outDir: await tmpOut(), logger: silentLogger, env: {}, now: fixedNow,
  });

  assert.equal(code, 0);
  assert.match(printed.join('\n'), /\* Node 25 released/);
});

test('CLI live run: sends through the injected transport and exits 0', async () => {
  const { path } = await writeConfigFile();
  const transport = fakeTransport();

  const code = await main(['-c', path], {
    fetchImpl: makeFetch(happyRoutes()), transport, logger: silentLogger, env: smtpEnv, now: fixedNow, retryDelayMs: 0,
  });

  assert.equal(code, 0);
  assert.equal(transport.calls.length, 2);
});

test('CLI live run without SMTP settings fails fast, before any network call', async () => {
  const { path } = await writeConfigFile();
  const fetchImpl = makeFetch(happyRoutes());

  const code = await main(['-c', path], { fetchImpl, logger: silentLogger, env: {} });

  assert.equal(code, 1);
  assert.equal(fetchImpl.calls.length, 0);
});

test('CLI exits 1 on a missing config file, 2 on an unknown flag, 0 on --help', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});

  assert.equal(await main(['-c', '/nonexistent/config.json'], { logger: silentLogger, env: {} }), 1);
  assert.equal(await main(['--bogus']), 2);
  assert.equal(await main(['--help']), 0);
});

test('CLI exits 1 when delivery fails for any recipient', async () => {
  const { path } = await writeConfigFile();
  const transport = fakeTransport(['b@example.com']);

  const code = await main(['-c', path], {
    fetchImpl: makeFetch(happyRoutes()), transport, logger: silentLogger, env: smtpEnv, now: fixedNow, retryDelayMs: 0,
  });

  assert.equal(code, 1);
});
