import { fetchWithTimeout } from './http.js';

/** Fetch commits from the last `sinceHours` hours for one "owner/name" repo. */
export async function fetchGithubRepo(repo, { token, sinceHours = 24, fetchImpl, timeoutMs } = {}) {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const params = new URLSearchParams({ per_page: '10', since });

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'daily-digest/0.1',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}/commits?${params}`, {
    fetchImpl,
    timeoutMs,
    headers,
  });
  const commits = await res.json();

  return commits.map((c) => ({
    title: (c.commit?.message ?? '').split('\n')[0].trim() || '(no message)',
    url: c.html_url ?? null,
    summary: `by ${c.commit?.author?.name ?? c.author?.login ?? 'unknown'}`,
    source: repo,
    publishedAt: c.commit?.author?.date ?? null,
  }));
}
