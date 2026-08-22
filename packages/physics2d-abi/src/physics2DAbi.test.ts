import { createPhysics2DCollider, createRigidBody2D } from '@flighthq/physics2d/contract';
import type { Physics2DAbi, Physics2DAbiCommandBuffer } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createPhysics2DAbi,
  createPhysics2DAbiWorld,
  destroyPhysics2DAbiWorld,
  executePhysics2DAbiCommands,
  getPhysics2DAbiWorldStatus,
  readPhysics2DAbiBodies,
  readPhysics2DAbiContacts,
  readPhysics2DAbiJoints,
  stepPhysics2DAbiWorld,
} from './physics2DAbi';
import {
  createPhysics2DAbiBodyBuffer,
  createPhysics2DAbiCommandBuffer,
  createPhysics2DAbiContactBuffer,
  createPhysics2DAbiExecutionResult,
  createPhysics2DAbiJointBuffer,
} from './physics2DAbiBuffer';
import { writePhysics2DAbiSetBodyCommand, writePhysics2DAbiSetColliderCommand } from './physics2DAbiCommand';
import { Physics2DAbiCapability, Physics2DAbiContactFlag, Physics2DAbiVersion } from './physics2DAbiLayout';

const MATERIAL = { density: 1, friction: 0.3, restitution: 0 };

function floorAndBox(commands: Physics2DAbiCommandBuffer): void {
  const floor = createRigidBody2D('static', 0, -0.5);
  floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -4, minY: -0.5, maxX: 4, maxY: 0 }, MATERIAL));
  const crate = createRigidBody2D('dynamic', 0, 0.5);
  crate.colliders.push(
    createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, MATERIAL),
  );
  writePhysics2DAbiSetBodyCommand(commands, 1, floor);
  writePhysics2DAbiSetColliderCommand(commands, 1, 1, floor.colliders[0]);
  writePhysics2DAbiSetBodyCommand(commands, 2, crate);
  writePhysics2DAbiSetColliderCommand(commands, 2, 2, crate.colliders[0]);
}

function settled(): { abi: Physics2DAbi; handle: number } {
  const abi = createPhysics2DAbi();
  const handle = createPhysics2DAbiWorld(abi);
  const commands = createPhysics2DAbiCommandBuffer(4096);
  floorAndBox(commands);
  executePhysics2DAbiCommands(abi, handle, commands, createPhysics2DAbiExecutionResult());
  for (let step = 0; step < 30; step += 1) stepPhysics2DAbiWorld(abi, handle, 1 / 60);
  return { abi, handle };
}

describe('createPhysics2DAbi', () => {
  it('declares its version and every capability the reference implements', () => {
    const abi = createPhysics2DAbi();
    expect(abi.version).toBe(Physics2DAbiVersion);
    expect(abi.capabilities & Physics2DAbiCapability.ContactHooks).toBeTruthy();
    expect(abi.capabilities & Physics2DAbiCapability.PersistentWorlds).toBeTruthy();
    expect(abi.capabilities & Physics2DAbiCapability.Queries).toBeTruthy();
    expect(abi.capabilities & Physics2DAbiCapability.SelectiveReadback).toBeTruthy();
  });
});

describe('createPhysics2DAbiWorld', () => {
  it('issues distinct non-zero handles that are never reused', () => {
    const abi = createPhysics2DAbi();
    const first = createPhysics2DAbiWorld(abi);
    const second = createPhysics2DAbiWorld(abi);
    expect(first).toBeGreaterThan(0);
    expect(second).not.toBe(first);
    destroyPhysics2DAbiWorld(abi, first);
    expect(createPhysics2DAbiWorld(abi)).not.toBe(first);
  });
});

describe('destroyPhysics2DAbiWorld', () => {
  it('reports false for a handle it has already released', () => {
    const abi = createPhysics2DAbi();
    const handle = createPhysics2DAbiWorld(abi);
    expect(destroyPhysics2DAbiWorld(abi, handle)).toBe(true);
    expect(destroyPhysics2DAbiWorld(abi, handle)).toBe(false);
  });
});

describe('executePhysics2DAbiCommands', () => {
  it('names the first command it could not apply and keeps the ones before it', () => {
    const abi = createPhysics2DAbi();
    const handle = createPhysics2DAbiWorld(abi);
    const commands = createPhysics2DAbiCommandBuffer(4096);
    const crate = createRigidBody2D('dynamic', 1, 2);
    writePhysics2DAbiSetBodyCommand(commands, 1, crate);
    // Names a body that does not exist, so this record fails while the one before it stands.
    writePhysics2DAbiSetColliderCommand(
      commands,
      1,
      99,
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, MATERIAL),
    );
    const result = createPhysics2DAbiExecutionResult();

    expect(executePhysics2DAbiCommands(abi, handle, commands, result)).toBe(false);

    expect(result.status).toBe('MissingBody');
    expect(result.commandIndex).toBe(1);
    const bodies = createPhysics2DAbiBodyBuffer(4);
    expect(readPhysics2DAbiBodies(abi, handle, null, bodies)).toBe(true);
    expect(bodies.count).toBe(1);
  });

  it('rejects a stream whose header disagrees with its contents', () => {
    const abi = createPhysics2DAbi();
    const handle = createPhysics2DAbiWorld(abi);
    const commands = createPhysics2DAbiCommandBuffer(4096);
    writePhysics2DAbiSetBodyCommand(commands, 1, createRigidBody2D('dynamic', 0, 0));
    commands.commandCount = 5;
    const result = createPhysics2DAbiExecutionResult();
    expect(executePhysics2DAbiCommands(abi, handle, commands, result)).toBe(false);
    expect(result.status).toBe('InvalidBuffer');
  });
});

describe('getPhysics2DAbiWorldStatus', () => {
  it('separates a live world from one that no longer exists', () => {
    const abi = createPhysics2DAbi();
    const handle = createPhysics2DAbiWorld(abi);
    expect(getPhysics2DAbiWorldStatus(abi, handle)).toBe('Ready');
    destroyPhysics2DAbiWorld(abi, handle);
    expect(getPhysics2DAbiWorldStatus(abi, handle)).toBe('Stale');
  });
});

describe('readPhysics2DAbiBodies', () => {
  it('reports the whole answer through requiredCount when only a prefix fits', () => {
    const { abi, handle } = settled();
    const small = createPhysics2DAbiBodyBuffer(1);
    expect(readPhysics2DAbiBodies(abi, handle, null, small)).toBe(true);
    expect(small.count).toBe(1);
    expect(small.requiredCount).toBe(2);
  });

  it('preserves the caller order of a selective read and omits absent ids', () => {
    const { abi, handle } = settled();
    const out = createPhysics2DAbiBodyBuffer(4);
    expect(readPhysics2DAbiBodies(abi, handle, new Uint32Array([2, 77, 1]), out)).toBe(true);
    expect(out.count).toBe(2);
    expect([out.ids[0], out.ids[1]]).toEqual([2, 1]);
  });
});

describe('readPhysics2DAbiContacts', () => {
  it('reports the resting contact with its manifold points', () => {
    const { abi, handle } = settled();
    const contacts = createPhysics2DAbiContactBuffer(4, 8);
    expect(readPhysics2DAbiContacts(abi, handle, 'All', contacts)).toBe(true);
    expect(contacts.count).toBe(1);
    expect(contacts.pointCount).toBeGreaterThan(0);
    expect(contacts.flags[0] & Physics2DAbiContactFlag.Touching).toBe(Physics2DAbiContactFlag.Touching);
    expect([contacts.ids[0], contacts.ids[1]]).toEqual([1, 2]);
  });

  it('separates the began selection from the standing set', () => {
    const { abi, handle } = settled();
    const all = createPhysics2DAbiContactBuffer(4, 8);
    const began = createPhysics2DAbiContactBuffer(4, 8);
    readPhysics2DAbiContacts(abi, handle, 'All', all);
    readPhysics2DAbiContacts(abi, handle, 'Began', began);
    expect(all.count).toBe(1);
    expect(began.count).toBe(0);
  });
});

describe('readPhysics2DAbiJoints', () => {
  it('reports an empty answer without touching the buffer contents', () => {
    const { abi, handle } = settled();
    const joints = createPhysics2DAbiJointBuffer(2);
    expect(readPhysics2DAbiJoints(abi, handle, joints)).toBe(true);
    expect(joints.count).toBe(0);
    expect(joints.requiredCount).toBe(0);
  });
});

describe('stepPhysics2DAbiWorld', () => {
  it('advances the world it names and leaves a sibling world alone', () => {
    const abi = createPhysics2DAbi();
    const stepped = createPhysics2DAbiWorld(abi);
    const untouched = createPhysics2DAbiWorld(abi);
    for (const handle of [stepped, untouched]) {
      const commands = createPhysics2DAbiCommandBuffer(4096);
      floorAndBox(commands);
      executePhysics2DAbiCommands(abi, handle, commands, createPhysics2DAbiExecutionResult());
    }
    for (let step = 0; step < 20; step += 1) expect(stepPhysics2DAbiWorld(abi, stepped, 1 / 60)).toBe('Complete');

    const a = createPhysics2DAbiBodyBuffer(4);
    const b = createPhysics2DAbiBodyBuffer(4);
    readPhysics2DAbiBodies(abi, stepped, null, a);
    readPhysics2DAbiBodies(abi, untouched, null, b);
    expect(a.values[17 + 4]).not.toBe(b.values[17 + 4]);
  });
});
