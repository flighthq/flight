import { createPhysics3DCollider, createPhysics3DQueryFilter, createRigidBody3D } from '@flighthq/physics3d/contract';
import type { Physics3DAbi, Physics3DAbiCommandBuffer, SpatialAabb3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics3DAbi, createPhysics3DAbiWorld, executePhysics3DAbiCommands } from './physics3DAbi';
import {
  createPhysics3DAbiCommandBuffer,
  createPhysics3DAbiExecutionResult,
  createPhysics3DAbiQueryBuffer,
} from './physics3DAbiBuffer';
import { writePhysics3DAbiSetBodyCommand, writePhysics3DAbiSetColliderCommand } from './physics3DAbiCommand';
import { Physics3DAbiQueryValue } from './physics3DAbiLayout';
import {
  queryPhysics3DAbiPoint,
  queryPhysics3DAbiRay,
  queryPhysics3DAbiRayClosest,
  queryPhysics3DAbiRegion,
  queryPhysics3DAbiShapeCast,
} from './physics3DAbiQuery';

describe('queryPhysics3DAbiPoint', () => {
  it('reports all hits and the complete count when output capacity truncates them', () => {
    const { abi, world } = createQueryWorld();
    const out = createPhysics3DAbiQueryBuffer(1);

    expect(queryPhysics3DAbiPoint(abi, world, 5, 0, 0, out)).toBe(true);
    expect(out.count).toBe(1);
    expect(out.requiredCount).toBe(2);
    expect([101, 102]).toContain(out.bodyIds[0]);
    expect([201, 202]).toContain(out.colliderIds[0]);
    expect([...out.values]).toEqual(new Array(7).fill(0));
  });

  it('applies the standard Physics3D query filter', () => {
    const { abi, world } = createQueryWorld();
    const filter = createPhysics3DQueryFilter();
    filter.includeStatic = false;
    const out = createPhysics3DAbiQueryBuffer(2);

    expect(queryPhysics3DAbiPoint(abi, world, 5, 0, 0, out, filter)).toBe(true);
    expect([out.count, out.requiredCount]).toEqual([0, 0]);
  });
});

describe('queryPhysics3DAbiRay', () => {
  it('writes fraction, hit point, and normal for every ray hit', () => {
    const { abi, world } = createQueryWorld();
    const out = createPhysics3DAbiQueryBuffer(2);

    expect(queryPhysics3DAbiRay(abi, world, 0, 0, 0, 1, 0, 0, out, 10)).toBe(true);
    expect(out.count).toBe(2);
    expect(out.requiredCount).toBe(2);
    expect(out.values[Physics3DAbiQueryValue.Fraction]).toBeCloseTo(4.5, 12);
    expect(out.values[Physics3DAbiQueryValue.X]).toBeCloseTo(4.5, 12);
    expect(out.values[Physics3DAbiQueryValue.NormalX]).toBe(-1);
  });
});

describe('queryPhysics3DAbiRayClosest', () => {
  it('publishes exactly one deterministic closest hit', () => {
    const { abi, world } = createQueryWorld();
    const out = createPhysics3DAbiQueryBuffer(2);

    expect(queryPhysics3DAbiRayClosest(abi, world, 0, 0, 0, 1, 0, 0, out, 10)).toBe(true);
    expect([out.count, out.requiredCount]).toEqual([1, 1]);
    expect(out.bodyIds[0]).toBe(101);
  });
});

describe('queryPhysics3DAbiRegion', () => {
  it('maps broadphase region results back to caller-owned ids', () => {
    const { abi, world } = createQueryWorld();
    const out = createPhysics3DAbiQueryBuffer(2);
    const region: SpatialAabb3D = { minX: 4, minY: -1, minZ: -1, maxX: 6, maxY: 1, maxZ: 1 };

    expect(queryPhysics3DAbiRegion(abi, world, region, out)).toBe(true);
    expect(out.count).toBe(2);
    expect(new Set(out.bodyIds)).toEqual(new Set([101, 102]));
  });
});

describe('queryPhysics3DAbiShapeCast', () => {
  it('writes the first swept-shape impact into the shared query layout', () => {
    const { abi, world } = createQueryWorld();
    const out = createPhysics3DAbiQueryBuffer(1);

    expect(queryPhysics3DAbiShapeCast(abi, world, unitAabb(), 10, 0, 0, out)).toBe(true);
    expect([out.count, out.requiredCount]).toEqual([1, 1]);
    expect(out.bodyIds[0]).toBe(101);
    expect(out.values[Physics3DAbiQueryValue.Fraction]).toBeCloseTo(0.4, 4);
  });
});

function createQueryWorld(): { abi: Physics3DAbi; world: number } {
  const abi = createPhysics3DAbi();
  const world = createPhysics3DAbiWorld(abi);
  const commands = createPhysics3DAbiCommandBuffer();
  addQueryBody(commands, 101, 201);
  addQueryBody(commands, 102, 202);
  const result = createPhysics3DAbiExecutionResult();
  if (!executePhysics3DAbiCommands(abi, world, commands, result)) throw new Error(result.status);
  return { abi, world };
}

function addQueryBody(commands: Physics3DAbiCommandBuffer, bodyId: number, colliderId: number): void {
  const body = createRigidBody3D('static');
  body.x = 5;
  writePhysics3DAbiSetBodyCommand(commands, bodyId, body);
  writePhysics3DAbiSetColliderCommand(commands, colliderId, bodyId, createPhysics3DCollider(unitAabb()));
}

function unitAabb(): {
  kind: 'aabb';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}
