import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Asset {
  url: string;
  path: string; // relative path under output directory
}

async function download(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
}

/**
 * Download a list of assets to the target directory.
 * Skips assets that already exist.
 * @param assets Array of {url, path} objects
 * @param targetDir Base directory to download files into
 */
export async function downloadAssets(assets: Asset[], targetDir: string) {
  for (const asset of assets) {
    const outPath = path.join(targetDir, asset.path);

    // Skip download if file exists
    try {
      await fs.access(outPath);
      console.log(`✔ Cached: ${asset.path}`); // eslint-disable-line
      continue;
    } catch {
      // File does not exist → download
    }

    console.log(`↓ Downloading: ${asset.url}`); // eslint-disable-line
    await download(asset.url, outPath);
  }
  console.log('Assets ready ✔'); // eslint-disable-line
}

// CLI behavior for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const exampleDir = process.cwd();
    const manifestPath = path.join(exampleDir, 'assets.manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    await downloadAssets(manifest.assets, path.join(exampleDir, 'assets'));
  })().catch((err) => {
    console.error(err); // eslint-disable-line
    process.exit(1);
  });
}
