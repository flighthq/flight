import { EntityRuntimeKey } from '@flighthq/types';
import type {
  Physics2DAbi,
  Physics2DAbiBodyBuffer,
  Physics2DAbiExecutionStatus,
  Physics2DAbiJointBuffer,
  Physics2DAbiQueryBuffer,
  Physics2DAbiStepStatus,
  Physics2DAbiWorldStatus,
} from '@flighthq/types';

import {
  abi_capabilities,
  abi_version,
  create_abi,
  create_world,
  destroy_world,
  execute,
  initSync,
  query,
  read_bodies,
  read_contacts,
  read_joints,
  step,
  world_status,
} from './wasm/physics2d_abi_wasm.js';
import { physics2DAbiWasmBytes } from './wasm/physics2DAbiWasmBytes.js';

const EMPTY_IDS = new Uint32Array();
const EXECUTION_STATUSES: readonly Physics2DAbiExecutionStatus[] = [
  'Complete',
  'BusyWorld',
  'InvalidBuffer',
  'InvalidCommand',
  'MissingBody',
  'MissingCollider',
  'MissingJoint',
  'RejectedMutation',
  'StaleWorld',
  'UnsupportedJoint',
  'UnsupportedShape',
];
const STEP_STATUSES: readonly Physics2DAbiStepStatus[] = [
  'Complete',
  'BusyWorld',
  'Declined',
  'InsufficientHookBuffer',
  'StaleWorld',
];
const WORLD_STATUSES: readonly Physics2DAbiWorldStatus[] = ['Stale', 'Ready', 'Busy'];
let initialized = false;

export function createPhysics2DAbi(): Physics2DAbi {
  ensureInitialized();
  const instance = create_abi();

  return {
    [EntityRuntimeKey]: undefined,
    version: abi_version(),
    capabilities: abi_capabilities(),
    createWorld: () => create_world(instance),
    destroyWorld: (world) => destroy_world(instance, world),
    getWorldStatus: (world) => statusAt(WORLD_STATUSES, world_status(instance, world), 'world'),
    execute(world, commands, out): boolean {
      const result = new Uint32Array(4);
      const success = execute(
        instance,
        world,
        asUint8(commands.data),
        commands.byteLength,
        commands.commandCount,
        result,
      );
      out.status = statusAt(EXECUTION_STATUSES, result[0]!, 'execution');
      out.commandIndex = result[1]!;
      out.byteOffset = result[2]!;
      out.commandKind = result[3]!;
      return success;
    },
    step(world, dt, hooks): Physics2DAbiStepStatus {
      return statusAt(STEP_STATUSES, step(instance, world, dt, hooks !== null), 'step');
    },
    readBodies(world, bodyIds, out): boolean {
      const counts = new Uint32Array(2);
      const success = read_bodies(
        instance,
        world,
        bodyIds === null ? EMPTY_IDS : bodyIds,
        bodyIds !== null,
        out.ids,
        out.flags,
        out.values,
        counts,
      );
      publishPair(out, counts);
      return success;
    },
    readContacts(world, _selection, out): boolean {
      const counts = new Uint32Array(4);
      const success = read_contacts(instance, world, counts);
      out.count = counts[0]!;
      out.pointCount = counts[1]!;
      out.requiredCount = counts[2]!;
      out.requiredPointCount = counts[3]!;
      return success;
    },
    readJoints(world, out): boolean {
      const counts = new Uint32Array(2);
      const success = read_joints(instance, world, out.ids, out.flags, out.values, counts);
      publishPair(out, counts);
      return success;
    },
    queryPoint(world, _x, _y, _filter, out): boolean {
      return unsupportedQuery(instance, world, out);
    },
    queryRay(world, _originX, _originY, _directionX, _directionY, _maxFraction, _closestOnly, _filter, out): boolean {
      return unsupportedQuery(instance, world, out);
    },
    queryRegion(world, _region, _filter, out): boolean {
      return unsupportedQuery(instance, world, out);
    },
    queryShapeCast(world, _shape, _dx, _dy, _maxFraction, _filter, out): boolean {
      return unsupportedQuery(instance, world, out);
    },
  } satisfies Physics2DAbi;
}

export function initPhysics2DAbiWasm(): void {
  ensureInitialized();
}

function unsupportedQuery(instance: number, world: number, out: Physics2DAbiQueryBuffer): boolean {
  const counts = new Uint32Array(2);
  const success = query(instance, world, counts);
  publishPair(out, counts);
  return success;
}

function publishPair(
  out: Physics2DAbiBodyBuffer | Physics2DAbiJointBuffer | Physics2DAbiQueryBuffer,
  counts: Uint32Array,
): void {
  out.count = counts[0]!;
  out.requiredCount = counts[1]!;
}

function ensureInitialized(): void {
  if (initialized) return;
  initSync({ module: physics2DAbiWasmBytes });
  initialized = true;
}

function asUint8(data: Readonly<Uint8Array<ArrayBufferLike>>): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function statusAt<T>(values: readonly T[], index: number, subject: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Physics2D wasm returned unknown ${subject} status ${index}`);
  return value;
}
