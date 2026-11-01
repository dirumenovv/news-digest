import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const rssSource = z.object({
  name: z.string().min(1),
  url: z.url(),
  maxItems: z.number().int().positive().optional(),
});

const configSchema = z
  .object({
    title: z.string().default('Daily Digest'),
    recipients: z.array(z.email()).min(1, 'at least one recipient is required'),
    schedule: z
      .object({
        cron: z.string().default('0 7 * * *'),
        timezone: z.string().default('UTC'),
      })
      .prefault({}),
    maxItemsPerSource: z.number().int().positive().default(5),
    maxSummaryChars: z.number().int().positive().default(200),
    sources: z.object({
      rss: z.array(rssSource).default([]),
      weather: z
        .object({
          locationName: z.string().default('Your location'),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .optional(),
      github: z
        .object({
          repos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'use the form "owner/name"')).min(1),
        })
        .optional(),
    }),
    filters: z
      .object({
        includeKeywords: z.array(z.string()).default([]),
        excludeKeywords: z.array(z.string()).default([]),
      })
      .prefault({}),
    summarizer: z
      .object({
        enabled: z.boolean().default(false),
        maxWords: z.number().int().positive().default(40),
      })
      .prefault({}),
  })
  .refine(
    (c) => c.sources.rss.length > 0 || c.sources.weather || c.sources.github,
    { message: 'configure at least one source', path: ['sources'] },
  );

const smtpSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  MAIL_FROM: z.string().min(1),
});

function formatIssues(error) {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

export async function loadConfig(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new ConfigError(
      `Cannot read config file "${path}": ${err.message}. Copy config.example.json to config.json first.`,
    );
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Config file "${path}" is not valid JSON: ${err.message}`);
  }

  const result = configSchema.safeParse(json);
  if (!result.success) {
    throw new ConfigError(`Invalid config:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

export function loadEnv(config, { dryRun = false, env = process.env } = {}) {
  const issues = [];
  let smtp = null;

  if (!dryRun) {
    const parsed = smtpSchema.safeParse(env);
    if (parsed.success) {
      const d = parsed.data;
      smtp = { host: d.SMTP_HOST, port: d.SMTP_PORT, user: d.SMTP_USER, pass: d.SMTP_PASS, from: d.MAIL_FROM };
    } else {
      issues.push(...parsed.error.issues.map((i) => `  - ${i.path.join('.')}: missing or invalid`));
    }
  }

  if (config.summarizer.enabled && !env.LLM_API_KEY) {
    issues.push('  - LLM_API_KEY: required because summarizer.enabled is true');
  }

  if (issues.length > 0) {
    throw new ConfigError(`Invalid environment:\n${issues.join('\n')}`);
  }

  return {
    smtp,
    llmApiKey: env.LLM_API_KEY || null,
    githubToken: env.GITHUB_TOKEN || null,
    logLevel: env.LOG_LEVEL || 'info',
  };
}
