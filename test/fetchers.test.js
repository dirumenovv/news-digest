import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTimeout, HttpError } from '../src/fetchers/http.js';
import { fetchWeather } from '../src/fetchers/weather.js';
import { fetchGithubRepo } from '../src/fetchers/github.js';

const ok = (body, status = 200) => async () => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test('fetchWithTimeout turns non-2xx responses into HttpError', async () => {
  await assert.rejects(fetchWithTimeout('https://x.test', { fetchImpl: ok({}, 503) }), (e) => e instanceof HttpError && e.status === 503);
});

test('fetchWithTimeout reports timeouts clearly', async () => {
  const fetchImpl = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  await assert.rejects(fetchWithTimeout('https://x.test', { fetchImpl, timeoutMs: 50 }), /timed out after 50ms/);
});

test('fetchWithTimeout wraps network errors', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(fetchWithTimeout('https://x.test', { fetchImpl }), /Network error/);
});

const weatherBody = {
  current: { temperature_2m: 12.4, weather_code: 2, wind_speed_10m: 9.6 },
  daily: { temperature_2m_max: [15.2], temperature_2m_min: [6.1], precipitation_probability_max: [20] },
};

test('fetchWeather builds one readable item', async () => {
  let calledUrl;
  const fetchImpl = async (url) => { calledUrl = url; return ok(weatherBody)(); };
  const [item] = await fetchWeather({ locationName: 'Sofia', latitude: 42.69, longitude: 23.32 }, { fetchImpl });
  assert.equal(item.title, 'Sofia: 12°C, partly cloudy');
  assert.match(item.summary, /High 15° \/ Low 6°, 20% chance of rain, wind 10 km\/h/);
  assert.match(calledUrl, /latitude=42\.69/);
});

test('fetchWeather rejects an unexpected response shape', async () => {
  await assert.rejects(fetchWeather({ locationName: 'X', latitude: 0, longitude: 0 }, { fetchImpl: ok({}) }), /Unexpected response/);
});

const commits = [
  { html_url: 'https://github.com/o/r/commit/1', commit: { message: 'Fix bug\n\nlong body', author: { name: 'Ada', date: '2026-10-29T08:00:00Z' } } },
];

test('fetchGithubRepo maps commits and sends the token when provided', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return ok(commits)(); };
  const items = await fetchGithubRepo('o/r', { token: 't0ken', fetchImpl });
  assert.equal(items[0].title, 'Fix bug');
  assert.equal(items[0].summary, 'by Ada');
  assert.equal(items[0].source, 'o/r');
  assert.equal(seen.init.headers.Authorization, 'Bearer t0ken');
  assert.match(seen.url, /since=/);
});

test('fetchGithubRepo sends no Authorization header without a token', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = init; return ok([])(); };
  await fetchGithubRepo('o/r', { fetchImpl });
  assert.equal(seen.headers.Authorization, undefined);
});
