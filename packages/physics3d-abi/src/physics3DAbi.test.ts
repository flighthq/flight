import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DBallAndSocketJoint,
  createPhysics3DCollider,
  createPhysics3DConeTwistJoint,
  createPhysics3DDistanceJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DSolverConfig,
  createPhysics3DSliderJoint,
  createPhysics3DWorld,
  createRigidBody3D,
  stepPhysics3D,
} from '@flighthq/physics3d/contract';
import type {
  CollisionColliderShape3D,
  Physics3DAbi,
  Physics3DAbiBodyBuffer,
  Physics3DAbiCommandBuffer,
  Physics3DJoint,
  RigidBody3D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createPhysics3DAbi,
  createPhysics3DAbiWorld,
  destroyPhysics3DAbiWorld,
  executePhysics3DAbiCommands,
  getPhysics3DAbiWorldStatus,
  readPhysics3DAbiBodies,
  readPhysics3DAbiContacts,
  readPhysics3DAbiJoints,
  stepPhysics3DAbiWorld,
} from './physics3DAbi';
import {
  clearPhysics3DAbiCommandBuffer,
  createPhysics3DAbiBodyBuffer,
  createPhysics3DAbiCommandBuffer,
  createPhysics3DAbiContactBuffer,
  createPhysics3DAbiExecutionResult,
  createPhysics3DAbiJointBuffer,
  createPhysics3DAbiQueryBuffer,
} from './physics3DAbiBuffer';
import {
  writePhysics3DAbiApplyForceAtPointCommand,
  writePhysics3DAbiApplyForceCommand,
  writePhysics3DAbiApplyLinearImpulseAtPointCommand,
  writePhysics3DAbiApplyLinearImpulseCommand,
  writePhysics3DAbiApplyTorqueCommand,
  writePhysics3DAbiDestroyBodyCommand,
  writePhysics3DAbiDestroyColliderCommand,
  writePhysics3DAbiDestroyJointCommand,
  writePhysics3DAbiSetBodyCommand,
  writePhysics3DAbiSetColliderCommand,
  writePhysics3DAbiSetGravityCommand,
  writePhysics3DAbiSetJointCommand,
  writePhysics3DAbiSetSolverConfigCommand,
  writePhysics3DAbiWakeBodyCommand,
} from './physics3DAbiCommand';
import {
  Physics3DAbiBodyValue,
  Physics3DAbiBodyValueStride,
  Physics3DAbiCapability,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiMaxContactPoints,
  Physics3DAbiVersion,
} from './physics3DAbiLayout';
import { queryPhysics3DAbiPoint } from './physics3DAbiQuery';

describe('createPhysics3DAbi', () => {
  it('publishes the reference version and required baseline capabilities', () => {
    const abi = createPhysics3DAbi();
    expect(abi.version).toBe(Physics3DAbiVersion);
    expect(abi.capabilities).toBe(
      Physics3DAbiCapability.ContactHooks |
        Physics3DAbiCapability.PersistentWorlds |
        Physics3DAbiCapability.Queries |
        Physics3DAbiCapability.SelectiveReadback,
    );
  });

  it('decodes all nine built-in collider shapes through the public command stream', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer(32768);
    const body = createRigidBody3D('static');
    expect(writePhysics3DAbiSetBodyCommand(commands, 1, body)).toBe(true);
    const shapes = getColliderShapes();
    for (let i = 0; i < shapes.length; i += 1) {
      expect(writePhysics3DAbiSetColliderCommand(commands, i + 1, 1, createPhysics3DCollider(shapes[i]))).toBe(true);
    }

    const result = createPhysics3DAbiExecutionResult();
    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(true);
    expect(result.commandIndex).toBe(1 + shapes.length);
  });

  it('executes and reads through caller-owned shared-memory views', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = allocateEntity<Physics3DAbiCommandBuffer>();
    commands.data = new Uint8Array(new SharedArrayBuffer(512));
    commands.byteLength = 0;
    commands.commandCount = 0;
    clearPhysics3DAbiCommandBuffer(commands);
    const body = createRigidBody3D();
    body.x = 17;
    expect(writePhysics3DAbiSetBodyCommand(commands, 3, body)).toBe(true);
    executeOrThrow(abi, world, commands);

    const out = allocateEntity<Physics3DAbiBodyBuffer>();
    out.ids = new Uint32Array(new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    out.flags = new Uint32Array(new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    out.values = new Float64Array(new SharedArrayBuffer(Physics3DAbiBodyValueStride * Float64Array.BYTES_PER_ELEMENT));
    out.count = 0;
    out.requiredCount = 0;
    expect(readPhysics3DAbiBodies(abi, world, null, out)).toBe(true);
    expect(out.ids[0]).toBe(3);
    expect(out.values[Physics3DAbiBodyValue.X]).toBe(17);
  });
});

describe('createPhysics3DAbiWorld', () => {
  it('allocates non-zero handles that are never reused by one ABI instance', () => {
    const abi = createPhysics3DAbi();
    const first = createPhysics3DAbiWorld(abi);
    expect(first).toBeGreaterThan(0);
    expect(destroyPhysics3DAbiWorld(abi, first)).toBe(true);
    const second = createPhysics3DAbiWorld(abi);
    expect(second).toBeGreaterThan(first);
  });
});

describe('destroyPhysics3DAbiWorld', () => {
  it('makes every later operation on that handle observably stale', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    expect(destroyPhysics3DAbiWorld(abi, world)).toBe(true);
    expect(destroyPhysics3DAbiWorld(abi, world)).toBe(false);
    expect(stepPhysics3DAbiWorld(abi, world, 1 / 60)).toBe('StaleWorld');
    expect(readPhysics3DAbiBodies(abi, world, null, createPhysics3DAbiBodyBuffer(1))).toBe(false);
  });
});

describe('executePhysics3DAbiCommands', () => {
  it('commits the valid prefix and identifies the first rejected command', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer();
    const body = createRigidBody3D();
    body.x = 6;
    expect(writePhysics3DAbiSetBodyCommand(commands, 5, body)).toBe(true);
    expect(writePhysics3DAbiDestroyBodyCommand(commands, 999)).toBe(true);

    const result = createPhysics3DAbiExecutionResult();
    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(false);
    expect(result).toMatchObject({ status: 'MissingBody', commandIndex: 1 });

    const bodies = createPhysics3DAbiBodyBuffer(1);
    expect(readPhysics3DAbiBodies(abi, world, null, bodies)).toBe(true);
    expect(bodies.ids[0]).toBe(5);
    expect(bodies.values[Physics3DAbiBodyValue.X]).toBe(6);
  });

  it('rejects a corrupted header before applying anything', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer();
    writePhysics3DAbiSetGravityCommand(commands, 1, 2, 3);
    commands.data[0] ^= 0xff;
    const result = createPhysics3DAbiExecutionResult();

    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(false);
    expect(result).toMatchObject({
      status: 'InvalidBuffer',
      commandIndex: 0,
      byteOffset: Physics3DAbiCommandHeaderByteLength,
      commandKind: 0,
    });
  });

  it('rejects unknown flag bits rather than silently adopting future semantics', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer();
    writePhysics3DAbiSetBodyCommand(commands, 1, createRigidBody3D());
    new DataView(commands.data.buffer).setUint32(32, 1 << 31, true);
    const result = createPhysics3DAbiExecutionResult();

    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(false);
    expect(result.status).toBe('InvalidCommand');
  });

  it('classifies a structurally minimal degenerate collider as a rejected mutation', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer();
    expect(writePhysics3DAbiSetBodyCommand(commands, 1, createRigidBody3D('static'))).toBe(true);
    expect(
      writePhysics3DAbiSetColliderCommand(commands, 1, 1, createPhysics3DCollider({ kind: 'convex', points: [] })),
    ).toBe(true);
    const result = createPhysics3DAbiExecutionResult();

    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(false);
    expect(result).toMatchObject({ status: 'RejectedMutation', commandIndex: 1 });
  });

  it('applies configuration, force, impulse, torque, and wake commands to persistent state', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const body = createRigidBody3D();
    body.mass = 2;
    body.inertiaXX = 4;
    body.inertiaYY = 4;
    body.inertiaZZ = 4;
    body.sleeping = true;
    const config = createPhysics3DSolverConfig();
    config.substeps = 2;

    executeOrThrow(
      abi,
      world,
      writeCommands((commands) => {
        writePhysics3DAbiSetGravityCommand(commands, 0, 0, 0);
        writePhysics3DAbiSetSolverConfigCommand(commands, config);
        writePhysics3DAbiSetBodyCommand(commands, 7, body);
        writePhysics3DAbiApplyForceCommand(commands, 7, 2, 0, 0);
        writePhysics3DAbiApplyForceAtPointCommand(commands, 7, 2, 0, 0, 0, 1, 0);
        writePhysics3DAbiApplyLinearImpulseCommand(commands, 7, 2, 0, 0);
        writePhysics3DAbiApplyLinearImpulseAtPointCommand(commands, 7, 2, 0, 0, 0, 1, 0);
        writePhysics3DAbiApplyTorqueCommand(commands, 7, 0, 0, 6);
        writePhysics3DAbiWakeBodyCommand(commands, 7);
      }),
    );

    const beforeStep = createPhysics3DAbiBodyBuffer(1);
    expect(readPhysics3DAbiBodies(abi, world, null, beforeStep)).toBe(true);
    expect(beforeStep.flags[0] & (1 << 4)).toBe(0);
    expect(beforeStep.values[Physics3DAbiBodyValue.VelocityX]).toBeCloseTo(2, 12);
    expect(beforeStep.values[Physics3DAbiBodyValue.AngularVelocityZ]).toBeCloseTo(-0.5, 12);
    expect(beforeStep.values[Physics3DAbiBodyValue.ForceX]).toBe(4);
    expect(beforeStep.values[Physics3DAbiBodyValue.TorqueZ]).toBe(4);

    expect(stepPhysics3DAbiWorld(abi, world, 0.5)).toBe('Complete');
    const afterStep = createPhysics3DAbiBodyBuffer(1);
    expect(readPhysics3DAbiBodies(abi, world, null, afterStep)).toBe(true);
    expect(afterStep.values[Physics3DAbiBodyValue.VelocityX]).toBeCloseTo(3, 12);
    expect(afterStep.values[Physics3DAbiBodyValue.VelocityY]).toBe(0);
    expect(afterStep.values[Physics3DAbiBodyValue.ForceX]).toBe(0);
    expect(afterStep.values[Physics3DAbiBodyValue.TorqueZ]).toBe(0);
  });

  it('removes collider identity and broadphase query visibility atomically', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const body = createRigidBody3D('static');
    executeOrThrow(
      abi,
      world,
      writeCommands((commands) => {
        writePhysics3DAbiSetBodyCommand(commands, 1, body);
        writePhysics3DAbiSetColliderCommand(commands, 2, 1, createPhysics3DCollider(unitAabb()));
      }),
    );
    const hits = createPhysics3DAbiQueryBuffer(1);
    expect(queryPhysics3DAbiPoint(abi, world, 0, 0, 0, hits)).toBe(true);
    expect([hits.count, hits.requiredCount]).toEqual([1, 1]);

    executeOrThrow(
      abi,
      world,
      writeCommands((commands) => {
        writePhysics3DAbiDestroyColliderCommand(commands, 2);
      }),
    );
    expect(queryPhysics3DAbiPoint(abi, world, 0, 0, 0, hits)).toBe(true);
    expect([hits.count, hits.requiredCount]).toEqual([0, 0]);
  });
});

describe('getPhysics3DAbiWorldStatus', () => {
  it('distinguishes a usable handle from a destroyed one', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    expect(getPhysics3DAbiWorldStatus(abi, world)).toBe('Ready');
    destroyPhysics3DAbiWorld(abi, world);
    expect(getPhysics3DAbiWorldStatus(abi, world)).toBe('Stale');
  });
});

describe('readPhysics3DAbiBodies', () => {
  it('reports a sorted full count and writes only the prefix that fits', () => {
    const { abi, world } = createBodyReadWorld();
    const out = createPhysics3DAbiBodyBuffer(1);

    expect(readPhysics3DAbiBodies(abi, world, null, out)).toBe(true);
    expect(out.requiredCount).toBe(2);
    expect(out.count).toBe(1);
    expect(out.ids[0]).toBe(10);
  });

  it('preserves selective caller order and silently omits missing ids', () => {
    const { abi, world } = createBodyReadWorld();
    const out = createPhysics3DAbiBodyBuffer(2);

    expect(readPhysics3DAbiBodies(abi, world, new Uint32Array([20, 404, 10]), out)).toBe(true);
    expect(out.requiredCount).toBe(2);
    expect(out.count).toBe(2);
    expect([...out.ids]).toEqual([20, 10]);
  });
});

describe('readPhysics3DAbiContacts', () => {
  it('publishes contact identities, events, and required capacity after a step', () => {
    const { abi, world } = createContactWorld();
    expect(stepPhysics3DAbiWorld(abi, world, 1 / 60)).toBe('Complete');

    const out = createPhysics3DAbiContactBuffer(4, 16);
    expect(readPhysics3DAbiContacts(abi, world, 'All', out)).toBe(true);
    expect(out.count).toBeGreaterThan(0);
    expect(new Set([out.ids[0], out.ids[1]])).toEqual(new Set([1, 2]));
    expect(new Set([out.ids[2], out.ids[3]])).toEqual(new Set([11, 22]));

    const began = createPhysics3DAbiContactBuffer(4, 16);
    expect(readPhysics3DAbiContacts(abi, world, 'Began', began)).toBe(true);
    expect(began.count).toBeGreaterThan(0);

    const undersized = createPhysics3DAbiContactBuffer(0, 0);
    expect(readPhysics3DAbiContacts(abi, world, 'All', undersized)).toBe(true);
    expect(undersized.count).toBe(0);
    expect(undersized.requiredCount).toBeGreaterThan(0);
    expect(undersized.requiredPointCount).toBeGreaterThan(0);
  });
});

describe('readPhysics3DAbiJoints', () => {
  it('decodes every built-in joint and returns reactions in caller-id order', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    const commands = createPhysics3DAbiCommandBuffer(16384);
    writePhysics3DAbiSetBodyCommand(commands, 10, createRigidBody3D());
    writePhysics3DAbiSetBodyCommand(commands, 20, createRigidBody3D());
    const joints = getJoints();
    const ids = [70, 10, 60, 20, 50, 30, 40];
    for (let i = 0; i < joints.length; i += 1) {
      expect(writePhysics3DAbiSetJointCommand(commands, ids[i], joints[i])).toBe(true);
    }
    const result = createPhysics3DAbiExecutionResult();
    expect(executePhysics3DAbiCommands(abi, world, commands, result)).toBe(true);

    const out = createPhysics3DAbiJointBuffer(3);
    expect(readPhysics3DAbiJoints(abi, world, out)).toBe(true);
    expect(out.requiredCount).toBe(7);
    expect(out.count).toBe(3);
    expect([...out.ids]).toEqual([10, 20, 30]);
    expect([...out.values]).toEqual(new Array(18).fill(0));
  });

  it('removes a joint explicitly and cascades the others when a body is destroyed', () => {
    const abi = createPhysics3DAbi();
    const world = createPhysics3DAbiWorld(abi);
    executeOrThrow(
      abi,
      world,
      writeCommands((commands) => {
        writePhysics3DAbiSetBodyCommand(commands, 1, createRigidBody3D());
        writePhysics3DAbiSetBodyCommand(commands, 2, createRigidBody3D());
        writePhysics3DAbiSetJointCommand(commands, 5, createPhysics3DDistanceJoint({ bodyA: 1, bodyB: 2 }));
        writePhysics3DAbiSetJointCommand(commands, 6, createPhysics3DBallAndSocketJoint({ bodyA: 1, bodyB: 2 }));
      }),
    );
    executeOrThrow(
      abi,
      world,
      writeCommands((commands) => {
        writePhysics3DAbiDestroyJointCommand(commands, 5);
        writePhysics3DAbiDestroyBodyCommand(commands, 1);
      }),
    );

    const out = createPhysics3DAbiJointBuffer(2);
    expect(readPhysics3DAbiJoints(abi, world, out)).toBe(true);
    expect([out.count, out.requiredCount]).toEqual([0, 0]);
  });
});

describe('stepPhysics3DAbiWorld', () => {
  it('matches standard free-flight integration exactly over a persistent multi-step world', () => {
    const abi = createPhysics3DAbi();
    const abiWorld = createPhysics3DAbiWorld(abi);
    const source = createRigidBody3D();
    source.x = -2;
    source.y = 4;
    source.velocityX = 1.25;
    const collider = createPhysics3DCollider(unitAabb());
    const commands = createPhysics3DAbiCommandBuffer();
    writePhysics3DAbiSetBodyCommand(commands, 7, source);
    writePhysics3DAbiSetColliderCommand(commands, 9, 7, collider);
    executeOrThrow(abi, abiWorld, commands);

    const directWorld = createPhysics3DWorld();
    const directBody = createRigidBody3D();
    directBody.x = source.x;
    directBody.y = source.y;
    directBody.velocityX = source.velocityX;
    addPhysics3DBody(directWorld, directBody);
    addPhysics3DCollider(directWorld, directBody, createPhysics3DCollider(unitAabb()));

    for (let i = 0; i < 120; i += 1) {
      expect(stepPhysics3DAbiWorld(abi, abiWorld, 1 / 120)).toBe('Complete');
      stepPhysics3D(directWorld, 1 / 120);
    }

    const out = createPhysics3DAbiBodyBuffer(1);
    readPhysics3DAbiBodies(abi, abiWorld, null, out);
    expect(out.values[Physics3DAbiBodyValue.X]).toBe(directBody.x);
    expect(out.values[Physics3DAbiBodyValue.Y]).toBe(directBody.y);
    expect(out.values[Physics3DAbiBodyValue.VelocityY]).toBe(directBody.velocityY);
  });

  it('matches the standard contact solver exactly over a frictional settling stack', () => {
    const abi = createPhysics3DAbi();
    const abiWorld = createPhysics3DAbiWorld(abi);
    const directWorld = createPhysics3DWorld();
    const material = { density: 1, friction: 0.4, restitution: 0.2 };
    const shapes: CollisionColliderShape3D[] = [
      { kind: 'aabb', minX: -6, minY: -0.5, minZ: -6, maxX: 6, maxY: 0.5, maxZ: 6 },
      unitAabb(),
      unitAabb(),
      unitAabb(),
    ];
    const poses: [RigidBody3D['type'], number, number, number][] = [
      ['static', 0, -0.5, 0],
      ['dynamic', 0, 0.5, 0],
      ['dynamic', 0.2, 1.6, 0.1],
      ['dynamic', -0.1, 2.7, 0],
    ];
    const bodies = poses.map(([type, x, y, z], index) => {
      const body = createRigidBody3D(type);
      body.x = x;
      body.y = y;
      body.z = z;
      body.velocityX = type === 'dynamic' ? 0.3 : 0;
      addPhysics3DBody(directWorld, body);
      addPhysics3DCollider(directWorld, body, createPhysics3DCollider(shapes[index], material));
      return body;
    });
    const commands = createPhysics3DAbiCommandBuffer(16384);
    for (let i = 0; i < bodies.length; i += 1) {
      expect(writePhysics3DAbiSetBodyCommand(commands, i + 1, bodies[i])).toBe(true);
      expect(writePhysics3DAbiSetColliderCommand(commands, i + 1, i + 1, bodies[i].colliders[0])).toBe(true);
    }
    executeOrThrow(abi, abiWorld, commands);

    for (let i = 0; i < 180; i += 1) {
      stepPhysics3D(directWorld, 1 / 60);
      expect(stepPhysics3DAbiWorld(abi, abiWorld, 1 / 60)).toBe('Complete');
    }

    const out = createPhysics3DAbiBodyBuffer(bodies.length);
    expect(readPhysics3DAbiBodies(abi, abiWorld, null, out)).toBe(true);
    expect(out.count).toBe(bodies.length);
    for (let i = 0; i < bodies.length; i += 1) {
      const at = i * Physics3DAbiBodyValueStride;
      const body = bodies[i];
      expect(out.values[at + Physics3DAbiBodyValue.X]).toBe(body.x);
      expect(out.values[at + Physics3DAbiBodyValue.Y]).toBe(body.y);
      expect(out.values[at + Physics3DAbiBodyValue.Z]).toBe(body.z);
      expect(out.values[at + Physics3DAbiBodyValue.OrientationX]).toBe(body.orientationX);
      expect(out.values[at + Physics3DAbiBodyValue.OrientationY]).toBe(body.orientationY);
      expect(out.values[at + Physics3DAbiBodyValue.OrientationZ]).toBe(body.orientationZ);
      expect(out.values[at + Physics3DAbiBodyValue.OrientationW]).toBe(body.orientationW);
      expect(out.values[at + Physics3DAbiBodyValue.VelocityX]).toBe(body.velocityX);
      expect(out.values[at + Physics3DAbiBodyValue.VelocityY]).toBe(body.velocityY);
      expect(out.values[at + Physics3DAbiBodyValue.VelocityZ]).toBe(body.velocityZ);
      expect(out.values[at + Physics3DAbiBodyValue.AngularVelocityX]).toBe(body.angularVelocityX);
      expect(out.values[at + Physics3DAbiBodyValue.AngularVelocityY]).toBe(body.angularVelocityY);
      expect(out.values[at + Physics3DAbiBodyValue.AngularVelocityZ]).toBe(body.angularVelocityZ);
    }
    expect(bodies[3].y).toBeLessThan(2.7);
    expect(directWorld.contacts.length).toBeGreaterThan(0);
    const contacts = createPhysics3DAbiContactBuffer(8, 8 * Physics3DAbiMaxContactPoints);
    expect(readPhysics3DAbiContacts(abi, abiWorld, 'All', contacts)).toBe(true);
    expect(contacts.count).toBe(directWorld.contacts.length);
    expect(Math.max(...contacts.pointCounts.slice(0, contacts.count))).toBe(Physics3DAbiMaxContactPoints);
  });

  it('adapts synchronous contact hooks without exposing the owned world', () => {
    const { abi, world } = createContactWorld();
    const buffer = createPhysics3DAbiContactBuffer(1, Physics3DAbiMaxContactPoints);
    const reentrantResult = createPhysics3DAbiExecutionResult();
    let preSolveCount = 0;
    let postSolveCount = 0;
    let nestedStepStatus = '';
    let statusDuringHook = '';
    let readDuringHook = true;
    let queryDuringHook = true;
    let destroyDuringHook = true;

    expect(
      stepPhysics3DAbiWorld(abi, world, 1 / 60, {
        buffer,
        preSolve(contact): void {
          preSolveCount += 1;
          contact.values[3] = 0.75;
          executePhysics3DAbiCommands(abi, world, createPhysics3DAbiCommandBuffer(), reentrantResult);
          nestedStepStatus = stepPhysics3DAbiWorld(abi, world, 1 / 60);
          statusDuringHook = getPhysics3DAbiWorldStatus(abi, world);
          readDuringHook = readPhysics3DAbiBodies(abi, world, null, createPhysics3DAbiBodyBuffer(1));
          queryDuringHook = queryPhysics3DAbiPoint(abi, world, 0, 0, 0, createPhysics3DAbiQueryBuffer(1));
          destroyDuringHook = destroyPhysics3DAbiWorld(abi, world);
        },
        postSolve(): void {
          postSolveCount += 1;
        },
      }),
    ).toBe('Complete');
    expect(preSolveCount).toBeGreaterThan(0);
    expect(postSolveCount).toBeGreaterThan(0);
    expect(reentrantResult.status).toBe('BusyWorld');
    expect(nestedStepStatus).toBe('BusyWorld');
    expect(statusDuringHook).toBe('Busy');
    expect(readDuringHook).toBe(false);
    expect(queryDuringHook).toBe(false);
    expect(destroyDuringHook).toBe(false);

    const contacts = createPhysics3DAbiContactBuffer(2, 8);
    readPhysics3DAbiContacts(abi, world, 'All', contacts);
    expect(contacts.values[3]).toBe(0.75);
  });

  it('declines invalid timesteps and insufficient live hook buffers explicitly', () => {
    const { abi, world } = createContactWorld();
    expect(stepPhysics3DAbiWorld(abi, world, 0)).toBe('Declined');
    expect(
      stepPhysics3DAbiWorld(abi, world, 1 / 60, {
        buffer: createPhysics3DAbiContactBuffer(1, Physics3DAbiMaxContactPoints - 1),
        preSolve(): void {},
        postSolve: null,
      }),
    ).toBe('InsufficientHookBuffer');
    expect(
      stepPhysics3DAbiWorld(abi, world, 1 / 60, {
        buffer: createPhysics3DAbiContactBuffer(0, 0),
        preSolve: null,
        postSolve: null,
      }),
    ).toBe('Complete');
  });
});

function createBodyReadWorld(): { abi: Physics3DAbi; world: number } {
  const abi = createPhysics3DAbi();
  const world = createPhysics3DAbiWorld(abi);
  const commands = createPhysics3DAbiCommandBuffer();
  const body20 = createRigidBody3D();
  body20.x = 20;
  const body10 = createRigidBody3D();
  body10.x = 10;
  writePhysics3DAbiSetBodyCommand(commands, 20, body20);
  writePhysics3DAbiSetBodyCommand(commands, 10, body10);
  executeOrThrow(abi, world, commands);
  return { abi, world };
}

function createContactWorld(): { abi: Physics3DAbi; world: number } {
  const abi = createPhysics3DAbi();
  const world = createPhysics3DAbiWorld(abi);
  const commands = createPhysics3DAbiCommandBuffer();
  const ground = createRigidBody3D('static');
  const box = createRigidBody3D();
  box.y = 0.75;
  writePhysics3DAbiSetBodyCommand(commands, 2, ground);
  writePhysics3DAbiSetColliderCommand(commands, 22, 2, createPhysics3DCollider(unitAabb()));
  writePhysics3DAbiSetBodyCommand(commands, 1, box);
  writePhysics3DAbiSetColliderCommand(commands, 11, 1, createPhysics3DCollider(unitAabb()));
  executeOrThrow(abi, world, commands);
  return { abi, world };
}

function executeOrThrow(abi: Readonly<Physics3DAbi>, world: number, commands: Physics3DAbiCommandBuffer): void {
  const result = createPhysics3DAbiExecutionResult();
  if (!executePhysics3DAbiCommands(abi, world, commands, result)) {
    throw new Error(`Unexpected ABI command failure: ${result.status} at ${result.commandIndex}`);
  }
}

function getColliderShapes(): CollisionColliderShape3D[] {
  return [
    { kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 },
    unitAabb(),
    {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
    },
    { kind: 'capsule', x0: 0, y0: -1, z0: 0, x1: 0, y1: 1, z1: 0, radius: 0.5 },
    { kind: 'cylinder', x0: 0, y0: -1, z0: 0, x1: 0, y1: 1, z1: 0, radius: 0.5 },
    { kind: 'cone', apexX: 0, apexY: 1, apexZ: 0, baseX: 0, baseY: -1, baseZ: 0, radius: 1 },
    { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
    (() => { const out = allocateEntity<void>(); out.kind = 'triangle-mesh'; out.version = 0; out.x = 0; out.y = 0; out.z = 0; out.rotationX = 0; out.rotationY = 0; out.rotationZ = 0; out.rotationW = 1; out.points = [0, 0, 0, 1, 0, 0, 0, 0, 1]; out.indices = [0, 1, 2]; return finishEntity(out); })(),
    (() => { const out = allocateEntity<void>(); out.kind = 'heightfield'; out.columns = 2; out.rows = 2; out.version = 0; out.cellSizeX = 1; out.cellSizeZ = 1; out.x = 0; out.y = 0; out.z = 0; out.rotationX = 0; out.rotationY = 0; out.rotationZ = 0; out.rotationW = 1; out.heights = [0, 0, 0, 0]; return finishEntity(out); })(),
  ];
}

function getJoints(): Physics3DJoint[] {
  return [
    createPhysics3DBallAndSocketJoint({ bodyA: 10, bodyB: 20 }),
    createPhysics3DDistanceJoint({ bodyA: 10, bodyB: 20, length: 1 }),
    createPhysics3DFixedJoint({ bodyA: 10, bodyB: 20 }),
    createPhysics3DHingeJoint({ bodyA: 10, bodyB: 20 }),
    createPhysics3DSliderJoint({ bodyA: 10, bodyB: 20 }),
    createPhysics3DConeTwistJoint({ bodyA: 10, bodyB: 20 }),
    createPhysics3DGeneric6DofJoint({ bodyA: 10, bodyB: 20 }),
  ];
}

function unitAabb(): CollisionColliderShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}

function writeCommands(write: (commands: Physics3DAbiCommandBuffer) => void): Physics3DAbiCommandBuffer {
  const commands = createPhysics3DAbiCommandBuffer();
  write(commands);
  return commands;
}
