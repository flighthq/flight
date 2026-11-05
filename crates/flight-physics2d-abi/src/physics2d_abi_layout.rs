//! flight-compiler: export-name PHYSICS2D_ABI_VERSION Physics2DAbiVersion
//! flight-compiler: export-name PHYSICS2D_ABI_COMMAND_MAGIC Physics2DAbiCommandMagic
//! flight-compiler: export-name PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH Physics2DAbiCommandHeaderByteLength
//! flight-compiler: export-name PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH Physics2DAbiCommandRecordHeaderByteLength
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_MAGIC Physics2DAbiCommandHeaderOffset.Magic
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_VERSION Physics2DAbiCommandHeaderOffset.Version
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH Physics2DAbiCommandHeaderOffset.ByteLength
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_COMMAND_COUNT Physics2DAbiCommandHeaderOffset.CommandCount
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_KIND Physics2DAbiCommandRecordOffset.Kind
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH Physics2DAbiCommandRecordOffset.ByteLength
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_OBJECT_ID Physics2DAbiCommandRecordOffset.ObjectId
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_RELATED_ID Physics2DAbiCommandRecordOffset.RelatedId
//! flight-compiler: const-member PHYSICS2D_ABI_CAPABILITY_CONTACT_HOOKS Physics2DAbiCapability.ContactHooks
//! flight-compiler: const-member PHYSICS2D_ABI_CAPABILITY_PERSISTENT_WORLDS Physics2DAbiCapability.PersistentWorlds
//! flight-compiler: const-member PHYSICS2D_ABI_CAPABILITY_QUERIES Physics2DAbiCapability.Queries
//! flight-compiler: const-member PHYSICS2D_ABI_CAPABILITY_SELECTIVE_READBACK Physics2DAbiCapability.SelectiveReadback
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY Physics2DAbiCommandKind.SetGravity
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG Physics2DAbiCommandKind.SetSolverConfig
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_SET_BODY Physics2DAbiCommandKind.SetBody
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY Physics2DAbiCommandKind.DestroyBody
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER Physics2DAbiCommandKind.SetCollider
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER Physics2DAbiCommandKind.DestroyCollider
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_SET_JOINT Physics2DAbiCommandKind.SetJoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT Physics2DAbiCommandKind.DestroyJoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE Physics2DAbiCommandKind.ApplyForce
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT Physics2DAbiCommandKind.ApplyForceAtPoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE Physics2DAbiCommandKind.ApplyLinearImpulse
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT Physics2DAbiCommandKind.ApplyLinearImpulseAtPoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_APPLY_TORQUE Physics2DAbiCommandKind.ApplyTorque
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY Physics2DAbiCommandKind.WakeBody
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_CIRCLE Physics2DAbiShapeKind.Circle
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_AABB Physics2DAbiShapeKind.Aabb
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_OBB Physics2DAbiShapeKind.Obb
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_CAPSULE Physics2DAbiShapeKind.Capsule
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_POLYGON Physics2DAbiShapeKind.Polygon
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_SEGMENT Physics2DAbiShapeKind.Segment
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_KIND_POINT Physics2DAbiShapeKind.Point
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_DISTANCE Physics2DAbiJointKind.Distance
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_REVOLUTE Physics2DAbiJointKind.Revolute
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_PRISMATIC Physics2DAbiJointKind.Prismatic
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_WELD Physics2DAbiJointKind.Weld
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_WHEEL Physics2DAbiJointKind.Wheel
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_ROPE Physics2DAbiJointKind.Rope
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_MOUSE Physics2DAbiJointKind.Mouse
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_PULLEY Physics2DAbiJointKind.Pulley
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_KIND_GEAR Physics2DAbiJointKind.Gear
//! flight-compiler: export-name PHYSICS2D_ABI_BODY_VALUE_STRIDE Physics2DAbiBodyValueStride
//! flight-compiler: export-name PHYSICS2D_ABI_CONTACT_ID_STRIDE Physics2DAbiContactIdStride
//! flight-compiler: export-name PHYSICS2D_ABI_CONTACT_VALUE_STRIDE Physics2DAbiContactValueStride
//! flight-compiler: export-name PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE Physics2DAbiContactPointValueStride
//! flight-compiler: export-name PHYSICS2D_ABI_JOINT_VALUE_STRIDE Physics2DAbiJointValueStride
//! flight-compiler: export-name PHYSICS2D_ABI_QUERY_VALUE_STRIDE Physics2DAbiQueryValueStride
//! flight-compiler: export-name PHYSICS2D_ABI_MAX_CONTACT_POINTS Physics2DAbiMaxContactPoints
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_X Physics2DAbiBodyValue.X
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_Y Physics2DAbiBodyValue.Y
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_ANGLE Physics2DAbiBodyValue.Angle
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_VELOCITY_X Physics2DAbiBodyValue.VelocityX
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y Physics2DAbiBodyValue.VelocityY
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_ANGULAR_VELOCITY Physics2DAbiBodyValue.AngularVelocity
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_FORCE_X Physics2DAbiBodyValue.ForceX
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_FORCE_Y Physics2DAbiBodyValue.ForceY
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_TORQUE Physics2DAbiBodyValue.Torque
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_MASS Physics2DAbiBodyValue.Mass
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_INERTIA Physics2DAbiBodyValue.Inertia
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_CENTER_X Physics2DAbiBodyValue.CenterX
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_CENTER_Y Physics2DAbiBodyValue.CenterY
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_LINEAR_DAMPING Physics2DAbiBodyValue.LinearDamping
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_ANGULAR_DAMPING Physics2DAbiBodyValue.AngularDamping
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_GRAVITY_SCALE Physics2DAbiBodyValue.GravityScale
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_VALUE_SLEEP_TIMER Physics2DAbiBodyValue.SleepTimer
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_ID_BODY_A Physics2DAbiContactId.BodyA
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_ID_BODY_B Physics2DAbiContactId.BodyB
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_ID_COLLIDER_A Physics2DAbiContactId.ColliderA
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_ID_COLLIDER_B Physics2DAbiContactId.ColliderB
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_X Physics2DAbiContactValue.NormalX
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_Y Physics2DAbiContactValue.NormalY
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_VALUE_FRICTION Physics2DAbiContactValue.Friction
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_VALUE_RESTITUTION Physics2DAbiContactValue.Restitution
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_X Physics2DAbiContactPointValue.X
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_Y Physics2DAbiContactPointValue.Y
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_DEPTH Physics2DAbiContactPointValue.Depth
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX Physics2DAbiContactPointValue.RelativeAX
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY Physics2DAbiContactPointValue.RelativeAY
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX Physics2DAbiContactPointValue.RelativeBX
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY Physics2DAbiContactPointValue.RelativeBY
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_VALUE_FORCE_X Physics2DAbiJointValue.ForceX
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_VALUE_FORCE_Y Physics2DAbiJointValue.ForceY
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_VALUE_TORQUE Physics2DAbiJointValue.Torque
//! flight-compiler: const-member PHYSICS2D_ABI_QUERY_VALUE_FRACTION Physics2DAbiQueryValue.Fraction
//! flight-compiler: const-member PHYSICS2D_ABI_QUERY_VALUE_X Physics2DAbiQueryValue.X
//! flight-compiler: const-member PHYSICS2D_ABI_QUERY_VALUE_Y Physics2DAbiQueryValue.Y
//! flight-compiler: const-member PHYSICS2D_ABI_QUERY_VALUE_NORMAL_X Physics2DAbiQueryValue.NormalX
//! flight-compiler: const-member PHYSICS2D_ABI_QUERY_VALUE_NORMAL_Y Physics2DAbiQueryValue.NormalY
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY Physics2DAbiCommandByteLength.SetGravity
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG Physics2DAbiCommandByteLength.SetSolverConfig
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY Physics2DAbiCommandByteLength.SetBody
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY Physics2DAbiCommandByteLength.DestroyBody
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM Physics2DAbiCommandByteLength.SetColliderMinimum
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER Physics2DAbiCommandByteLength.DestroyCollider
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT Physics2DAbiCommandByteLength.SetJoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT Physics2DAbiCommandByteLength.DestroyJoint
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION Physics2DAbiCommandByteLength.BodyAction
//! flight-compiler: const-member PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY Physics2DAbiCommandByteLength.WakeBody
//! flight-compiler: const-member PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_FLAGS Physics2DAbiSetBodyPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_RESERVED Physics2DAbiSetBodyPayloadOffset.Reserved
//! flight-compiler: const-member PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES Physics2DAbiSetBodyPayloadOffset.Values
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FLAGS Physics2DAbiSetColliderPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_CATEGORY_BITS Physics2DAbiSetColliderPayloadOffset.CategoryBits
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_MASK_BITS Physics2DAbiSetColliderPayloadOffset.MaskBits
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_GROUP_INDEX Physics2DAbiSetColliderPayloadOffset.GroupIndex
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_DENSITY Physics2DAbiSetColliderPayloadOffset.Density
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FRICTION Physics2DAbiSetColliderPayloadOffset.Friction
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_RESTITUTION Physics2DAbiSetColliderPayloadOffset.Restitution
//! flight-compiler: const-member PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE Physics2DAbiSetColliderPayloadOffset.Shape
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND Physics2DAbiSetJointPayloadOffset.Kind
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A Physics2DAbiSetJointPayloadOffset.BodyA
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B Physics2DAbiSetJointPayloadOffset.BodyB
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS Physics2DAbiSetJointPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES Physics2DAbiSetJointPayloadOffset.CommonValues
//! flight-compiler: const-member PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES Physics2DAbiSetJointPayloadOffset.KindValues
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_FLAGS Physics2DAbiSetSolverConfigPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0 Physics2DAbiSetSolverConfigPayloadOffset.Reserved0
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_SUBSTEPS Physics2DAbiSetSolverConfigPayloadOffset.MaxCcdSubsteps
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_ROTATION_SUBSTEPS Physics2DAbiSetSolverConfigPayloadOffset.MaxCcdRotationSubsteps
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VELOCITY_ITERATIONS Physics2DAbiSetSolverConfigPayloadOffset.VelocityIterations
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_POSITION_ITERATIONS Physics2DAbiSetSolverConfigPayloadOffset.PositionIterations
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED1 Physics2DAbiSetSolverConfigPayloadOffset.Reserved1
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED2 Physics2DAbiSetSolverConfigPayloadOffset.Reserved2
//! flight-compiler: const-member PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES Physics2DAbiSetSolverConfigPayloadOffset.Values
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_LINEAR_THRESHOLD Physics2DAbiSolverConfigValue.SleepLinearThreshold
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_ANGULAR_THRESHOLD Physics2DAbiSolverConfigValue.SleepAngularThreshold
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_TIME_TO_SLEEP Physics2DAbiSolverConfigValue.TimeToSleep
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_PENETRATION_SLOP Physics2DAbiSolverConfigValue.PenetrationSlop
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_POSITION_CORRECTION Physics2DAbiSolverConfigValue.PositionCorrection
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_RESTITUTION_THRESHOLD Physics2DAbiSolverConfigValue.RestitutionThreshold
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AX Physics2DAbiJointCommonValue.LocalAnchorAX
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AY Physics2DAbiJointCommonValue.LocalAnchorAY
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BX Physics2DAbiJointCommonValue.LocalAnchorBX
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BY Physics2DAbiJointCommonValue.LocalAnchorBY
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_FORCE Physics2DAbiJointCommonValue.BreakForce
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_TORQUE Physics2DAbiJointCommonValue.BreakTorque
//! flight-compiler: export-name PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT Physics2DAbiJointKindValueCount
//! flight-compiler: export-name PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH Physics2DAbiShapeHeaderByteLength
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_KIND Physics2DAbiShapeHeaderOffset.Kind
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALAR_COUNT Physics2DAbiShapeHeaderOffset.ScalarCount
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_INTEGER_COUNT Physics2DAbiShapeHeaderOffset.IntegerCount
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_VERSION Physics2DAbiShapeHeaderOffset.Version
//! flight-compiler: const-member PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALARS Physics2DAbiShapeHeaderOffset.Scalars
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK Physics2DAbiBodyFlag.TypeMask
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION Physics2DAbiBodyFlag.FixedRotation
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_FLAG_BULLET Physics2DAbiBodyFlag.Bullet
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_FLAG_SLEEPING Physics2DAbiBodyFlag.Sleeping
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED Physics2DAbiBodyFlag.SleepEnabled
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_FLAG_ENABLED Physics2DAbiContactFlag.Enabled
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_FLAG_SENSOR Physics2DAbiContactFlag.Sensor
//! flight-compiler: const-member PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING Physics2DAbiContactFlag.Touching
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED Physics2DAbiJointFlag.CollideConnected
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_BROKEN Physics2DAbiJointFlag.Broken
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR Physics2DAbiJointFlag.EnableMotor
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT Physics2DAbiJointFlag.EnableLimit
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT_SPRING Physics2DAbiJointFlag.EnableLimitSpring
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A Physics2DAbiJointFlag.LinearCoordinateA
//! flight-compiler: const-member PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B Physics2DAbiJointFlag.LinearCoordinateB
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING Physics2DAbiSolverConfigFlag.AllowSleeping
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION Physics2DAbiSolverConfigFlag.ContinuousCollision
//! flight-compiler: const-member PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING Physics2DAbiSolverConfigFlag.WarmStarting
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_TYPE_DYNAMIC Physics2DAbiBodyType.Dynamic
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_TYPE_KINEMATIC Physics2DAbiBodyType.Kinematic
//! flight-compiler: const-member PHYSICS2D_ABI_BODY_TYPE_STATIC Physics2DAbiBodyType.Static

//! The Physics2D ABI wire layout (TS `physics2DAbiLayout.ts`). Each TS `as const` group is a set
//! of flat, group-prefixed constants (the `BITMAP_NOISE_CHANNEL_*` convention): wire words are `u32`,
//! byte lengths, offsets and strides are `usize`.

/// Wire version for the command stream and backend surface (TS `Physics2DAbiVersion`). Increment
/// when an existing numeric discriminant, field position, or meaning changes.
pub const PHYSICS2D_ABI_VERSION: u32 = 1;

/// The bytes `P2DA`, read little-endian (TS `Physics2DAbiCommandMagic`).
pub const PHYSICS2D_ABI_COMMAND_MAGIC: u32 = 0x41443250;
pub const PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH: usize = 16;
pub const PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH: usize = 16;

// TS `Physics2DAbiCommandHeaderOffset`.
pub const PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_MAGIC: usize = 0;
pub const PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_VERSION: usize = 4;
pub const PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH: usize = 8;
pub const PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_COMMAND_COUNT: usize = 12;

// TS `Physics2DAbiCommandRecordOffset`.
pub const PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_KIND: usize = 0;
pub const PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH: usize = 4;
pub const PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_OBJECT_ID: usize = 8;
pub const PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_RELATED_ID: usize = 12;

// TS `Physics2DAbiCapability`: one bit per optional backend feature.
pub const PHYSICS2D_ABI_CAPABILITY_CONTACT_HOOKS: u32 = 1 << 0;
pub const PHYSICS2D_ABI_CAPABILITY_PERSISTENT_WORLDS: u32 = 1 << 1;
pub const PHYSICS2D_ABI_CAPABILITY_QUERIES: u32 = 1 << 2;
pub const PHYSICS2D_ABI_CAPABILITY_SELECTIVE_READBACK: u32 = 1 << 3;

// TS `Physics2DAbiCommandKind`.
pub const PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY: u32 = 1;
pub const PHYSICS2D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG: u32 = 2;
pub const PHYSICS2D_ABI_COMMAND_KIND_SET_BODY: u32 = 3;
pub const PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY: u32 = 4;
pub const PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER: u32 = 5;
pub const PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER: u32 = 6;
pub const PHYSICS2D_ABI_COMMAND_KIND_SET_JOINT: u32 = 7;
pub const PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT: u32 = 8;
pub const PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE: u32 = 9;
pub const PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT: u32 = 10;
pub const PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE: u32 = 11;
pub const PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT: u32 = 12;
pub const PHYSICS2D_ABI_COMMAND_KIND_APPLY_TORQUE: u32 = 13;
pub const PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY: u32 = 14;

// TS `Physics2DAbiShapeKind`: every kind `CollisionBuiltInShape2D` admits, including the two
// area-less ones Physics2D accepts as legal authored state.
pub const PHYSICS2D_ABI_SHAPE_KIND_CIRCLE: u32 = 1;
pub const PHYSICS2D_ABI_SHAPE_KIND_AABB: u32 = 2;
pub const PHYSICS2D_ABI_SHAPE_KIND_OBB: u32 = 3;
pub const PHYSICS2D_ABI_SHAPE_KIND_CAPSULE: u32 = 4;
pub const PHYSICS2D_ABI_SHAPE_KIND_POLYGON: u32 = 5;
pub const PHYSICS2D_ABI_SHAPE_KIND_SEGMENT: u32 = 6;
pub const PHYSICS2D_ABI_SHAPE_KIND_POINT: u32 = 7;

// TS `Physics2DAbiJointKind`.
pub const PHYSICS2D_ABI_JOINT_KIND_DISTANCE: u32 = 1;
pub const PHYSICS2D_ABI_JOINT_KIND_REVOLUTE: u32 = 2;
pub const PHYSICS2D_ABI_JOINT_KIND_PRISMATIC: u32 = 3;
pub const PHYSICS2D_ABI_JOINT_KIND_WELD: u32 = 4;
pub const PHYSICS2D_ABI_JOINT_KIND_WHEEL: u32 = 5;
pub const PHYSICS2D_ABI_JOINT_KIND_ROPE: u32 = 6;
pub const PHYSICS2D_ABI_JOINT_KIND_MOUSE: u32 = 7;
pub const PHYSICS2D_ABI_JOINT_KIND_PULLEY: u32 = 8;
pub const PHYSICS2D_ABI_JOINT_KIND_GEAR: u32 = 9;

pub const PHYSICS2D_ABI_BODY_VALUE_STRIDE: usize = 17;
pub const PHYSICS2D_ABI_CONTACT_ID_STRIDE: usize = 4;
pub const PHYSICS2D_ABI_CONTACT_VALUE_STRIDE: usize = 4;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE: usize = 7;
pub const PHYSICS2D_ABI_JOINT_VALUE_STRIDE: usize = 3;
pub const PHYSICS2D_ABI_QUERY_VALUE_STRIDE: usize = 5;

/// A planar manifold is a segment, so two points is the exact bound (TS
/// `Physics2DAbiMaxContactPoints`).
pub const PHYSICS2D_ABI_MAX_CONTACT_POINTS: usize = 2;

// TS `Physics2DAbiBodyValue`: authored body scalars in wire order. Derived solver quantities
// (inverse mass and inertia, lever arms, warm-start impulses) are deliberately absent.
pub const PHYSICS2D_ABI_BODY_VALUE_X: usize = 0;
pub const PHYSICS2D_ABI_BODY_VALUE_Y: usize = 1;
pub const PHYSICS2D_ABI_BODY_VALUE_ANGLE: usize = 2;
pub const PHYSICS2D_ABI_BODY_VALUE_VELOCITY_X: usize = 3;
pub const PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y: usize = 4;
pub const PHYSICS2D_ABI_BODY_VALUE_ANGULAR_VELOCITY: usize = 5;
pub const PHYSICS2D_ABI_BODY_VALUE_FORCE_X: usize = 6;
pub const PHYSICS2D_ABI_BODY_VALUE_FORCE_Y: usize = 7;
pub const PHYSICS2D_ABI_BODY_VALUE_TORQUE: usize = 8;
pub const PHYSICS2D_ABI_BODY_VALUE_MASS: usize = 9;
pub const PHYSICS2D_ABI_BODY_VALUE_INERTIA: usize = 10;
pub const PHYSICS2D_ABI_BODY_VALUE_CENTER_X: usize = 11;
pub const PHYSICS2D_ABI_BODY_VALUE_CENTER_Y: usize = 12;
pub const PHYSICS2D_ABI_BODY_VALUE_LINEAR_DAMPING: usize = 13;
pub const PHYSICS2D_ABI_BODY_VALUE_ANGULAR_DAMPING: usize = 14;
pub const PHYSICS2D_ABI_BODY_VALUE_GRAVITY_SCALE: usize = 15;
pub const PHYSICS2D_ABI_BODY_VALUE_SLEEP_TIMER: usize = 16;

// TS `Physics2DAbiContactId`.
pub const PHYSICS2D_ABI_CONTACT_ID_BODY_A: usize = 0;
pub const PHYSICS2D_ABI_CONTACT_ID_BODY_B: usize = 1;
pub const PHYSICS2D_ABI_CONTACT_ID_COLLIDER_A: usize = 2;
pub const PHYSICS2D_ABI_CONTACT_ID_COLLIDER_B: usize = 3;

// TS `Physics2DAbiContactValue`.
pub const PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_X: usize = 0;
pub const PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_Y: usize = 1;
pub const PHYSICS2D_ABI_CONTACT_VALUE_FRICTION: usize = 2;
pub const PHYSICS2D_ABI_CONTACT_VALUE_RESTITUTION: usize = 3;

// TS `Physics2DAbiContactPointValue`.
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_X: usize = 0;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_Y: usize = 1;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_DEPTH: usize = 2;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX: usize = 3;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY: usize = 4;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX: usize = 5;
pub const PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY: usize = 6;

// TS `Physics2DAbiJointValue`: a 2D reaction is a force plus one torque scalar.
pub const PHYSICS2D_ABI_JOINT_VALUE_FORCE_X: usize = 0;
pub const PHYSICS2D_ABI_JOINT_VALUE_FORCE_Y: usize = 1;
pub const PHYSICS2D_ABI_JOINT_VALUE_TORQUE: usize = 2;

// TS `Physics2DAbiQueryValue`.
pub const PHYSICS2D_ABI_QUERY_VALUE_FRACTION: usize = 0;
pub const PHYSICS2D_ABI_QUERY_VALUE_X: usize = 1;
pub const PHYSICS2D_ABI_QUERY_VALUE_Y: usize = 2;
pub const PHYSICS2D_ABI_QUERY_VALUE_NORMAL_X: usize = 3;
pub const PHYSICS2D_ABI_QUERY_VALUE_NORMAL_Y: usize = 4;

// TS `Physics2DAbiCommandByteLength`: record lengths include the 16-byte record header.
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY: usize = 32;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG: usize = 96;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY: usize = 160;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY: usize = 16;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM: usize = 72;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER: usize = 16;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT: usize = 152;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT: usize = 16;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION: usize = 48;
pub const PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY: usize = 16;

// TS `Physics2DAbiSetBodyPayloadOffset`.
pub const PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_RESERVED: usize = 4;
pub const PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES: usize = 8;

// TS `Physics2DAbiSetColliderPayloadOffset`.
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_CATEGORY_BITS: usize = 4;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_MASK_BITS: usize = 8;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_GROUP_INDEX: usize = 12;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_DENSITY: usize = 16;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FRICTION: usize = 24;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_RESTITUTION: usize = 32;
pub const PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE: usize = 40;

// TS `Physics2DAbiSetJointPayloadOffset`.
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND: usize = 0;
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A: usize = 4;
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B: usize = 8;
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS: usize = 12;
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES: usize = 16;
pub const PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES: usize = 64;

// TS `Physics2DAbiSetSolverConfigPayloadOffset`. Physics2D has no substeps: the word 3D spends on
// them is held zero (Reserved0) so the two configs stay positionally comparable.
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0: usize = 4;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_SUBSTEPS: usize = 8;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_ROTATION_SUBSTEPS: usize = 12;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VELOCITY_ITERATIONS: usize = 16;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_POSITION_ITERATIONS: usize = 20;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED1: usize = 24;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED2: usize = 28;
pub const PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES: usize = 32;

// TS `Physics2DAbiSolverConfigValue`.
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_LINEAR_THRESHOLD: usize = 0;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_ANGULAR_THRESHOLD: usize = 1;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_TIME_TO_SLEEP: usize = 2;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_PENETRATION_SLOP: usize = 3;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_POSITION_CORRECTION: usize = 4;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_RESTITUTION_THRESHOLD: usize = 5;

// TS `Physics2DAbiJointCommonValue`: anchors plus the two break thresholds, in wire order.
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AX: usize = 0;
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AY: usize = 1;
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BX: usize = 2;
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BY: usize = 3;
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_FORCE: usize = 4;
pub const PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_TORQUE: usize = 5;

/// Nine kind slots: the prismatic joint needs nine and no built-in needs more (TS
/// `Physics2DAbiJointKindValueCount`).
pub const PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT: usize = 9;

pub const PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH: usize = 16;

// TS `Physics2DAbiShapeHeaderOffset`.
pub const PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_KIND: usize = 0;
pub const PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALAR_COUNT: usize = 4;
pub const PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_INTEGER_COUNT: usize = 8;
pub const PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_VERSION: usize = 12;
pub const PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALARS: usize = 16;

// TS `Physics2DAbiBodyFlag`.
pub const PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK: u32 = 0b11;
pub const PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION: u32 = 1 << 2;
pub const PHYSICS2D_ABI_BODY_FLAG_BULLET: u32 = 1 << 3;
pub const PHYSICS2D_ABI_BODY_FLAG_SLEEPING: u32 = 1 << 4;
pub const PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED: u32 = 1 << 5;

// TS `Physics2DAbiContactFlag`.
pub const PHYSICS2D_ABI_CONTACT_FLAG_ENABLED: u32 = 1 << 0;
pub const PHYSICS2D_ABI_CONTACT_FLAG_SENSOR: u32 = 1 << 1;
pub const PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING: u32 = 1 << 2;

// TS `Physics2DAbiJointFlag`. Bits 0-1 are common to every kind; bits 2-4 are read against the
// record's own kind, so a gear's two coordinate bits and a revolute's enable bits share positions.
pub const PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED: u32 = 1 << 0;
pub const PHYSICS2D_ABI_JOINT_FLAG_BROKEN: u32 = 1 << 1;
pub const PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR: u32 = 1 << 2;
pub const PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT: u32 = 1 << 3;
pub const PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT_SPRING: u32 = 1 << 4;
pub const PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A: u32 = 1 << 2;
pub const PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B: u32 = 1 << 3;

// TS `Physics2DAbiSolverConfigFlag`.
pub const PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING: u32 = 1 << 0;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION: u32 = 1 << 1;
pub const PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING: u32 = 1 << 2;

// TS `Physics2DAbiBodyType`.
pub const PHYSICS2D_ABI_BODY_TYPE_DYNAMIC: u32 = 0;
pub const PHYSICS2D_ABI_BODY_TYPE_KINEMATIC: u32 = 1;
pub const PHYSICS2D_ABI_BODY_TYPE_STATIC: u32 = 2;
