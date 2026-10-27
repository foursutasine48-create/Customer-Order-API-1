const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, 'dist', 'project-web', 'browser');
const indexFile = path.join(publicDirectory, 'index.html');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  const filePath = path.resolve(publicDirectory, `.${pathname}`);
  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  const serveFile = (targetPath) => {
    const stream = fs.createReadStream(targetPath);
    stream.on('error', () => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Internal Server Error');
    });
    stream.on('open', () => {
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(targetPath).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': targetPath === indexFile ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      if (request.method === 'HEAD') {
        stream.destroy();
        response.end();
      } else {
        stream.pipe(response);
      }
    });
  };

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      serveFile(filePath);
      return;
    }

    if (path.extname(pathname)) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    if (error && error.code !== 'ENOENT') {
      response.writeHead(500);
      response.end('Unable to read production build');
      return;
    }

    if (!fs.existsSync(indexFile)) {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Production build not found. Run "npm run build" first.');
      return;
    }

    serveFile(indexFile);
  });
});

const port = Number(process.env.PORT) || 4200;

server.listen(port, '0.0.0.0', () => {
  console.log(`Production frontend server is listening on port ${port}`);
});
