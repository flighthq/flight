// Wire version for the command stream and backend surface. Increment when an existing numeric
// discriminant, field position, or meaning changes. Additive commands may retain the version because
// every record is length-delimited and an older backend reports Unknown/InvalidCommand at that record.
export const Physics3DAbiVersion = 1;

export const Physics3DAbiCommandMagic = 0x41443350;
export const Physics3DAbiCommandHeaderByteLength = 16;
export const Physics3DAbiCommandRecordHeaderByteLength = 16;

export const Physics3DAbiCommandHeaderOffset = {
  Magic: 0,
  Version: 4,
  ByteLength: 8,
  CommandCount: 12,
} as const;

export const Physics3DAbiCommandRecordOffset = {
  Kind: 0,
  ByteLength: 4,
  ObjectId: 8,
  RelatedId: 12,
} as const;

export const Physics3DAbiCapability = {
  ContactHooks: 1 << 0,
  PersistentWorlds: 1 << 1,
  Queries: 1 << 2,
  SelectiveReadback: 1 << 3,
} as const;

export const Physics3DAbiCommandKind = {
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

export const Physics3DAbiShapeKind = {
  Sphere: 1,
  Aabb: 2,
  Box: 3,
  Capsule: 4,
  Cylinder: 5,
  Cone: 6,
  Convex: 7,
  TriangleMesh: 8,
  Heightfield: 9,
} as const;

export const Physics3DAbiJointKind = {
  BallAndSocket: 1,
  Distance: 2,
  Fixed: 3,
  Hinge: 4,
  Slider: 5,
  ConeTwist: 6,
  Generic6Dof: 7,
} as const;

export const Physics3DAbiBodyValueStride = 33;
export const Physics3DAbiContactIdStride = 4;
export const Physics3DAbiContactValueStride = 5;
export const Physics3DAbiContactPointValueStride = 10;
export const Physics3DAbiJointValueStride = 6;
export const Physics3DAbiQueryValueStride = 7;

export const Physics3DAbiBodyValue = {
  X: 0,
  Y: 1,
  Z: 2,
  OrientationX: 3,
  OrientationY: 4,
  OrientationZ: 5,
  OrientationW: 6,
  VelocityX: 7,
  VelocityY: 8,
  VelocityZ: 9,
  AngularVelocityX: 10,
  AngularVelocityY: 11,
  AngularVelocityZ: 12,
  ForceX: 13,
  ForceY: 14,
  ForceZ: 15,
  TorqueX: 16,
  TorqueY: 17,
  TorqueZ: 18,
  Mass: 19,
  InertiaXX: 20,
  InertiaYY: 21,
  InertiaZZ: 22,
  InertiaXY: 23,
  InertiaXZ: 24,
  InertiaYZ: 25,
  CenterX: 26,
  CenterY: 27,
  CenterZ: 28,
  LinearDamping: 29,
  AngularDamping: 30,
  GravityScale: 31,
  SleepTimer: 32,
} as const;

export const Physics3DAbiContactId = {
  BodyA: 0,
  BodyB: 1,
  ColliderA: 2,
  ColliderB: 3,
} as const;

export const Physics3DAbiContactValue = {
  NormalX: 0,
  NormalY: 1,
  NormalZ: 2,
  Friction: 3,
  Restitution: 4,
} as const;

export const Physics3DAbiContactPointValue = {
  X: 0,
  Y: 1,
  Z: 2,
  Depth: 3,
  RelativeAX: 4,
  RelativeAY: 5,
  RelativeAZ: 6,
  RelativeBX: 7,
  RelativeBY: 8,
  RelativeBZ: 9,
} as const;

export const Physics3DAbiJointValue = {
  ForceX: 0,
  ForceY: 1,
  ForceZ: 2,
  TorqueX: 3,
  TorqueY: 4,
  TorqueZ: 5,
} as const;

export const Physics3DAbiQueryValue = {
  Fraction: 0,
  X: 1,
  Y: 2,
  Z: 3,
  NormalX: 4,
  NormalY: 5,
  NormalZ: 6,
} as const;

// Command byte lengths include the 16-byte record header. Payload offsets are relative to the first
// payload byte. Variable collider records end after their aligned shape block.
export const Physics3DAbiCommandByteLength = {
  SetGravity: 40,
  SetSolverConfig: 96,
  SetBody: 288,
  DestroyBody: 16,
  SetColliderMinimum: 80,
  DestroyCollider: 16,
  SetJoint: 272,
  DestroyJoint: 16,
  BodyAction: 64,
  WakeBody: 16,
} as const;

export const Physics3DAbiSetBodyPayloadOffset = {
  Flags: 0,
  Reserved: 4,
  Values: 8,
} as const;

export const Physics3DAbiSetColliderPayloadOffset = {
  Flags: 0,
  CategoryBits: 4,
  MaskBits: 8,
  GroupIndex: 12,
  Density: 16,
  Friction: 24,
  Restitution: 32,
  Shape: 40,
} as const;

export const Physics3DAbiSetJointPayloadOffset = {
  Kind: 0,
  BodyA: 4,
  BodyB: 8,
  Flags: 12,
  CommonValues: 16,
  KindValues: 144,
} as const;

export const Physics3DAbiSetSolverConfigPayloadOffset = {
  Flags: 0,
  Substeps: 4,
  MaxCcdSubsteps: 8,
  MaxCcdRotationSubsteps: 12,
  VelocityIterations: 16,
  PositionIterations: 20,
  Reserved0: 24,
  Reserved1: 28,
  Values: 32,
} as const;

export const Physics3DAbiShapeHeaderByteLength = 16;

export const Physics3DAbiShapeHeaderOffset = {
  Kind: 0,
  ScalarCount: 4,
  IntegerCount: 8,
  Version: 12,
  Scalars: 16,
} as const;

export const Physics3DAbiBodyFlag = {
  TypeMask: 0b11,
  FixedRotation: 1 << 2,
  Bullet: 1 << 3,
  Sleeping: 1 << 4,
  SleepEnabled: 1 << 5,
} as const;

export const Physics3DAbiContactFlag = {
  Enabled: 1 << 0,
  Sensor: 1 << 1,
  Touching: 1 << 2,
} as const;

export const Physics3DAbiJointFlag = {
  Broken: 1 << 0,
} as const;

export const Physics3DAbiBodyType = {
  Dynamic: 0,
  Kinematic: 1,
  Static: 2,
} as const;
