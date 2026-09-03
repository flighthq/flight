import { createEntity } from '@flighthq/entity/contract';
import {
  addPhysics2DBody,
  addPhysics2DCollider,
  addPhysics2DJoint,
  applyPhysics2DForce,
  applyPhysics2DForceAtPoint,
  applyPhysics2DLinearImpulse,
  applyPhysics2DLinearImpulseAtPoint,
  applyPhysics2DTorque,
  createPhysics2DCollider,
  createPhysics2DDistanceJoint,
  createPhysics2DGearJoint,
  createPhysics2DJointReaction,
  createPhysics2DMouseJoint,
  createPhysics2DPrismaticJoint,
  createPhysics2DPulleyJoint,
  createPhysics2DQueryResult,
  createPhysics2DRayResult,
  createPhysics2DRevoluteJoint,
  createPhysics2DRopeJoint,
  createPhysics2DShapeCastResult,
  createPhysics2DWeldJoint,
  createPhysics2DWheelJoint,
  createPhysics2DWorld,
  createRigidBody2D,
  isPhysics2DBodyStateValid,
  isPhysics2DContactStateValid,
  isPhysics2DGravityValid,
  isPhysics2DJointStateValid,
  isPhysics2DPreviousTimestepValid,
  isPhysics2DSolverConfigValid,
  isPhysics2DTimestepValid,
  queryPhysics2DPoint,
  queryPhysics2DRay,
  queryPhysics2DRayClosest,
  queryPhysics2DRegion,
  queryPhysics2DShapeCast,
  registerBuiltInPhysics2DJointSolvers,
  removePhysics2DBody,
  removePhysics2DCollider,
  removePhysics2DJoint,
  setPhysics2DBodyBullet,
  setPhysics2DBodyFixedRotation,
  setPhysics2DBodySleepEnabled,
  setPhysics2DBodyTransform,
  setPhysics2DBodyType,
  stepPhysics2D,
  wakePhysics2DBody,
  writePhysics2DJointReaction,
} from '@flighthq/physics2d/contract';
import type {
  CollisionBuiltInShape2D,
  EntityWithoutRuntime,
  Physics2DAbi,
  Physics2DAbiBodyBuffer,
  Physics2DAbiCommandBuffer,
  Physics2DAbiContactBuffer,
  Physics2DAbiContactHooks,
  Physics2DAbiContactSelection,
  Physics2DAbiExecutionResult,
  Physics2DAbiExecutionStatus,
  Physics2DAbiJointBuffer,
  Physics2DAbiQueryBuffer,
  Physics2DAbiStepStatus,
  Physics2DAbiWorldHandle,
  Physics2DAbiWorldStatus,
  Physics2DCollider,
  Physics2DContact,
  Physics2DContactCallback,
  Physics2DJoint,
  Physics2DQueryHit,
  Physics2DSolverConfig,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';

import {
  Physics2DAbiBodyFlag,
  Physics2DAbiBodyType,
  Physics2DAbiBodyValueStride,
  Physics2DAbiCapability,
  Physics2DAbiCommandByteLength,
  Physics2DAbiCommandHeaderByteLength,
  Physics2DAbiCommandKind,
  Physics2DAbiCommandMagic,
  Physics2DAbiCommandRecordHeaderByteLength,
  Physics2DAbiContactFlag,
  Physics2DAbiContactIdStride,
  Physics2DAbiContactPointValueStride,
  Physics2DAbiContactValue,
  Physics2DAbiContactValueStride,
  Physics2DAbiJointFlag,
  Physics2DAbiJointKind,
  Physics2DAbiJointKindValueCount,
  Physics2DAbiJointValueStride,
  Physics2DAbiMaxContactPoints,
  Physics2DAbiQueryValueStride,
  Physics2DAbiSetColliderPayloadOffset,
  Physics2DAbiSetJointPayloadOffset,
  Physics2DAbiShapeHeaderByteLength,
  Physics2DAbiShapeKind,
  Physics2DAbiVersion,
} from './physics2DAbiLayout';

// The executable specification for the Physics2D ABI: a real `Physics2DWorld` behind persistent
// handles, caller-chosen ids, and packed buffers. It exists to make the wire contract testable rather
// than to be fast — a native shadow replaces this one constructor and inherits every codec above it.
export function createReferencePhysics2DAbi(): Physics2DAbi {
  const worlds = new Map<number, ReferencePhysics2DAbiWorld>();
  let nextWorldHandle = 1;

  return createEntity<EntityWithoutRuntime<Physics2DAbi>>({
    version: Physics2DAbiVersion,
    capabilities:
      Physics2DAbiCapability.ContactHooks |
      Physics2DAbiCapability.PersistentWorlds |
      Physics2DAbiCapability.Queries |
      Physics2DAbiCapability.SelectiveReadback,
    createWorld(): Physics2DAbiWorldHandle {
      if (nextWorldHandle > 0xffffffff) return 0;
      const handle = nextWorldHandle;
      nextWorldHandle += 1;
      const world = createPhysics2DWorld();
      registerBuiltInPhysics2DJointSolvers(world);
      worlds.set(handle, createReferenceWorld(world));
      return handle;
    },
    destroyWorld(handle): boolean {
      if (worlds.get(handle)?.stepping === true) return false;
      return worlds.delete(handle);
    },
    getWorldStatus(handle): Physics2DAbiWorldStatus {
      const state = worlds.get(handle);
      if (state === undefined) return 'Stale';
      return state.stepping ? 'Busy' : 'Ready';
    },
    execute(handle, commands, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined) return failExecution(out, 'StaleWorld', 0, Physics2DAbiCommandHeaderByteLength, 0);
      if (state.stepping) return failExecution(out, 'BusyWorld', 0, Physics2DAbiCommandHeaderByteLength, 0);
      return executeCommands(state, commands, out);
    },
    step(handle, dt, hooks): Physics2DAbiStepStatus {
      const state = worlds.get(handle);
      if (state === undefined) return 'StaleWorld';
      if (state.stepping) return 'BusyWorld';
      return stepReferenceWorld(state, dt, hooks);
    },
    readBodies(handle, bodyIds, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      readBodies(state, bodyIds, out);
      return true;
    },
    readContacts(handle, selection, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      readContacts(state, selection, out);
      return true;
    },
    readJoints(handle, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      readJoints(state, out);
      return true;
    },
    queryPoint(handle, x, y, filter, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      queryPhysics2DPoint(state.world, x, y, state.query, filter ?? undefined);
      writeQueryHits(state, state.query, out);
      return true;
    },
    queryRay(handle, originX, originY, directionX, directionY, maxFraction, closest, filter, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      const query = closest ? queryPhysics2DRayClosest : queryPhysics2DRay;
      query(state.world, originX, originY, directionX, directionY, state.ray, maxFraction, filter ?? undefined);
      writeRayHits(state, out);
      return true;
    },
    queryRegion(handle, region, filter, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      queryPhysics2DRegion(state.world, region, state.query, filter ?? undefined);
      writeQueryHits(state, state.query, out);
      return true;
    },
    queryShapeCast(handle, shape, dx, dy, maxFraction, filter, out): boolean {
      const state = worlds.get(handle);
      if (state === undefined || state.stepping) return false;
      queryPhysics2DShapeCast(state.world, shape, dx, dy, state.shapeCast, maxFraction, filter ?? undefined);
      writeShapeCastHit(state, out);
      return true;
    },
  });
}

interface ReferencePhysics2DAbiCollider {
  readonly bodyId: number;
  readonly collider: Physics2DCollider;
}

interface ReferencePhysics2DAbiBrokenJoint {
  readonly id: number;
  readonly forceX: number;
  readonly forceY: number;
  readonly torque: number;
}

interface ReferencePhysics2DAbiWorld {
  readonly world: Physics2DWorld;
  readonly bodyById: Map<number, RigidBody2D>;
  readonly idByBody: Map<RigidBody2D, number>;
  readonly bodyIds: number[];
  readonly colliderById: Map<number, ReferencePhysics2DAbiCollider>;
  readonly idByCollider: Map<Physics2DCollider, number>;
  readonly jointById: Map<number, Physics2DJoint>;
  readonly idByJoint: Map<Physics2DJoint, number>;
  readonly jointIds: number[];
  // Joints that broke during the most recent step. Physics2D REMOVES a broken joint from the world, so
  // this list is the only surface on which a buffer-based caller can learn that a joint it still holds
  // an id for is gone, and with what load it failed.
  brokenJoints: ReferencePhysics2DAbiBrokenJoint[];
  readonly query: ReturnType<typeof createPhysics2DQueryResult>;
  readonly ray: ReturnType<typeof createPhysics2DRayResult>;
  readonly shapeCast: ReturnType<typeof createPhysics2DShapeCastResult>;
  readonly reaction: ReturnType<typeof createPhysics2DJointReaction>;
  readonly bodyValues: number[];
  readonly jointCommonValues: number[];
  readonly jointKindValues: number[];
  activeHooks: Readonly<Physics2DAbiContactHooks> | null;
  stepping: boolean;
  lastStepDt: number;
  readonly preSolveHook: Physics2DContactCallback;
  readonly postSolveHook: Physics2DContactCallback;
}

interface CommandRecord {
  readonly view: DataView;
  readonly start: number;
  readonly payload: number;
  readonly byteLength: number;
  readonly kind: number;
  readonly objectId: number;
  readonly relatedId: number;
}

function createReferenceWorld(world: Physics2DWorld): ReferencePhysics2DAbiWorld {
  let state: ReferencePhysics2DAbiWorld;
  state = {
    world,
    bodyById: new Map(),
    idByBody: new Map(),
    bodyIds: [],
    colliderById: new Map(),
    idByCollider: new Map(),
    jointById: new Map(),
    idByJoint: new Map(),
    jointIds: [],
    brokenJoints: [],
    query: createPhysics2DQueryResult(),
    ray: createPhysics2DRayResult(),
    shapeCast: createPhysics2DShapeCastResult(),
    reaction: createPhysics2DJointReaction(),
    bodyValues: new Array<number>(Physics2DAbiBodyValueStride).fill(0),
    jointCommonValues: new Array<number>(6).fill(0),
    jointKindValues: new Array<number>(Physics2DAbiJointKindValueCount).fill(0),
    activeHooks: null,
    stepping: false,
    lastStepDt: 0,
    preSolveHook(_world, contact): void {
      const hooks = state.activeHooks;
      if (hooks?.preSolve !== null && hooks?.preSolve !== undefined) {
        invokeContactHook(state, contact, hooks.buffer, hooks.preSolve);
      }
    },
    postSolveHook(_world, contact): void {
      const hooks = state.activeHooks;
      if (hooks?.postSolve !== null && hooks?.postSolve !== undefined) {
        invokeContactHook(state, contact, hooks.buffer, hooks.postSolve);
      }
    },
  };
  return state;
}

function executeCommands(
  state: ReferencePhysics2DAbiWorld,
  commands: Readonly<Physics2DAbiCommandBuffer>,
  out: Physics2DAbiExecutionResult,
): boolean {
  if (!isCommandBufferValid(commands)) {
    return failExecution(out, 'InvalidBuffer', 0, Physics2DAbiCommandHeaderByteLength, 0);
  }

  const view = new DataView(commands.data.buffer, commands.data.byteOffset, commands.data.byteLength);
  let byteOffset = Physics2DAbiCommandHeaderByteLength;
  for (let commandIndex = 0; commandIndex < commands.commandCount; commandIndex += 1) {
    if (byteOffset + Physics2DAbiCommandRecordHeaderByteLength > commands.byteLength) {
      return failExecution(out, 'InvalidBuffer', commandIndex, byteOffset, 0);
    }
    const kind = view.getUint32(byteOffset, true);
    const byteLength = view.getUint32(byteOffset + 4, true);
    if (
      byteLength < Physics2DAbiCommandRecordHeaderByteLength ||
      byteLength % 8 !== 0 ||
      byteOffset + byteLength > commands.byteLength
    ) {
      return failExecution(out, 'InvalidBuffer', commandIndex, byteOffset, kind);
    }
    const record: CommandRecord = {
      view,
      start: byteOffset,
      payload: byteOffset + Physics2DAbiCommandRecordHeaderByteLength,
      byteLength,
      kind,
      objectId: view.getUint32(byteOffset + 8, true),
      relatedId: view.getUint32(byteOffset + 12, true),
    };
    const status = executeCommand(state, record);
    if (status !== 'Complete') return failExecution(out, status, commandIndex, byteOffset, kind);
    byteOffset += byteLength;
  }
  if (byteOffset !== commands.byteLength) {
    return failExecution(out, 'InvalidBuffer', commands.commandCount, byteOffset, 0);
  }
  out.status = 'Complete';
  out.commandIndex = commands.commandCount;
  out.byteOffset = byteOffset;
  out.commandKind = 0;
  return true;
}

function executeCommand(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (command.kind === Physics2DAbiCommandKind.SetGravity) return executeSetGravity(state, command);
  if (command.kind === Physics2DAbiCommandKind.SetSolverConfig) return executeSetSolverConfig(state, command);
  if (command.kind === Physics2DAbiCommandKind.SetBody) return executeSetBody(state, command);
  if (command.kind === Physics2DAbiCommandKind.DestroyBody) return executeDestroyBody(state, command);
  if (command.kind === Physics2DAbiCommandKind.SetCollider) return executeSetCollider(state, command);
  if (command.kind === Physics2DAbiCommandKind.DestroyCollider) return executeDestroyCollider(state, command);
  if (command.kind === Physics2DAbiCommandKind.SetJoint) return executeSetJoint(state, command);
  if (command.kind === Physics2DAbiCommandKind.DestroyJoint) return executeDestroyJoint(state, command);
  if (command.kind === Physics2DAbiCommandKind.ApplyForce) {
    return executeBodyAction(state, command, (body, x, y) => applyPhysics2DForce(body, x, y));
  }
  if (command.kind === Physics2DAbiCommandKind.ApplyForceAtPoint) {
    return executeBodyPointAction(state, command, applyPhysics2DForceAtPoint);
  }
  if (command.kind === Physics2DAbiCommandKind.ApplyLinearImpulse) {
    return executeBodyAction(state, command, (body, x, y) => applyPhysics2DLinearImpulse(body, x, y));
  }
  if (command.kind === Physics2DAbiCommandKind.ApplyLinearImpulseAtPoint) {
    return executeBodyPointAction(state, command, applyPhysics2DLinearImpulseAtPoint);
  }
  // The plane's single torque scalar travels in the first slot of the shared body-action record, so the
  // remaining three must be zero rather than merely ignored: silently accepting a vector here would let
  // a 3D-shaped caller believe its Y and Z torque had been applied.
  if (command.kind === Physics2DAbiCommandKind.ApplyTorque) {
    return executeBodyAction(state, command, (body, x) => applyPhysics2DTorque(body, x), true);
  }
  if (command.kind === Physics2DAbiCommandKind.WakeBody) return executeWakeBody(state, command);
  return 'InvalidCommand';
}

function executeSetGravity(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.SetGravity ||
    command.objectId !== 0 ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const x = command.view.getFloat64(command.payload, true);
  const y = command.view.getFloat64(command.payload + 8, true);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'RejectedMutation';
  state.world.gravityX = x;
  state.world.gravityY = y;
  return 'Complete';
}

function executeSetSolverConfig(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.SetSolverConfig ||
    command.objectId !== 0 ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const flags = command.view.getUint32(command.payload, true);
  if (
    (flags & 0b111) !== flags ||
    command.view.getUint32(command.payload + 4, true) !== 0 ||
    command.view.getUint32(command.payload + 24, true) !== 0 ||
    command.view.getUint32(command.payload + 28, true) !== 0
  ) {
    return 'InvalidCommand';
  }
  const config: Physics2DSolverConfig = {
    allowSleeping: (flags & 1) !== 0,
    continuousCollision: (flags & (1 << 1)) !== 0,
    warmStarting: (flags & (1 << 2)) !== 0,
    maxCcdSubsteps: command.view.getUint32(command.payload + 8, true),
    maxCcdRotationSubsteps: command.view.getUint32(command.payload + 12, true),
    velocityIterations: command.view.getUint32(command.payload + 16, true),
    positionIterations: command.view.getUint32(command.payload + 20, true),
    sleepLinearThreshold: command.view.getFloat64(command.payload + 32, true),
    sleepAngularThreshold: command.view.getFloat64(command.payload + 40, true),
    timeToSleep: command.view.getFloat64(command.payload + 48, true),
    penetrationSlop: command.view.getFloat64(command.payload + 56, true),
    positionCorrection: command.view.getFloat64(command.payload + 64, true),
    restitutionThreshold: command.view.getFloat64(command.payload + 72, true),
  };
  if (!isPhysics2DSolverConfigValid(config)) return 'RejectedMutation';
  state.world.config = config;
  return 'Complete';
}

// Mass, inertia, and centre of mass are absent from the mutation path on purpose. Physics2D DERIVES
// them from collider geometry and density, and re-derives them whenever a collider, body type, or
// fixed-rotation flag changes. Accepting them here would let a caller author a body whose mass
// contradicts its own shape, and the next collider command would silently overwrite it anyway. They
// remain on the wire for readback, which is the direction in which they are meaningful.
function executeSetBody(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.SetBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const flags = command.view.getUint32(command.payload, true);
  if ((flags & PHYSICS2D_ABI_BODY_FLAG_MASK) !== flags || command.view.getUint32(command.payload + 4, true) !== 0) {
    return 'InvalidCommand';
  }
  const type = decodeBodyType(flags & Physics2DAbiBodyFlag.TypeMask);
  const values = readFloat64Values(command, 8, state.bodyValues);
  if (type === null || !isBodyValueBlockValid(values)) return 'RejectedMutation';

  const existing = state.bodyById.get(command.objectId);
  const body = existing ?? createRigidBody2D(type, values[0], values[1], values[2]);
  if (existing === undefined) {
    addPhysics2DBody(state.world, body);
    state.bodyById.set(command.objectId, body);
    state.idByBody.set(body, command.objectId);
    insertSorted(state.bodyIds, command.objectId);
  }

  if (!setPhysics2DBodyType(state.world, body, type)) return 'RejectedMutation';
  if (!setPhysics2DBodyFixedRotation(state.world, body, (flags & Physics2DAbiBodyFlag.FixedRotation) !== 0)) {
    return 'RejectedMutation';
  }
  if (!setPhysics2DBodyBullet(state.world, body, (flags & Physics2DAbiBodyFlag.Bullet) !== 0)) {
    return 'RejectedMutation';
  }
  if (!setPhysics2DBodySleepEnabled(state.world, body, (flags & Physics2DAbiBodyFlag.SleepEnabled) !== 0)) {
    return 'RejectedMutation';
  }
  if (!setPhysics2DBodyTransform(state.world, body, values[0], values[1], values[2])) return 'RejectedMutation';

  body.velocityX = values[3];
  body.velocityY = values[4];
  body.angularVelocity = values[5];
  body.forceX = values[6];
  body.forceY = values[7];
  body.torque = values[8];
  body.linearDamping = values[13];
  body.angularDamping = values[14];
  body.gravityScale = values[15];
  body.sleepTimer = values[16];
  if ((flags & Physics2DAbiBodyFlag.Sleeping) === 0) wakePhysics2DBody(body);
  else body.sleeping = body.type !== 'static';
  return 'Complete';
}

function executeDestroyBody(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.DestroyBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  for (const [id, held] of state.colliderById) {
    if (held.bodyId !== command.objectId) continue;
    state.colliderById.delete(id);
    state.idByCollider.delete(held.collider);
  }
  for (const [id, joint] of state.jointById) {
    if (joint.bodyA !== body.index && joint.bodyB !== body.index) continue;
    state.jointById.delete(id);
    state.idByJoint.delete(joint);
    removeSorted(state.jointIds, id);
  }
  removePhysics2DBody(state.world, body);
  state.bodyById.delete(command.objectId);
  state.idByBody.delete(body);
  removeSorted(state.bodyIds, command.objectId);
  return 'Complete';
}

function executeSetCollider(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    !isObjectId(command.objectId) ||
    !isObjectId(command.relatedId) ||
    command.byteLength < Physics2DAbiCommandByteLength.SetColliderMinimum
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.relatedId);
  if (body === undefined) return 'MissingBody';

  const sensorFlag = command.view.getUint32(command.payload, true);
  if (sensorFlag > 1) return 'InvalidCommand';
  const shapeKind = command.view.getUint32(command.payload + Physics2DAbiSetColliderPayloadOffset.Shape, true);
  if (shapeKind < Physics2DAbiShapeKind.Circle || shapeKind > Physics2DAbiShapeKind.Point) {
    return 'UnsupportedShape';
  }
  const shape = readShape(command, command.payload + Physics2DAbiSetColliderPayloadOffset.Shape);
  if (shape === null) return 'InvalidCommand';
  if (!isShapeStateValid(shape)) return 'RejectedMutation';

  const density = command.view.getFloat64(command.payload + 16, true);
  const friction = command.view.getFloat64(command.payload + 24, true);
  const restitution = command.view.getFloat64(command.payload + 32, true);
  if (![density, friction, restitution].every((value) => Number.isFinite(value) && value >= 0)) {
    return 'RejectedMutation';
  }

  const collider = createPhysics2DCollider(shape, { density, friction, restitution }, sensorFlag === 1, {
    categoryBits: command.view.getUint32(command.payload + 4, true),
    maskBits: command.view.getUint32(command.payload + 8, true),
    groupIndex: command.view.getInt32(command.payload + 12, true),
  });

  // Replacing an id detaches the previous collider first, so an id names one live collider at a time
  // and a caller may resend a whole body's colliders without accumulating them.
  const previous = state.colliderById.get(command.objectId);
  if (previous !== undefined) {
    const previousBody = state.bodyById.get(previous.bodyId);
    if (previousBody !== undefined) removePhysics2DCollider(state.world, previousBody, previous.collider);
    state.idByCollider.delete(previous.collider);
  }
  addPhysics2DCollider(state.world, body, collider);
  state.colliderById.set(command.objectId, { bodyId: command.relatedId, collider });
  state.idByCollider.set(collider, command.objectId);
  return 'Complete';
}

function executeDestroyCollider(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.DestroyCollider ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const held = state.colliderById.get(command.objectId);
  if (held === undefined) return 'MissingCollider';
  const body = state.bodyById.get(held.bodyId);
  if (body !== undefined) removePhysics2DCollider(state.world, body, held.collider);
  state.colliderById.delete(command.objectId);
  state.idByCollider.delete(held.collider);
  return 'Complete';
}

function executeSetJoint(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.SetJoint ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const kind = command.view.getUint32(command.payload + Physics2DAbiSetJointPayloadOffset.Kind, true);
  const bodyAId = command.view.getUint32(command.payload + Physics2DAbiSetJointPayloadOffset.BodyA, true);
  const bodyBId = command.view.getUint32(command.payload + Physics2DAbiSetJointPayloadOffset.BodyB, true);
  if (kind < Physics2DAbiJointKind.Distance || kind > Physics2DAbiJointKind.Gear) return 'UnsupportedJoint';
  if (!isObjectId(bodyAId) || !isObjectId(bodyBId)) return 'InvalidCommand';
  const flags = command.view.getUint32(command.payload + Physics2DAbiSetJointPayloadOffset.Flags, true);
  if ((flags & getJointFlagMask(kind)) !== flags) return 'InvalidCommand';

  const bodyA = state.bodyById.get(bodyAId);
  const bodyB = state.bodyById.get(bodyBId);
  if (bodyA === undefined || bodyB === undefined) return 'MissingBody';

  const common = readFloat64Values(command, Physics2DAbiSetJointPayloadOffset.CommonValues, state.jointCommonValues);
  const values = readFloat64Values(command, Physics2DAbiSetJointPayloadOffset.KindValues, state.jointKindValues);
  if (!isJointValueBlockValid(common, values)) return 'RejectedMutation';

  const joint = createJoint(kind, bodyA.index, bodyB.index, flags, common, values);
  if (joint === null) return 'UnsupportedJoint';

  const previous = state.jointById.get(command.objectId);
  if (previous !== undefined) {
    removePhysics2DJoint(state.world, previous);
    state.idByJoint.delete(previous);
    removeSorted(state.jointIds, command.objectId);
  }
  addPhysics2DJoint(state.world, joint);
  state.jointById.set(command.objectId, joint);
  state.idByJoint.set(joint, command.objectId);
  insertSorted(state.jointIds, command.objectId);
  state.brokenJoints = state.brokenJoints.filter((broken) => broken.id !== command.objectId);
  return 'Complete';
}

function executeDestroyJoint(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.DestroyJoint ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const joint = state.jointById.get(command.objectId);
  if (joint === undefined) return 'MissingJoint';
  removePhysics2DJoint(state.world, joint);
  state.jointById.delete(command.objectId);
  state.idByJoint.delete(joint);
  removeSorted(state.jointIds, command.objectId);
  return 'Complete';
}

function executeBodyAction(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
  apply: (body: RigidBody2D, x: number, y: number) => boolean,
  scalarOnly = false,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.BodyAction ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const x = command.view.getFloat64(command.payload, true);
  const y = command.view.getFloat64(command.payload + 8, true);
  if (
    command.view.getFloat64(command.payload + 16, true) !== 0 ||
    command.view.getFloat64(command.payload + 24, true) !== 0 ||
    (scalarOnly && y !== 0)
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  return apply(body, x, y) ? 'Complete' : 'RejectedMutation';
}

function executeBodyPointAction(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
  apply: (body: RigidBody2D, x: number, y: number, pointX: number, pointY: number) => boolean,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.BodyAction ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  const applied = apply(
    body,
    command.view.getFloat64(command.payload, true),
    command.view.getFloat64(command.payload + 8, true),
    command.view.getFloat64(command.payload + 16, true),
    command.view.getFloat64(command.payload + 24, true),
  );
  return applied ? 'Complete' : 'RejectedMutation';
}

function executeWakeBody(
  state: ReferencePhysics2DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics2DAbiExecutionStatus {
  if (
    command.byteLength !== Physics2DAbiCommandByteLength.WakeBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  wakePhysics2DBody(body);
  return 'Complete';
}

function createJoint(
  kind: number,
  bodyA: number,
  bodyB: number,
  flags: number,
  common: Readonly<number[]>,
  values: Readonly<number[]>,
): Physics2DJoint | null {
  const base = {
    bodyA,
    bodyB,
    localAnchorAX: common[0],
    localAnchorAY: common[1],
    localAnchorBX: common[2],
    localAnchorBY: common[3],
    collideConnected: (flags & Physics2DAbiJointFlag.CollideConnected) !== 0,
    breakForce: common[4],
    breakTorque: common[5],
  };
  if (kind === Physics2DAbiJointKind.Distance) {
    return createPhysics2DDistanceJoint({
      ...base,
      length: values[0],
      frequencyHz: values[1],
      dampingRatio: values[2],
    });
  }
  if (kind === Physics2DAbiJointKind.Revolute) {
    return createPhysics2DRevoluteJoint({
      ...base,
      lowerAngle: values[0],
      upperAngle: values[1],
      referenceAngle: values[2],
      motorSpeed: values[3],
      maxMotorTorque: values[4],
      limitFrequencyHz: values[5],
      limitDampingRatio: values[6],
      enableMotor: (flags & Physics2DAbiJointFlag.EnableMotor) !== 0,
      enableLimit: (flags & Physics2DAbiJointFlag.EnableLimit) !== 0,
      enableLimitSpring: (flags & Physics2DAbiJointFlag.EnableLimitSpring) !== 0,
    });
  }
  if (kind === Physics2DAbiJointKind.Prismatic) {
    return createPhysics2DPrismaticJoint({
      ...base,
      localAxisAX: values[0],
      localAxisAY: values[1],
      referenceAngle: values[2],
      lowerTranslation: values[3],
      upperTranslation: values[4],
      motorSpeed: values[5],
      maxMotorForce: values[6],
      limitFrequencyHz: values[7],
      limitDampingRatio: values[8],
      enableMotor: (flags & Physics2DAbiJointFlag.EnableMotor) !== 0,
      enableLimit: (flags & Physics2DAbiJointFlag.EnableLimit) !== 0,
      enableLimitSpring: (flags & Physics2DAbiJointFlag.EnableLimitSpring) !== 0,
    });
  }
  if (kind === Physics2DAbiJointKind.Weld) {
    return createPhysics2DWeldJoint({ ...base, referenceAngle: values[0] });
  }
  if (kind === Physics2DAbiJointKind.Wheel) {
    return createPhysics2DWheelJoint({
      ...base,
      localAxisAX: values[0],
      localAxisAY: values[1],
      restTranslation: values[2],
      frequencyHz: values[3],
      dampingRatio: values[4],
      motorSpeed: values[5],
      maxMotorTorque: values[6],
      enableMotor: (flags & Physics2DAbiJointFlag.EnableMotor) !== 0,
    });
  }
  if (kind === Physics2DAbiJointKind.Rope) {
    return createPhysics2DRopeJoint({ ...base, maxLength: values[0] });
  }
  if (kind === Physics2DAbiJointKind.Mouse) {
    // The odd one out: a mouse joint drags ONE body toward a world point, so the factory sets both
    // endpoints to the same body and reads the anchor from the B slot. The record therefore has to
    // name that body twice, and a caller that names two different ones is describing a joint Physics2D
    // has no way to build rather than one it merely dislikes.
    if (bodyA !== bodyB) return null;
    return createPhysics2DMouseJoint({
      body: bodyA,
      localAnchorX: common[2],
      localAnchorY: common[3],
      breakForce: common[4],
      breakTorque: common[5],
      targetX: values[0],
      targetY: values[1],
      maxForce: values[2],
      frequencyHz: values[3],
      dampingRatio: values[4],
    });
  }
  if (kind === Physics2DAbiJointKind.Pulley) {
    return createPhysics2DPulleyJoint({
      ...base,
      groundAnchorAX: values[0],
      groundAnchorAY: values[1],
      groundAnchorBX: values[2],
      groundAnchorBY: values[3],
      ratio: values[4],
      constant: values[5],
    });
  }
  if (kind === Physics2DAbiJointKind.Gear) {
    return createPhysics2DGearJoint({
      ...base,
      axisAX: values[0],
      axisAY: values[1],
      axisBX: values[2],
      axisBY: values[3],
      ratio: values[4],
      constant: values[5],
      coordinateA: (flags & Physics2DAbiJointFlag.LinearCoordinateA) !== 0 ? 'linear' : 'angular',
      coordinateB: (flags & Physics2DAbiJointFlag.LinearCoordinateB) !== 0 ? 'linear' : 'angular',
    });
  }
  return null;
}

function readShape(command: Readonly<CommandRecord>, byteOffset: number): CollisionBuiltInShape2D | null {
  if (byteOffset + Physics2DAbiShapeHeaderByteLength > command.start + command.byteLength) return null;
  const kind = command.view.getUint32(byteOffset, true);
  const scalarCount = command.view.getUint32(byteOffset + 4, true);
  const integerCount = command.view.getUint32(byteOffset + 8, true);
  const version = command.view.getUint32(byteOffset + 12, true);
  // No 2D built-in carries integers or a payload version. Refusing a non-zero value rather than
  // ignoring it is what lets a future kind that does carry them be introduced without an older reader
  // silently accepting a record whose tail it never read.
  if (integerCount !== 0 || version !== 0) return null;
  const scalarsAt = byteOffset + Physics2DAbiShapeHeaderByteLength;
  if (scalarsAt + scalarCount * 8 !== command.start + command.byteLength) return null;

  const scalars: number[] = [];
  for (let i = 0; i < scalarCount; i += 1) scalars.push(command.view.getFloat64(scalarsAt + i * 8, true));
  for (const scalar of scalars) if (!Number.isFinite(scalar)) return null;

  if (kind === Physics2DAbiShapeKind.Circle && scalarCount === 3) {
    return { kind: 'circle', x: scalars[0], y: scalars[1], radius: scalars[2] };
  }
  if (kind === Physics2DAbiShapeKind.Aabb && scalarCount === 4) {
    return { kind: 'aabb', minX: scalars[0], minY: scalars[1], maxX: scalars[2], maxY: scalars[3] };
  }
  if (kind === Physics2DAbiShapeKind.Obb && scalarCount === 5) {
    return { kind: 'obb', x: scalars[0], y: scalars[1], halfW: scalars[2], halfH: scalars[3], rotation: scalars[4] };
  }
  if (kind === Physics2DAbiShapeKind.Capsule && scalarCount === 5) {
    return { kind: 'capsule', x0: scalars[0], y0: scalars[1], x1: scalars[2], y1: scalars[3], radius: scalars[4] };
  }
  if (kind === Physics2DAbiShapeKind.Polygon && scalarCount % 2 === 0) {
    return { kind: 'polygon', points: scalars };
  }
  if (kind === Physics2DAbiShapeKind.Segment && scalarCount === 4) {
    return { kind: 'segment', x0: scalars[0], y0: scalars[1], x1: scalars[2], y1: scalars[3] };
  }
  if (kind === Physics2DAbiShapeKind.Point && scalarCount === 2) {
    return { kind: 'point', x: scalars[0], y: scalars[1] };
  }
  return null;
}

function stepReferenceWorld(
  state: ReferencePhysics2DAbiWorld,
  dt: number,
  hooks: Readonly<Physics2DAbiContactHooks> | null,
): Physics2DAbiStepStatus {
  if (hooks !== null && (hooks.preSolve !== null || hooks.postSolve !== null) && !hasHookCapacity(hooks.buffer)) {
    return 'InsufficientHookBuffer';
  }
  if (!canStep(state.world, dt)) return 'Declined';

  state.activeHooks = hooks;
  state.world.contactHooks.preSolve = hooks?.preSolve != null ? state.preSolveHook : null;
  state.world.contactHooks.postSolve = hooks?.postSolve != null ? state.postSolveHook : null;
  state.stepping = true;
  try {
    stepPhysics2D(state.world, dt);
  } finally {
    state.stepping = false;
    state.activeHooks = null;
    state.world.contactHooks.preSolve = null;
    state.world.contactHooks.postSolve = null;
  }
  state.lastStepDt = dt;
  collectBrokenJoints(state);
  return 'Complete';
}

// Physics2D removes a broken joint from the world, so its ABI id has to be retired here or a later
// SetJoint reusing that id would find a stale entry. The load that broke it is retained for one
// readback, which is the whole of what a caller can learn about a joint that no longer exists.
function collectBrokenJoints(state: ReferencePhysics2DAbiWorld): void {
  state.brokenJoints = [];
  for (const broken of state.world.jointEvents.broke) {
    const id = state.idByJoint.get(broken.joint);
    if (id === undefined) continue;
    state.brokenJoints.push({ id, forceX: broken.forceX, forceY: broken.forceY, torque: broken.torque });
    state.jointById.delete(id);
    state.idByJoint.delete(broken.joint);
    removeSorted(state.jointIds, id);
  }
  state.brokenJoints.sort((a, b) => a.id - b.id);
}

function canStep(world: Readonly<Physics2DWorld>, dt: number): boolean {
  return (
    isPhysics2DTimestepValid(dt) &&
    isPhysics2DPreviousTimestepValid(world) &&
    isPhysics2DGravityValid(world) &&
    isPhysics2DSolverConfigValid(world.config) &&
    isPhysics2DBodyStateValid(world) &&
    isPhysics2DContactStateValid(world) &&
    isPhysics2DJointStateValid(world)
  );
}

function hasHookCapacity(buffer: Readonly<Physics2DAbiContactBuffer>): boolean {
  return (
    getContactCapacity(buffer) >= 1 &&
    buffer.pointFeatureIds.length >= Physics2DAbiMaxContactPoints &&
    buffer.pointValues.length >= Physics2DAbiMaxContactPoints * Physics2DAbiContactPointValueStride
  );
}

function invokeContactHook(
  state: ReferencePhysics2DAbiWorld,
  contact: Physics2DContact,
  buffer: Physics2DAbiContactBuffer,
  hook: (contact: Physics2DAbiContactBuffer) => void,
): void {
  clearContactBuffer(buffer);
  writeContact(state, contact, buffer, 0, 0);
  buffer.count = 1;
  buffer.pointCount = Math.min(contact.pointCount, Physics2DAbiMaxContactPoints);
  buffer.requiredCount = 1;
  buffer.requiredPointCount = contact.pointCount;
  hook(buffer);

  const enabled = (buffer.flags[0] & Physics2DAbiContactFlag.Enabled) !== 0;
  // Row zero: a hook is handed exactly one contact, so the stride never multiplies anything here.
  const friction = buffer.values[Physics2DAbiContactValue.Friction];
  const restitution = buffer.values[Physics2DAbiContactValue.Restitution];
  if (!Number.isFinite(friction) || !Number.isFinite(restitution)) {
    throw new RangeError('Physics2D ABI contact hook wrote a non-finite friction or restitution');
  }
  contact.enabled = enabled;
  contact.friction = friction;
  contact.restitution = restitution;
}

function readBodies(
  state: ReferencePhysics2DAbiWorld,
  bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
  out: Physics2DAbiBodyBuffer,
): void {
  const capacity = Math.min(
    out.ids.length,
    out.flags.length,
    Math.floor(out.values.length / Physics2DAbiBodyValueStride),
  );
  let written = 0;
  let required = 0;
  if (bodyIds === null) {
    for (const id of state.bodyIds) {
      const body = state.bodyById.get(id);
      if (body === undefined) continue;
      required += 1;
      if (written < capacity) writeBody(id, body, out, written++);
    }
  } else {
    for (let i = 0; i < bodyIds.length; i += 1) {
      const body = state.bodyById.get(bodyIds[i]);
      if (body === undefined) continue;
      required += 1;
      if (written < capacity) writeBody(bodyIds[i], body, out, written++);
    }
  }
  out.count = written;
  out.requiredCount = required;
}

function readContacts(
  state: ReferencePhysics2DAbiWorld,
  selection: Physics2DAbiContactSelection,
  out: Physics2DAbiContactBuffer,
): void {
  const source =
    selection === 'Began'
      ? state.world.events.began
      : selection === 'Ended'
        ? state.world.events.ended
        : state.world.contacts;
  const capacity = getContactCapacity(out);
  const pointCapacity = Math.min(
    out.pointFeatureIds.length,
    Math.floor(out.pointValues.length / Physics2DAbiContactPointValueStride),
  );
  clearContactBuffer(out);
  let written = 0;
  let pointsWritten = 0;
  let requiredPoints = 0;
  // Once one contact does not fit, publishing stops. Skipping it and continuing would write a
  // SUBSEQUENCE while `count` claims a prefix, so a caller that grew its buffer and re-read would get
  // a different set rather than a superset — and a wide contact could hide behind a narrow one that
  // happened to fit after it.
  let prefixFits = true;
  for (const contact of source) {
    requiredPoints += contact.pointCount;
    if (!prefixFits || written >= capacity || pointsWritten + contact.pointCount > pointCapacity) {
      prefixFits = false;
      continue;
    }
    writeContact(state, contact, out, written, pointsWritten);
    pointsWritten += contact.pointCount;
    written += 1;
  }
  out.count = written;
  out.pointCount = pointsWritten;
  out.requiredCount = source.length;
  out.requiredPointCount = requiredPoints;
}

function readJoints(state: ReferencePhysics2DAbiWorld, out: Physics2DAbiJointBuffer): void {
  const capacity = Math.min(
    out.ids.length,
    out.flags.length,
    Math.floor(out.values.length / Physics2DAbiJointValueStride),
  );
  let written = 0;
  for (const id of state.jointIds) {
    const joint = state.jointById.get(id);
    if (joint === undefined) continue;
    if (written < capacity) {
      const at = written * Physics2DAbiJointValueStride;
      const reported = writePhysics2DJointReaction(state.world, joint, state.lastStepDt, state.reaction);
      out.ids[written] = id;
      out.flags[written] = 0;
      out.values[at] = reported ? state.reaction.forceX : 0;
      out.values[at + 1] = reported ? state.reaction.forceY : 0;
      out.values[at + 2] = reported ? state.reaction.torque : 0;
    }
    written += 1;
  }
  for (const broken of state.brokenJoints) {
    if (written < capacity) {
      const at = written * Physics2DAbiJointValueStride;
      out.ids[written] = broken.id;
      out.flags[written] = Physics2DAbiJointFlag.Broken;
      out.values[at] = broken.forceX;
      out.values[at + 1] = broken.forceY;
      out.values[at + 2] = broken.torque;
    }
    written += 1;
  }
  out.requiredCount = written;
  out.count = Math.min(written, capacity);
  state.brokenJoints = [];
}

function writeBody(id: number, body: Readonly<RigidBody2D>, out: Physics2DAbiBodyBuffer, at: number): void {
  out.ids[at] = id;
  out.flags[at] = encodeBodyFlags(body);
  const base = at * Physics2DAbiBodyValueStride;
  out.values[base] = body.x;
  out.values[base + 1] = body.y;
  out.values[base + 2] = body.angle;
  out.values[base + 3] = body.velocityX;
  out.values[base + 4] = body.velocityY;
  out.values[base + 5] = body.angularVelocity;
  out.values[base + 6] = body.forceX;
  out.values[base + 7] = body.forceY;
  out.values[base + 8] = body.torque;
  out.values[base + 9] = body.mass;
  out.values[base + 10] = body.inertia;
  out.values[base + 11] = body.centerX;
  out.values[base + 12] = body.centerY;
  out.values[base + 13] = body.linearDamping;
  out.values[base + 14] = body.angularDamping;
  out.values[base + 15] = body.gravityScale;
  out.values[base + 16] = body.sleepTimer;
}

function writeContact(
  state: ReferencePhysics2DAbiWorld,
  contact: Readonly<Physics2DContact>,
  out: Physics2DAbiContactBuffer,
  at: number,
  pointStart: number,
): void {
  const idBase = at * Physics2DAbiContactIdStride;
  const bodyA = state.world.bodyByIndex.get(contact.bodyA);
  const bodyB = state.world.bodyByIndex.get(contact.bodyB);
  out.ids[idBase] = bodyA === undefined ? 0 : (state.idByBody.get(bodyA) ?? 0);
  out.ids[idBase + 1] = bodyB === undefined ? 0 : (state.idByBody.get(bodyB) ?? 0);
  out.ids[idBase + 2] = getColliderId(state, bodyA, contact.colliderA);
  out.ids[idBase + 3] = getColliderId(state, bodyB, contact.colliderB);

  let flags = 0;
  if (contact.enabled) flags |= Physics2DAbiContactFlag.Enabled;
  if (contact.sensor) flags |= Physics2DAbiContactFlag.Sensor;
  if (contact.touching) flags |= Physics2DAbiContactFlag.Touching;
  out.flags[at] = flags;

  const valueBase = at * Physics2DAbiContactValueStride;
  out.values[valueBase] = contact.normalX;
  out.values[valueBase + 1] = contact.normalY;
  out.values[valueBase + 2] = contact.friction;
  out.values[valueBase + 3] = contact.restitution;

  out.pointStarts[at] = pointStart;
  const pointCount = Math.min(contact.pointCount, Physics2DAbiMaxContactPoints);
  out.pointCounts[at] = pointCount;
  for (let i = 0; i < pointCount; i += 1) {
    const point = contact.points[i];
    const pointBase = (pointStart + i) * Physics2DAbiContactPointValueStride;
    out.pointFeatureIds[pointStart + i] = point.featureId;
    out.pointValues[pointBase] = point.x;
    out.pointValues[pointBase + 1] = point.y;
    out.pointValues[pointBase + 2] = point.depth;
    out.pointValues[pointBase + 3] = point.rAX;
    out.pointValues[pointBase + 4] = point.rAY;
    out.pointValues[pointBase + 5] = point.rBX;
    out.pointValues[pointBase + 6] = point.rBY;
  }
}

function getColliderId(
  state: ReferencePhysics2DAbiWorld,
  body: Readonly<RigidBody2D> | undefined,
  colliderIndex: number,
): number {
  if (body === undefined) return 0;
  const collider = body.colliders[colliderIndex];
  return collider === undefined ? 0 : (state.idByCollider.get(collider) ?? 0);
}

function clearContactBuffer(out: Physics2DAbiContactBuffer): void {
  out.count = 0;
  out.pointCount = 0;
  out.requiredCount = 0;
  out.requiredPointCount = 0;
}

function getContactCapacity(out: Readonly<Physics2DAbiContactBuffer>): number {
  return Math.min(
    Math.floor(out.ids.length / Physics2DAbiContactIdStride),
    out.flags.length,
    out.pointStarts.length,
    out.pointCounts.length,
    Math.floor(out.values.length / Physics2DAbiContactValueStride),
  );
}

function writeQueryHits(
  state: ReferencePhysics2DAbiWorld,
  source: ReturnType<typeof createPhysics2DQueryResult>,
  out: Physics2DAbiQueryBuffer,
): void {
  const capacity = getQueryCapacity(out);
  const written = Math.min(source.hitCount, capacity);
  for (let i = 0; i < written; i += 1) {
    writeQueryIdentity(state, source.hits[i], out, i);
    clearQueryValues(out, i);
  }
  out.count = written;
  out.requiredCount = source.hitCount;
}

function writeRayHits(state: ReferencePhysics2DAbiWorld, out: Physics2DAbiQueryBuffer): void {
  const hits = state.ray.hits;
  const capacity = getQueryCapacity(out);
  const written = Math.min(state.ray.hitCount, capacity);
  for (let i = 0; i < written; i += 1) {
    writeQueryIdentity(state, hits[i], out, i);
    writeQueryValues(out, i, hits[i].fraction, hits[i].x, hits[i].y, hits[i].normalX, hits[i].normalY);
  }
  out.count = written;
  out.requiredCount = state.ray.hitCount;
}

function writeShapeCastHit(state: ReferencePhysics2DAbiWorld, out: Physics2DAbiQueryBuffer): void {
  const result = state.shapeCast;
  if (!result.hit || getQueryCapacity(out) < 1) {
    out.count = 0;
    out.requiredCount = result.hit ? 1 : 0;
    return;
  }
  out.bodyIds[0] = result.body === null ? 0 : (state.idByBody.get(result.body) ?? 0);
  out.colliderIds[0] = result.collider === null ? 0 : (state.idByCollider.get(result.collider) ?? 0);
  writeQueryValues(out, 0, result.fraction, result.x, result.y, result.normalX, result.normalY);
  out.count = 1;
  out.requiredCount = 1;
}

function writeQueryIdentity(
  state: ReferencePhysics2DAbiWorld,
  hit: Readonly<Physics2DQueryHit>,
  out: Physics2DAbiQueryBuffer,
  at: number,
): void {
  out.bodyIds[at] = state.idByBody.get(hit.body) ?? 0;
  out.colliderIds[at] = state.idByCollider.get(hit.collider) ?? 0;
}

function clearQueryValues(out: Physics2DAbiQueryBuffer, at: number): void {
  const base = at * Physics2DAbiQueryValueStride;
  for (let i = 0; i < Physics2DAbiQueryValueStride; i += 1) out.values[base + i] = 0;
}

function writeQueryValues(
  out: Physics2DAbiQueryBuffer,
  at: number,
  fraction: number,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
): void {
  const base = at * Physics2DAbiQueryValueStride;
  out.values[base] = fraction;
  out.values[base + 1] = x;
  out.values[base + 2] = y;
  out.values[base + 3] = normalX;
  out.values[base + 4] = normalY;
}

function getQueryCapacity(out: Readonly<Physics2DAbiQueryBuffer>): number {
  return Math.min(
    out.bodyIds.length,
    out.colliderIds.length,
    Math.floor(out.values.length / Physics2DAbiQueryValueStride),
  );
}

function isCommandBufferValid(commands: Readonly<Physics2DAbiCommandBuffer>): boolean {
  if (
    !Number.isSafeInteger(commands.byteLength) ||
    commands.byteLength < Physics2DAbiCommandHeaderByteLength ||
    commands.byteLength > commands.data.byteLength ||
    !Number.isSafeInteger(commands.commandCount) ||
    commands.commandCount < 0
  ) {
    return false;
  }
  const view = new DataView(commands.data.buffer, commands.data.byteOffset, commands.data.byteLength);
  return (
    view.getUint32(0, true) === Physics2DAbiCommandMagic &&
    view.getUint32(4, true) === Physics2DAbiVersion &&
    view.getUint32(8, true) === commands.byteLength &&
    view.getUint32(12, true) === commands.commandCount
  );
}

function failExecution(
  out: Physics2DAbiExecutionResult,
  status: Physics2DAbiExecutionStatus,
  commandIndex: number,
  byteOffset: number,
  commandKind: number,
): boolean {
  out.status = status;
  out.commandIndex = commandIndex;
  out.byteOffset = byteOffset;
  out.commandKind = commandKind;
  return false;
}

function readFloat64Values(command: Readonly<CommandRecord>, payloadByteOffset: number, values: number[]): number[] {
  const at = command.payload + payloadByteOffset;
  for (let i = 0; i < values.length; i += 1) values[i] = command.view.getFloat64(at + i * 8, true);
  return values;
}

function decodeBodyType(type: number): RigidBody2D['type'] | null {
  if (type === Physics2DAbiBodyType.Dynamic) return 'dynamic';
  if (type === Physics2DAbiBodyType.Kinematic) return 'kinematic';
  if (type === Physics2DAbiBodyType.Static) return 'static';
  return null;
}

function encodeBodyFlags(body: Readonly<RigidBody2D>): number {
  let flags =
    body.type === 'dynamic'
      ? Physics2DAbiBodyType.Dynamic
      : body.type === 'kinematic'
        ? Physics2DAbiBodyType.Kinematic
        : Physics2DAbiBodyType.Static;
  if (body.fixedRotation) flags |= Physics2DAbiBodyFlag.FixedRotation;
  if (body.bullet) flags |= Physics2DAbiBodyFlag.Bullet;
  if (body.sleeping) flags |= Physics2DAbiBodyFlag.Sleeping;
  if (body.sleepEnabled) flags |= Physics2DAbiBodyFlag.SleepEnabled;
  return flags;
}

function areFinite(values: Readonly<number[]>): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

function isBodyValueBlockValid(values: Readonly<number[]>): boolean {
  return areFinite(values) && values[13] >= 0 && values[14] >= 0 && values[16] >= 0;
}

// Match the Physics2D step validator rather than the manifold validator: point and segment colliders
// are legal authored state even though they deliberately have no contact-manifold path.
function isShapeStateValid(shape: Readonly<CollisionBuiltInShape2D>): boolean {
  if (shape.kind === 'circle') return shape.radius > 0;
  if (shape.kind === 'aabb') return shape.maxX > shape.minX && shape.maxY > shape.minY;
  if (shape.kind === 'obb') return shape.halfW > 0 && shape.halfH > 0;
  if (shape.kind === 'capsule') return shape.radius > 0;
  if (shape.kind === 'polygon') return shape.points.length >= 6 && (shape.points.length & 1) === 0;
  return true;
}

function isJointValueBlockValid(common: Readonly<number[]>, values: Readonly<number[]>): boolean {
  if (!areFinite(values) || !areFinite(common.slice(0, 4))) return false;
  return isBreakThresholdValid(common[4]) && isBreakThresholdValid(common[5]);
}

function isBreakThresholdValid(value: number): boolean {
  return !Number.isNaN(value) && value >= 0;
}

function isObjectId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

// Which flag bits a joint record may set, by kind. Anything outside the mask is InvalidCommand rather
// than ignored, so a caller that sets a motor bit on a weld learns it at the boundary instead of
// wondering why its motor never ran.
function getJointFlagMask(kind: number): number {
  const common = Physics2DAbiJointFlag.CollideConnected;
  if (kind === Physics2DAbiJointKind.Revolute || kind === Physics2DAbiJointKind.Prismatic) {
    return (
      common |
      Physics2DAbiJointFlag.EnableMotor |
      Physics2DAbiJointFlag.EnableLimit |
      Physics2DAbiJointFlag.EnableLimitSpring
    );
  }
  if (kind === Physics2DAbiJointKind.Wheel) return common | Physics2DAbiJointFlag.EnableMotor;
  if (kind === Physics2DAbiJointKind.Gear) {
    return common | Physics2DAbiJointFlag.LinearCoordinateA | Physics2DAbiJointFlag.LinearCoordinateB;
  }
  return common;
}

function insertSorted(values: number[], value: number): void {
  let at = values.length;
  while (at > 0 && values[at - 1] > value) at -= 1;
  values.splice(at, 0, value);
}

function removeSorted(values: number[], value: number): void {
  const at = values.indexOf(value);
  if (at >= 0) values.splice(at, 1);
}

const PHYSICS2D_ABI_BODY_FLAG_MASK =
  Physics2DAbiBodyFlag.TypeMask |
  Physics2DAbiBodyFlag.FixedRotation |
  Physics2DAbiBodyFlag.Bullet |
  Physics2DAbiBodyFlag.Sleeping |
  Physics2DAbiBodyFlag.SleepEnabled;
