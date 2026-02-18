import { rectangle, vector2 } from '@flighthq/math';

test('create rectangle and point', () => {
  const rect = rectangle.create();
  rect.width = 100;
  rect.height = 100;
  const point = vector2.create(50, 50);
  expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  expect(point).toEqual({ x: 50, y: 50 });
  expect(rectangle.containsPoint(rect, point)).toBe(true);
});
