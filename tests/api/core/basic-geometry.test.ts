import {
  createRectangle,
  createVector2,
  equalsRectangle,
  equalsVector2,
  rectangleContainsPoint,
} from '@flighthq/geometry';

test('create rectangle and point', () => {
  const rect = createRectangle();
  rect.width = 100;
  rect.height = 100;
  const point = createVector2(50, 50);
  expect(equalsRectangle(rect, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  expect(equalsVector2(point, { x: 50, y: 50 })).toBe(true);
  expect(rectangleContainsPoint(rect, point)).toBe(true);
});
