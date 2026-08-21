import type { Physics3DFixedJoint, Physics3DJoint, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { refreshRigidBody3DWorldInertia } from './integrate';
import { createPhysics3DFixedJoint } from './jointFactories';
import {
  applyRow,
  beginJointSolve,
  clearJointSolve,
  frameABasis,
  frameARotation,
  frameBBasis,
  frameBRotation,
  getJointSolveState,
  getRowMass,
  getRowVelocity,
  POINT_BIAS,
  POINT_LENGTH,
  POINT_MASS,
  prepareAngularBlock,
  preparePointBlock,
  readFrameBases,
  readFrameRotations,
  readJointImpulse,
  ROW_LENGTH,
  solveAngularBlock,
  solveEqualityRow,
  solveLowerLimitRow,
  solveMotorRow,
  solvePointBlock,
  solveUpperLimitRow,
  warmStartAngularBlock,
  warmStartPointBlock,
  writeAngularRow,
  writeJointImpulse,
  writeRow,
  writePhysics3DSoftRowParameters,
} from './jointRows';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { createRigidBody3D } from './world';

describe('applyRow', () => {
  it('drives a row toward rest when scaled by the row mass', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = 2;
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    applyRow(bodyA, bodyB, state, 0, -getRowVelocity(bodyA, bodyB, state, 0) * getRowMass(bodyA, bodyB, state, 0));

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeCloseTo(0, 12);
  });

  it('does nothing for a zero impulse', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    applyRow(bodyA, bodyB, state, 0, 0);

    expect(bodyB.velocityX).toBe(0);
  });
});

describe('beginJointSolve', () => {
  it('sizes the scratch and hands the same array back next time', () => {
    const joint = createTestJoint();

    const first = beginJointSolve(joint, 5);
    first[0] = 9;
    const second = beginJointSolve(joint, 8);

    expect(second).toBe(first);
    expect(second.length).toBe(8);
  });

  it('establishes accumulators a reconstructed joint reached the solver without', () => {
    const joint = createTestJoint();
    // A joint deserialized from a saved world satisfies the required type at compile time only; at runtime the
    // fields are simply absent, and the first `undefined + x` would send NaN out through both bodies.
    (joint as Partial<Physics3DJoint>).impulse0 = undefined;
    (joint as Partial<Physics3DJoint>).impulse5 = undefined;

    beginJointSolve(joint, 4);

    expect(joint.impulse0).toBe(0);
    expect(joint.impulse5).toBe(0);
  });
});

describe('clearJointSolve', () => {
  it('leaves a solve with nothing to read', () => {
    const joint = createTestJoint();
    beginJointSolve(joint, 4);

    clearJointSolve(joint);

    expect(getJointSolveState(joint)).toBeUndefined();
  });
});

describe('frameABasis', () => {
  it('holds nine numbers, three per axis', () => {
    expect(frameABasis.length).toBe(9);
    expect(frameBBasis.length).toBe(9);
  });
});

describe('frameARotation', () => {
  it('holds a quaternion, and starts as the identity', () => {
    expect(frameARotation.length).toBe(4);
    expect(frameBRotation.length).toBe(4);
  });
});

describe('frameBBasis', () => {
  it('is a distinct array from the frame A basis', () => {
    expect(frameBBasis).not.toBe(frameABasis);
  });
});

describe('frameBRotation', () => {
  it('is a distinct array from the frame A rotation', () => {
    expect(frameBRotation).not.toBe(frameARotation);
  });
});

describe('getJointSolveState', () => {
  it('is undefined until a prepare has run', () => {
    expect(getJointSolveState(createTestJoint())).toBeUndefined();
  });
});

describe('getRowMass', () => {
  it('reads the row at the given offset rather than the head of the state', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    writeRow(state, ROW_LENGTH, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    expect(getRowMass(bodyA, bodyB, state, 0)).toBe(0);
    expect(getRowMass(bodyA, bodyB, state, ROW_LENGTH)).toBeCloseTo(0.5, 12);
  });
});

describe('getRowVelocity', () => {
  it('measures B relative to A along the row', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityY = 3;
    const state = newState();
    writeRow(state, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeCloseTo(3, 12);
  });
});

describe('POINT_BIAS', () => {
  it('follows the six-number mass block', () => {
    expect(POINT_BIAS).toBe(POINT_MASS + 6);
    expect(POINT_LENGTH).toBe(POINT_BIAS + 3);
  });
});

describe('POINT_LENGTH', () => {
  it('covers the whole point block', () => {
    expect(POINT_LENGTH).toBe(9);
  });
});

describe('POINT_MASS', () => {
  it('sits at the head of the per-step state', () => {
    expect(POINT_MASS).toBe(0);
  });
});

describe('prepareAngularBlock', () => {
  it('reads the frames left by readFrameRotations', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    setAxisAngle(bodyB, 0, 0, 1, 0.4);
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
    const state = beginJointSolve(joint, 32);

    readFrameRotations(bodyA, bodyB, joint);
    prepareAngularBlock(bodyA, bodyB, state, 0, 6, 1 / 60);

    // The bias is the rotation error scaled by BAUMGARTE / dt: 0.4 * 0.2 * 60.
    expect(state[8]).toBeCloseTo(0.4 * 0.2 * 60, 9);
  });
});

describe('preparePointBlock', () => {
  it('writes the lever arms and the inverted mass block', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.x = 3;
    const joint = createTestJoint();
    joint.localAnchorAX = 1;
    const state = newState();

    preparePointBlock(bodyA, bodyB, joint, state, 1 / 60);

    expect(joint.rAX).toBeCloseTo(1, 12);
    // Both anchors are on their centres for B and one unit out on A, and the inverse of the diagonal 2 that a
    // zero-arm pair would give is 0.5.
    expect(state[POINT_MASS]).toBeCloseTo(0.5, 12);
    expect(state[POINT_BIAS]).toBeCloseTo(2 * 0.2 * 60, 9);
  });
});

describe('readFrameBases', () => {
  it('expands both frames into world axes', () => {
    const bodyA = createUnitBody();
    setAxisAngle(bodyA, 0, 0, 1, Math.PI / 2);
    const bodyB = createUnitBody();

    readFrameBases(bodyA, bodyB, createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 }));

    expect(frameABasis[0]).toBeCloseTo(0, 12);
    expect(frameABasis[1]).toBeCloseTo(1, 12);
    expect(frameBBasis[0]).toBeCloseTo(1, 12);
  });
});

describe('readFrameRotations', () => {
  it('establishes an absent frame as the identity', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
    (joint as Partial<Physics3DFixedJoint>).localRotationAW = undefined;
    (joint as Partial<Physics3DFixedJoint>).localRotationAX = undefined;

    readFrameRotations(bodyA, bodyB, joint);

    expect(joint.localRotationAW).toBe(1);
    expect(frameARotation[3]).toBeCloseTo(1, 12);
  });
});

describe('readJointImpulse', () => {
  it('reads each of the six slots', () => {
    const joint = createTestJoint();
    joint.impulse0 = 10;
    joint.impulse3 = 13;
    joint.impulse5 = 15;

    expect(readJointImpulse(joint, 0)).toBe(10);
    expect(readJointImpulse(joint, 3)).toBe(13);
    expect(readJointImpulse(joint, 5)).toBe(15);
  });
});

describe('ROW_LENGTH', () => {
  it('is a direction plus two angular arms', () => {
    expect(ROW_LENGTH).toBe(9);
  });
});

describe('solveAngularBlock', () => {
  it('cancels relative rotation and accumulates into the upper three slots', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.angularVelocityY = 2;
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
    const state = beginJointSolve(joint, 32);
    readFrameRotations(bodyA, bodyB, joint);
    prepareAngularBlock(bodyA, bodyB, state, 0, 6, 1 / 60);

    solveAngularBlock(bodyA, bodyB, joint, state, 0, 6);

    expect(bodyB.angularVelocityY - bodyA.angularVelocityY).toBeCloseTo(0, 12);
    expect(joint.impulse4).not.toBe(0);
  });
});

describe('solveEqualityRow', () => {
  it('drives the row to the bias velocity and accumulates into its slot', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = 2;
    const joint = createTestJoint();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveEqualityRow(bodyA, bodyB, joint, 2, state, 0, getRowMass(bodyA, bodyB, state, 0), 0, 0);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeCloseTo(0, 12);
    expect(joint.impulse2).toBeCloseTo(-1, 12);
  });
});

describe('solveLowerLimitRow', () => {
  it('pushes a crossed bound back up', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveLowerLimitRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), -1, 60, ROW_LENGTH);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeGreaterThan(0);
  });

  it('never pulls a coordinate down through its bound', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = 5;
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveLowerLimitRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), 3, 60, ROW_LENGTH);

    expect(bodyB.velocityX).toBe(5);
  });
});

describe('solveMotorRow', () => {
  it('returns the accumulated impulse clamped to its budget', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    const total = solveMotorRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), 100, 0.25, 0);

    expect(total).toBeCloseTo(0.25, 12);
  });

  it('reaches its target speed when the budget allows', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveMotorRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), 4, 1000, 0);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeCloseTo(4, 12);
  });
});

describe('solvePointBlock', () => {
  it('cancels the velocity separating the anchors', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = 2;
    bodyB.velocityZ = -1;
    const joint = createTestJoint();
    const state = newState();
    preparePointBlock(bodyA, bodyB, joint, state, 1 / 60);

    solvePointBlock(bodyA, bodyB, joint, state);

    expect(bodyB.velocityX - bodyA.velocityX).toBeCloseTo(0, 12);
    expect(bodyB.velocityZ - bodyA.velocityZ).toBeCloseTo(0, 12);
  });
});

describe('solveUpperLimitRow', () => {
  it('pushes a crossed bound back down', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveUpperLimitRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), -1, 60, ROW_LENGTH);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeLessThan(0);
  });

  it('never pushes a coordinate up through its bound', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = -5;
    const state = newState();
    writeRow(state, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

    solveUpperLimitRow(bodyA, bodyB, state, 0, getRowMass(bodyA, bodyB, state, 0), 3, 60, ROW_LENGTH);

    expect(bodyB.velocityX).toBe(-5);
  });
});

describe('warmStartAngularBlock', () => {
  it('reapplies the angular accumulators', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const joint = createTestJoint();
    joint.impulse4 = 2;

    warmStartAngularBlock(bodyA, bodyB, joint);

    expect(bodyB.angularVelocityY).toBeCloseTo(2, 12);
    expect(bodyA.angularVelocityY).toBeCloseTo(-2, 12);
  });
});

describe('warmStartPointBlock', () => {
  it('reapplies the point accumulators', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const joint = createTestJoint();
    joint.impulse0 = 3;

    warmStartPointBlock(bodyA, bodyB, joint);

    expect(bodyB.velocityX).toBeCloseTo(3, 12);
    expect(bodyA.velocityX).toBeCloseTo(-3, 12);
  });
});

describe('writeAngularRow', () => {
  it('writes a row with no linear direction and the axis as both arms', () => {
    const state = newState();

    writeAngularRow(state, 0, 0, 1, 0);

    expect(state.slice(0, 9)).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 0]);
  });

  it('measures the relative spin about its axis', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.angularVelocityZ = 1.5;
    const state = newState();

    writeAngularRow(state, 0, 0, 0, 1);

    expect(getRowVelocity(bodyA, bodyB, state, 0)).toBeCloseTo(1.5, 12);
  });
});

describe('writeJointImpulse', () => {
  it('writes each of the six slots', () => {
    const joint = createTestJoint();

    for (let slot = 0; slot < 6; slot += 1) writeJointImpulse(joint, slot, slot + 1);

    expect([joint.impulse0, joint.impulse1, joint.impulse2, joint.impulse3, joint.impulse4, joint.impulse5]).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('writePhysics3DSoftRowParameters', () => {
  it('returns the hard parameters unchanged for a non-positive frequency', () => {
    // "Spring enabled but never configured" must not be a third behaviour. This is what makes an
    // unconfigured spring degrade to exactly the stop it replaced.
    const out = [0, 0, 0];
    writePhysics3DSoftRowParameters(4, 0, 0.7, 1 / 60, 60, out);
    expect(out).toEqual([4, 60, 0]);
    writePhysics3DSoftRowParameters(4, -1, 0.7, 1 / 60, 60, out);
    expect(out).toEqual([4, 60, 0]);
  });

  it('uses the caller HARD bias factor rather than a baked-in constant', () => {
    // The two callers legitimately disagree: a two-sided rest row corrects at BAUMGARTE/dt, a one-sided
    // limit row fully at 1/dt. Baking either in would silently change the other's hard behaviour.
    const out = [0, 0, 0];
    writePhysics3DSoftRowParameters(1, 0, 0, 1 / 60, 12, out);
    expect(out[1]).toBe(12);
    writePhysics3DSoftRowParameters(1, 0, 0, 1 / 60, 60, out);
    expect(out[1]).toBe(60);
  });

  it('softens the mass, which is an addition on the RECIPROCAL side', () => {
    // Compliance makes a constraint easier to violate, so it adds to the inverse mass. The softened mass
    // is therefore always below the rigid one, never a scaled-up version of it.
    const out = [0, 0, 0];
    const mass = 5;
    writePhysics3DSoftRowParameters(mass, 4, 0.7, 1 / 60, 60, out);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(mass);
    const gamma = out[2];
    expect(out[0]).toBeCloseTo(1 / (1 / mass + gamma), 12);
  });

  it('produces a bias factor INDEPENDENT of mass', () => {
    // The property the cone-twist and 6-DOF solvers rely on when several rows of different masses share
    // one bias slot. If this were false, the last row prepared would corrupt the others.
    const light = [0, 0, 0];
    const heavy = [0, 0, 0];
    writePhysics3DSoftRowParameters(0.25, 4, 0.7, 1 / 60, 60, light);
    writePhysics3DSoftRowParameters(400, 4, 0.7, 1 / 60, 60, heavy);
    expect(heavy[1]).toBeCloseTo(light[1], 12);
    // Gamma is NOT mass-independent — it scales as the reciprocal — which is why it gets a slot per row.
    expect(heavy[2]).toBeLessThan(light[2]);
  });

  it('stiffens toward the rigid mass as frequency rises', () => {
    const slack = [0, 0, 0];
    const stiff = [0, 0, 0];
    writePhysics3DSoftRowParameters(2, 1, 0.7, 1 / 60, 60, slack);
    writePhysics3DSoftRowParameters(2, 200, 0.7, 1 / 60, 60, stiff);
    expect(stiff[0]).toBeGreaterThan(slack[0]);
    expect(stiff[0]).toBeLessThanOrEqual(2);
  });

  it('stays finite for a zero mass rather than dividing by it', () => {
    const out = [0, 0, 0];
    writePhysics3DSoftRowParameters(0, 4, 0.7, 1 / 60, 60, out);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
    expect(Number.isFinite(out[2])).toBe(true);
  });
});

function createTestJoint(): Physics3DJoint {
  return createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
}

function createUnitBody(): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  const data = createPhysics3DMassData();
  data.mass = 1;
  data.inertiaXX = 1;
  data.inertiaYY = 1;
  data.inertiaZZ = 1;
  setRigidBody3DMassData(body, data);
  refreshRigidBody3DWorldInertia(body);
  return body;
}

function newState(): number[] {
  return new Array<number>(32).fill(0);
}

function setAxisAngle(body: RigidBody3D, x: number, y: number, z: number, angle: number): void {
  const sine = Math.sin(angle / 2);
  body.orientationX = x * sine;
  body.orientationY = y * sine;
  body.orientationZ = z * sine;
  body.orientationW = Math.cos(angle / 2);
  refreshRigidBody3DWorldInertia(body);
}

describe('writeRow', () => {
  it('lays the direction and the two arms out in one block', () => {
    const state = newState();

    writeRow(state, ROW_LENGTH, 1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(state.slice(ROW_LENGTH, ROW_LENGTH * 2)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
