import type { CollisionBuiltInShape3D } from './Collision';
import type { Physics3DQueryFilter } from './Physics3D';
import type { SpatialAabb3D } from './Spatial';

// The target-neutral execution boundary beneath a native or otherwise separately-owned Physics3D
// world. `@flighthq/physics3d-abi` supplies the executable TypeScript reference; another package may
// return the same interface backed by Rust/Wasm without changing any command, readback, or query helper.
//
// Handles and object ids are non-zero unsigned 32-bit integers. A world handle is allocated by the
// implementation and never reused by that ABI instance; body, collider, and joint ids are selected by
// the caller and remain stable until their corresponding object is destroyed.
export type Physics3DAbiWorldHandle = number;
export type Physics3DAbiObjectId = number;
export type Physics3DAbiWorldStatus = 'Busy' | 'Ready' | 'Stale';

// Command application is deliberately partial rather than transactional. `commandIndex` names the
// first command that was not applied; every preceding command committed. Native callers can therefore
// recover without an implicit whole-world copy solely to provide rollback.
export type Physics3DAbiExecutionStatus =
  | 'BusyWorld'
  | 'Complete'
  | 'InvalidBuffer'
  | 'InvalidCommand'
  | 'MissingBody'
  | 'MissingCollider'
  | 'MissingJoint'
  | 'RejectedMutation'
  | 'StaleWorld'
  | 'UnsupportedJoint'
  | 'UnsupportedShape';

export interface Physics3DAbiExecutionResult {
  status: Physics3DAbiExecutionStatus;
  commandIndex: number;
  byteOffset: number;
  commandKind: number;
}

// A fixed-capacity, little-endian command stream. Writers return false without changing this record
// when the next command cannot be encoded or does not fit; semantic validation happens when the backend
// executes it. Capacity growth is explicit: allocate another buffer and rewrite the stream.
export interface Physics3DAbiCommandBuffer {
  readonly data: Uint8Array<ArrayBufferLike>;
  byteLength: number;
  commandCount: number;
}

// Structure-of-arrays body readback. `requiredCount` reports the complete answer and `count` the prefix
// that fit. A selective read preserves the caller's id order and silently omits ids absent from the
// world; an unfiltered read is ordered by ABI body id.
export interface Physics3DAbiBodyBuffer {
  readonly ids: Uint32Array<ArrayBufferLike>;
  readonly flags: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

export type Physics3DAbiContactSelection = 'All' | 'Began' | 'Ended';

// Structure-of-arrays contact readback. Each contact occupies one id/flag row and one value row;
// `pointStarts`/`pointCounts` select its points from the point arrays. Required counts describe the
// whole answer even when the caller-provided capacities publish only a prefix.
export interface Physics3DAbiContactBuffer {
  readonly ids: Uint32Array<ArrayBufferLike>;
  readonly flags: Uint32Array<ArrayBufferLike>;
  readonly pointStarts: Uint32Array<ArrayBufferLike>;
  readonly pointCounts: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  readonly pointFeatureIds: Uint32Array<ArrayBufferLike>;
  readonly pointValues: Float64Array<ArrayBufferLike>;
  count: number;
  pointCount: number;
  requiredCount: number;
  requiredPointCount: number;
}

// Contact hooks receive one contact at a time in step order. They may change only the Enabled flag,
// friction, and restitution. The same buffer is reused for every invocation, so retaining a view past
// the callback is invalid. `Physics3DAbiMaxContactPoints` point slots are sufficient for every built-in
// Physics3D manifold.
export type Physics3DAbiContactHook = (contact: Physics3DAbiContactBuffer) => void;

export interface Physics3DAbiContactHooks {
  readonly buffer: Physics3DAbiContactBuffer;
  readonly preSolve: Physics3DAbiContactHook | null;
  readonly postSolve: Physics3DAbiContactHook | null;
}

export type Physics3DAbiStepStatus = 'BusyWorld' | 'Complete' | 'Declined' | 'InsufficientHookBuffer' | 'StaleWorld';

// Joint ids and their latest reaction. `flags` carries the Broken bit. A kind that cannot report a
// reaction writes zeroes, exactly as `writePhysics3DJointReaction` reports false in the standard API.
export interface Physics3DAbiJointBuffer {
  readonly ids: Uint32Array<ArrayBufferLike>;
  readonly flags: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

// Query output shared by point, region, ray, and shape-cast calls. Point/region hits leave the geometric
// value row zero. Rays and shape casts write fraction, point, and normal. `requiredCount` makes capacity
// exhaustion distinguishable from an empty result without allocating from the query.
export interface Physics3DAbiQueryBuffer {
  readonly bodyIds: Uint32Array<ArrayBufferLike>;
  readonly colliderIds: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

// The narrow backend seam. Apps normally call the free functions in `@flighthq/physics3d-abi`; the
// methods live here so another implementation can replace `createPhysics3DAbi` and reuse every public
// codec and convenience function. A zero-copy native shadow may additionally replace the buffer
// constructors with identical records backed by its linear memory; the typed-array fields deliberately
// accept every ArrayBufferLike backing for that reason.
export interface Physics3DAbi {
  readonly version: number;
  readonly capabilities: number;
  createWorld(): Physics3DAbiWorldHandle;
  destroyWorld(world: Physics3DAbiWorldHandle): boolean;
  getWorldStatus(world: Physics3DAbiWorldHandle): Physics3DAbiWorldStatus;
  execute(
    world: Physics3DAbiWorldHandle,
    commands: Readonly<Physics3DAbiCommandBuffer>,
    out: Physics3DAbiExecutionResult,
  ): boolean;
  step(
    world: Physics3DAbiWorldHandle,
    dt: number,
    hooks: Readonly<Physics3DAbiContactHooks> | null,
  ): Physics3DAbiStepStatus;
  readBodies(
    world: Physics3DAbiWorldHandle,
    bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
    out: Physics3DAbiBodyBuffer,
  ): boolean;
  readContacts(
    world: Physics3DAbiWorldHandle,
    selection: Physics3DAbiContactSelection,
    out: Physics3DAbiContactBuffer,
  ): boolean;
  readJoints(world: Physics3DAbiWorldHandle, out: Physics3DAbiJointBuffer): boolean;
  queryPoint(
    world: Physics3DAbiWorldHandle,
    x: number,
    y: number,
    z: number,
    filter: Readonly<Physics3DQueryFilter> | null,
    out: Physics3DAbiQueryBuffer,
  ): boolean;
  queryRay(
    world: Physics3DAbiWorldHandle,
    originX: number,
    originY: number,
    originZ: number,
    directionX: number,
    directionY: number,
    directionZ: number,
    maxFraction: number,
    closestOnly: boolean,
    filter: Readonly<Physics3DQueryFilter> | null,
    out: Physics3DAbiQueryBuffer,
  ): boolean;
  queryRegion(
    world: Physics3DAbiWorldHandle,
    region: Readonly<SpatialAabb3D>,
    filter: Readonly<Physics3DQueryFilter> | null,
    out: Physics3DAbiQueryBuffer,
  ): boolean;
  queryShapeCast(
    world: Physics3DAbiWorldHandle,
    shape: Readonly<CollisionBuiltInShape3D>,
    dx: number,
    dy: number,
    dz: number,
    maxFraction: number,
    filter: Readonly<Physics3DQueryFilter> | null,
    out: Physics3DAbiQueryBuffer,
  ): boolean;
}
