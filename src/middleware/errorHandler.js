'use strict';
const logger = require('../utils/logger');

function notFound(req, res) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Haipatikani', code: 'NOT_FOUND' });
  res.status(404).sendFile(require('path').join(__dirname, '..', '..', 'public', '404.html'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON si sahihi', code: 'BAD_JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Data ni kubwa mno', code: 'TOO_LARGE' });
  if (err && err.code === '23505') return res.status(409).json({ error: 'Rekodi hii tayari ipo', code: 'DUPLICATE' });
  if (err && err.code === '23503') return res.status(409).json({ error: 'Kitendo hakiruhusiwi kwa sababu rekodi inatumika mahali pengine', code: 'IN_USE' });
  const status = err.status || 500;
  if (status >= 500) logger.error(`${req.method} ${req.path}`, err);
  const body = { error: status >= 500 && !err.expose ? 'Hitilafu ya seva. Jaribu tena.' : err.message, code: err.code || (status >= 500 ? 'SERVER_ERROR' : 'ERROR') };
  // Public text API keeps plain text errors
  if (req.path.startsWith('/api/v1/')) return res.status(status).type('text/plain').send(status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 503 ? 'Service Unavailable' : body.error);
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
