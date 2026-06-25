import { enableShapeHitTesting } from './shapeHitTestBuiltins';
import { hitTestShapeCommandPoint } from './shapeHitTestRegistry';

// Call once to register built-in handlers for this test module.
enableShapeHitTesting();

describe('enableShapeHitTesting', () => {
  describe('drawCircle', () => {
    it('returns true for a point inside the circle', () => {
      const buf = ['drawCircle', 3, 50, 50, 25];
      expect(hitTestShapeCommandPoint(buf, 0, 50, 50)).toBe(true);
    });
    it('returns true for a point exactly on the edge', () => {
      const buf = ['drawCircle', 3, 0, 0, 10];
      expect(hitTestShapeCommandPoint(buf, 0, 10, 0)).toBe(true);
    });
    it('returns false for a point outside the circle', () => {
      const buf = ['drawCircle', 3, 50, 50, 25];
      expect(hitTestShapeCommandPoint(buf, 0, 100, 100)).toBe(false);
    });
  });

  describe('drawEllipse', () => {
    it('returns true for a point at the ellipse center', () => {
      // drawEllipse args: x (top-left), y (top-left), width, height
      const buf = ['drawEllipse', 4, 0, 0, 100, 60];
      expect(hitTestShapeCommandPoint(buf, 0, 50, 30)).toBe(true);
    });
    it('returns false for a point outside the ellipse', () => {
      const buf = ['drawEllipse', 4, 0, 0, 100, 60];
      expect(hitTestShapeCommandPoint(buf, 0, 0, 0)).toBe(false);
    });
  });

  describe('drawRectangle', () => {
    it('returns true for a point inside the rectangle', () => {
      const buf = ['drawRectangle', 4, 10, 10, 80, 60];
      expect(hitTestShapeCommandPoint(buf, 0, 50, 40)).toBe(true);
    });
    it('returns true for a point on the rectangle edge', () => {
      const buf = ['drawRectangle', 4, 10, 10, 80, 60];
      expect(hitTestShapeCommandPoint(buf, 0, 10, 10)).toBe(true);
    });
    it('returns false for a point outside the rectangle', () => {
      const buf = ['drawRectangle', 4, 10, 10, 80, 60];
      expect(hitTestShapeCommandPoint(buf, 0, 0, 0)).toBe(false);
    });
  });

  describe('drawRoundRectangle', () => {
    it('returns true for a point in the rectangular bounds', () => {
      const buf = ['drawRoundRectangle', 6, 0, 0, 100, 50, 10, 10];
      expect(hitTestShapeCommandPoint(buf, 0, 50, 25)).toBe(true);
    });
    it('returns false for a point outside the rectangular bounds', () => {
      const buf = ['drawRoundRectangle', 6, 0, 0, 100, 50, 10, 10];
      expect(hitTestShapeCommandPoint(buf, 0, 200, 200)).toBe(false);
    });
    it('returns false for a point in the corner cutout region', () => {
      // With ellipseWidth=40, ellipseHeight=40: corner arcs have rx=cy=20.
      // The very corner (0, 0) is outside the rounded shape.
      const buf = ['drawRoundRectangle', 6, 0, 0, 100, 100, 40, 40];
      // (1, 1) is in the corner cutout — distance from corner center (20, 20) is sqrt(361)~19,
      // which is < 20 so it's inside the ellipse. Actually let's test a clearly-outside corner:
      // corner ellipse center is at (20, 20) with rx=ry=20; (2, 2) is dist ~18/20=0.9 < 1 => inside.
      // Use (0, 0) — normalized: (0-20)/20, (0-20)/20 => (-1, -1) => 1+1=2 > 1 => outside.
      expect(hitTestShapeCommandPoint(buf, 0, 0, 0)).toBe(false);
    });
    it('returns true for a point on the rounded corner arc boundary', () => {
      // Corner center at (20, 20) with rx=ry=20; point at (20, 0) is exactly on the top edge.
      const buf = ['drawRoundRectangle', 6, 0, 0, 100, 100, 40, 40];
      // (20, 0): corner check: inLeft=(20<20)=false, inTop=(0<20)=true, inRight=false.
      // Since not both inLeft/inRight AND inTop/inBottom, falls to the cross check → inside.
      expect(hitTestShapeCommandPoint(buf, 0, 20, 0)).toBe(true);
    });
  });
});
