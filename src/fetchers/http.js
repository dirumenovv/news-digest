export class HttpError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * fetch() with a hard timeout and non-2xx responses turned into errors.
 * `fetchImpl` is injectable so tests never touch the network.
 */
export async function fetchWithTimeout(
  url,
  { timeoutMs = 10_000, headers = {}, fetchImpl = globalThis.fetch } = {},
) {
  let res;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new HttpError(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw new HttpError(`Network error for ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new HttpError(`HTTP ${res.status} for ${url}`, { status: res.status });
  }
  return res;
}
