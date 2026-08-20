import type { CollisionShape2D } from '@flighthq/types/contract';

import {
  getCollisionPairTest2D,
  getCollisionSupport2D,
  registerBuiltInCollisionSupports2D,
  registerCollisionPairTest2D,
  registerCollisionSupport2D,
  supportCollisionAabb2D,
  supportCollisionCircle2D,
  supportCollisionObb2D,
  supportCollisionPolygon2D,
  writeVertexListSupport2D,
} from './collisionSupport2D';

registerBuiltInCollisionSupports2D();

describe('getCollisionPairTest2D', () => {
  it('is null for a pair nobody registered', () => {
    expect(getCollisionPairTest2D('circle', 'acme.capsule')).toBeNull();
  });

  it('keys on the ORDERED pair, so the reverse is a separate entry', () => {
    const test = () => false;
    registerCollisionPairTest2D('acme.left', 'acme.right', test);

    expect(getCollisionPairTest2D('acme.left', 'acme.right')).toBe(test);
    expect(getCollisionPairTest2D('acme.right', 'acme.left')).toBeNull();
  });

  it('cannot confuse two pairs whose names run together the same way', () => {
    const first = () => false;
    const second = () => true;
    registerCollisionPairTest2D('ab', 'c', first);
    registerCollisionPairTest2D('a', 'bc', second);

    // Concatenating the kinds without a separator lands both on `abc`. The collision cannot occur among
    // the built-ins and appears the first time a vendor kind is a prefix of another.
    expect(getCollisionPairTest2D('ab', 'c')).toBe(first);
    expect(getCollisionPairTest2D('a', 'bc')).toBe(second);
  });
});

describe('getCollisionSupport2D', () => {
  it('is null for a kind nobody registered', () => {
    expect(getCollisionSupport2D('acme.unregistered')).toBeNull();
  });

  it('resolves each built-in area kind', () => {
    expect(getCollisionSupport2D('aabb')).toBe(supportCollisionAabb2D);
    expect(getCollisionSupport2D('circle')).toBe(supportCollisionCircle2D);
    expect(getCollisionSupport2D('obb')).toBe(supportCollisionObb2D);
    expect(getCollisionSupport2D('polygon')).toBe(supportCollisionPolygon2D);
  });

  it('leaves the area-less kinds unregistered', () => {
    // Deliberate: a support function could be written for either, and GJK would then report a
    // penetration depth against a shape that has no interior for one to mean anything in.
    expect(getCollisionSupport2D('point')).toBeNull();
    expect(getCollisionSupport2D('segment')).toBeNull();
  });
});

describe('registerBuiltInCollisionSupports2D', () => {
  it('registers exactly the four area kinds', () => {
    registerBuiltInCollisionSupports2D();

    const registered = ['aabb', 'circle', 'obb', 'polygon', 'point', 'segment'].filter(
      (kind) => getCollisionSupport2D(kind) !== null,
    );
    expect(registered).toEqual(['aabb', 'circle', 'obb', 'polygon']);
  });
});

describe('registerCollisionPairTest2D', () => {
  it('lets a later registration replace an earlier one', () => {
    const first = () => false;
    const second = () => true;
    registerCollisionPairTest2D('acme.a', 'acme.b', first);
    registerCollisionPairTest2D('acme.a', 'acme.b', second);

    expect(getCollisionPairTest2D('acme.a', 'acme.b')).toBe(second);
  });
});

describe('registerCollisionSupport2D', () => {
  it('lets a caller override a built-in, last write wins', () => {
    const replacement = supportCollisionCircle2D;
    registerCollisionSupport2D('acme.override', replacement);

    expect(getCollisionSupport2D('acme.override')).toBe(replacement);
  });
});

describe('supportCollisionAabb2D', () => {
  it('picks the corner the direction signs name', () => {
    const box: CollisionShape2D = { kind: 'aabb', maxX: 2, maxY: 3, minX: -1, minY: -4 };
    const out = [0, 0];

    supportCollisionAabb2D(box, 1, 1, out);
    expect(out).toEqual([2, 3]);
    supportCollisionAabb2D(box, -1, -1, out);
    expect(out).toEqual([-1, -4]);
    supportCollisionAabb2D(box, -1, 1, out);
    expect(out).toEqual([-1, 3]);
  });
});

describe('supportCollisionCircle2D', () => {
  it('pushes the centre one radius along the direction, whatever its length', () => {
    const circle: CollisionShape2D = { kind: 'circle', radius: 2, x: 1, y: 1 };
    const unit = [0, 0];
    const long = [0, 0];

    supportCollisionCircle2D(circle, 1, 0, unit);
    supportCollisionCircle2D(circle, 50, 0, long);

    expect(unit[0]).toBeCloseTo(3, 12);
    expect(unit[1]).toBeCloseTo(1, 12);
    // A support direction is not required to be unit length; normalizing is the function's job.
    expect(long).toEqual(unit);
  });

  it('answers a zero direction with the centre rather than a NaN', () => {
    const out = [0, 0];

    supportCollisionCircle2D({ kind: 'circle', radius: 2, x: 1, y: -1 }, 0, 0, out);

    expect(out).toEqual([1, -1]);
  });
});

describe('supportCollisionObb2D', () => {
  it('picks the furthest rotated corner', () => {
    const out = [0, 0];
    // A quarter turn maps the box's local +x onto world +y, so the furthest corner along +y is the one
    // the unrotated box would have reached along +x.
    supportCollisionObb2D({ halfH: 1, halfW: 2, kind: 'obb', rotation: Math.PI / 2, x: 0, y: 0 }, 0, 1, out);

    expect(out[1]).toBeCloseTo(2, 9);
  });
});

describe('supportCollisionPolygon2D', () => {
  it('picks the furthest vertex', () => {
    const out = [0, 0];
    const triangle: CollisionShape2D = { kind: 'polygon', points: [0, 0, 4, 0, 0, 3] };

    supportCollisionPolygon2D(triangle, 1, 0, out);
    expect(out).toEqual([4, 0]);
    supportCollisionPolygon2D(triangle, 0, 1, out);
    expect(out).toEqual([0, 3]);
  });
});

describe('writeVertexListSupport2D', () => {
  it('reads a flat coordinate list and keeps the first of an exact tie', () => {
    const out = [0, 0];

    // Two vertices project identically along +y; a strict `>` keeps the first, which is what makes the
    // scan deterministic for a caller feeding the same shape twice.
    writeVertexListSupport2D([0, 1, 5, 1, 0, -1], 3, 0, 1, out);

    expect(out).toEqual([0, 1]);
  });
});
