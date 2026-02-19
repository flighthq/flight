import { fileURLToPath } from 'node:url';

import { addChild, createBitmap, createDisplayObject } from '@flighthq/stage';
// tests/integration/setup-assets.ts
import path from 'path';

import { type Asset, downloadAssets } from '../../scripts/download-assets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testAssetsDir = path.resolve(__dirname, './.test-assets');

const assets: Asset[] = [
  {
    path: 'wabbit_alpha.png',
    url: 'https://github.com/flighthq/flight-example-assets/releases/download/v1/wabbit_alpha.png',
  },
];

beforeAll(async () => {
  await downloadAssets(assets, testAssetsDir);
});

export function loadImageAndDecode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${url}`));

    img.src = url;

    // For jsdom, force a “load” if needed
    if (typeof window === 'undefined' || !('decode' in img)) {
      // In Node/jsdom, onload may never fire if URL is not real
      // You can optionally resolve immediately for testing
      setImmediate(() => resolve(img));
    }
  });
}

test('create basic bitmap and add to scene', async () => {
  const container = createDisplayObject();
  const bitmap = createBitmap();
  bitmap.data.image = await loadImageAndDecode('./test-assets/wabbit_alpha.png');
  addChild(container, bitmap);
  expect(bitmap.parent).toBe(container);
});
