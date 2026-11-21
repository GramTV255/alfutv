'use strict';

const fmt = (level, msg, meta) => {
  const line = { t: new Date().toISOString(), level, msg };
  if (meta !== undefined) line.meta = meta instanceof Error ? { message: meta.message, stack: meta.stack } : meta;
  return JSON.stringify(line);
};

module.exports = {
  info: (m, meta) => console.log(fmt('info', m, meta)),
  warn: (m, meta) => console.warn(fmt('warn', m, meta)),
  error: (m, meta) => console.error(fmt('error', m, meta)),
};
