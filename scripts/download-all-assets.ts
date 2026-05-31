import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Asset, downloadAssets } from './download-assets';

const projectRoot = resolve(fileURLToPath(import.meta.url), '../..');
const examplesDir = join(projectRoot, 'examples');

const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map(({ name }) => ({ name, dir: join(examplesDir, name) }))
  .filter(({ dir }) => existsSync(join(dir, 'assets.manifest.json')));

for (const { name, dir } of examples) {
  const manifest = JSON.parse(readFileSync(join(dir, 'assets.manifest.json'), 'utf8')) as {
    assets: Asset[];
  };
  console.log(`\n${name}`);
  await downloadAssets(manifest.assets, join(dir, 'public/assets'));
}
