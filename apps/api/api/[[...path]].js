// Catch-all: /api and /api/* go to the Nest app (dist/vercel-entry.js)
const handler = require('../dist/vercel-entry').default;

module.exports = (req, res) => {
  const pathSegments = req.query.path;
  const path = Array.isArray(pathSegments) ? pathSegments : pathSegments ? [pathSegments] : [];
  const pathStr = path.length ? '/' + path.join('/') : '';
  const qs = (req.url && req.url.includes('?')) ? '?' + req.url.split('?')[1] : '';
  req.url = '/api' + pathStr + qs;
  return handler(req, res);
};
