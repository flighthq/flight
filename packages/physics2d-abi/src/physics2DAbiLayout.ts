// Generated from crates/flight-physics2d-abi/src/physics2d_abi_layout.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Wire version for the command stream and backend surface (TS `Physics2DAbiVersion`). Increment
 * when an existing numeric discriminant, field position, or meaning changes.
 */
export const Physics2DAbiVersion: number = 1;

/**
 * The bytes `P2DA`, read little-endian (TS `Physics2DAbiCommandMagic`).
 */
export const Physics2DAbiCommandMagic: number = 0x41443250;

export const Physics2DAbiCommandHeaderByteLength: number = 16;

export const Physics2DAbiCommandRecordHeaderByteLength: number = 16;

export const Physics2DAbiCommandHeaderOffset = {
  Magic: 0,
  Version: 4,
  ByteLength: 8,
  CommandCount: 12,
};

export const Physics2DAbiCommandRecordOffset = {
  Kind: 0,
  ByteLength: 4,
  ObjectId: 8,
  RelatedId: 12,
};

export const Physics2DAbiCapability = {
  ContactHooks: 1 << 0,
  PersistentWorlds: 1 << 1,
  Queries: 1 << 2,
  SelectiveReadback: 1 << 3,
};

export const Physics2DAbiCommandKind = {
  SetGravity: 1,
  SetSolverConfig: 2,
  SetBody: 3,
  DestroyBody: 4,
  SetCollider: 5,
  DestroyCollider: 6,
  SetJoint: 7,
  DestroyJoint: 8,
  ApplyForce: 9,
  ApplyForceAtPoint: 10,
  ApplyLinearImpulse: 11,
  ApplyLinearImpulseAtPoint: 12,
  ApplyTorque: 13,
  WakeBody: 14,
};

export const Physics2DAbiShapeKind = {
  Circle: 1,
  Aabb: 2,
  Obb: 3,
  Capsule: 4,
  Polygon: 5,
  Segment: 6,
  Point: 7,
};

export const Physics2DAbiJointKind = {
  Distance: 1,
  Revolute: 2,
  Prismatic: 3,
  Weld: 4,
  Wheel: 5,
  Rope: 6,
  Mouse: 7,
  Pulley: 8,
  Gear: 9,
};

export const Physics2DAbiBodyValueStride: number = 17;

export const Physics2DAbiContactIdStride: number = 4;

export const Physics2DAbiContactValueStride: number = 4;

export const Physics2DAbiContactPointValueStride: number = 7;

export const Physics2DAbiJointValueStride: number = 3;

export const Physics2DAbiQueryValueStride: number = 5;

/**
 * A planar manifold is a segment, so two points is the exact bound (TS
 * `Physics2DAbiMaxContactPoints`).
 */
export const Physics2DAbiMaxContactPoints: number = 2;

export const Physics2DAbiBodyValue = {
  X: 0,
  Y: 1,
  Angle: 2,
  VelocityX: 3,
  VelocityY: 4,
  AngularVelocity: 5,
  ForceX: 6,
  ForceY: 7,
  Torque: 8,
  Mass: 9,
  Inertia: 10,
  CenterX: 11,
  CenterY: 12,
  LinearDamping: 13,
  AngularDamping: 14,
  GravityScale: 15,
  SleepTimer: 16,
};

export const Physics2DAbiContactId = {
  BodyA: 0,
  BodyB: 1,
  ColliderA: 2,
  ColliderB: 3,
};

export const Physics2DAbiContactValue = {
  NormalX: 0,
  NormalY: 1,
  Friction: 2,
  Restitution: 3,
};

export const Physics2DAbiContactPointValue = {
  X: 0,
  Y: 1,
  Depth: 2,
  RelativeAX: 3,
  RelativeAY: 4,
  RelativeBX: 5,
  RelativeBY: 6,
};

export const Physics2DAbiJointValue = {
  ForceX: 0,
  ForceY: 1,
  Torque: 2,
};

export const Physics2DAbiQueryValue = {
  Fraction: 0,
  X: 1,
  Y: 2,
  NormalX: 3,
  NormalY: 4,
};

export const Physics2DAbiCommandByteLength = {
  SetGravity: 32,
  SetSolverConfig: 96,
  SetBody: 160,
  DestroyBody: 16,
  SetColliderMinimum: 72,
  DestroyCollider: 16,
  SetJoint: 152,
  DestroyJoint: 16,
  BodyAction: 48,
  WakeBody: 16,
};

export const Physics2DAbiSetBodyPayloadOffset = {
  Flags: 0,
  Reserved: 4,
  Values: 8,
};

export const Physics2DAbiSetColliderPayloadOffset = {
  Flags: 0,
  CategoryBits: 4,
  MaskBits: 8,
  GroupIndex: 12,
  Density: 16,
  Friction: 24,
  Restitution: 32,
  Shape: 40,
};

export const Physics2DAbiSetJointPayloadOffset = {
  Kind: 0,
  BodyA: 4,
  BodyB: 8,
  Flags: 12,
  CommonValues: 16,
  KindValues: 64,
};

export const Physics2DAbiSetSolverConfigPayloadOffset = {
  Flags: 0,
  Reserved0: 4,
  MaxCcdSubsteps: 8,
  MaxCcdRotationSubsteps: 12,
  VelocityIterations: 16,
  PositionIterations: 20,
  Reserved1: 24,
  Reserved2: 28,
  Values: 32,
};

export const Physics2DAbiSolverConfigValue = {
  SleepLinearThreshold: 0,
  SleepAngularThreshold: 1,
  TimeToSleep: 2,
  PenetrationSlop: 3,
  PositionCorrection: 4,
  RestitutionThreshold: 5,
};

export const Physics2DAbiJointCommonValue = {
  LocalAnchorAX: 0,
  LocalAnchorAY: 1,
  LocalAnchorBX: 2,
  LocalAnchorBY: 3,
  BreakForce: 4,
  BreakTorque: 5,
};

/**
 * Nine kind slots: the prismatic joint needs nine and no built-in needs more (TS
 * `Physics2DAbiJointKindValueCount`).
 */
export const Physics2DAbiJointKindValueCount: number = 9;

export const Physics2DAbiShapeHeaderByteLength: number = 16;

export const Physics2DAbiShapeHeaderOffset = {
  Kind: 0,
  ScalarCount: 4,
  IntegerCount: 8,
  Version: 12,
  Scalars: 16,
};

export const Physics2DAbiBodyFlag = {
  TypeMask: 0b11,
  FixedRotation: 1 << 2,
  Bullet: 1 << 3,
  Sleeping: 1 << 4,
  SleepEnabled: 1 << 5,
};

export const Physics2DAbiContactFlag = {
  Enabled: 1 << 0,
  Sensor: 1 << 1,
  Touching: 1 << 2,
};

export const Physics2DAbiJointFlag = {
  CollideConnected: 1 << 0,
  Broken: 1 << 1,
  EnableMotor: 1 << 2,
  EnableLimit: 1 << 3,
  EnableLimitSpring: 1 << 4,
  LinearCoordinateA: 1 << 2,
  LinearCoordinateB: 1 << 3,
};

export const Physics2DAbiSolverConfigFlag = {
  AllowSleeping: 1 << 0,
  ContinuousCollision: 1 << 1,
  WarmStarting: 1 << 2,
};

export const Physics2DAbiBodyType = {
  Dynamic: 0,
  Kinematic: 1,
  Static: 2,
};
