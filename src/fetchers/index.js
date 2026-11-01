import { fetchRss } from './rss.js';
import { fetchWeather } from './weather.js';
import { fetchGithubRepo } from './github.js';

/**
 * Runs every configured fetcher in parallel. A failing source never throws:
 * it becomes a section with `error` set and no items.
 *
 * Section shape: { id, title, type: 'news'|'weather'|'activity', items, error }
 * Item shape:    { title, url, summary, source, publishedAt }
 */
export async function fetchAll(config, env = {}, { logger, fetchImpl, timeoutMs } = {}) {
  const opts = { fetchImpl, timeoutMs };
  const tasks = [];

  for (const source of config.sources.rss) {
    tasks.push({ id: `rss:${source.name}`, title: source.name, type: 'news', run: () => fetchRss(source, opts) });
  }
  if (config.sources.weather) {
    tasks.push({ id: 'weather', title: 'Weather', type: 'weather', run: () => fetchWeather(config.sources.weather, opts) });
  }
  if (config.sources.github) {
    for (const repo of config.sources.github.repos) {
      tasks.push({
        id: `github:${repo}`,
        title: `GitHub: ${repo}`,
        type: 'activity',
        run: () => fetchGithubRepo(repo, { ...opts, token: env.githubToken }),
      });
    }
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));

  return settled.map((result, i) => {
    const { id, title, type } = tasks[i];
    if (result.status === 'fulfilled') {
      logger?.info(`Fetched ${result.value.length} item(s) from ${id}`);
      return { id, title, type, items: result.value, error: null };
    }
    logger?.warn(`Source ${id} failed: ${result.reason.message}`);
    return { id, title, type, items: [], error: result.reason.message };
  });
}
