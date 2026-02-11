/**
 * Offline sprite baker — runs Three.js in Puppeteer to render 3D model to sprite sheet.
 * Usage: npm run bake-sprites
 *
 * Prerequisites: npm run build:baker (builds the browser runner)
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function serveDir(dir: string, port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url === '/' ? '/scripts/bake.html' : (req.url ?? '/').split('?')[0];
      const file = path.join(dir, urlPath.replace(/^\//, ''));
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(file);
        const types: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.json': 'application/json',
        };
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

async function main(): Promise<void> {
  const puppeteer = await import('puppeteer');

  const projectRoot = path.resolve(__dirname, '..');
  const distBake = path.join(projectRoot, 'dist-bake');
  const outputPath = path.join(projectRoot, 'public', 'sprites', 'enemy-guard.png');

  const port = 39482;
  const server = await serveDir(distBake, port);
  const bakeUrl = `http://127.0.0.1:${port}/scripts/bake.html`;

  console.log('Launching browser...');
  const browser = await puppeteer.default.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(bakeUrl, {
      waitUntil: 'networkidle0',
      timeout: 10000,
    });

    await page.waitForFunction(
      () => typeof (window as unknown as { __runBake?: unknown }).__runBake === 'function',
      { timeout: 5000 },
    );

    const result = await page.evaluate(async () => {
      const win = window as unknown as { __runBake?: () => Promise<string> };
      if (!win.__runBake) {
        throw new Error('Bake runner not loaded. Run "npm run build:baker" first.');
      }
      return win.__runBake();
    });

    if (!result || typeof result !== 'string' || !result.startsWith('data:image/png')) {
      throw new Error('Bake failed: no image data returned');
    }

    const base64 = result.split(',')[1];
    if (!base64) throw new Error('Invalid base64 data');
    const buffer = Buffer.from(base64, 'base64');

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, buffer);
    console.log(`Wrote ${outputPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
