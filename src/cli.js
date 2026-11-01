import { parseArgs } from 'node:util';

export const HELP_TEXT = `Daily Digest

Usage: node src/index.js [options]

Options:
  --dry-run          Build the digest but do not send the email
  -c, --config PATH  Path to the config file (default: config.json)
  -v, --verbose      Show debug logs
  -h, --help         Show this help
`;

export function parseCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      config: { type: 'string', short: 'c', default: 'config.json' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  return {
    dryRun: values['dry-run'],
    configPath: values.config,
    verbose: values.verbose,
    help: values.help,
  };
}
