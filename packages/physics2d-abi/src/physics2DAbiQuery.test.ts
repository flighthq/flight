import { createPhysics2DCollider, createRigidBody2D } from '@flighthq/physics2d/contract';
import type { Physics2DAbi } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics2DAbi, createPhysics2DAbiWorld, executePhysics2DAbiCommands } from './physics2DAbi';
import {
  createPhysics2DAbiCommandBuffer,
  createPhysics2DAbiExecutionResult,
  createPhysics2DAbiQueryBuffer,
} from './physics2DAbiBuffer';
import { writePhysics2DAbiSetBodyCommand, writePhysics2DAbiSetColliderCommand } from './physics2DAbiCommand';
import { Physics2DAbiQueryValue } from './physics2DAbiLayout';
import {
  queryPhysics2DAbiPoint,
  queryPhysics2DAbiRay,
  queryPhysics2DAbiRayClosest,
  queryPhysics2DAbiRegion,
  queryPhysics2DAbiShapeCast,
} from './physics2DAbiQuery';

const MATERIAL = { density: 1, friction: 0.3, restitution: 0 };

// Two unit boxes on the x axis at 0 and 10, so a ray along +x meets a known order and a point query
// has an unambiguous answer.
function world(): { abi: Physics2DAbi; handle: number } {
  const abi = createPhysics2DAbi();
  const handle = createPhysics2DAbiWorld(abi);
  const commands = createPhysics2DAbiCommandBuffer(4096);
  for (const [id, x] of [
    [1, 0],
    [2, 10],
  ] as const) {
    const body = createRigidBody2D('static', x, 0);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, MATERIAL),
    );
    writePhysics2DAbiSetBodyCommand(commands, id, body);
    writePhysics2DAbiSetColliderCommand(commands, id, id, body.colliders[0]);
  }
  executePhysics2DAbiCommands(abi, handle, commands, createPhysics2DAbiExecutionResult());
  return { abi, handle };
}

describe('queryPhysics2DAbiPoint', () => {
  it('names the body containing the point and zeroes the geometric row', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(4);
    expect(queryPhysics2DAbiPoint(abi, handle, 0, 0, out)).toBe(true);
    expect(out.count).toBe(1);
    expect(out.bodyIds[0]).toBe(1);
    expect(out.colliderIds[0]).toBe(1);
    // A point hit has no fraction or normal, and reporting a stale one would be worse than none.
    expect([...out.values.slice(0, 5)]).toEqual([0, 0, 0, 0, 0]);
  });

  it('returns an empty answer for empty space', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(4);
    expect(queryPhysics2DAbiPoint(abi, handle, 5, 5, out)).toBe(true);
    expect(out.count).toBe(0);
    expect(out.requiredCount).toBe(0);
  });

  it('does not republish a previous hit when a reused query result misses', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(4);
    expect(queryPhysics2DAbiPoint(abi, handle, 0, 0, out)).toBe(true);
    expect(out.count).toBe(1);

    expect(queryPhysics2DAbiPoint(abi, handle, 5, 5, out)).toBe(true);
    expect(out.count).toBe(0);
    expect(out.requiredCount).toBe(0);
  });
});

describe('queryPhysics2DAbiRay', () => {
  it('reports every crossing with its fraction, point, and normal', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(8);
    expect(queryPhysics2DAbiRay(abi, handle, -5, 0, 1, 0, out, 100)).toBe(true);
    expect(out.count).toBe(2);
    for (let i = 0; i < out.count; i += 1) {
      const base = i * 5;
      expect(out.values[base + Physics2DAbiQueryValue.Fraction]).toBeGreaterThan(0);
      expect(out.values[base + Physics2DAbiQueryValue.NormalX]).toBeCloseTo(-1, 9);
      expect(out.values[base + Physics2DAbiQueryValue.Y]).toBeCloseTo(0, 9);
    }
  });
});

describe('queryPhysics2DAbiRayClosest', () => {
  it('keeps only the nearest crossing', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(8);
    expect(queryPhysics2DAbiRayClosest(abi, handle, -5, 0, 1, 0, out, 100)).toBe(true);
    expect(out.count).toBe(1);
    expect(out.bodyIds[0]).toBe(1);
    expect(out.values[Physics2DAbiQueryValue.X]).toBeCloseTo(-0.5, 9);
  });

  it('publishes only the current closest hit after an all-hits query reused the scratch rows', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(8);
    expect(queryPhysics2DAbiRay(abi, handle, -5, 0, 1, 0, out, 100)).toBe(true);
    expect(out.count).toBe(2);

    expect(queryPhysics2DAbiRayClosest(abi, handle, -5, 0, 1, 0, out, 100)).toBe(true);
    expect(out.count).toBe(1);
    expect(out.requiredCount).toBe(1);
    expect(out.bodyIds[0]).toBe(1);
  });
});

describe('queryPhysics2DAbiRegion', () => {
  it('reports capacity exhaustion through requiredCount rather than by truncating silently', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(1);
    expect(queryPhysics2DAbiRegion(abi, handle, { minX: -20, minY: -20, maxX: 20, maxY: 20 }, out)).toBe(true);
    expect(out.count).toBe(1);
    expect(out.requiredCount).toBe(2);
  });
});

describe('queryPhysics2DAbiShapeCast', () => {
  it('stops at the first body along the sweep', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(4);
    const cast = queryPhysics2DAbiShapeCast(abi, handle, { kind: 'circle', x: -5, y: 0, radius: 0.25 }, 20, 0, out, 1);
    expect(cast).toBe(true);
    expect(out.count).toBe(1);
    expect(out.bodyIds[0]).toBe(1);
    expect(out.values[Physics2DAbiQueryValue.Fraction]).toBeGreaterThan(0);
    expect(out.values[Physics2DAbiQueryValue.Fraction]).toBeLessThan(1);
  });

  it('reports a clean miss as an empty answer', () => {
    const { abi, handle } = world();
    const out = createPhysics2DAbiQueryBuffer(4);
    expect(queryPhysics2DAbiShapeCast(abi, handle, { kind: 'circle', x: -5, y: 40, radius: 0.25 }, 20, 0, out, 1)).toBe(
      true,
    );
    expect(out.count).toBe(0);
    expect(out.requiredCount).toBe(0);
  });
});
