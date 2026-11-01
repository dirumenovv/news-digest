import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchAll } from './fetchers/index.js';
import { processSections } from './processing.js';
import { renderDigest } from './render.js';
import { sendDigest } from './mailer.js';

/**
 * The whole pipeline: fetch -> process -> render -> (preview | send).
 * Network, mail transport, clock and output folder are injectable so the
 * pipeline can be tested end to end without touching the outside world.
 *
 * Returns { status, sections, stats, digest, delivery } where status is
 * 'ok' | 'all-sources-failed' | 'delivery-failed'.
 */
export async function runDigest(
  config,
  env,
  { dryRun = false, logger, fetchImpl, transport, now, outDir = 'out', timeoutMs, retryDelayMs } = {},
) {
  const fetched = await fetchAll(config, env, { logger, fetchImpl, timeoutMs });
  const failed = fetched.filter((s) => s.error);
  const total = fetched.reduce((n, s) => n + s.items.length, 0);
  logger?.info(`Fetched ${total} item(s) from ${fetched.length - failed.length}/${fetched.length} sources`);

  if (failed.length === fetched.length) {
    logger?.error('Every source failed; nothing to send.');
    return { status: 'all-sources-failed', sections: fetched, stats: null, digest: null, delivery: null };
  }

  const { sections, stats } = processSections(fetched, config);
  logger?.info(
    `Processed: ${stats.duplicates} duplicate(s) removed, ` +
      `${stats.filtered} filtered by keywords, ${stats.limited} over the item limit`,
  );

  const digest = await renderDigest(sections, config, { now });
  logger?.info(`Rendered "${digest.subject}" (${digest.html.length} bytes HTML, ${digest.text.length} bytes text)`);

  if (dryRun) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'digest-preview.html'), digest.html);
    await writeFile(join(outDir, 'digest-preview.txt'), digest.text);
    logger?.info(`Dry run: previews written to ${join(outDir, 'digest-preview.html')} and .txt`);
    return { status: 'ok', sections, stats, digest, delivery: null };
  }

  const delivery = await sendDigest(digest, config, env.smtp, { logger, transport, retryDelayMs });
  logger?.info(`Delivery: ${delivery.sent.length} sent, ${delivery.failed.length} failed`);

  return {
    status: delivery.failed.length > 0 ? 'delivery-failed' : 'ok',
    sections,
    stats,
    digest,
    delivery,
  };
}
