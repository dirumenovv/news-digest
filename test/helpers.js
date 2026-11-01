import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';

export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

export const res = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

/** Fake fetch. Routes are [urlSubstring, response]. Any unrouted URL fails the test loudly. */
export function makeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    for (const [match, response] of routes) {
      if (String(url).includes(match)) return response;
    }
    throw new Error(`Unexpected network call in test: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

export function fakeTransport(rejectFor = []) {
  const calls = [];
  return {
    calls,
    sendMail: async (msg) => {
      calls.push(msg);
      if (rejectFor.includes(msg.to)) throw new Error('mailbox rejected');
    },
  };
}

export function rssXml(items) {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link>` +
        `<description>${i.description ?? ''}</description>` +
        (i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : '') +
        '</item>',
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${body}</channel></rss>`;
}

export const weatherBody = {
  current: { temperature_2m: 12.4, weather_code: 2, wind_speed_10m: 9.6 },
  daily: { temperature_2m_max: [15.2], temperature_2m_min: [6.1], precipitation_probability_max: [20] },
};

export const githubBody = [
  { html_url: 'https://github.com/o/r/commit/1', commit: { message: 'Fix flaky test', author: { name: 'Ada', date: '2026-10-29T04:00:00Z' } } },
];

export const feedA = rssXml([
  { title: 'Node 25 released', link: 'https://a.test/1?utm_source=x', description: '&lt;p&gt;Big &lt;b&gt;release&lt;/b&gt;&lt;/p&gt;', pubDate: 'Thu, 29 Oct 2026 06:00:00 GMT' },
  { title: 'Sponsored: buy now', link: 'https://a.test/2', pubDate: 'Thu, 29 Oct 2026 05:00:00 GMT' },
  { title: 'Older post', link: 'https://a.test/3', pubDate: 'Wed, 28 Oct 2026 05:00:00 GMT' },
]);

export const feedB = rssXml([
  { title: 'Node 25 released', link: 'https://www.a.test/1', pubDate: 'Thu, 29 Oct 2026 06:00:00 GMT' },
  { title: 'Unique B story', link: 'https://b.test/9', pubDate: 'Thu, 29 Oct 2026 04:30:00 GMT' },
]);

export const happyRoutes = () => [
  ['a.test/feed', res(feedA)],
  ['b.test/feed', res(feedB)],
  ['open-meteo', res(weatherBody)],
  ['api.github.com/repos/o/r/commits', res(githubBody)],
];

export const configObject = {
  title: 'Test Digest',
  recipients: ['a@example.com', 'b@example.com'],
  schedule: { timezone: 'Europe/Sofia' },
  sources: {
    rss: [
      { name: 'Feed A', url: 'https://a.test/feed' },
      { name: 'Feed B', url: 'https://b.test/feed' },
    ],
    weather: { locationName: 'Sofia', latitude: 42.69, longitude: 23.32 },
    github: { repos: ['o/r'] },
  },
  filters: { excludeKeywords: ['sponsored'] },
};

export async function writeConfigFile(obj = configObject) {
  const dir = await mkdtemp(join(tmpdir(), 'digest-e2e-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify(obj));
  return { dir, path };
}

export async function loadTestConfig(obj = configObject) {
  const { path } = await writeConfigFile(obj);
  return loadConfig(path);
}

export const smtpEnv = { SMTP_HOST: 'h', SMTP_PORT: '2525', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'Digest <d@example.com>' };
export const liveEnv = { smtp: { host: 'h', port: 2525, user: 'u', pass: 'p', from: 'Digest <d@example.com>' }, githubToken: null };
export const dryEnv = { smtp: null, githubToken: null };
export const fixedNow = new Date('2026-10-29T05:00:00Z');
