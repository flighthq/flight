import type {
  Physics3DAbi,
  Physics3DAbiBodyBuffer,
  Physics3DAbiCommandBuffer,
  Physics3DAbiContactBuffer,
  Physics3DAbiContactHooks,
  Physics3DAbiContactSelection,
  Physics3DAbiExecutionResult,
  Physics3DAbiJointBuffer,
  Physics3DAbiStepStatus,
  Physics3DAbiWorldHandle,
  Physics3DAbiWorldStatus,
} from '@flighthq/types/contract';

import { createReferencePhysics3DAbi } from './referencePhysics3DAbi';

// Creates the executable TypeScript reference ABI. A drop-in package shadows this one constructor and
// returns the same interface backed by its own persistent storage; every codec and wrapper remains
// shared, which keeps the wire contract upstream-first.
export function createPhysics3DAbi(): Physics3DAbi {
  return createReferencePhysics3DAbi();
}

export function createPhysics3DAbiWorld(abi: Readonly<Physics3DAbi>): Physics3DAbiWorldHandle {
  return abi.createWorld();
}

export function destroyPhysics3DAbiWorld(abi: Readonly<Physics3DAbi>, world: Physics3DAbiWorldHandle): boolean {
  return abi.destroyWorld(world);
}

export function executePhysics3DAbiCommands(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  commands: Readonly<Physics3DAbiCommandBuffer>,
  out: Physics3DAbiExecutionResult,
): boolean {
  return abi.execute(world, commands, out);
}

export function getPhysics3DAbiWorldStatus(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
): Physics3DAbiWorldStatus {
  return abi.getWorldStatus(world);
}

export function readPhysics3DAbiBodies(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
  out: Physics3DAbiBodyBuffer,
): boolean {
  return abi.readBodies(world, bodyIds, out);
}

export function readPhysics3DAbiContacts(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  selection: Physics3DAbiContactSelection,
  out: Physics3DAbiContactBuffer,
): boolean {
  return abi.readContacts(world, selection, out);
}

export function readPhysics3DAbiJoints(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  out: Physics3DAbiJointBuffer,
): boolean {
  return abi.readJoints(world, out);
}

export function stepPhysics3DAbiWorld(
  abi: Readonly<Physics3DAbi>,
  world: Physics3DAbiWorldHandle,
  dt: number,
  hooks: Readonly<Physics3DAbiContactHooks> | null = null,
): Physics3DAbiStepStatus {
  return abi.step(world, dt, hooks);
}
