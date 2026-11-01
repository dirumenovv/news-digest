// Static inline SVG icons for section headers. These strings are written by us,
// never derived from feed content, which is why the template may render them unescaped.
const COLOR = '#1f3a5f';

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
  `aria-hidden="true" focusable="false">${inner}</svg>`;

const ICONS = {
  // sun peeking out from behind a cloud
  weather: svg(
    '<circle cx="7.5" cy="7.5" r="2.5"/><path d="M7.5 1.8v1.4M1.8 7.5h1.4M3.4 3.4l1 1M11.6 3.4l-1 1"/>' +
      '<path d="M9 21a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 19 14a3.5 3.5 0 0 1-.5 7z"/>',
  ),
  // document with text lines
  news: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  // git commit: a node on a line
  activity: svg('<circle cx="12" cy="12" r="3.5"/><path d="M2.5 12h6M15.5 12h6"/>'),
};

export function sectionIcon(type) {
  return ICONS[type] ?? ICONS.news;
}
