const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleAuth, isAuth, handleLogout, checkEmailExists } = require('./user');
const { parseCookies, verifySession } = require('./utils');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
const PORT = process.env.PORT || 3000;

// Protected routes that require authentication
const PROTECTED_ROUTES = [
  '/wiki'
];

function serveStaticFile(res, filePath, headers = {}) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('File Not Found');
        return;
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error');
        return;
      }
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, ...headers });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  // Handle API requests
  if (url.startsWith('/api')) {
    console.log('API request received:', url);

    if (url === '/api/serveForm/login' && method === 'GET') {
      serveStaticFile(res, 'public/forms/login.html');
      return;
    } else if (url === '/api/serveForm/register' && method === 'GET') {
      serveStaticFile(res, 'public/forms/register.html');
      return;
    } else if (url === '/api/user/auth' && method === 'POST') {
      handleAuth(req, res);
      return;
    } else if (url === '/api/user/check-email' && method === 'POST') {
      checkEmailExists(req, res);
      return;
    } else if (url === '/api/user/check-auth' && method === 'GET') {
      isAuth(req, res);
      return;
    } else if (url === '/api/user/logout' && method === 'POST') {
      handleLogout(req, res);
      return;
    } else {
      res.statusCode = 404;
      res.end('API Endpoint Not Found');
      return;
    }
  }

  // Handle root path and auth page - check if already logged in
  if (url === '/' || url === '/auth.html') {
    const { authorized } = await verifySession(req);
    if (authorized) {
      // If already logged in, redirect to wiki
      res.writeHead(302, { 'Location': '/wiki' });
      res.end();
      return;
    }
    serveStaticFile(res, 'public/auth.html');
    return;
  }
  // Check authentication for protected routes
  else if (PROTECTED_ROUTES.some(route => url === route || url.startsWith(`${route}/`))) {
    const { authorized } = await verifySession(req);
    if (!authorized) {
      res.writeHead(302, { 'Location': '/' });
      res.end();
      return;
    }

    if (url === '/wiki') {
      serveStaticFile(res, 'public/wiki.html');
      return;
    }
  }

  // Check if file exists in public directory and serve it
  const filePath = path.join('public', url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveStaticFile(res, filePath);
    return;
  }

  // Fallback - redirect to home
  res.writeHead(302, { 'Location': '/' });
  res.end();
});

server.listen(PORT, HOSTNAME, () => {
  console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});