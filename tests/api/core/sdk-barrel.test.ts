import { addNodeChild, createDisplayObject, createRectangle, getNodeParent } from '@flighthq/sdk';

test('sdk barrel exports geometry and scenegraph primitives', () => {
  const rect = createRectangle();
  rect.width = 10;
  rect.height = 20;

  expect(rect.width).toBe(10);
  expect(rect.height).toBe(20);

  const parent = createDisplayObject();
  const child = createDisplayObject();
  const out = addNodeChild(parent, child);

  expect(getNodeParent(child)).toBe(parent);
  expect(out).toBe(child);
});
