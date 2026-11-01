import { fetchWithTimeout, HttpError } from './http.js';

// WMO weather interpretation codes used by Open-Meteo
const WMO = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

/** Fetch today's weather from Open-Meteo (no API key needed). */
export async function fetchWeather(weather, { fetchImpl, timeoutMs } = {}) {
  const params = new URLSearchParams({
    latitude: String(weather.latitude),
    longitude: String(weather.longitude),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  });

  const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {
    fetchImpl,
    timeoutMs,
  });
  const data = await res.json();

  const cur = data?.current;
  const day = data?.daily;
  if (!cur || !day || cur.temperature_2m == null || day.temperature_2m_max?.[0] == null) {
    throw new HttpError('Unexpected response shape from Open-Meteo');
  }

  const description = WMO[cur.weather_code] ?? 'unknown conditions';
  const rain = day.precipitation_probability_max?.[0];

  return [
    {
      title: `${weather.locationName}: ${Math.round(cur.temperature_2m)}°C, ${description}`,
      url: 'https://open-meteo.com/',
      summary:
        `High ${Math.round(day.temperature_2m_max[0])}° / Low ${Math.round(day.temperature_2m_min[0])}°` +
        (rain != null ? `, ${rain}% chance of rain` : '') +
        `, wind ${Math.round(cur.wind_speed_10m)} km/h`,
      source: 'Open-Meteo',
      publishedAt: null,
    },
  ];
}
