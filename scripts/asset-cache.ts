import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

import { copyDirectoryContents } from './copy-dir';
import { type Asset, downloadAssets } from './download-assets';

// scripts/ sits directly under the repo root, and this module exists only inside the monorepo, so
// its own location is a reliable repo-root anchor. A copied-out standalone example has no
// asset-cache module to import, so it can never resolve a shared cache — it falls back to the plain
// public/assets path, which is exactly the standard, plumbing-free behavior.
const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

const MIME: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.utf8': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface AssetTarget {
  consumer: string;
  outDir: string; // where the manifest's files are downloaded and served from
  usingCache: boolean; // true → shared .cache/assets pool; false → the consumer's own public/assets
}

// The shared, gitignored download cache used by every in-repo consumer. Each downloads its manifest
// into a per-consumer subfolder here, and the asset-server plugin serves that subfolder at /assets.
// Set FLIGHT_ASSET_CACHE to relocate the pool, or FLIGHT_ASSET_CACHE=off to force the standard
// per-project public/assets path — the same path a copied-out standalone example uses.
export function getAssetCacheDir(): string | null {
  const override = process.env['FLIGHT_ASSET_CACHE'];
  if (override === 'off' || override === '0') return null;
  if (override && override.length > 0) return resolve(override);
  return join(repoRoot, '.cache', 'assets');
}

// Resolve where one consumer's assets are downloaded to and served from. manifestDir is the
// directory holding assets.manifest.json (an example package, or a suite's assets/<suite> folder).
export function resolveAssetTarget(manifestDir: string): AssetTarget {
  const consumer = basename(manifestDir);
  const cacheDir = getAssetCacheDir();
  if (cacheDir) return { consumer, outDir: join(cacheDir, consumer), usingCache: true };
  return { consumer, outDir: join(manifestDir, 'public', 'assets'), usingCache: false };
}

// Read a consumer's assets.manifest.json. Returns the declared asset list.
export function readAssetManifest(manifestDir: string): Asset[] {
  const parsed = JSON.parse(readFileSync(join(manifestDir, 'assets.manifest.json'), 'utf8')) as {
    assets: Asset[];
  };
  return parsed.assets;
}

// Download one consumer's manifest into its resolved target. Reuses the shared, portable
// downloadAssets unchanged; only the target directory is chosen here.
export async function downloadConsumerAssets(manifestDir: string): Promise<AssetTarget> {
  const target = resolveAssetTarget(manifestDir);
  await downloadAssets(readAssetManifest(manifestDir), target.outDir);
  return target;
}

// The removable cache overlay. In dev it serves the consumer's cached assets at /assets; in build it
// copies them into dist/assets. Drop this plugin and point predev at the plain downloader, and the
// project reverts to the standard public/assets path with no cache and no middleware. When the cache
// is disabled (FLIGHT_ASSET_CACHE=off, or a standalone checkout) the plugin no-ops and Vite serves
// public/assets natively.
export function createAssetServerPlugin(options?: { manifestDir?: string; mount?: string }): Plugin {
  const mount = options?.mount ?? '/assets';
  let target: AssetTarget | null = null;
  let distDir = '';

  return {
    name: 'flight-asset-server',

    configResolved(config) {
      target = resolveAssetTarget(options?.manifestDir ?? config.root);
      distDir = resolve(config.root, config.build.outDir);
    },

    configureServer(server) {
      if (!target || !target.usingCache) return; // standalone/off → Vite serves public/ natively
      const dir = target.outDir;
      server.middlewares.use(mount, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const filePath = join(dir, rel);
        if (relative(dir, filePath).startsWith('..') || !existsSync(filePath) || !statSync(filePath).isFile()) {
          return next();
        }
        res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
        res.end(readFileSync(filePath));
      });
    },

    writeBundle() {
      if (!target || !target.usingCache) return; // files already live in dist via publicDir
      if (existsSync(target.outDir)) copyDirectoryContents(target.outDir, join(distDir, 'assets'));
    },
  };
}
