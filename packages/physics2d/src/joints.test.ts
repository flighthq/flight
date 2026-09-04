import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Physics2DDistanceJoint,
  Physics2DGearJoint,
  Physics2DMouseJoint,
  Physics2DPrismaticJoint,
  Physics2DPulleyJoint,
  Physics2DRevoluteJoint,
  Physics2DRopeJoint,
  Physics2DWheelJoint,
  Physics2DWeldJoint,
  Physics2DWorld,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import {
  Physics2DDistanceJointKind,
  Physics2DGearJointKind,
  Physics2DMouseJointKind,
  Physics2DPrismaticJointKind,
  Physics2DPulleyJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWheelJointKind,
  Physics2DWeldJointKind,
  physics2DDistanceJointSolver,
  physics2DGearJointSolver,
  physics2DMouseJointSolver,
  physics2DPrismaticJointSolver,
  physics2DPulleyJointSolver,
  physics2DRevoluteJointSolver,
  physics2DRopeJointSolver,
  physics2DWheelJointSolver,
  physics2DWeldJointSolver,
} from './joints';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function box(world: ReturnType<typeof createPhysics2DWorld>, type: 'dynamic' | 'static', x: number, y: number) {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return addPhysics2DBody(world, body);
}

function baseJoint(kind: string, bodyA: number, bodyB: number) {
  const out = allocateEntity<any>();
  out.kind = kind;
  out.bodyA = bodyA;
  out.bodyB = bodyB;
  out.localAnchorAX = 0;
  out.localAnchorAY = 0;
  out.localAnchorBX = 0;
  out.localAnchorBY = 0;
  out.collideConnected = false;
  out.breakForce = Number.POSITIVE_INFINITY;
  out.breakTorque = Number.POSITIVE_INFINITY;
  out.impulse0 = 0;
  out.impulse1 = 0;
  out.impulse2 = 0;
  out.rAX = 0;
  out.rAY = 0;
  out.rBX = 0;
  out.rBY = 0;
  return finishEntity(out);
}

function run(world: ReturnType<typeof createPhysics2DWorld>, steps: number): void {
  for (let i = 0; i < steps; i++) stepPhysics2D(world, 1 / 60);
}

describe('canonical end ordering and direction-bearing joint state', () => {
  // The generic swap in addPhysics2DJoint moves only what every joint has: two body indices and two
  // anchors. Anything a kind measures FROM bodyA TO bodyB reverses when the ends trade places, and the
  // registry cannot know which fields those are — so each kind now answers for its own via swapEnds.
  it('negates a weld reference angle when the ends are exchanged', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    // Supplied high-index-first, so the ends must be exchanged.
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, first.index, second.index),
      referenceAngle: 0.5,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
    expect(joint.referenceAngle).toBeCloseTo(-0.5, 12);
  });

  it('leaves a weld reference angle alone when no exchange happens', () => {
    // swapEnds both vetoes and transforms, so it must only be consulted when a swap is actually
    // pending — calling it unconditionally would negate the angle of every joint supplied in order.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const first = box(world, 'dynamic', 0, 0);
    const second = box(world, 'dynamic', 1, 0);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, first.index, second.index),
      referenceAngle: 0.5,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(first.index);
    expect(joint.referenceAngle).toBeCloseTo(0.5, 12);
  });

  it('holds the same physical pose whichever order the weld ends were supplied in', () => {
    // The property the negation exists for: the constraint is a fact about the pair, so which end the
    // caller happened to name first must not change where the bodies end up.
    function poseFor(supplyReversed: boolean): number {
      const world = createPhysics2DWorld(0, 0);
      registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
      const low = box(world, 'static', 0, 0);
      const high = box(world, 'dynamic', 1, 0);
      const joint: Physics2DWeldJoint = {
        ...baseJoint(
          Physics2DWeldJointKind,
          supplyReversed ? high.index : low.index,
          supplyReversed ? low.index : high.index,
        ),
        referenceAngle: supplyReversed ? -0.4 : 0.4,
      };
      addPhysics2DJoint(world, joint);
      run(world, 60);
      return high.angle;
    }
    expect(poseFor(true)).toBeCloseTo(poseFor(false), 6);
  });

  it('still swaps a direction-free kind, which needs no transform', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, first.index, second.index),
      length: 1,
      frequencyHz: 0,
      dampingRatio: 0,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
  });
});

describe('joint warm starting', () => {
  // Physics2DJoint documents its impulse block as "reused as the next step's warm start exactly as a
  // contact's are". Only contacts were warm-started; the joint block accumulated forever and was never
  // reapplied, and switching warmStarting off did not clear it either.
  function hangingWorld(warmStarting: boolean) {
    const world = createPhysics2DWorld(0, -10);
    world.config.warmStarting = warmStarting;
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 0);
    const hanging = box(world, 'dynamic', 0, -2);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, hanging.index),
      dampingRatio: 0,
      length: 2,
      frequencyHz: 0,
    };
    addPhysics2DJoint(world, joint);
    return { hanging, joint, world };
  }

  it('clears the accumulated impulse each step when warm starting is off', () => {
    // Cold start every step: the same step from the same state converges to the same impulse, so two
    // consecutive settled steps agree. Before, the accumulator was carried whether or not the flag
    // said to, so it drifted step over step.
    const { joint, world } = hangingWorld(false);
    run(world, 60);
    const first = joint.impulse0;
    stepPhysics2D(world, 1 / 60);
    expect(joint.impulse0).toBeCloseTo(first, 6);
  });

  it("invokes each kind's warm start once per step when warm starting is on", () => {
    // Asserted on the wiring rather than on a numerical difference. Warm starting changes the PATH to
    // convergence, not the fixed point, and a single stiff distance joint converges in one iteration
    // either way — so every physical observable I tried was identical by construction, and a test
    // built on one would have been measuring nothing while claiming to measure warm starting. What
    // finding 7 is actually about is that the hook never ran at all.
    const world = createPhysics2DWorld(0, -10);
    world.config.warmStarting = true;
    const calls: string[] = [];
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, {
      ...physics2DDistanceJointSolver,
      clearAccumulatedImpulses: () => calls.push('clear'),
      warmStart: () => calls.push('warm'),
    });
    const anchor = box(world, 'static', 0, 0);
    const hanging = box(world, 'dynamic', 0, -2);
    addPhysics2DJoint(world, {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, hanging.index),
      dampingRatio: 0,
      length: 2,
      frequencyHz: 0,
    } as Physics2DDistanceJoint);

    stepPhysics2D(world, 1 / 60);
    expect(calls).toEqual(['warm']);

    world.config.warmStarting = false;
    stepPhysics2D(world, 1 / 60);
    expect(calls).toEqual(['warm', 'clear']);
  });

  it('leaves a kind that declares neither hook untouched', () => {
    // Both hooks are optional: a kind that starts cold every step is correct, just slower to converge.
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, {
      prepare: physics2DDistanceJointSolver.prepare,
      solve: physics2DDistanceJointSolver.solve,
    });
    const anchor = box(world, 'static', 0, 0);
    const hanging = box(world, 'dynamic', 0, -2);
    addPhysics2DJoint(world, {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, hanging.index),
      dampingRatio: 0,
      length: 2,
      frequencyHz: 0,
    } as Physics2DDistanceJoint);
    expect(() => run(world, 30)).not.toThrow();
    expect(hanging.y).toBeLessThan(-1.5);
  });

  it('holds the hanging body at the joint length either way', () => {
    // Warm starting is a convergence aid, not a behaviour change: both settle to the same pose.
    const cold = hangingWorld(false);
    const warm = hangingWorld(true);
    run(cold.world, 240);
    run(warm.world, 240);
    expect(warm.hanging.y).toBeCloseTo(cold.hanging.y, 2);
    expect(warm.hanging.y).toBeLessThan(-1.5);
    expect(warm.hanging.y).toBeGreaterThan(-2.5);
  });

  it('clears a weld joint every impulse it accumulates, not only the linear pair', () => {
    const world = createPhysics2DWorld(0, -10);
    world.config.warmStarting = false;
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const anchor = box(world, 'static', 0, 0);
    // Offset so gravity puts real load on both the linear and the angular part; welded at the origin
    // the impulses settle at ~1e-6 and asserting on them would be asserting on noise.
    const welded = box(world, 'dynamic', 3, 0);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, anchor.index, welded.index),
      referenceAngle: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 120);
    const settled = { angular: joint.impulse2, x: joint.impulse0, y: joint.impulse1 };
    expect(Math.abs(settled.y)).toBeGreaterThan(0.001);
    stepPhysics2D(world, 1 / 60);
    expect(joint.impulse0).toBeCloseTo(settled.x, 4);
    expect(joint.impulse1).toBeCloseTo(settled.y, 4);
    expect(joint.impulse2).toBeCloseTo(settled.angular, 4);
  });
});

// A joint whose impulse accumulators were never written. The type declares them required, so this is not
// a shape a TypeScript caller can build by hand — it is what a joint deserialized from a saved world
// actually looks like at runtime, where the compile-time guarantee bought nothing.
function jointWithoutAccumulators(kind: string, bodyA: number, bodyB: number, over: object = {}): never {
  return {
    kind,
    bodyA,
    bodyB,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    collideConnected: false,
    breakForce: Number.POSITIVE_INFINITY,
    breakTorque: Number.POSITIVE_INFINITY,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
    ...over,
  } as never;
}

describe('joints built without their impulse accumulators', () => {
  // An absent accumulator is read as `undefined`, and the first arithmetic on it yields NaN. Because an
  // accumulator is fed back into the next iteration, the NaN does not stay in the joint: it leaves
  // through the applied impulse into BOTH bodies' velocities, and from there into every contact they
  // touch. One joint missing one number poisons the world.
  it('drives a revolute motor normally when the ends are already canonical', () => {
    const world = createPhysics2DWorld(0, 0);
    const anchor = box(world, 'static', 0, 0);
    const arm = box(world, 'dynamic', 1, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const joint = jointWithoutAccumulators(Physics2DRevoluteJointKind, anchor.index, arm.index, {
      enableLimit: false,
      enableMotor: true,
      lowerAngle: 0,
      maxMotorTorque: 100,
      motorSpeed: 2,
      referenceAngle: 0,
      upperAngle: 0,
    });
    addPhysics2DJoint(world, joint);
    run(world, 30);

    // Not merely finite: the motor has to actually turn the arm toward its target speed, which is what
    // proves the accumulator was established as a usable zero rather than just kept out of the maths.
    expect(arm.angularVelocity).toBeGreaterThan(0.5);
    expect(Number.isFinite((joint as unknown as Physics2DRevoluteJoint).motorImpulse)).toBe(true);
  });

  it('drives a revolute motor normally when the ends must be exchanged first', () => {
    // The second, distinct mechanism. swapEnds runs when the joint is ADDED, before any prepare, and it
    // negates the motor accumulator. Negating an absent value writes NaN into the field — and NaN is not
    // nullish, so every later `??` accepts the poison instead of replacing it. This order is the only one
    // that reaches that path, which is why both orders are pinned.
    const world = createPhysics2DWorld(0, 0);
    const arm = box(world, 'dynamic', 1, 0);
    const anchor = box(world, 'static', 0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    // Supplied high-index-first, so the ends must be exchanged.
    const joint = jointWithoutAccumulators(Physics2DRevoluteJointKind, anchor.index, arm.index, {
      enableLimit: false,
      enableMotor: true,
      lowerAngle: 0,
      maxMotorTorque: 100,
      motorSpeed: 2,
      referenceAngle: 0,
      upperAngle: 0,
    });
    addPhysics2DJoint(world, joint);
    // Magnitude, because negating an established zero keeps the sign bit and yields -0. That is
    // identical to +0 in every arithmetic that follows and differs only under Object.is, which toBe uses.
    expect(Math.abs((joint as unknown as Physics2DRevoluteJoint).motorImpulse)).toBe(0);

    run(world, 30);

    expect(Math.abs(arm.angularVelocity)).toBeGreaterThan(0.5);
  });

  // The same defect on every other solved kind: the revolute motor was the instance that was reported,
  // the generic impulse0/1/2 block is the class.
  const GENERIC_KINDS = [
    [Physics2DDistanceJointKind, physics2DDistanceJointSolver, { length: 2, frequencyHz: 0, dampingRatio: 0 }],
    [
      Physics2DGearJointKind,
      physics2DGearJointSolver,
      {
        axisAX: 1,
        axisAY: 0,
        axisBX: 1,
        axisBY: 0,
        constant: 0,
        coordinateA: 'angular',
        coordinateB: 'angular',
        ratio: 2,
      },
    ],
    [
      Physics2DPrismaticJointKind,
      physics2DPrismaticJointSolver,
      {
        enableLimit: false,
        enableMotor: false,
        localAxisAX: 1,
        localAxisAY: 0,
        lowerTranslation: 0,
        maxMotorForce: 0,
        motorSpeed: 0,
        referenceAngle: 0,
        upperTranslation: 0,
      },
    ],
    [
      Physics2DPulleyJointKind,
      physics2DPulleyJointSolver,
      {
        constant: 4,
        groundAnchorAX: 0,
        groundAnchorAY: 2,
        groundAnchorBX: 2,
        groundAnchorBY: 2,
        ratio: 1,
      },
    ],
    [Physics2DRopeJointKind, physics2DRopeJointSolver, { maxLength: 1 }],
    [
      Physics2DWheelJointKind,
      physics2DWheelJointSolver,
      {
        dampingRatio: 0.7,
        enableMotor: false,
        localAxisAX: 0,
        localAxisAY: 1,
        maxMotorTorque: 0,
        motorSpeed: 0,
        restTranslation: 0,
        frequencyHz: 4,
      },
    ],
    [Physics2DWeldJointKind, physics2DWeldJointSolver, { referenceAngle: 0 }],
  ] as const;

  for (const [kind, solver, over] of GENERIC_KINDS) {
    it(`keeps both bodies finite across a ${kind} joint`, () => {
      const world = createPhysics2DWorld();
      const first = box(world, 'dynamic', 0, 0);
      const second = box(world, 'dynamic', 2, 0);
      registerPhysics2DJointSolver(world, kind, solver);
      addPhysics2DJoint(world, jointWithoutAccumulators(kind, first.index, second.index, over));
      // Two steps, because the second is the one that warm-starts from the first step's accumulator —
      // a single step would pass even if the accumulator were never written back.
      run(world, 2);

      for (const body of [first, second]) {
        expect(Number.isFinite(body.velocityX)).toBe(true);
        expect(Number.isFinite(body.velocityY)).toBe(true);
        expect(Number.isFinite(body.angularVelocity)).toBe(true);
      }
    });
  }
});

describe('physics2DDistanceJointSolver', () => {
  // A hanging spring whose only dynamic body's mass is set by `density`. Everything else — the authored
  // frequency, the damping ratio, the stretch it starts from — is held identical between instances, so
  // any difference in how it moves is a difference the mass caused.
  function springWorld(density: number): { world: Physics2DWorld; bob: ReturnType<typeof box> } {
    const material = { density, friction: 0, restitution: 0 };
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = createRigidBody2D('static', 0, 0);
    anchor.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, material));
    addPhysics2DBody(world, anchor);
    const bob = createRigidBody2D('dynamic', 0, -2);
    bob.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, material));
    addPhysics2DBody(world, bob);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 1,
      frequencyHz: 2,
      dampingRatio: 0.2,
    };
    addPhysics2DJoint(world, joint);
    return { world, bob };
  }

  it('oscillates an authored spring at the same rate whatever mass hangs off it', () => {
    // Authoring a spring by frequency instead of by stiffness is only worth anything if the frequency
    // survives the mass changing — otherwise it is a stiffness under another name, and every tuned
    // spring in a game retunes itself the moment an artist resizes the body.
    const light = springWorld(1);
    const heavy = springWorld(4);
    expect(heavy.bob.mass).toBeCloseTo(light.bob.mass * 4, 12);

    stepPhysics2D(light.world, 1 / 60);
    stepPhysics2D(heavy.world, 1 / 60);
    // Exactly equal, not close: mass has to cancel out of this completely, not mostly.
    expect(heavy.bob.velocityY).toBe(light.bob.velocityY);

    // Half a period, measured as the swing back through rest to the far side.
    const halfPeriod = (spring: { world: Physics2DWorld; bob: ReturnType<typeof box> }): number => {
      for (let step = 1; step < 600; step++) {
        stepPhysics2D(spring.world, 1 / 60);
        if (step > 2 && spring.bob.velocityY <= 0) return step;
      }
      return -1;
    };
    const lightHalfPeriod = halfPeriod(light);
    expect(halfPeriod(heavy)).toBe(lightHalfPeriod);

    // And it is the RIGHT rate, not merely a consistent one: a 2 Hz spring at damping ratio 0.2 has a
    // damped half-period of 1 / (2 * 2 * sqrt(1 - 0.04)) seconds, which is 15.3 steps at 60 Hz. Pinning
    // only the agreement between the two would pass just as well for two identically wrong springs.
    expect(lightHalfPeriod).toBeGreaterThan(14);
    expect(lightHalfPeriod).toBeLessThan(17);
  });

  it('keeps prepared axis and mass local when a joint getter prepares another world', () => {
    const world = createPhysics2DWorld(0, 0);
    const anchor = box(world, 'static', 0, 0);
    const bob = box(world, 'dynamic', 2, 0);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 1,
      frequencyHz: 0,
      dampingRatio: 0,
    };

    const nestedWorld = createPhysics2DWorld(0, 0);
    const nestedAnchor = box(nestedWorld, 'static', 0, 0);
    const nestedBob = box(nestedWorld, 'dynamic', 0, 4);
    const nestedJoint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, nestedAnchor.index, nestedBob.index),
      length: 3,
      frequencyHz: 2,
      dampingRatio: 0.5,
    };
    let impulse = 0;
    let nestedCalls = 0;
    Object.defineProperty(joint, 'impulse0', {
      configurable: true,
      enumerable: true,
      get() {
        if (nestedCalls === 0) {
          nestedCalls++;
          physics2DDistanceJointSolver.prepare(nestedWorld, nestedJoint, 1 / 60);
        }
        return impulse;
      },
      set(value: number) {
        impulse = value;
      },
    });

    physics2DDistanceJointSolver.prepare(world, joint, 1 / 60);
    physics2DDistanceJointSolver.solve(world, joint);

    expect(nestedCalls).toBe(1);
    expect(bob.velocityX).toBeLessThan(0);
    expect(bob.velocityY).toBeCloseTo(0);
  });

  it('holds a hanging body at the joint length instead of letting it fall', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 0, 3);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 240);

    const separation = Math.sqrt((bob.x - anchor.x) ** 2 + (bob.y - anchor.y) ** 2);
    expect(separation).toBeGreaterThan(1.9);
    expect(separation).toBeLessThan(2.1);
  });

  it('swings a displaced bob back under the anchor rather than holding it out sideways', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 2, 5);
    bob.linearDamping = 1.5;
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 600);
    expect(bob.y).toBeLessThan(4);
  });
});

describe('physics2DGearJointSolver', () => {
  it('keeps two angular coordinates at their configured ratio', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DGearJointKind, physics2DGearJointSolver);
    const first = box(world, 'dynamic', -2, 0);
    const second = box(world, 'dynamic', 2, 0);
    first.angularVelocity = 2;
    addPhysics2DJoint(world, gearJoint(first.index, second.index, { ratio: 2 }));

    run(world, 120);

    expect(first.angle + 2 * second.angle).toBeCloseTo(0, 5);
    expect(first.angularVelocity).toBeGreaterThan(0);
    expect(second.angularVelocity).toBeLessThan(0);
  });

  it('couples linear and angular coordinates for a rack and pinion', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DGearJointKind, physics2DGearJointSolver);
    const rack = box(world, 'dynamic', 0, 0);
    const pinion = box(world, 'dynamic', 4, 0);
    rack.velocityX = 2;
    addPhysics2DJoint(
      world,
      gearJoint(rack.index, pinion.index, {
        axisAX: 5,
        coordinateA: 'linear',
        coordinateB: 'angular',
        ratio: 2,
      }),
    );

    run(world, 120);

    expect(rack.x + 2 * pinion.angle).toBeCloseTo(0, 5);
    expect(rack.x).toBeGreaterThan(0);
    expect(pinion.angle).toBeLessThan(0);
  });

  it('corrects a coordinate pair that starts away from its constant', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DGearJointKind, physics2DGearJointSolver);
    const first = box(world, 'dynamic', -2, 0);
    const second = box(world, 'dynamic', 2, 0);
    first.angle = 1;
    addPhysics2DJoint(world, gearJoint(first.index, second.index, { ratio: -1 }));

    run(world, 60);

    expect(first.angle - second.angle).toBeCloseTo(0, 5);
  });

  it('preserves the same constraint when canonical ordering exchanges the ends', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DGearJointKind, physics2DGearJointSolver);
    const first = box(world, 'dynamic', 2, 0);
    const second = box(world, 'dynamic', -2, 0);
    const joint = gearJoint(second.index, first.index, {
      axisAX: 1,
      axisAY: 2,
      axisBX: 3,
      axisBY: 4,
      constant: 6,
      coordinateA: 'linear',
      coordinateB: 'angular',
      impulse0: 3,
      ratio: 2,
    });

    addPhysics2DJoint(world, joint);

    expect(joint.bodyA).toBe(first.index);
    expect(joint.coordinateA).toBe('angular');
    expect(joint.coordinateB).toBe('linear');
    expect(joint.axisAX).toBe(3);
    expect(joint.axisAY).toBe(4);
    expect(joint.axisBX).toBe(1);
    expect(joint.axisBY).toBe(2);
    expect(joint.ratio).toBeCloseTo(0.5, 12);
    expect(joint.constant).toBeCloseTo(3, 12);
    expect(joint.impulse0).toBeCloseTo(6, 12);
  });
});

function revoluteJoint(
  bodyA: number,
  bodyB: number,
  over: Partial<Physics2DRevoluteJoint> = {},
): Physics2DRevoluteJoint {
  return {
    ...baseJoint(Physics2DRevoluteJointKind, bodyA, bodyB),
    enableLimit: false,
    enableMotor: false,
    lowerAngle: 0,
    maxMotorTorque: 0,
    motorImpulse: 0,
    motorSpeed: 0,
    referenceAngle: 0,
    upperAngle: 0,
    ...over,
  } as Physics2DRevoluteJoint;
}

function prismaticJoint(
  bodyA: number,
  bodyB: number,
  over: Partial<Physics2DPrismaticJoint> = {},
): Physics2DPrismaticJoint {
  return {
    ...baseJoint(Physics2DPrismaticJointKind, bodyA, bodyB),
    enableLimit: false,
    enableMotor: false,
    localAxisAX: 1,
    localAxisAY: 0,
    lowerTranslation: 0,
    maxMotorForce: 0,
    motorImpulse: 0,
    motorSpeed: 0,
    referenceAngle: 0,
    upperTranslation: 0,
    ...over,
  } as Physics2DPrismaticJoint;
}

function pulleyJoint(bodyA: number, bodyB: number, over: Partial<Physics2DPulleyJoint> = {}): Physics2DPulleyJoint {
  return {
    ...baseJoint(Physics2DPulleyJointKind, bodyA, bodyB),
    constant: 4,
    groundAnchorAX: 0,
    groundAnchorAY: 0,
    groundAnchorBX: 4,
    groundAnchorBY: 0,
    ratio: 1,
    ...over,
  } as Physics2DPulleyJoint;
}

function gearJoint(bodyA: number, bodyB: number, over: Partial<Physics2DGearJoint> = {}): Physics2DGearJoint {
  return {
    ...baseJoint(Physics2DGearJointKind, bodyA, bodyB),
    axisAX: 1,
    axisAY: 0,
    axisBX: 1,
    axisBY: 0,
    constant: 0,
    coordinateA: 'angular',
    coordinateB: 'angular',
    ratio: 1,
    ...over,
  } as Physics2DGearJoint;
}

describe('physics2DMouseJointSolver', () => {
  it('drags a body toward its target', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 120);
    expect(dragged.x).toBeGreaterThan(3);
  });

  it('drags its body when the unused bodyA placeholder does not resolve', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, 999, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);

    run(world, 60);

    expect(dragged.x).toBeGreaterThan(3);
  });

  it('keeps accepting moved targets after being held still past the sleep timeout', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 0,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 60);
    expect(dragged.sleeping).toBe(false);

    joint.targetX = 5;
    stepPhysics2D(world, 1 / 30);

    expect(dragged.velocityX).toBeGreaterThan(0);
    expect(dragged.x).toBeGreaterThan(0);
  });

  it('pulls a resting body off a surface without an unstable response', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -10, minY: -1, maxX: 10, maxY: 0 }, STONE));
    addPhysics2DBody(world, floor);
    const dragged = box(world, 'dynamic', 0, 0.5);
    for (let i = 0; i < 120; i++) stepPhysics2D(world, 1 / 30);

    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      localAnchorBX: 0.3,
      localAnchorBY: 0.2,
      targetX: dragged.x + 0.3,
      targetY: dragged.y + 0.2,
      maxForce: 1000 * dragged.mass,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    joint.targetX = 3;
    joint.targetY = 2.5;
    for (let i = 0; i < 180; i++) stepPhysics2D(world, 1 / 30);

    expect(dragged.x).toBeGreaterThan(2);
    expect(dragged.y).toBeGreaterThan(1.5);
    expect(Number.isFinite(dragged.velocityX)).toBe(true);
    expect(Number.isFinite(dragged.velocityY)).toBe(true);
    expect(Math.abs(dragged.velocityX)).toBeLessThan(10);
    expect(Math.abs(dragged.velocityY)).toBeLessThan(10);
  });

  it.each([0.5, 5])('keeps a low-frequency response directed toward the target at %s Hz', (frequencyHz) => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1_000_000,
      frequencyHz,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);

    stepPhysics2D(world, 1 / 60);

    expect(dragged.x).toBeGreaterThan(0);
    expect(dragged.velocityX).toBeGreaterThan(0);
    expect(Number.isFinite(dragged.x)).toBe(true);
    expect(Number.isFinite(dragged.velocityX)).toBe(true);
  });

  // Critic's repro. The mouse joint deliberately declares no warmStart, because a target that moves
  // between steps invalidates the previous impulse -- the type documents a cold start. But the step only
  // cleared accumulators when the WORLD had warm starting off, so with it on (the default) the stale
  // impulse stayed live and kept pushing a body whose target was already on top of it.
  it('starts cold each step even while the world is warm starting', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 30);

    // Park the body: stop it dead and put the target exactly where the body already is, so a correct
    // cold start has nothing left to do.
    dragged.velocityX = 0;
    dragged.velocityY = 0;
    joint.targetX = dragged.x;
    joint.targetY = dragged.y;

    stepPhysics2D(world, 1 / 60);

    expect(Math.abs(dragged.velocityX)).toBeLessThan(1e-6);
    expect(Math.abs(dragged.velocityY)).toBeLessThan(1e-6);
  });

  it('respects its force bound rather than injecting unbounded energy', () => {
    // The reason a mouse joint is soft by construction: a rigid drag lets a user pull a body arbitrarily
    // fast simply by moving the cursor, and the rest of the world absorbs it.
    //
    // This assertion used to read `velocity < 60` with a maxForce of 0.5, which is not a force bound at
    // all — it passed while the solver was clamping the ACCUMULATED IMPULSE against maxForce, a unit
    // error worth 1/dt. The bound a force actually implies is dv <= F*dt/m per step, and that is what
    // is asserted now: at maxForce 1, dt 0.01, mass 1 the step may add 0.01 and no more, where the old
    // code added 1.0 and the old assertion waved it through.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const maxForce = 1;
    const dt = 0.01;
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 1000,
      targetY: 0,
      maxForce,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);

    const perStep = (maxForce * dt) / (1 / dragged.inverseMass);
    let previous = dragged.velocityX;
    for (let i = 0; i < 20; i++) {
      stepPhysics2D(world, dt);
      expect(Math.abs(dragged.velocityX - previous)).toBeLessThanOrEqual(perStep * 1.0000001);
      previous = dragged.velocityX;
    }
    expect(Number.isFinite(dragged.x)).toBe(true);
  });

  it('scales the impulse bound with the timestep, so the force means the same at any dt', () => {
    // A force bound that ignored dt would let a smaller step inject the same impulse more often.
    const speeds: number[] = [];
    for (const dt of [0.02, 0.01]) {
      const world = createPhysics2DWorld(0, 0);
      registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
      const dragged = box(world, 'dynamic', 0, 0);
      const joint: Physics2DMouseJoint = {
        ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
        targetX: 1000,
        targetY: 0,
        maxForce: 1,
        frequencyHz: 5,
        dampingRatio: 0.7,
      };
      addPhysics2DJoint(world, joint);
      stepPhysics2D(world, dt);
      speeds.push(Math.abs(dragged.velocityX));
    }
    // Halving dt halves the impulse a single step may deliver.
    expect(speeds[1]).toBeCloseTo(speeds[0] / 2, 10);
  });

  it('drags the dynamic body even when it was added before its anchor', () => {
    // Canonical ordering swaps a joint's ends when the caller supplies them low-index-second. A mouse
    // joint has only one real body — the other end is a world-space target — so the exchange moved the
    // dragged body into bodyA while this solver acts on bodyB, and the drag silently applied to the
    // anchor. The dragged body did not move at all.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const anchor = box(world, 'static', 0, 0);
    expect(dragged.index).toBeLessThan(anchor.index);

    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, anchor.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyB).toBe(dragged.index);

    run(world, 60);
    expect(dragged.x).toBeGreaterThan(3);
    expect(anchor.x).toBe(0);
  });

  it('drags the dynamic body when it was added after its anchor', () => {
    // The orientation that already worked, kept so the veto cannot be "fixed" by breaking this one.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const anchor = box(world, 'static', 0, 0);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, anchor.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      frequencyHz: 5,
      dampingRatio: 0.7,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyB).toBe(dragged.index);
    run(world, 60);
    expect(dragged.x).toBeGreaterThan(3);
  });
});

describe('physics2DPrismaticJointSolver', () => {
  // A vertical rail with a stop below it, so a slider falls onto the stop and how far it sinks past is
  // the compliance. Same shape as the hinge's test, one dimension over.
  const RAIL_LOWER = -1;
  const RAIL_DT = 1 / 480;

  function limitedSlider(density: number, frequencyHz: number, enableLimitSpring: boolean) {
    const material = { density, friction: 0, restitution: 0 };
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = createRigidBody2D('static', 0, 0);
    rail.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, material));
    addPhysics2DBody(world, rail);
    const slider = createRigidBody2D('dynamic', 0, -0.5);
    slider.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.3 }, material));
    addPhysics2DBody(world, slider);
    const joint: Physics2DPrismaticJoint = {
      ...baseJoint(Physics2DPrismaticJointKind, rail.index, slider.index),
      localAxisAX: 0,
      localAxisAY: 1,
      referenceAngle: 0,
      enableMotor: false,
      motorSpeed: 0,
      maxMotorForce: 0,
      motorImpulse: 0,
      enableLimit: true,
      lowerTranslation: RAIL_LOWER,
      upperTranslation: 1,
      enableLimitSpring,
      limitFrequencyHz: frequencyHz,
      limitDampingRatio: 1,
    };
    addPhysics2DJoint(world, joint);
    for (let step = 0; step < 2400; step++) stepPhysics2D(world, RAIL_DT);
    // Statics again, on the linear axis: weight over a spring rate of `m * (2*pi*f)^2`, so mass cancels
    // and the sink depth is `g / omega^2`.
    const predictedSink = 10 / (2 * Math.PI * frequencyHz) ** 2;
    return { sink: RAIL_LOWER - slider.y, predictedSink, slider };
  }

  it('arrests the slider at a hard travel stop', () => {
    expect(limitedSlider(1, 0, false).sink).toBeLessThan(0.02);
  });

  it('sinks past a compliant travel stop by the depth its authored frequency predicts', () => {
    for (const frequency of [20, 40]) {
      const soft = limitedSlider(1, frequency, true);
      expect(soft.sink, `${String(frequency)} Hz`).toBeCloseTo(soft.predictedSink, 3);
    }
  });

  it('sinks the same depth whatever the slider weighs', () => {
    const light = limitedSlider(1, 20, true);
    const heavy = limitedSlider(4, 20, true);
    expect(heavy.slider.mass).toBeCloseTo(light.slider.mass * 4, 9);
    expect(heavy.sink).toBe(light.sink);
  });

  it('leaves a pinned rail hard, because a zero-width range has no side to yield toward', () => {
    // Coincident bounds make the axis row a two-sided equality rather than a stop, and a spring there
    // would be a rest length on a coordinate that is not allowed to move at all.
    const material = { density: 1, friction: 0, restitution: 0 };
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = createRigidBody2D('static', 0, 0);
    rail.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, material));
    addPhysics2DBody(world, rail);
    const slider = createRigidBody2D('dynamic', 0, -0.5);
    slider.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.3 }, material));
    addPhysics2DBody(world, slider);
    const pinned: Physics2DPrismaticJoint = {
      ...baseJoint(Physics2DPrismaticJointKind, rail.index, slider.index),
      localAxisAX: 0,
      localAxisAY: 1,
      referenceAngle: 0,
      enableMotor: false,
      motorSpeed: 0,
      maxMotorForce: 0,
      motorImpulse: 0,
      enableLimit: true,
      lowerTranslation: -0.5,
      upperTranslation: -0.5,
      enableLimitSpring: true,
      limitFrequencyHz: 20,
      limitDampingRatio: 1,
    };
    addPhysics2DJoint(world, pinned);

    for (let step = 0; step < 1200; step++) stepPhysics2D(world, RAIL_DT);

    expect(slider.y).toBeCloseTo(-0.5, 3);
  });

  it('allows motion along its axis while removing perpendicular motion and relative rotation', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', 0, 1);
    slider.angle = 0.4;
    slider.velocityX = 2;
    addPhysics2DJoint(world, prismaticJoint(rail.index, slider.index));

    run(world, 120);

    expect(slider.x).toBeGreaterThan(3);
    expect(Math.abs(slider.y)).toBeLessThan(0.05);
    expect(Math.abs(slider.angle)).toBeLessThan(0.05);
  });

  it('keeps the slider on an axis carried by a rotating rail body', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'dynamic', 0, 0);
    const slider = box(world, 'dynamic', 2, 0);
    rail.angularVelocity = 1;
    slider.angularVelocity = 1;
    addPhysics2DJoint(world, prismaticJoint(rail.index, slider.index));

    run(world, 60);

    const axisX = Math.cos(rail.angle);
    const axisY = Math.sin(rail.angle);
    const distanceX = slider.x - rail.x;
    const distanceY = slider.y - rail.y;
    const perpendicularError = -axisY * distanceX + axisX * distanceY;
    expect(Math.abs(perpendicularError)).toBeLessThan(0.1);
    expect(slider.angle).toBeCloseTo(rail.angle, 3);
  });

  it('drives translation toward its motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', 0, 0);
    addPhysics2DJoint(
      world,
      prismaticJoint(rail.index, slider.index, { enableMotor: true, maxMotorForce: 1000, motorSpeed: 2 }),
    );

    run(world, 30);

    expect(slider.velocityX).toBeCloseTo(2, 6);
    expect(slider.x).toBeCloseTo(1, 3);
  });

  it('bounds its motor impulse by force times timestep', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', 0, 0);
    const maxMotorForce = 1;
    addPhysics2DJoint(
      world,
      prismaticJoint(rail.index, slider.index, { enableMotor: true, maxMotorForce, motorSpeed: 100 }),
    );

    const dt = 0.01;
    stepPhysics2D(world, dt);

    const maximumDelta = maxMotorForce * dt * slider.inverseMass;
    expect(slider.velocityX).toBeGreaterThan(0);
    expect(slider.velocityX).toBeLessThanOrEqual(maximumDelta * 1.0000001);
  });

  it('exerts no force after its motor is disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', 0, 0);
    const joint = prismaticJoint(rail.index, slider.index, {
      enableMotor: true,
      maxMotorForce: 1,
      motorSpeed: 10,
    });
    addPhysics2DJoint(world, joint);
    stepPhysics2D(world, 1 / 60);

    joint.enableMotor = false;
    slider.velocityX = 0;
    stepPhysics2D(world, 1 / 60);

    expect(joint.motorImpulse).toBe(0);
    expect(slider.velocityX).toBe(0);
  });

  it('stops a motor at the upper translation limit', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', 0, 0);
    addPhysics2DJoint(
      world,
      prismaticJoint(rail.index, slider.index, {
        enableLimit: true,
        enableMotor: true,
        lowerTranslation: -0.5,
        maxMotorForce: 1000,
        motorSpeed: 5,
        upperTranslation: 1,
      }),
    );

    run(world, 120);

    expect(slider.x).toBeCloseTo(1, 5);
    expect(slider.velocityX).toBeCloseTo(0, 5);
  });

  it('corrects a translation already below the lower limit', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const rail = box(world, 'static', 0, 0);
    const slider = box(world, 'dynamic', -2, 0);
    addPhysics2DJoint(
      world,
      prismaticJoint(rail.index, slider.index, {
        enableLimit: true,
        lowerTranslation: -1,
        upperTranslation: 1,
      }),
    );

    run(world, 60);

    expect(slider.x).toBeGreaterThan(-1.05);
  });

  it('preserves axis direction and translation limits when canonical ordering swaps the ends', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
    const slider = box(world, 'dynamic', 1, 0);
    const rail = box(world, 'static', 0, 0);
    const joint = prismaticJoint(rail.index, slider.index, {
      enableLimit: true,
      localAxisAX: -1,
      lowerTranslation: -2,
      motorSpeed: 3,
      referenceAngle: 0,
      upperTranslation: 4,
    });

    addPhysics2DJoint(world, joint);

    expect(joint.bodyA).toBe(slider.index);
    expect(joint.localAxisAX).toBe(1);
    expect(joint.lowerTranslation).toBe(-2);
    expect(joint.upperTranslation).toBe(4);
    expect(joint.motorSpeed).toBe(3);
  });
});

describe('physics2DPulleyJointSolver', () => {
  it('preserves the coupled cable length while transferring motion between its ends', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPulleyJointKind, physics2DPulleyJointSolver);
    const left = box(world, 'dynamic', 0, -2);
    const right = box(world, 'dynamic', 4, -2);
    left.velocityY = -2;
    addPhysics2DJoint(world, pulleyJoint(left.index, right.index));

    run(world, 120);

    const lengthA = Math.hypot(left.x, left.y);
    const lengthB = Math.hypot(right.x - 4, right.y);
    expect(lengthA + lengthB).toBeCloseTo(4, 3);
    expect(left.y).toBeLessThan(-2.5);
    expect(right.y).toBeGreaterThan(-1.5);
  });

  it('weights the second cable length by its configured ratio', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPulleyJointKind, physics2DPulleyJointSolver);
    const left = box(world, 'dynamic', 0, -2);
    const right = box(world, 'dynamic', 4, -2);
    left.velocityY = -2;
    addPhysics2DJoint(world, pulleyJoint(left.index, right.index, { constant: 6, ratio: 2 }));

    run(world, 120);

    const lengthA = Math.hypot(left.x, left.y);
    const lengthB = Math.hypot(right.x - 4, right.y);
    expect(lengthA + 2 * lengthB).toBeCloseTo(6, 3);
    expect(Math.abs(left.y + 2)).toBeGreaterThan(Math.abs(right.y + 2));
  });

  it('preserves the same constraint when canonical ordering exchanges the ends', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DPulleyJointKind, physics2DPulleyJointSolver);
    const first = box(world, 'dynamic', 4, -2);
    const second = box(world, 'dynamic', 0, -2);
    const joint = pulleyJoint(second.index, first.index, {
      constant: 6,
      groundAnchorAX: 0,
      groundAnchorAY: 1,
      groundAnchorBX: 4,
      groundAnchorBY: 2,
      impulse0: 3,
      ratio: 2,
    });

    addPhysics2DJoint(world, joint);

    expect(joint.bodyA).toBe(first.index);
    expect(joint.groundAnchorAX).toBe(4);
    expect(joint.groundAnchorAY).toBe(2);
    expect(joint.groundAnchorBX).toBe(0);
    expect(joint.groundAnchorBY).toBe(1);
    expect(joint.ratio).toBeCloseTo(0.5, 12);
    expect(joint.constant).toBeCloseTo(3, 12);
    expect(joint.impulse0).toBeCloseTo(6, 12);
  });
});

describe('physics2DRevoluteJointSolver', () => {
  // A hinged arm whose mass hangs 1.5 to the side, limited below at LIMIT_ANGLE, so gravity drives it
  // into the lower stop and how far past it settles is the compliance under test. The frequencies are
  // deliberately stiff relative to this load: a spring soft enough to be overwhelmed does not settle at
  // all, and measuring one at an arbitrary moment reads a swinging pendulum as a sag.
  const LIMIT_ANGLE = -0.05;
  const LIMIT_DT = 1 / 480;

  function limitedArm(density: number, frequencyHz: number, enableLimitSpring: boolean) {
    const material = { density, friction: 0, restitution: 0 };
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const post = createRigidBody2D('static', 0, 0);
    post.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, material));
    addPhysics2DBody(world, post);
    const arm = createRigidBody2D('dynamic', 0, 0);
    arm.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 1.5, y: 0, radius: 0.3 }, material));
    addPhysics2DBody(world, arm);
    const joint: Physics2DRevoluteJoint = {
      ...baseJoint(Physics2DRevoluteJointKind, post.index, arm.index),
      enableMotor: false,
      motorSpeed: 0,
      maxMotorTorque: 0,
      motorImpulse: 0,
      enableLimit: true,
      lowerAngle: LIMIT_ANGLE,
      upperAngle: 1,
      referenceAngle: 0,
      enableLimitSpring,
      limitFrequencyHz: frequencyHz,
      limitDampingRatio: 1,
    };
    addPhysics2DJoint(world, joint);
    for (let step = 0; step < 2400; step++) stepPhysics2D(world, LIMIT_DT);
    // Statics: the arm's weight applies this moment about the hinge, and an angular spring of frequency
    // `f` resists it with stiffness `I * (2*pi*f)^2`. Mass cancels from the ratio, which is what makes
    // the authored frequency mean something.
    const predictedSag = (arm.mass * 10 * 1.5) / (arm.inertia * (2 * Math.PI * frequencyHz) ** 2);
    return { sag: LIMIT_ANGLE - arm.angle, predictedSag, arm };
  }

  it('arrests the arm at a hard limit, which is what a joint that sets no spring still gets', () => {
    const hard = limitedArm(1, 0, false);
    expect(hard.sag).toBeLessThan(0.001);
  });

  it('lets a compliant limit sag by the deflection its authored frequency predicts', () => {
    // Checked against statics rather than against a recorded number, so a change to how the row is
    // derived has to still describe a spring of the frequency the caller asked for.
    for (const frequency of [20, 40]) {
      const soft = limitedArm(1, frequency, true);
      expect(soft.sag, `${String(frequency)} Hz`).toBeCloseTo(soft.predictedSag, 3);
    }
  });

  it('sags four times as far when the limit spring is half the frequency', () => {
    // Deflection goes as 1 / omega^2, so halving the frequency quadruples it. A row that merely got
    // "softer with a smaller number" would pass a monotonicity check and fail this one.
    const stiff = limitedArm(1, 40, true);
    const soft = limitedArm(1, 20, true);
    expect(soft.sag / stiff.sag).toBeCloseTo(4, 1);
  });

  it('sags the same distance whatever the arm weighs', () => {
    // The point of authoring a stop by frequency. Both the driving moment and the stiffness scale with
    // mass, so it cancels — and it must cancel EXACTLY, not approximately.
    const light = limitedArm(1, 20, true);
    const heavy = limitedArm(4, 20, true);
    expect(heavy.arm.mass).toBeCloseTo(light.arm.mass * 4, 9);
    expect(heavy.sag).toBe(light.sag);
  });

  it('stays one-sided when softened, and never pulls the arm back inside the range', () => {
    // Softening changes how hard a stop resists being crossed, never whether it may pull. A row that
    // gained a rest length would hoist the arm back above the limit it is resting against.
    const soft = limitedArm(1, 20, true);
    expect(soft.sag).toBeGreaterThan(0);
    expect(soft.arm.angle).toBeLessThan(LIMIT_ANGLE);
  });

  it('behaves exactly as a hard stop when the spring is enabled with no frequency', () => {
    // The degenerate authoring case — a caller flips the flag and forgets the number. It must degrade to
    // the stop it replaced rather than to a constraint that does nothing.
    const hard = limitedArm(1, 0, false);
    const frequencyless = limitedArm(1, 0, true);
    expect(frequencyless.arm.angle).toBe(hard.arm.angle);
  });

  it('keeps the pinned anchors together while leaving rotation free', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const arm = box(world, 'dynamic', 1, 5);
    const joint = {
      ...baseJoint(Physics2DRevoluteJointKind, anchor.index, arm.index),
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: -1,
      localAnchorBY: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // The arm's anchor point must stay on the static body's anchor.
    const cos = Math.cos(arm.angle);
    const sin = Math.sin(arm.angle);
    const anchorX = arm.x + -1 * cos - 0 * sin;
    const anchorY = arm.y + -1 * sin + 0 * cos;
    expect(Math.abs(anchorX - anchor.x)).toBeLessThan(0.15);
    expect(Math.abs(anchorY - anchor.y)).toBeLessThan(0.15);
    // Rotation is free, so gravity must have swung it.
    expect(Math.abs(arm.angle)).toBeGreaterThan(0.05);
  });
});

describe('physics2DRevoluteJointSolver motor and limits', () => {
  // The type advertises a motor and an angular limit; the solver read none of those fields, so an
  // enabled motor left the arm at exactly zero angular velocity. These are the behaviours the header
  // promises, asserted against the numbers the promise implies rather than against "it moved".
  function hinged(world: Physics2DWorld) {
    const anchor = box(world, 'static', 0, 0);
    const arm = box(world, 'dynamic', 0, 0);
    return { anchor, arm };
  }

  it('drives the relative angular velocity to the motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 100, motorSpeed: 2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(2, 6);
    // Half a second at 2 rad/s.
    expect(arm.angle).toBeCloseTo(1, 3);
  });

  it('drives the relative angle the other way for a negative motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 100, motorSpeed: -2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(-2, 6);
  });

  it('does not drive the arm at all when the motor is disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: false, maxMotorTorque: 100, motorSpeed: 2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(0, 9);
  });

  it('bounds the motor by its torque, so a small budget cannot reach the target speed', () => {
    // The torque bound is a torque: the accumulated impulse may not exceed maxMotorTorque * dt.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    const maxMotorTorque = 0.01;
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque, motorSpeed: 100 }),
    );
    const dt = 1 / 60;
    let previous = arm.angularVelocity;
    for (let i = 0; i < 10; i++) {
      stepPhysics2D(world, dt);
      const perStep = maxMotorTorque * dt * arm.inverseInertia;
      expect(Math.abs(arm.angularVelocity - previous)).toBeLessThanOrEqual(perStep * 1.0000001);
      previous = arm.angularVelocity;
    }
    expect(arm.angularVelocity).toBeLessThan(100);
  });

  // The bound test above passes for a motor that stops acting entirely — every delta of zero is <= the
  // bound — which is exactly how a saturated accumulator hid. This asserts the motor keeps ACTING, the
  // property the title of that test claims. The motor impulse persists across steps, so it must be
  // reapplied in warm start; without that the running total pins at maxMotorTorque * dt on step one and
  // every later step adds nothing.
  it('keeps accelerating on later steps rather than pinning after the first', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 0.01, motorSpeed: 100 }),
    );

    stepPhysics2D(world, 1 / 60);
    const afterFirst = arm.angularVelocity;
    stepPhysics2D(world, 1 / 60);
    const afterSecond = arm.angularVelocity;

    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBeGreaterThan(afterFirst);
  });

  it('keeps accelerating across many steps toward the target speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 0.01, motorSpeed: 100 }),
    );

    stepPhysics2D(world, 1 / 60);
    const afterFirst = arm.angularVelocity;
    for (let i = 0; i < 29; i++) stepPhysics2D(world, 1 / 60);

    // Thirty steps of a bounded motor must be meaningfully faster than one, not the same value.
    expect(arm.angularVelocity).toBeGreaterThan(afterFirst * 5);
  });

  // A cached impulse is only valid while the thing that produced it is still running. `solve` skips a
  // disabled motor, so warm start must skip it too — otherwise the last impulse is reapplied every step
  // with nothing to cancel it, and a switched-off motor keeps turning the joint forever.
  it('exerts no torque once the motor is disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    const joint = revoluteJoint(anchor.index, arm.index, {
      enableMotor: true,
      maxMotorTorque: 1,
      motorSpeed: 10,
    });
    addPhysics2DJoint(world, joint);
    stepPhysics2D(world, 1 / 60);

    joint.enableMotor = false;
    arm.angularVelocity = 0;
    stepPhysics2D(world, 1 / 60);

    expect(arm.angularVelocity).toBe(0);
  });

  it('stays still across many steps with the motor disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    const joint = revoluteJoint(anchor.index, arm.index, {
      enableMotor: true,
      maxMotorTorque: 1,
      motorSpeed: 10,
    });
    addPhysics2DJoint(world, joint);
    for (let i = 0; i < 5; i++) stepPhysics2D(world, 1 / 60);

    joint.enableMotor = false;
    arm.angularVelocity = 0;
    for (let i = 0; i < 20; i++) stepPhysics2D(world, 1 / 60);

    expect(arm.angularVelocity).toBe(0);
  });

  // Clearing rather than merely skipping: a motor switched back on starts from rest, not from whatever
  // the accumulator held when it was last enabled.
  it('starts from rest when the motor is re-enabled rather than resuming a stale accumulator', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    const joint = revoluteJoint(anchor.index, arm.index, {
      enableMotor: true,
      maxMotorTorque: 1,
      motorSpeed: 10,
    });
    addPhysics2DJoint(world, joint);
    for (let i = 0; i < 5; i++) stepPhysics2D(world, 1 / 60);

    joint.enableMotor = false;
    stepPhysics2D(world, 1 / 60);
    expect(joint.motorImpulse).toBe(0);

    joint.enableMotor = true;
    arm.angularVelocity = 0;
    stepPhysics2D(world, 1 / 60);

    // Acts again, and from a cold accumulator: one step of a 1 N·m budget, not a resumed total.
    expect(arm.angularVelocity).toBeGreaterThan(0);
    expect(Math.abs(joint.motorImpulse)).toBeLessThanOrEqual((1 / 60) * 1 * 1.0000001);
  });

  // Critic's repro: a joint authored OUTSIDE its interval. The header says limits clamp the angle into
  // the interval, and the previous bias (remaining room, clamped at zero) went silent exactly when the
  // angle was already out of range -- so a violated joint sitting still was never pushed back.
  it('corrects an angle that is already outside the limit interval', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    arm.angle = 1;
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableLimit: true, lowerAngle: -0.5, upperAngle: 0.5 }),
    );

    for (let i = 0; i < 30; i++) stepPhysics2D(world, 1 / 60);

    expect(arm.angle).toBeLessThan(1);
    expect(arm.angle).toBeLessThan(0.6);
  });

  it('corrects a violation of the lower bound too, not just the upper', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    arm.angle = -1;
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableLimit: true, lowerAngle: -0.5, upperAngle: 0.5 }),
    );

    for (let i = 0; i < 30; i++) stepPhysics2D(world, 1 / 60);

    expect(arm.angle).toBeGreaterThan(-0.6);
  });

  // The opposite failure, which the correcting form must not reintroduce: while the angle is INSIDE the
  // interval the limit has to stay silent, or it brakes a motor nowhere near the bound.
  it('stays silent while the angle is inside the interval', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        lowerAngle: -3,
        upperAngle: 3,
        enableMotor: true,
        maxMotorTorque: 100,
        motorSpeed: 5,
      }),
    );

    for (let i = 0; i < 20; i++) stepPhysics2D(world, 1 / 60);

    expect(arm.angularVelocity).toBeGreaterThan(1);
  });

  it('stops the arm at the upper limit instead of letting the motor carry it past', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -0.2,
        maxMotorTorque: 1000,
        motorSpeed: 5,
        upperAngle: 0.5,
      }),
    );
    run(world, 120);
    expect(arm.angle).toBeCloseTo(0.5, 6);
    expect(arm.angularVelocity).toBeCloseTo(0, 6);
  });

  it('stops the arm at the lower limit when driven the other way', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -0.3,
        maxMotorTorque: 1000,
        motorSpeed: -5,
        upperAngle: 0.5,
      }),
    );
    run(world, 120);
    expect(arm.angle).toBeCloseTo(-0.3, 6);
  });

  it('leaves the arm free to turn while it is inside the limit interval', () => {
    // The regression that cost the most to find: a limit whose bias is the violation depth rather
    // than the remaining room brakes ALL rotation, so an enabled limit the arm was nowhere near held
    // it at a standstill while the motor spent its whole torque budget every step.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -100,
        maxMotorTorque: 1000,
        motorSpeed: 5,
        upperAngle: 100,
      }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(5, 6);
  });

  it('exchanges and negates the limit interval when the ends are swapped', () => {
    // lower <= (angleB - angleA - reference) <= upper. Reversing the ends negates that measurement, so
    // the same physical interval requires the bounds to negate AND trade places.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    const joint = revoluteJoint(first.index, second.index, {
      lowerAngle: -0.2,
      motorSpeed: 3,
      referenceAngle: 0.1,
      upperAngle: 0.5,
    });
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
    expect(joint.lowerAngle).toBeCloseTo(-0.5, 12);
    expect(joint.upperAngle).toBeCloseTo(0.2, 12);
    expect(joint.referenceAngle).toBeCloseTo(-0.1, 12);
    expect(joint.motorSpeed).toBeCloseTo(-3, 12);
  });
});

describe('physics2DRopeJointSolver', () => {
  it('goes slack inside its length and catches the body at full extension', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRopeJointKind, physics2DRopeJointSolver);
    const anchor = box(world, 'static', 0, 10);
    const bob = box(world, 'dynamic', 0, 9.5);
    const joint: Physics2DRopeJoint = {
      ...baseJoint(Physics2DRopeJointKind, anchor.index, bob.index),
      maxLength: 3,
    };
    addPhysics2DJoint(world, joint);

    run(world, 30);
    // Still inside the rope's length: it must not have pulled the body back up.
    expect(anchor.y - bob.y).toBeLessThan(3.05);
    run(world, 300);
    expect(anchor.y - bob.y).toBeLessThan(3.2);
    expect(anchor.y - bob.y).toBeGreaterThan(2.8);
  });
});

function wheelJoint(bodyA: number, bodyB: number, over: Partial<Physics2DWheelJoint> = {}): Physics2DWheelJoint {
  return {
    ...baseJoint(Physics2DWheelJointKind, bodyA, bodyB),
    dampingRatio: 0.7,
    enableMotor: false,
    localAxisAX: 0,
    localAxisAY: 1,
    maxMotorTorque: 0,
    motorImpulse: 0,
    motorSpeed: 0,
    restTranslation: -2,
    frequencyHz: 4,
    ...over,
  } as Physics2DWheelJoint;
}

describe('physics2DWeldJointSolver', () => {
  it('locks the relative angle as well as the anchor point', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const post = box(world, 'static', 0, 5);
    const welded = box(world, 'dynamic', 1, 5);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, post.index, welded.index),
      localAnchorBX: -1,
      localAnchorBY: 0,
      referenceAngle: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // A revolute would have swung; a weld holds the angle.
    expect(Math.abs(welded.angle)).toBeLessThan(0.2);
    expect(Math.abs(welded.y - 5)).toBeLessThan(0.3);
  });
});

describe('physics2DWheelJointSolver', () => {
  it('locks lateral motion while preserving suspension travel and free rotation', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const chassis = box(world, 'static', 0, 2);
    const wheel = box(world, 'dynamic', 1, 0);
    wheel.angularVelocity = 2;
    addPhysics2DJoint(world, wheelJoint(chassis.index, wheel.index, { frequencyHz: 0 }));

    run(world, 120);

    expect(Math.abs(wheel.x)).toBeLessThan(0.05);
    expect(wheel.y).toBeCloseTo(0, 5);
    expect(Math.abs(wheel.angle)).toBeGreaterThan(1);
  });

  it('supports a wheel against gravity with a damped suspension spring', () => {
    const world = createPhysics2DWorld(0, -10);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const chassis = box(world, 'static', 0, 2);
    const wheel = box(world, 'dynamic', 0, 0);
    addPhysics2DJoint(world, wheelJoint(chassis.index, wheel.index));

    run(world, 240);

    expect(wheel.y).toBeGreaterThan(-0.5);
    expect(wheel.y).toBeLessThan(0.1);
    expect(Math.abs(wheel.velocityY)).toBeLessThan(0.1);
  });

  it('drives relative rotation toward its motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const chassis = box(world, 'static', 0, 2);
    const wheel = box(world, 'dynamic', 0, 0);
    addPhysics2DJoint(
      world,
      wheelJoint(chassis.index, wheel.index, { enableMotor: true, maxMotorTorque: 100, motorSpeed: 3 }),
    );

    run(world, 30);

    expect(wheel.angularVelocity).toBeCloseTo(3, 5);
  });

  it('bounds motor acceleration by torque times timestep', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const chassis = box(world, 'static', 0, 2);
    const wheel = box(world, 'dynamic', 0, 0);
    const maxMotorTorque = 0.5;
    addPhysics2DJoint(
      world,
      wheelJoint(chassis.index, wheel.index, { enableMotor: true, maxMotorTorque, motorSpeed: 100 }),
    );

    const dt = 0.01;
    stepPhysics2D(world, dt);

    const maximumDelta = maxMotorTorque * dt * wheel.inverseInertia;
    expect(wheel.angularVelocity).toBeGreaterThan(0);
    expect(wheel.angularVelocity).toBeLessThanOrEqual(maximumDelta * 1.0000001);
  });

  it('clears its motor impulse when the motor is disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const chassis = box(world, 'static', 0, 2);
    const wheel = box(world, 'dynamic', 0, 0);
    const joint = wheelJoint(chassis.index, wheel.index, {
      enableMotor: true,
      maxMotorTorque: 1,
      motorSpeed: 10,
    });
    addPhysics2DJoint(world, joint);
    stepPhysics2D(world, 1 / 60);

    joint.enableMotor = false;
    wheel.angularVelocity = 0;
    stepPhysics2D(world, 1 / 60);

    expect(joint.motorImpulse).toBe(0);
    expect(wheel.angularVelocity).toBe(0);
  });

  it('preserves authored ends because free relative rotation prevents descriptor-only axis swapping', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
    const wheel = box(world, 'dynamic', 0, 0);
    const chassis = box(world, 'static', 0, 2);
    const joint = wheelJoint(chassis.index, wheel.index);

    addPhysics2DJoint(world, joint);

    expect(chassis.index).toBeGreaterThan(wheel.index);
    expect(joint.bodyA).toBe(chassis.index);
    expect(joint.bodyB).toBe(wheel.index);
  });
});
