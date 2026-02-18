import { addChild, createBitmap, createDisplayObject } from '@flighthq/stage';

test('create basic bitmap and add to scene', () => {
  const container = createDisplayObject();
  const bitmap = createBitmap();
  // bitmap.width = 100;
  // bitmap.height = 100;
  addChild(container, bitmap);
  expect(bitmap.parent).toBe(container);
});
