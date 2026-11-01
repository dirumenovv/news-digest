const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

export function createLogger(level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const log = (name, message, meta) => {
    if (LEVELS[name] > threshold) return;
    const line = `${new Date().toISOString()} [${name.toUpperCase()}] ${message}`;
    const out = name === 'error' || name === 'warn' ? console.error : console.log;
    meta === undefined ? out(line) : out(line, meta);
  };

  return {
    error: (m, meta) => log('error', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    info: (m, meta) => log('info', m, meta),
    debug: (m, meta) => log('debug', m, meta),
  };
}
