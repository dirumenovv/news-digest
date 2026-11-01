import { sectionIcon } from './icons.js';

const TYPE_ORDER = { weather: 0, news: 1, activity: 2 };

/** Only http(s) links are allowed in the email; blocks javascript:, data:, etc. */
export function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function makeFormatter(options, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
  }
}

/** Turns processed sections into the plain data the templates render. */
export function buildViewModel(sections, config, { now = new Date() } = {}) {
  const tz = config.schedule?.timezone ?? 'UTC';
  const dateLabel = makeFormatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, tz).format(now);
  const itemDate = makeFormatter({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, tz);

  const formatItemDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : itemDate.format(d);
  };

  const shown = sections
    .filter((s) => !s.error && s.items.length > 0)
    .map((s) => ({
      title: s.title,
      type: s.type,
      icon: sectionIcon(s.type),
      isWeather: s.type === 'weather',
      items: s.items.map((i) => ({
        title: i.title,
        url: safeUrl(i.url),
        summary: i.summary,
        meta: formatItemDate(i.publishedAt),
      })),
    }))
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 1) - (TYPE_ORDER[b.type] ?? 1));

  const unavailable = sections.filter((s) => s.error).map((s) => s.title);

  return {
    title: config.title,
    subject: `${config.title} · ${dateLabel}`,
    dateLabel,
    sections: shown,
    totalItems: shown.reduce((n, s) => n + s.items.length, 0),
    isEmpty: shown.length === 0,
    unavailable,
    hasUnavailable: unavailable.length > 0,
  };
}

/** Plain-text fallback for email clients that do not render HTML. */
export function renderText(vm) {
  const lines = [`${vm.title} - ${vm.dateLabel}`, ''];

  if (vm.isEmpty) lines.push('No new items today.', '');

  for (const section of vm.sections) {
    lines.push(section.title.toUpperCase(), '-'.repeat(section.title.length));
    for (const item of section.items) {
      lines.push(`* ${item.title}`);
      if (item.summary) lines.push(`  ${item.summary}`);
      if (item.url) lines.push(`  ${item.url}`);
      lines.push('');
    }
  }

  if (vm.hasUnavailable) lines.push(`Unavailable sources today: ${vm.unavailable.join(', ')}`);

  return `${lines.join('\n').trimEnd()}\n`;
}
