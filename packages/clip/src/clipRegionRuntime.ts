// Generated from crates/flight-clip/src/clip_region_runtime.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

import { getClipRegionStateBinding } from './clipRegionState.ts';
import type { ClipRegion, ClipRegionContoursGuard, ClipRegionReleaseGuard, ClipRegionUseGuard } from './types.ts';

interface ClipRegionStateRaw extends EntityRaw {}

interface ClipRegionRuntime {
  pool: ClipRegion[];
  poolSize: number;
  contoursGuard: ClipRegionContoursGuard | null;
  releaseGuard: ClipRegionReleaseGuard | null;
  useGuard: ClipRegionUseGuard | null;
}

export function acquireClipRegionFromPool(): ClipRegion | null {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  if (runtime.poolSize === 0) {
    return null;
  }
  runtime.poolSize -= 1;
  return runtime.pool[runtime.poolSize];
}

function getClipRegionRuntime(state: Readonly<ClipRegionStateRaw>): ClipRegionRuntime {
  return clipRegionStateStateStore.get(state)!;
}

function getBoundClipRegionRuntime(): ClipRegionRuntime {
  const binding: ClipRegionStateRaw = getClipRegionStateBinding();
  const state = binding!;
  return getClipRegionRuntime(state);
}

export function createClipRegionState(): ClipRegionStateRaw {
  let out: ClipRegionStateRaw = allocateEntity<ClipRegionStateRaw>();
  clipRegionStateStateStore.set(out, {
    pool: [] as never[],
    poolSize: 0,
    contoursGuard: null,
    releaseGuard: null,
    useGuard: null,
  });
  return out;
}

export function getClipRegionContoursGuard(): ClipRegionContoursGuard | null {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  return runtime.contoursGuard;
}

export function isClipRegionReleased(clip: Readonly<ClipRegion>): boolean {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  return clipRegionRuntimeContains(runtime, clip);
}

export function releaseClipRegionToPool(clip: Readonly<ClipRegion>): void {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  const index = runtime.poolSize;
  if (index < runtime.pool.length) {
    runtime.pool[index] = clip;
  } else {
    runtime.pool.push(clip);
  }
  runtime.poolSize += 1;
}

export function setClipRegionContoursGuardSlot(guard: ClipRegionContoursGuard | null): void {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  runtime.contoursGuard = guard;
}

export function setClipRegionReleaseGuardSlot(guard: ClipRegionReleaseGuard | null): void {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  runtime.releaseGuard = guard;
}

export function setClipRegionUseGuardSlot(guard: ClipRegionUseGuard | null): void {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  runtime.useGuard = guard;
}

export function snapshotClipRegionReleaseGuard(
  clip: Readonly<ClipRegion>,
): readonly [ClipRegionReleaseGuard | null, boolean] {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  return [runtime.releaseGuard, clipRegionRuntimeContains(runtime, clip)];
}

export function snapshotClipRegionUseGuard(clip: Readonly<ClipRegion>): readonly [ClipRegionUseGuard | null, boolean] {
  let runtime = getBoundClipRegionRuntime();
  runtime = runtime!;
  return [runtime.useGuard, clipRegionRuntimeContains(runtime, clip)];
}

function clipRegionRuntimeContains(runtime: Readonly<ClipRegionRuntime>, clip: Readonly<ClipRegion>): boolean {
  for (let index = 0; index < runtime.poolSize; index += 1) {
    if (runtime.pool[index] === clip) {
      return true;
    }
  }
  return false;
}

// Crate-private `ClipRegionState.state`, keyed by entity identity and reachable only from this package's modules.
const clipRegionStateStateStore = /* @__PURE__ */ new WeakMap<Readonly<ClipRegionStateRaw>, ClipRegionRuntime>();

export { clipRegionStateStateStore };
