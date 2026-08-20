import type { Physics3DJoint, Physics3DJointFrames, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { refreshRigidBody3DWorldInertia } from './integrate';
import {
  applyPhysics3DJointAngularImpulse,
  applyPhysics3DJointImpulse,
  applyPhysics3DJointRowImpulse,
  getPhysics3DJointRowMass,
  getPhysics3DJointRowVelocity,
  swapPhysics3DJointFrames,
  writePhysics3DJointAnchorVelocity,
  writePhysics3DJointAnchors,
  writePhysics3DJointAngularMass,
  writePhysics3DJointFrameBasis,
  writePhysics3DJointFrameRotation,
  writePhysics3DJointPointMass,
  writePhysics3DJointRelativeRotation,
  writePhysics3DJointRotationError,
  writePhysics3DJointSeparation,
} from './jointMath';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { createRigidBody3D } from './world';

describe('applyPhysics3DJointAngularImpulse', () => {
  it('spins B forward and A backward by the same amount', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    applyPhysics3DJointAngularImpulse(bodyA, bodyB, 2, 0, 0);

    expect(bodyA.angularVelocityX).toBeCloseTo(-2, 12);
    expect(bodyB.angularVelocityX).toBeCloseTo(2, 12);
  });

  it('leaves linear velocity untouched', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    applyPhysics3DJointAngularImpulse(bodyA, bodyB, 1, 2, 3);

    expect(bodyA.velocityX).toBe(0);
    expect(bodyB.velocityZ).toBe(0);
  });

  it('applies nothing to a body with no rotational freedom', () => {
    const bodyA = createUnitBody();
    const bodyB = createRigidBody3D('static');

    applyPhysics3DJointAngularImpulse(bodyA, bodyB, 1, 0, 0);

    expect(bodyB.angularVelocityX).toBe(0);
    expect(bodyA.angularVelocityX).toBeCloseTo(-1, 12);
  });
});

describe('applyPhysics3DJointImpulse', () => {
  it('pushes B along the impulse and A against it', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    applyPhysics3DJointImpulse(bodyA, bodyB, 0, 0, 0, 0, 0, 0, 3, 0, 0);

    expect(bodyA.velocityX).toBeCloseTo(-3, 12);
    expect(bodyB.velocityX).toBeCloseTo(3, 12);
  });

  it('turns a body whose lever arm is offset from its centre of mass', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    applyPhysics3DJointImpulse(bodyA, bodyB, 0, 1, 0, 0, 0, 0, 1, 0, 0);

    // A receives -impulse at (0,1,0), so its torque is (0,1,0) x (-1,0,0) = (0,0,1).
    expect(bodyA.angularVelocityZ).toBeCloseTo(1, 12);
    expect(bodyA.velocityX).toBeCloseTo(-1, 12);
    expect(bodyB.angularVelocityZ).toBe(0);
  });
});

describe('applyPhysics3DJointRowImpulse', () => {
  it('pushes B along the row direction and A against it', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    applyPhysics3DJointRowImpulse(bodyA, bodyB, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2);

    expect(bodyA.velocityX).toBeCloseTo(-2, 12);
    expect(bodyB.velocityX).toBeCloseTo(2, 12);
  });

  it('cancels the row velocity when scaled by the row mass', () => {
    // The three row functions have to describe ONE constraint. Mass, velocity, and impulse agreeing is what
    // makes `-velocity * mass` the impulse that stops the row; if any of the three used a different
    // Jacobian the row would over- or under-correct here, and a solver built on them would converge to the
    // wrong answer while every individual function still looked plausible.
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyA.velocityY = -0.4;
    bodyA.angularVelocityZ = 0.9;
    bodyB.velocityX = 1.7;
    bodyB.angularVelocityY = -1.3;
    const direction = normalized(0.3, 0.5, -0.8);
    const armA = [1.1, -0.2, 0.6];
    const armB = [-0.4, 0.9, 0.3];

    const mass = getPhysics3DJointRowMass(
      bodyA,
      bodyB,
      direction[0],
      direction[1],
      direction[2],
      armA[0],
      armA[1],
      armA[2],
      armB[0],
      armB[1],
      armB[2],
    );
    const velocity = getPhysics3DJointRowVelocity(
      bodyA,
      bodyB,
      direction[0],
      direction[1],
      direction[2],
      armA[0],
      armA[1],
      armA[2],
      armB[0],
      armB[1],
      armB[2],
    );
    applyPhysics3DJointRowImpulse(
      bodyA,
      bodyB,
      direction[0],
      direction[1],
      direction[2],
      armA[0],
      armA[1],
      armA[2],
      armB[0],
      armB[1],
      armB[2],
      -velocity * mass,
    );

    expect(velocity).not.toBeCloseTo(0, 3);
    expect(
      getPhysics3DJointRowVelocity(
        bodyA,
        bodyB,
        direction[0],
        direction[1],
        direction[2],
        armA[0],
        armA[1],
        armA[2],
        armB[0],
        armB[1],
        armB[2],
      ),
    ).toBeCloseTo(0, 12);
  });
});

describe('getPhysics3DJointRowMass', () => {
  it('reduces to the pair mass for a linear row through both centres', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    expect(getPhysics3DJointRowMass(bodyA, bodyB, 1, 0, 0, 0, 0, 0, 0, 0, 0)).toBeCloseTo(0.5, 12);
  });

  it('drops the translational term for a purely angular row', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();

    // A zero direction is how a caller says "this row applies no linear impulse". With the pair's mass
    // still in the denominator the result would be 1/3 rather than 1/2.
    expect(getPhysics3DJointRowMass(bodyA, bodyB, 0, 0, 0, 1, 0, 0, 1, 0, 0)).toBeCloseTo(0.5, 12);
  });

  it('returns zero when neither body can respond', () => {
    const bodyA = createRigidBody3D('static');
    const bodyB = createRigidBody3D('static');

    expect(getPhysics3DJointRowMass(bodyA, bodyB, 1, 0, 0, 1, 0, 0, 1, 0, 0)).toBe(0);
  });
});

describe('getPhysics3DJointRowVelocity', () => {
  it('agrees with the anchor velocity for a point row', () => {
    // A point constraint's row along `direction` has arms `r x direction`. Reading the same quantity two
    // ways is how the row form is pinned to the anchor form the point block uses.
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyA.angularVelocityZ = 0.7;
    bodyB.velocityY = -1.2;
    bodyB.angularVelocityX = 0.5;
    const joint = createTestJoint();
    joint.rAX = 0.4;
    joint.rAY = 1.1;
    joint.rBZ = -0.6;
    const anchorVelocity = [0, 0, 0];
    writePhysics3DJointAnchorVelocity(bodyA, bodyB, joint, anchorVelocity);

    const direction = normalized(0.2, -0.9, 0.4);
    const armA = cross(joint.rAX, joint.rAY, joint.rAZ, direction[0], direction[1], direction[2]);
    const armB = cross(joint.rBX, joint.rBY, joint.rBZ, direction[0], direction[1], direction[2]);

    expect(
      getPhysics3DJointRowVelocity(
        bodyA,
        bodyB,
        direction[0],
        direction[1],
        direction[2],
        armA[0],
        armA[1],
        armA[2],
        armB[0],
        armB[1],
        armB[2],
      ),
    ).toBeCloseTo(
      anchorVelocity[0] * direction[0] + anchorVelocity[1] * direction[1] + anchorVelocity[2] * direction[2],
      12,
    );
  });
});

describe('swapPhysics3DJointFrames', () => {
  it('exchanges the two local rotations', () => {
    const frames: Physics3DJointFrames = {
      localRotationAX: 1,
      localRotationAY: 2,
      localRotationAZ: 3,
      localRotationAW: 4,
      localRotationBX: 5,
      localRotationBY: 6,
      localRotationBZ: 7,
      localRotationBW: 8,
    };

    swapPhysics3DJointFrames(frames);

    expect([frames.localRotationAX, frames.localRotationAY, frames.localRotationAZ, frames.localRotationAW]).toEqual([
      5, 6, 7, 8,
    ]);
    expect([frames.localRotationBX, frames.localRotationBY, frames.localRotationBZ, frames.localRotationBW]).toEqual([
      1, 2, 3, 4,
    ]);
  });
});

describe('writePhysics3DJointAnchors', () => {
  it('copies the local anchor through for an unrotated body at its origin', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const joint = createTestJoint();
    joint.localAnchorAX = 1;
    joint.localAnchorAY = 2;
    joint.localAnchorAZ = 3;

    writePhysics3DJointAnchors(bodyA, bodyB, joint);

    expect(joint.rAX).toBeCloseTo(1, 12);
    expect(joint.rAY).toBeCloseTo(2, 12);
    expect(joint.rAZ).toBeCloseTo(3, 12);
  });

  it('rotates the local anchor by the body orientation', () => {
    const bodyA = createUnitBody();
    setAxisAngle(bodyA, 0, 0, 1, Math.PI / 2);
    const bodyB = createUnitBody();
    const joint = createTestJoint();
    joint.localAnchorAX = 1;

    writePhysics3DJointAnchors(bodyA, bodyB, joint);

    expect(joint.rAX).toBeCloseTo(0, 12);
    expect(joint.rAY).toBeCloseTo(1, 12);
    expect(joint.rAZ).toBeCloseTo(0, 12);
  });

  it('measures the arm from the centre of mass, not from the body origin', () => {
    const bodyA = createUnitBody();
    bodyA.centerX = 0.5;
    const bodyB = createUnitBody();
    const joint = createTestJoint();
    joint.localAnchorAX = 2;

    writePhysics3DJointAnchors(bodyA, bodyB, joint);

    expect(joint.rAX).toBeCloseTo(1.5, 12);
  });
});

describe('writePhysics3DJointAnchorVelocity', () => {
  it('measures B relative to A', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.velocityX = 1;
    const joint = createTestJoint();
    const out = [0, 0, 0];

    writePhysics3DJointAnchorVelocity(bodyA, bodyB, joint, out);

    expect(out).toEqual([1, 0, 0]);
  });

  it('includes the rotational contribution at each lever arm', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.angularVelocityZ = 1;
    const joint = createTestJoint();
    joint.rBX = 1;
    const out = [0, 0, 0];

    writePhysics3DJointAnchorVelocity(bodyA, bodyB, joint, out);

    // (0,0,1) x (1,0,0) = (0,1,0): the anchor sweeps sideways though the centre is still.
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });
});

describe('writePhysics3DJointAngularMass', () => {
  it('sums the two world inverse inertia tensors', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.inverseInertiaWorldXY = 0.25;
    const out = [0, 0, 0, 0, 0, 0];

    writePhysics3DJointAngularMass(bodyA, bodyB, out);

    expect(out).toEqual([2, 2, 2, 0.25, 0, 0]);
  });
});

describe('writePhysics3DJointFrameBasis', () => {
  it('produces the identity basis for an unrotated body and an identity frame', () => {
    const body = createUnitBody();
    const out = new Array<number>(9).fill(0);

    writePhysics3DJointFrameBasis(body, 0, 0, 0, 1, out);

    expect(out).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('carries the body orientation into the frame axes', () => {
    const body = createUnitBody();
    setAxisAngle(body, 0, 0, 1, Math.PI / 2);
    const out = new Array<number>(9).fill(0);

    writePhysics3DJointFrameBasis(body, 0, 0, 0, 1, out);

    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1, 12);
    expect(out[3]).toBeCloseTo(-1, 12);
    expect(out[4]).toBeCloseTo(0, 12);
  });

  it('applies the local rotation before the body orientation', () => {
    const body = createUnitBody();
    setAxisAngle(body, 0, 0, 1, Math.PI / 2);
    const half = Math.SQRT1_2;
    const out = new Array<number>(9).fill(0);

    // Local frame is a quarter turn about X. Composed as bodyOrientation * localRotation, the frame's Y
    // axis lands on world +Z; composed the other way round it would land on world -X.
    writePhysics3DJointFrameBasis(body, half, 0, 0, half, out);

    expect(out[3]).toBeCloseTo(0, 12);
    expect(out[4]).toBeCloseTo(0, 12);
    expect(out[5]).toBeCloseTo(1, 12);
  });
});

describe('writePhysics3DJointFrameRotation', () => {
  it('returns the body orientation when the frame is the identity', () => {
    const body = createUnitBody();
    setAxisAngle(body, 0, 1, 0, 0.7);
    const out = [0, 0, 0, 0];

    writePhysics3DJointFrameRotation(body, 0, 0, 0, 1, out);

    expect(out[0]).toBeCloseTo(body.orientationX, 12);
    expect(out[1]).toBeCloseTo(body.orientationY, 12);
    expect(out[2]).toBeCloseTo(body.orientationZ, 12);
    expect(out[3]).toBeCloseTo(body.orientationW, 12);
  });

  it('composes two quarter turns about the same axis into a half turn', () => {
    const body = createUnitBody();
    setAxisAngle(body, 0, 0, 1, Math.PI / 2);
    const half = Math.SQRT1_2;
    const out = [0, 0, 0, 0];

    writePhysics3DJointFrameRotation(body, 0, 0, half, half, out);

    expect(out[2]).toBeCloseTo(1, 12);
    expect(out[3]).toBeCloseTo(0, 12);
  });
});

describe('writePhysics3DJointPointMass', () => {
  it('is the pair mass on the diagonal when both anchors sit on the centres of mass', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const out = [0, 0, 0, 0, 0, 0];

    writePhysics3DJointPointMass(bodyA, bodyB, 0, 0, 0, 0, 0, 0, out);

    expect(out).toEqual([2, 2, 2, 0, 0, 0]);
  });

  it('adds the rotational resistance of an offset lever arm', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const out = [0, 0, 0, 0, 0, 0];

    // skew((0,0,1)) * identity * transpose(skew((0,0,1))) is diag(1,1,0): an impulse along the arm itself
    // produces no torque, so the z row keeps the bare pair mass.
    writePhysics3DJointPointMass(bodyA, bodyB, 0, 0, 1, 0, 0, 0, out);

    expect(out[0]).toBeCloseTo(3, 12);
    expect(out[1]).toBeCloseTo(3, 12);
    expect(out[2]).toBeCloseTo(2, 12);
    expect(out[3]).toBeCloseTo(0, 12);
    expect(out[4]).toBeCloseTo(0, 12);
    expect(out[5]).toBeCloseTo(0, 12);
  });

  it('stays symmetric for a lever arm off every axis', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    const out = [0, 0, 0, 0, 0, 0];

    writePhysics3DJointPointMass(bodyA, bodyB, 0.3, -0.7, 1.1, 0, 0, 0, out);

    // K = 2I + skew(r) skew(r)^T, whose off-diagonal (i,j) is -r_i r_j for a unit inverse inertia.
    expect(out[0]).toBeCloseTo(2 + 0.7 * 0.7 + 1.1 * 1.1, 12);
    expect(out[3]).toBeCloseTo(-0.3 * -0.7, 12);
    expect(out[4]).toBeCloseTo(-0.3 * 1.1, 12);
    expect(out[5]).toBeCloseTo(0.7 * 1.1, 12);
  });
});

describe('writePhysics3DJointRelativeRotation', () => {
  it('is the identity for coincident frames', () => {
    const out = [0, 0, 0, 0];

    writePhysics3DJointRelativeRotation(0, 0, 0, 1, 0, 0, 0, 1, out);

    expect(out).toEqual([0, 0, 0, 1]);
  });

  it('expresses the relative rotation in frame A, not in world space', () => {
    const quarter = Math.SQRT1_2;
    const twist = 0.4;
    const frameB = [0, 0, 0, 0];
    multiply(0, 0, quarter, quarter, Math.sin(twist / 2), 0, 0, Math.cos(twist / 2), frameB);
    const out = [0, 0, 0, 0];

    writePhysics3DJointRelativeRotation(0, 0, quarter, quarter, frameB[0], frameB[1], frameB[2], frameB[3], out);

    // A pure twist about A's local X, whatever A's world orientation is.
    expect(out[0]).toBeCloseTo(Math.sin(twist / 2), 12);
    expect(out[1]).toBeCloseTo(0, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });

  it('returns the representative with a non-negative scalar part', () => {
    const angle = 2 * Math.PI - 0.3;
    const half = angle / 2;
    const out = [0, 0, 0, 0];

    writePhysics3DJointRelativeRotation(0, 0, 0, 1, 0, 0, Math.sin(half), Math.cos(half), out);

    expect(out[3]).toBeGreaterThanOrEqual(0);
    expect(out[2]).toBeCloseTo(-Math.sin(0.15), 12);
  });
});

describe('writePhysics3DJointRotationError', () => {
  it('is zero for coincident frames', () => {
    const out = [1, 1, 1];

    writePhysics3DJointRotationError(0, 0, 0, 1, 0, 0, 0, 1, out);

    expect(out).toEqual([0, 0, 0]);
  });

  it('reports the true angle rather than its small-angle approximation', () => {
    const out = [0, 0, 0];
    const half = Math.SQRT1_2;

    // A quarter turn about Y. The shortcut 2 * q.xyz would give 2 * sin(pi/4) = 1.4142, which is 10% short.
    writePhysics3DJointRotationError(0, 0, 0, 1, 0, half, 0, half, out);

    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(Math.PI / 2, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });

  it('takes the shorter arc when the frames are nearly aligned the long way round', () => {
    const out = [0, 0, 0];
    const angle = 2 * Math.PI - 0.3;
    const half = angle / 2;

    writePhysics3DJointRotationError(0, 0, 0, 1, 0, 0, Math.sin(half), Math.cos(half), out);

    expect(out[2]).toBeCloseTo(-0.3, 12);
  });

  it('expresses the error in world space, not in frame A', () => {
    const out = [0, 0, 0];
    const quarter = Math.SQRT1_2;
    const twist = 0.4;
    // frameB = frameA * (0.4 about local X), with frameA a quarter turn about Z. A's local X points along
    // world +Y, so the world error is 0.4 about +Y.
    const frameB = [0, 0, 0, 0];
    multiply(0, 0, quarter, quarter, Math.sin(twist / 2), 0, 0, Math.cos(twist / 2), frameB);

    writePhysics3DJointRotationError(0, 0, quarter, quarter, frameB[0], frameB[1], frameB[2], frameB[3], out);

    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(twist, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });
});

describe('writePhysics3DJointSeparation', () => {
  it('measures from the A anchor to the B anchor', () => {
    const bodyA = createUnitBody();
    const bodyB = createUnitBody();
    bodyB.x = 5;
    const joint = createTestJoint();
    joint.localAnchorAX = 1;
    joint.localAnchorBX = -1;
    writePhysics3DJointAnchors(bodyA, bodyB, joint);
    const out = [0, 0, 0];

    writePhysics3DJointSeparation(bodyA, bodyB, joint, out);

    expect(out[0]).toBeCloseTo(3, 12);
  });

  it('does not shift when a body carries an offset centre of mass', () => {
    const bodyA = createUnitBody();
    bodyA.centerX = 0.5;
    const bodyB = createUnitBody();
    bodyB.x = 5;
    const joint = createTestJoint();
    joint.localAnchorAX = 1;
    joint.localAnchorBX = -1;
    writePhysics3DJointAnchors(bodyA, bodyB, joint);
    const out = [0, 0, 0];

    writePhysics3DJointSeparation(bodyA, bodyB, joint, out);

    // The anchors have not moved, only the point the lever arms are measured from. Adding the arm to the
    // body's ORIGIN instead of its world centre would report 3.5 here.
    expect(out[0]).toBeCloseTo(3, 12);
  });
});

function cross(aX: number, aY: number, aZ: number, bX: number, bY: number, bZ: number): number[] {
  return [aY * bZ - aZ * bY, aZ * bX - aX * bZ, aX * bY - aY * bX];
}

function createTestJoint(): Physics3DJoint {
  return {
    kind: 'Test',
    bodyA: 0,
    bodyB: 1,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorAZ: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    localAnchorBZ: 0,
    collideConnected: false,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    impulse3: 0,
    impulse4: 0,
    impulse5: 0,
    rAX: 0,
    rAY: 0,
    rAZ: 0,
    rBX: 0,
    rBY: 0,
    rBZ: 0,
  };
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

function normalized(x: number, y: number, z: number): number[] {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

function multiply(
  aX: number,
  aY: number,
  aZ: number,
  aW: number,
  bX: number,
  bY: number,
  bZ: number,
  bW: number,
  out: number[],
): void {
  out[0] = aW * bX + aX * bW + aY * bZ - aZ * bY;
  out[1] = aW * bY - aX * bZ + aY * bW + aZ * bX;
  out[2] = aW * bZ + aX * bY - aY * bX + aZ * bW;
  out[3] = aW * bW - aX * bX - aY * bY - aZ * bZ;
}

function setAxisAngle(body: RigidBody3D, x: number, y: number, z: number, angle: number): void {
  const sine = Math.sin(angle / 2);
  body.orientationX = x * sine;
  body.orientationY = y * sine;
  body.orientationZ = z * sine;
  body.orientationW = Math.cos(angle / 2);
  refreshRigidBody3DWorldInertia(body);
}
