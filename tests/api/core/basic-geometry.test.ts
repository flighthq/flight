import { createRectangle, createVector2, rectContainsPoint, rectEquals, vec2Equals } from '@flighthq/geometry';

test('create rectangle and point', () => {
  const rect = createRectangle();
  rect.width = 100;
  rect.height = 100;
  const point = createVector2(50, 50);
  expect(rectEquals(rect, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  expect(vec2Equals(point, { x: 50, y: 50 })).toBe(true);
  expect(rectContainsPoint(rect, point)).toBe(true);
});
