import { rectangle, vector2 } from '@flighthq/geometry';

test('create rectangle and point', () => {
  const rect = rectangle.create();
  rect.width = 100;
  rect.height = 100;
  const point = vector2.create(50, 50);
  expect(rectangle.equals(rect, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  expect(vector2.equals(point, { x: 50, y: 50 })).toBe(true);
  expect(rectangle.containsPoint(rect, point)).toBe(true);
});
