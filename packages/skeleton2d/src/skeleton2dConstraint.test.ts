import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bone2D, Skeleton2DConstraint } from '@flighthq/types/contract';
import { Skeleton2DConstraintKind, TransformMode2D } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { computeSkeleton2DWorldTransforms, createSkeleton2D } from './skeleton2d';
import {
  getSkeleton2DConstraintSolver,
  registerSkeleton2DConstraintSolver,
  solveSkeleton2DConstraints,
  unregisterSkeleton2DConstraintSolver,
} from './skeleton2dConstraint';

function makeBone(overrides: Partial<Bone2D> = {}): Bone2D {
  return {
    length: 0,
    name: null,
    parentIndex: -1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function constraint(kind: string): Skeleton2DConstraint {
  const out = allocateEntity<Skeleton2DConstraint>();
  out.kind = kind;
  out.mix = 1;
  return finishEntity(out) as Skeleton2DConstraint;
}

// The registry is a module GLOBAL, deliberately: last-write-wins is what lets a caller replace a built-in
// solver, and skeleton2d has no state object to scope it to. So a test may not assert anything about a kind
// it did not itself set — another file registering a built-in would decide the result. Every kind this file
// touches is restored to whatever it was found holding.
const TOUCHED = ['acme.First', 'acme.Present', 'acme.Rope', 'acme.RopeConstraint', 'acme.Second'];
const PRIOR = new Map(TOUCHED.map((kind) => [kind, getSkeleton2DConstraintSolver(kind)]));

afterEach(() => {
  for (const kind of TOUCHED) {
    const prior = PRIOR.get(kind) ?? null;
    if (prior === null) unregisterSkeleton2DConstraintSolver(kind);
    else registerSkeleton2DConstraintSolver(kind, prior);
  }
});

describe('getSkeleton2DConstraintSolver', () => {
  it('returns null for a kind nothing has claimed, since nothing registers by default', () => {
    expect(getSkeleton2DConstraintSolver('acme.RopeConstraint')).toBeNull();
  });
});

describe('registerSkeleton2DConstraintSolver', () => {
  it('claims a kind and takes the last registration for it', () => {
    const first = (): void => {};
    const second = (): void => {};
    registerSkeleton2DConstraintSolver('acme.RopeConstraint', first);
    registerSkeleton2DConstraintSolver('acme.RopeConstraint', second);
    const resolved = getSkeleton2DConstraintSolver('acme.RopeConstraint');
    unregisterSkeleton2DConstraintSolver('acme.RopeConstraint');

    expect(resolved).toBe(second);
  });
});

describe('solveSkeleton2DConstraints', () => {
  it('runs constraints in declared order, since one may read a bone another moved', () => {
    const order: string[] = [];
    registerSkeleton2DConstraintSolver('acme.First', () => order.push('first'));
    registerSkeleton2DConstraintSolver('acme.Second', () => order.push('second'));
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DConstraints(skeleton, [constraint('acme.Second'), constraint('acme.First')]);
    unregisterSkeleton2DConstraintSolver('acme.First');
    unregisterSkeleton2DConstraintSolver('acme.Second');

    expect(order).toEqual(['second', 'first']);
  });

  it('skips a constraint whose kind has no solver rather than throwing, and keeps going', () => {
    let solved = 0;
    registerSkeleton2DConstraintSolver('acme.Present', () => {
      solved++;
    });
    const skeleton = createSkeleton2D([makeBone()]);
    computeSkeleton2DWorldTransforms(skeleton);

    solveSkeleton2DConstraints(skeleton, [constraint('acme.Absent'), constraint('acme.Present')]);
    unregisterSkeleton2DConstraintSolver('acme.Present');

    expect(solved).toBe(1);
  });

  it('hands the whole constraint to its solver, so a family carries its own fields', () => {
    let seen: Readonly<Skeleton2DConstraint> | null = null;
    registerSkeleton2DConstraintSolver('acme.Rope', (_skeleton, value) => {
      seen = value;
    });
    const skeleton = createSkeleton2D([makeBone()]);
    const rope = (() => {
      const out = allocateEntity<Skeleton2DConstraint>();
      out.kind = 'acme.Rope';
      out.mix = 0.25;
      out.slack = 3;
      return finishEntity(out) as Skeleton2DConstraint;
    })();

    solveSkeleton2DConstraints(skeleton, [rope]);
    unregisterSkeleton2DConstraintSolver('acme.Rope');

    expect(seen).toBe(rope);
  });
});

describe('unregisterSkeleton2DConstraintSolver', () => {
  it('releases a kind, after which its constraints are skipped', () => {
    registerSkeleton2DConstraintSolver('acme.Rope', () => {});
    unregisterSkeleton2DConstraintSolver('acme.Rope');

    expect(getSkeleton2DConstraintSolver('acme.Rope')).toBeNull();
  });
});
