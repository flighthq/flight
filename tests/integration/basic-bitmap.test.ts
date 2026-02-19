// tests/integration/setup-assets.ts
import { addChild, createBitmap, createDisplayObject } from '@flighthq/stage';

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
      // @ts-expect-error: setImmediate is a Node global
      setImmediate(() => resolve(img));
    }
  });
}

test('create basic bitmap and add to scene', async () => {
  const container = createDisplayObject();
  const bitmap = createBitmap();
  bitmap.data.image = await loadImageAndDecode(); // <-- stub image
  addChild(container, bitmap);
  expect(bitmap.parent).toBe(container);
});
