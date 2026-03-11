import { createImageSource } from '@flighthq/assets';
import { addChild, getParent } from '@flighthq/scene-graph-core';
import { createBitmap, createDisplayObject } from '@flighthq/scene-graph-display';

export function loadImageAndDecode(): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img); // fail-safe
    // 1x1 transparent PNG
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgR2Yv1kAAAAASUVORK5CYII=';

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
  bitmap.data.image = createImageSource(await loadImageAndDecode()); // <-- stub image
  addChild(container, bitmap);
  expect(getParent(bitmap)).toBe(container);
});
