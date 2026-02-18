import { container, createBitmap, createDisplayObject } from '@flighthq/stage';

test('create basic bitmap and add to scene', () => {
  const parent = createDisplayObject();
  const bitmap = createBitmap();
  bitmap.width = 100;
  bitmap.height = 100;
  container.addChild(parent, bitmap);
  expect(bitmap.parent).toBe(parent);
});
