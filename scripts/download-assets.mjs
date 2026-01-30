import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
}

async function run() {
  const exampleDir = process.cwd();
  const manifestPath = path.join(exampleDir, 'assets.manifest.json');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  for (const asset of manifest.assets) {
    const outPath = path.join(exampleDir, 'assets', asset.path);
    console.log(`↓ ${asset.url}`);
    await download(asset.url, outPath);
  }

  console.log('Assets ready ✔');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
