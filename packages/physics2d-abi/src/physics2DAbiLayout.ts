// Wire version for the command stream and backend surface. Increment when an existing numeric
// discriminant, field position, or meaning changes. Additive commands may retain the version because
// every record is length-delimited and an older backend reports Unknown/InvalidCommand at that record.
export const Physics2DAbiVersion = 1;

// The bytes `P2DA`, read little-endian — the 3D stream's `P3DA` with the dimension digit changed, so a
// reader handed the wrong stream fails on the magic rather than on a field whose meaning silently moved.
export const Physics2DAbiCommandMagic = 0x41443250;
export const Physics2DAbiCommandHeaderByteLength = 16;
export const Physics2DAbiCommandRecordHeaderByteLength = 16;

export const Physics2DAbiCommandHeaderOffset = {
  Magic: 0,
  Version: 4,
  ByteLength: 8,
  CommandCount: 12,
} as const;

export const Physics2DAbiCommandRecordOffset = {
  Kind: 0,
  ByteLength: 4,
  ObjectId: 8,
  RelatedId: 12,
} as const;

export const Physics2DAbiCapability = {
  ContactHooks: 1 << 0,
  PersistentWorlds: 1 << 1,
  Queries: 1 << 2,
  SelectiveReadback: 1 << 3,
} as const;

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
} as const;

// Every kind `CollisionBuiltInShape2D` admits, including the two area-less ones. Physics2D validates
// and accepts a segment or point collider — they weigh nothing and generate no manifold, but they are
// legal authored state — so the wire encodes them rather than making the ABI reject a world the
// standard API would have stepped.
export const Physics2DAbiShapeKind = {
  Circle: 1,
  Aabb: 2,
  Obb: 3,
  Capsule: 4,
  Polygon: 5,
  Segment: 6,
  Point: 7,
} as const;

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
} as const;

export const Physics2DAbiBodyValueStride = 17;
export const Physics2DAbiContactIdStride = 4;
export const Physics2DAbiContactValueStride = 4;
export const Physics2DAbiContactPointValueStride = 7;
export const Physics2DAbiJointValueStride = 3;
export const Physics2DAbiQueryValueStride = 5;

// A planar manifold is a segment, so two points is the EXACT bound rather than a comfortable one. The
// 3D boundary reserves four because a face-face region needs them; halving that number here is a
// statement about 2D geometry, not a smaller default.
export const Physics2DAbiMaxContactPoints = 2;

// Derived quantities the solver rebuilds every step — inverse mass, inverse inertia, lever arms,
// warm-start impulses — are deliberately absent. The wire carries authored state, so a backend that
// recomputes them is conforming rather than lossy, and a caller cannot corrupt a solver cache.
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
} as const;

export const Physics2DAbiContactId = {
  BodyA: 0,
  BodyB: 1,
  ColliderA: 2,
  ColliderB: 3,
} as const;

export const Physics2DAbiContactValue = {
  NormalX: 0,
  NormalY: 1,
  Friction: 2,
  Restitution: 3,
} as const;

export const Physics2DAbiContactPointValue = {
  X: 0,
  Y: 1,
  Depth: 2,
  RelativeAX: 3,
  RelativeAY: 4,
  RelativeBX: 5,
  RelativeBY: 6,
} as const;

// A plane's couple is one scalar, so a 2D reaction is a force plus a torque rather than two vectors.
export const Physics2DAbiJointValue = {
  ForceX: 0,
  ForceY: 1,
  Torque: 2,
} as const;

export const Physics2DAbiQueryValue = {
  Fraction: 0,
  X: 1,
  Y: 2,
  NormalX: 3,
  NormalY: 4,
} as const;

// Command byte lengths include the 16-byte record header. Payload offsets are relative to the first
// payload byte. Variable collider records end after their aligned shape block.
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
} as const;

export const Physics2DAbiSetBodyPayloadOffset = {
  Flags: 0,
  Reserved: 4,
  Values: 8,
} as const;

export const Physics2DAbiSetColliderPayloadOffset = {
  Flags: 0,
  CategoryBits: 4,
  MaskBits: 8,
  GroupIndex: 12,
  Density: 16,
  Friction: 24,
  Restitution: 32,
  Shape: 40,
} as const;

export const Physics2DAbiSetJointPayloadOffset = {
  Kind: 0,
  BodyA: 4,
  BodyB: 8,
  Flags: 12,
  CommonValues: 16,
  KindValues: 64,
} as const;

// Physics2D has no `substeps`: its CCD bounds are the two impact-sample limits, and the solver takes
// its iteration counts directly. The reserved word that 3D spends on substeps is held zero here rather
// than repurposed, so the two configs stay positionally comparable when read side by side.
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
} as const;

export const Physics2DAbiSolverConfigValue = {
  SleepLinearThreshold: 0,
  SleepAngularThreshold: 1,
  TimeToSleep: 2,
  PenetrationSlop: 3,
  PositionCorrection: 4,
  RestitutionThreshold: 5,
} as const;

// Common joint values, in wire order. A 2D joint has no orientation frames — a reference ANGLE is one
// scalar and belongs to the kinds that have one — so the common block is anchors plus the two break
// thresholds, and reference angles live among the kind values.
export const Physics2DAbiJointCommonValue = {
  LocalAnchorAX: 0,
  LocalAnchorAY: 1,
  LocalAnchorBX: 2,
  LocalAnchorBY: 3,
  BreakForce: 4,
  BreakTorque: 5,
} as const;

// Nine slots because the prismatic joint needs nine and no built-in needs more. Sized to the widest
// member rather than rounded up: the record is length-delimited, so a future kind that needs a tenth
// changes the version and every reader learns about it at the header instead of misreading a payload.
export const Physics2DAbiJointKindValueCount = 9;

export const Physics2DAbiShapeHeaderByteLength = 16;

export const Physics2DAbiShapeHeaderOffset = {
  Kind: 0,
  ScalarCount: 4,
  IntegerCount: 8,
  Version: 12,
  Scalars: 16,
} as const;

export const Physics2DAbiBodyFlag = {
  TypeMask: 0b11,
  FixedRotation: 1 << 2,
  Bullet: 1 << 3,
  Sleeping: 1 << 4,
  SleepEnabled: 1 << 5,
} as const;

export const Physics2DAbiContactFlag = {
  Enabled: 1 << 0,
  Sensor: 1 << 1,
  Touching: 1 << 2,
} as const;

// Bits 0-1 are common to every kind; bits 2-4 are read against the record's own joint kind. A gear's
// two coordinate bits and a revolute's three enable bits occupy the same positions and never collide,
// because a record carries exactly one kind.
export const Physics2DAbiJointFlag = {
  CollideConnected: 1 << 0,
  Broken: 1 << 1,
  EnableMotor: 1 << 2,
  EnableLimit: 1 << 3,
  EnableLimitSpring: 1 << 4,
  LinearCoordinateA: 1 << 2,
  LinearCoordinateB: 1 << 3,
} as const;

export const Physics2DAbiSolverConfigFlag = {
  AllowSleeping: 1 << 0,
  ContinuousCollision: 1 << 1,
  WarmStarting: 1 << 2,
} as const;

export const Physics2DAbiBodyType = {
  Dynamic: 0,
  Kinematic: 1,
  Static: 2,
} as const;
