import type { CollisionBuiltInShape2D } from './Collision';
import type { Physics2DQueryFilter } from './Physics2D';
import type { SpatialAabb2D } from './Spatial';

// The target-neutral execution boundary beneath a native or otherwise separately-owned Physics2D
// world. `@flighthq/physics2d-abi` supplies the executable TypeScript reference; another package may
// return the same interface backed by Rust/Wasm without changing any command, readback, or query helper.
//
// Handles and object ids are non-zero unsigned 32-bit integers. A world handle is allocated by the
// implementation and never reused by that ABI instance; body, collider, and joint ids are selected by
// the caller and remain stable until their corresponding object is destroyed.
export type Physics2DAbiWorldHandle = number;
export type Physics2DAbiObjectId = number;
export type Physics2DAbiWorldStatus = 'Busy' | 'Ready' | 'Stale';

// Command application is deliberately partial rather than transactional. `commandIndex` names the
// first command that was not applied; every preceding command committed. Native callers can therefore
// recover without an implicit whole-world copy solely to provide rollback.
export type Physics2DAbiExecutionStatus =
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

export interface Physics2DAbiExecutionResult {
  status: Physics2DAbiExecutionStatus;
  commandIndex: number;
  byteOffset: number;
  commandKind: number;
}

// A fixed-capacity, little-endian command stream. Writers return false without changing this record
// when the next command cannot be encoded or does not fit; semantic validation happens when the backend
// executes it. Capacity growth is explicit: allocate another buffer and rewrite the stream.
export interface Physics2DAbiCommandBuffer {
  readonly data: Uint8Array<ArrayBufferLike>;
  byteLength: number;
  commandCount: number;
}

// Structure-of-arrays body readback. `requiredCount` reports the complete answer and `count` the prefix
// that fit. A selective read preserves the caller's id order and silently omits ids absent from the
// world; an unfiltered read is ordered by ABI body id.
export interface Physics2DAbiBodyBuffer {
  readonly ids: Uint32Array<ArrayBufferLike>;
  readonly flags: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

export type Physics2DAbiContactSelection = 'All' | 'Began' | 'Ended';

// Structure-of-arrays contact readback. Each contact occupies one id/flag row and one value row;
// `pointStarts`/`pointCounts` select its points from the point arrays. Required counts describe the
// whole answer even when the caller-provided capacities publish only a prefix.
export interface Physics2DAbiContactBuffer {
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
// the callback is invalid. Two point slots are sufficient for every built-in Physics2D manifold, which
// is where this differs from the 3D boundary rather than being a smaller version of it: a planar
// manifold is a segment, so two points is the exact bound rather than a generous one.
export type Physics2DAbiContactHook = (contact: Physics2DAbiContactBuffer) => void;

export interface Physics2DAbiContactHooks {
  readonly buffer: Physics2DAbiContactBuffer;
  readonly preSolve: Physics2DAbiContactHook | null;
  readonly postSolve: Physics2DAbiContactHook | null;
}

export type Physics2DAbiStepStatus = 'BusyWorld' | 'Complete' | 'Declined' | 'InsufficientHookBuffer' | 'StaleWorld';

// Joint ids and their latest reaction. `flags` carries the Broken bit. A kind that cannot report a
// reaction writes zeroes, exactly as `writePhysics2DJointReaction` reports false in the standard API.
export interface Physics2DAbiJointBuffer {
  readonly ids: Uint32Array<ArrayBufferLike>;
  readonly flags: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

// Query output shared by point, region, ray, and shape-cast calls. Point/region hits leave the geometric
// value row zero. Rays and shape casts write fraction, point, and normal. `requiredCount` makes capacity
// exhaustion distinguishable from an empty result without allocating from the query.
export interface Physics2DAbiQueryBuffer {
  readonly bodyIds: Uint32Array<ArrayBufferLike>;
  readonly colliderIds: Uint32Array<ArrayBufferLike>;
  readonly values: Float64Array<ArrayBufferLike>;
  count: number;
  requiredCount: number;
}

// The narrow backend seam. Apps normally call the free functions in `@flighthq/physics2d-abi`; the
// methods live here so another implementation can replace `createPhysics2DAbi` and reuse every public
// codec and convenience function. A zero-copy native shadow may additionally replace the buffer
// constructors with identical records backed by its linear memory; the typed-array fields deliberately
// accept every ArrayBufferLike backing for that reason.
export interface Physics2DAbi {
  readonly version: number;
  readonly capabilities: number;
  createWorld(): Physics2DAbiWorldHandle;
  destroyWorld(world: Physics2DAbiWorldHandle): boolean;
  getWorldStatus(world: Physics2DAbiWorldHandle): Physics2DAbiWorldStatus;
  execute(
    world: Physics2DAbiWorldHandle,
    commands: Readonly<Physics2DAbiCommandBuffer>,
    out: Physics2DAbiExecutionResult,
  ): boolean;
  step(
    world: Physics2DAbiWorldHandle,
    dt: number,
    hooks: Readonly<Physics2DAbiContactHooks> | null,
  ): Physics2DAbiStepStatus;
  readBodies(
    world: Physics2DAbiWorldHandle,
    bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
    out: Physics2DAbiBodyBuffer,
  ): boolean;
  readContacts(
    world: Physics2DAbiWorldHandle,
    selection: Physics2DAbiContactSelection,
    out: Physics2DAbiContactBuffer,
  ): boolean;
  readJoints(world: Physics2DAbiWorldHandle, out: Physics2DAbiJointBuffer): boolean;
  queryPoint(
    world: Physics2DAbiWorldHandle,
    x: number,
    y: number,
    filter: Readonly<Physics2DQueryFilter> | null,
    out: Physics2DAbiQueryBuffer,
  ): boolean;
  queryRay(
    world: Physics2DAbiWorldHandle,
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
    maxFraction: number,
    closestOnly: boolean,
    filter: Readonly<Physics2DQueryFilter> | null,
    out: Physics2DAbiQueryBuffer,
  ): boolean;
  queryRegion(
    world: Physics2DAbiWorldHandle,
    region: Readonly<SpatialAabb2D>,
    filter: Readonly<Physics2DQueryFilter> | null,
    out: Physics2DAbiQueryBuffer,
  ): boolean;
  queryShapeCast(
    world: Physics2DAbiWorldHandle,
    shape: Readonly<CollisionBuiltInShape2D>,
    dx: number,
    dy: number,
    maxFraction: number,
    filter: Readonly<Physics2DQueryFilter> | null,
    out: Physics2DAbiQueryBuffer,
  ): boolean;
}
