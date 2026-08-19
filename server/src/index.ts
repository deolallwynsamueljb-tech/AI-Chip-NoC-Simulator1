import 'dotenv/config';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { router } from './routes';
import { assistantRouter } from './assistant';
import { attachWebSocketServer } from './ws';

const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use(express.json());
app.use('/api', router);
app.use('/api/assistant', assistantRouter);

// Production: this same process also serves the built frontend bundle.
// Both `dist/` (vite build) and the bundled `server.js` (esbuild) land at
// the repo root, and npm scripts always run with that as cwd - so resolve
// relative to cwd rather than import.meta.url, which points inside the
// bundle after esbuild flattens everything into one file.
const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);
attachWebSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`NoC simulator server listening on http://localhost:${PORT}`);
});
