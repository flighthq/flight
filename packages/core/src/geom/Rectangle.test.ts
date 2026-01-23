import { Rectangle, clone, contains, containsPoint, containsRect, copyFrom, create, inflate, inflatePoint, intersection, intersects, isEmpty, offset, offsetPoint, setEmpty, setTo, union } from './Rectangle.js';
import { Point } from './Point.js';

describe('Rectangle', () =>
{
    let r: Rectangle;
    let r2: Rectangle;

    beforeEach(() =>
    {
        r = new Rectangle(0, 0, 10, 20);
        r2 = new Rectangle(2, 5, 3, 4);
    });

    // Constructor

    describe('create', () =>
    {
        it('initializes with default values', () =>
        {
            const rect = create();
            expect(rect.x).toBe(0);
            expect(rect.y).toBe(0);
            expect(rect.width).toBe(0);
            expect(rect.height).toBe(0);
        });

        it('initializes with specified values', () =>
        {
            const rect = create(1, 2, 3, 4);
            expect(rect.x).toBe(1);
            expect(rect.y).toBe(2);
            expect(rect.width).toBe(3);
            expect(rect.height).toBe(4);
        });
    });

    // Properties

    describe('bottom', () =>
    {
        it('returns y + height', () =>
        {
            expect(r.bottom).toBe(20);
        });
    });

    describe('bottomRight', () =>
    {
        it('returns correct Point', () =>
        {
            const br = r.bottomRight;
            expect(br.x).toBe(10);
            expect(br.y).toBe(20);
        });

        it('setter adjusts width and height', () =>
        {
            r.bottomRight = new Point(15, 25);
            expect(r.width).toBe(15);
            expect(r.height).toBe(25);
        });
    });

    describe('left', () =>
    {
        it('getter returns x', () =>
        {
            expect(r.left).toBe(0);
        });

        it('setter adjusts width correctly', () =>
        {
            r.left = 5;
            expect(r.x).toBe(5);
            expect(r.width).toBe(5);
        });
    });

    describe('right', () =>
    {
        it('getter returns x + width', () =>
        {
            expect(r.right).toBe(10);
        });

        it('setter adjusts width', () =>
        {
            r.right = 15;
            expect(r.width).toBe(15);
        });

        it('setter can create negative width (flipped rectangle)', () =>
        {
            r.right = -5;
            expect(r.width).toBe(-5);
        });
    });

    describe('size', () =>
    {
        it('getter returns width and height as Point', () =>
        {
            const s = r.size;
            expect(s.x).toBe(10);
            expect(s.y).toBe(20);
        });

        it('setter adjusts width and height', () =>
        {
            r.size = new Point(5, 6);
            expect(r.width).toBe(5);
            expect(r.height).toBe(6);
        });
    });

    describe('top', () =>
    {
        it('getter returns y', () =>
        {
            expect(r.top).toBe(0);
        });

        it('setter adjusts height correctly', () =>
        {
            r.top = 5;
            expect(r.y).toBe(5);
            expect(r.height).toBe(15);
        });

        it('setter can create negative height (flipped rectangle)', () =>
        {
            r.top = 25;
            expect(r.height).toBe(-5);
        });
    });

    describe('topLeft', () =>
    {
        it('getter returns top-left Point', () =>
        {
            const tl = r.topLeft;
            expect(tl.x).toBe(0);
            expect(tl.y).toBe(0);
        });

        it('setter updates x and y', () =>
        {
            r.topLeft = new Point(3, 4);
            expect(r.x).toBe(3);
            expect(r.y).toBe(4);
        });
    });

    // Methods

    describe('clone', () =>
    {
        it('clone creates a copy', () =>
        {
            const c = clone(r);
            expect(equals(r, c)).toBe(true);
        });
    });

    describe('contains', () =>
    {
        it('returns true for a point inside', () =>
        {
            expect(contains(r, 5, 10)).toBe(true);
        });

        it('returns false for a point outside', () =>
        {
            expect(contains(r, -1, 0)).toBe(false);
        });

        it('works with flipped rectangle', () =>
        {
            r.width = -10;
            r.height = -20;
            expect(contains(r, -5, -10)).toBe(true);
        });
    });

    describe('containsPoint', () =>
    {
        it('delegates to contains', () =>
        {
            expect(containsPoint(r, new Point(5, 10))).toBe(true);
        });
    });

    describe('containsRect', () =>
    {
        it('returns true if rectangle is fully inside', () =>
        {
            expect(containsRect(r, r2)).toBe(true);
        });

        it('returns false if rectangle partially outside', () =>
        {
            r2.x = -5;
            expect(containsRect(r, r2)).toBe(false);
        });

        it('works with flipped rectangle', () =>
        {
            r2.width = -3;
            r2.height = -4;
            r2.x = 5;
            r2.y = 6;
            expect(containsRect(r, r2)).toBe(true);
        });

        it('returns false if flipped rectangle exceeds bounds', () =>
        {
            r2.width = -20;
            r2.height = -20;
            r2.x = 15;
            r2.y = 15;
            expect(containsRect(r, r2)).toBe(false);
        });
    });

    describe('copyFrom', () =>
    {
        it('copyFrom copies values', () =>
        {
            copyFrom(r2, r);
            expect(equals(r, r2)).toBe(true);
        });
    });

    describe('equals', () =>
    {
        it('returns true for identical rectangles', () =>
        {
            expect(equals(r, r)).toBe(true);
            expect(equals(r, clone(r))).toBe(true);
        });

        it('returns false for different rectangles', () =>
        {
            r2.x = 1;
            expect(equals(r, r2)).toBe(false);
        });
    });

    describe('intersection', () =>
    {
        it('returns intersection rectangle', () =>
        {
            const r3 = new Rectangle(5, 10, 10, 10);
            const result = intersection(r, r3);
            expect(result.x).toBe(5);
            expect(result.y).toBe(10);
            expect(result.width).toBe(5);
            expect(result.height).toBe(10);
        });

        it('returns empty rectangle if no intersection', () =>
        {
            const r3 = new Rectangle(20, 20, 5, 5);
            const result = intersection(r, r3);
            expect(isEmpty(result)).toBe(true);
        });
    });

    describe('intersects', () =>
    {
        it('returns true if rectangles overlap', () =>
        {
            const r3 = new Rectangle(5, 10, 10, 10);
            expect(intersects(r, r3)).toBe(true);
        });

        it('returns false if rectangles do not overlap', () =>
        {
            const r3 = new Rectangle(20, 20, 5, 5);
            expect(intersects(r, r3)).toBe(false);
        });
    });


    describe('isEmpty', () =>
    {
        it('returns true only for zero width or height', () =>
        {
            expect(isEmpty(r)).toBe(false);
            r.width = 0;
            expect(isEmpty(r)).toBe(true);
            r.width = 10;
            r.height = 0;
            expect(isEmpty(r)).toBe(true);
            r.width = -5;
            r.height = -5;
            expect(isEmpty(r)).toBe(false); // flipped rectangles are valid
        });
    });

    describe('offset', () =>
    {
        it('offset moves rectangle', () =>
        {
            offset(r, 5, 10);
            expect(r.x).toBe(5);
            expect(r.y).toBe(10);
        });
    });

    describe('offsetPoint', () =>
    {
        it('offsetPoint moves rectangle by Point', () =>
        {
            offsetPoint(r, new Point(3, 4));
            expect(r.x).toBe(3);
            expect(r.y).toBe(4);
        });
    });

    describe('inflate', () =>
    {
        it('inflates rectangle by dx/dy', () =>
        {
            inflate(r, 2, 3);
            expect(r.x).toBe(-2);
            expect(r.y).toBe(-3);
            expect(r.width).toBe(14);
            expect(r.height).toBe(26);
        });
    });

    describe('inflatePoint', () =>
    {
        it('inflates rectangle by Point', () =>
        {
            inflatePoint(r, new Point(1, 2));
            expect(r.x).toBe(-1);
            expect(r.y).toBe(-2);
            expect(r.width).toBe(12);
            expect(r.height).toBe(24);
        });
    });

    describe('setEmpty', () =>
    {
        it('sets rectangle to zero', () =>
        {
            setEmpty(r);
            expect(r.x).toBe(0);
            expect(r.y).toBe(0);
            expect(r.width).toBe(0);
            expect(r.height).toBe(0);
        });
    });

    describe('setTo', () =>
    {
        it('sets rectangle to specified values', () =>
        {
            setTo(r, 1, 2, 3, 4);
            expect(r.x).toBe(1);
            expect(r.y).toBe(2);
            expect(r.width).toBe(3);
            expect(r.height).toBe(4);
        });
    });

    describe('union', () =>
    {
        it('returns union of two rectangles', () =>
        {
            const r3 = new Rectangle(5, 15, 10, 10);
            const u = union(r, r3);
            expect(u.x).toBe(0);
            expect(u.y).toBe(0);
            expect(u.width).toBe(15);
            expect(u.height).toBe(25);
        });

        it('union works with zero-width rectangle', () =>
        {
            const r3 = new Rectangle(5, 15, 0, 0);
            const u = union(r, r3);
            expect(equals(u, r)).toBe(true);
        });

        it('union works with flipped rectangles', () =>
        {
            const r3 = new Rectangle(15, 20, -10, -10);
            const u = union(r, r3);
            expect(u.x).toBe(0);
            expect(u.y).toBe(0);
            expect(u.width).toBe(15);
            expect(u.height).toBe(20);
        });
    });
});
