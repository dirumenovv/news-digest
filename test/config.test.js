import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadEnv, ConfigError } from '../src/config.js';
import { parseCli } from '../src/cli.js';

async function writeTemp(obj) {
  const dir = await mkdtemp(join(tmpdir(), 'digest-'));
  const path = join(dir, 'config.json');
  await writeFile(path, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return path;
}

const valid = {
  recipients: ['a@example.com'],
  sources: { rss: [{ name: 'Test', url: 'https://example.com/feed.xml' }] },
};

test('loadConfig applies defaults to a minimal valid config', async () => {
  const cfg = await loadConfig(await writeTemp(valid));
  assert.equal(cfg.title, 'Daily Digest');
  assert.equal(cfg.maxItemsPerSource, 5);
  assert.equal(cfg.maxSummaryChars, 200);
  assert.equal(cfg.summarizer.enabled, false);
});

test('loadConfig rejects a missing file with a helpful message', async () => {
  await assert.rejects(loadConfig('/nonexistent/config.json'), (e) => e instanceof ConfigError && /config.example.json/.test(e.message));
});

test('loadConfig rejects invalid JSON', async () => {
  await assert.rejects(loadConfig(await writeTemp('{ nope')), /not valid JSON/);
});

test('loadConfig rejects bad email and missing sources', async () => {
  await assert.rejects(loadConfig(await writeTemp({ ...valid, recipients: ['not-an-email'] })), /recipients/);
  await assert.rejects(loadConfig(await writeTemp({ ...valid, sources: {} })), /at least one source/);
});

test('loadEnv requires SMTP settings unless dry run', async () => {
  const cfg = await loadConfig(await writeTemp(valid));
  assert.throws(() => loadEnv(cfg, { env: {} }), ConfigError);
  assert.equal(loadEnv(cfg, { dryRun: true, env: {} }).smtp, null);
});

test('loadEnv reads SMTP settings and coerces the port', async () => {
  const cfg = await loadConfig(await writeTemp(valid));
  const env = { SMTP_HOST: 'h', SMTP_PORT: '2525', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'x@y.z' };
  assert.equal(loadEnv(cfg, { env }).smtp.port, 2525);
});

test('loadEnv requires LLM_API_KEY when summarizer is enabled', async () => {
  const cfg = await loadConfig(await writeTemp({ ...valid, summarizer: { enabled: true } }));
  assert.throws(() => loadEnv(cfg, { dryRun: true, env: {} }), /LLM_API_KEY/);
});

test('parseCli parses flags and defaults', () => {
  assert.deepEqual(parseCli([]), { dryRun: false, configPath: 'config.json', verbose: false, help: false });
  const cli = parseCli(['--dry-run', '-c', 'x.json', '-v']);
  assert.equal(cli.dryRun, true);
  assert.equal(cli.configPath, 'x.json');
  assert.equal(cli.verbose, true);
});

test('parseCli throws on unknown flags', () => {
  assert.throws(() => parseCli(['--bogus']));
});
