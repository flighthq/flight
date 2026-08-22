import type {
  Physics2DAbi,
  Physics2DAbiBodyBuffer,
  Physics2DAbiCommandBuffer,
  Physics2DAbiContactBuffer,
  Physics2DAbiContactHooks,
  Physics2DAbiContactSelection,
  Physics2DAbiExecutionResult,
  Physics2DAbiJointBuffer,
  Physics2DAbiStepStatus,
  Physics2DAbiWorldHandle,
  Physics2DAbiWorldStatus,
} from '@flighthq/types/contract';

import { createReferencePhysics2DAbi } from './referencePhysics2DAbi';

// Creates the executable TypeScript reference ABI. A drop-in package shadows this one constructor and
// returns the same interface backed by its own persistent storage; every codec and wrapper remains
// shared, which keeps the wire contract upstream-first.
export function createPhysics2DAbi(): Physics2DAbi {
  return createReferencePhysics2DAbi();
}

export function createPhysics2DAbiWorld(abi: Readonly<Physics2DAbi>): Physics2DAbiWorldHandle {
  return abi.createWorld();
}

export function destroyPhysics2DAbiWorld(abi: Readonly<Physics2DAbi>, world: Physics2DAbiWorldHandle): boolean {
  return abi.destroyWorld(world);
}

export function executePhysics2DAbiCommands(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  commands: Readonly<Physics2DAbiCommandBuffer>,
  out: Physics2DAbiExecutionResult,
): boolean {
  return abi.execute(world, commands, out);
}

export function getPhysics2DAbiWorldStatus(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
): Physics2DAbiWorldStatus {
  return abi.getWorldStatus(world);
}

export function readPhysics2DAbiBodies(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
  out: Physics2DAbiBodyBuffer,
): boolean {
  return abi.readBodies(world, bodyIds, out);
}

export function readPhysics2DAbiContacts(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  selection: Physics2DAbiContactSelection,
  out: Physics2DAbiContactBuffer,
): boolean {
  return abi.readContacts(world, selection, out);
}

export function readPhysics2DAbiJoints(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  out: Physics2DAbiJointBuffer,
): boolean {
  return abi.readJoints(world, out);
}

export function stepPhysics2DAbiWorld(
  abi: Readonly<Physics2DAbi>,
  world: Physics2DAbiWorldHandle,
  dt: number,
  hooks: Readonly<Physics2DAbiContactHooks> | null = null,
): Physics2DAbiStepStatus {
  return abi.step(world, dt, hooks);
}
