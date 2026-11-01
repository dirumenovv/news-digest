import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { parseCli, HELP_TEXT } from './cli.js';
import { loadConfig, loadEnv, ConfigError } from './config.js';
import { createLogger } from './logger.js';
import { runDigest } from './pipeline.js';

/**
 * CLI entry point. Returns the process exit code:
 * 0 = success, 1 = config/runtime/delivery failure, 2 = bad command-line usage.
 * `deps` lets tests inject the network, mail transport, environment and output folder.
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  let cli;
  try {
    cli = parseCli(argv);
  } catch (err) {
    console.error(`${err.message}\n\n${HELP_TEXT}`);
    return 2;
  }

  if (cli.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  const logger = deps.logger ?? createLogger(cli.verbose ? 'debug' : process.env.LOG_LEVEL || 'info');

  try {
    const config = await loadConfig(cli.configPath);
    const env = loadEnv(config, { dryRun: cli.dryRun, env: deps.env ?? process.env });

    logger.info(`Loaded config "${config.title}" (${cli.dryRun ? 'dry run' : 'live run'})`);
    logger.info(
      `Sources: ${config.sources.rss.length} RSS, ` +
        `weather ${config.sources.weather ? 'on' : 'off'}, ` +
        `github ${config.sources.github ? 'on' : 'off'}`,
    );
    logger.debug('Recipients', config.recipients);

    const result = await runDigest(config, env, {
      dryRun: cli.dryRun,
      logger,
      fetchImpl: deps.fetchImpl,
      transport: deps.transport,
      now: deps.now,
      outDir: deps.outDir,
      retryDelayMs: deps.retryDelayMs,
    });

    if (cli.dryRun && result.digest) console.log(`\n${result.digest.text}`);
    return result.status === 'ok' ? 0 : 1;
  } catch (err) {
    if (err instanceof ConfigError) {
      logger.error(err.message);
      return 1;
    }
    logger.error(`Unexpected error: ${err.stack}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
