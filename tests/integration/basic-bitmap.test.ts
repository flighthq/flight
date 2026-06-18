import { createBitmap, createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild, getNodeParent } from '@flighthq/node';
import { createImageResource } from '@flighthq/resources';

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
  bitmap.data.image = createImageResource(await loadImageAndDecode()); // <-- stub image
  addNodeChild(container, bitmap);
  expect(getNodeParent(bitmap)).toBe(container);
});
