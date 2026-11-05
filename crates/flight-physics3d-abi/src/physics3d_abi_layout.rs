//! flight-compiler: target-native
//! flight-compiler: export-name PHYSICS3D_ABI_VERSION Physics3DAbiVersion
//! flight-compiler: export-name PHYSICS3D_ABI_COMMAND_MAGIC Physics3DAbiCommandMagic
//! flight-compiler: export-name PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH Physics3DAbiCommandHeaderByteLength
//! flight-compiler: export-name PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH Physics3DAbiCommandRecordHeaderByteLength
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_MAGIC Physics3DAbiCommandHeaderOffset.Magic
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_VERSION Physics3DAbiCommandHeaderOffset.Version
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH Physics3DAbiCommandHeaderOffset.ByteLength
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_COMMAND_COUNT Physics3DAbiCommandHeaderOffset.CommandCount
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_KIND Physics3DAbiCommandRecordOffset.Kind
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH Physics3DAbiCommandRecordOffset.ByteLength
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_OBJECT_ID Physics3DAbiCommandRecordOffset.ObjectId
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_RELATED_ID Physics3DAbiCommandRecordOffset.RelatedId
//! flight-compiler: const-member PHYSICS3D_ABI_CAPABILITY_CONTACT_HOOKS Physics3DAbiCapability.ContactHooks
//! flight-compiler: const-member PHYSICS3D_ABI_CAPABILITY_PERSISTENT_WORLDS Physics3DAbiCapability.PersistentWorlds
//! flight-compiler: const-member PHYSICS3D_ABI_CAPABILITY_QUERIES Physics3DAbiCapability.Queries
//! flight-compiler: const-member PHYSICS3D_ABI_CAPABILITY_SELECTIVE_READBACK Physics3DAbiCapability.SelectiveReadback
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY Physics3DAbiCommandKind.SetGravity
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG Physics3DAbiCommandKind.SetSolverConfig
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_SET_BODY Physics3DAbiCommandKind.SetBody
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY Physics3DAbiCommandKind.DestroyBody
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER Physics3DAbiCommandKind.SetCollider
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER Physics3DAbiCommandKind.DestroyCollider
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT Physics3DAbiCommandKind.SetJoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT Physics3DAbiCommandKind.DestroyJoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE Physics3DAbiCommandKind.ApplyForce
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT Physics3DAbiCommandKind.ApplyForceAtPoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE Physics3DAbiCommandKind.ApplyLinearImpulse
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT Physics3DAbiCommandKind.ApplyLinearImpulseAtPoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE Physics3DAbiCommandKind.ApplyTorque
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY Physics3DAbiCommandKind.WakeBody
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_SPHERE Physics3DAbiShapeKind.Sphere
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_AABB Physics3DAbiShapeKind.Aabb
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_BOX Physics3DAbiShapeKind.Box
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_CAPSULE Physics3DAbiShapeKind.Capsule
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_CYLINDER Physics3DAbiShapeKind.Cylinder
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_CONE Physics3DAbiShapeKind.Cone
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_CONVEX Physics3DAbiShapeKind.Convex
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH Physics3DAbiShapeKind.TriangleMesh
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD Physics3DAbiShapeKind.Heightfield
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET Physics3DAbiJointKind.BallAndSocket
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_DISTANCE Physics3DAbiJointKind.Distance
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_FIXED Physics3DAbiJointKind.Fixed
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_HINGE Physics3DAbiJointKind.Hinge
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_SLIDER Physics3DAbiJointKind.Slider
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST Physics3DAbiJointKind.ConeTwist
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF Physics3DAbiJointKind.Generic6Dof
//! flight-compiler: export-name PHYSICS3D_ABI_BODY_VALUE_STRIDE Physics3DAbiBodyValueStride
//! flight-compiler: export-name PHYSICS3D_ABI_CONTACT_ID_STRIDE Physics3DAbiContactIdStride
//! flight-compiler: export-name PHYSICS3D_ABI_CONTACT_VALUE_STRIDE Physics3DAbiContactValueStride
//! flight-compiler: export-name PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE Physics3DAbiContactPointValueStride
//! flight-compiler: export-name PHYSICS3D_ABI_JOINT_VALUE_STRIDE Physics3DAbiJointValueStride
//! flight-compiler: export-name PHYSICS3D_ABI_QUERY_VALUE_STRIDE Physics3DAbiQueryValueStride
//! flight-compiler: export-name PHYSICS3D_ABI_MAX_CONTACT_POINTS Physics3DAbiMaxContactPoints
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_X Physics3DAbiBodyValue.X
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_Y Physics3DAbiBodyValue.Y
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_Z Physics3DAbiBodyValue.Z
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_X Physics3DAbiBodyValue.OrientationX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Y Physics3DAbiBodyValue.OrientationY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Z Physics3DAbiBodyValue.OrientationZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_W Physics3DAbiBodyValue.OrientationW
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X Physics3DAbiBodyValue.VelocityX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y Physics3DAbiBodyValue.VelocityY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Z Physics3DAbiBodyValue.VelocityZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_X Physics3DAbiBodyValue.AngularVelocityX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Y Physics3DAbiBodyValue.AngularVelocityY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Z Physics3DAbiBodyValue.AngularVelocityZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_FORCE_X Physics3DAbiBodyValue.ForceX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_FORCE_Y Physics3DAbiBodyValue.ForceY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_FORCE_Z Physics3DAbiBodyValue.ForceZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_TORQUE_X Physics3DAbiBodyValue.TorqueX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_TORQUE_Y Physics3DAbiBodyValue.TorqueY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_TORQUE_Z Physics3DAbiBodyValue.TorqueZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_MASS Physics3DAbiBodyValue.Mass
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_XX Physics3DAbiBodyValue.InertiaXX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_YY Physics3DAbiBodyValue.InertiaYY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_ZZ Physics3DAbiBodyValue.InertiaZZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_XY Physics3DAbiBodyValue.InertiaXY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_XZ Physics3DAbiBodyValue.InertiaXZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_INERTIA_YZ Physics3DAbiBodyValue.InertiaYZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_CENTER_X Physics3DAbiBodyValue.CenterX
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_CENTER_Y Physics3DAbiBodyValue.CenterY
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_CENTER_Z Physics3DAbiBodyValue.CenterZ
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_LINEAR_DAMPING Physics3DAbiBodyValue.LinearDamping
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_ANGULAR_DAMPING Physics3DAbiBodyValue.AngularDamping
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_GRAVITY_SCALE Physics3DAbiBodyValue.GravityScale
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_VALUE_SLEEP_TIMER Physics3DAbiBodyValue.SleepTimer
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_ID_BODY_A Physics3DAbiContactId.BodyA
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_ID_BODY_B Physics3DAbiContactId.BodyB
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_ID_COLLIDER_A Physics3DAbiContactId.ColliderA
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_ID_COLLIDER_B Physics3DAbiContactId.ColliderB
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_X Physics3DAbiContactValue.NormalX
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Y Physics3DAbiContactValue.NormalY
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Z Physics3DAbiContactValue.NormalZ
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_VALUE_FRICTION Physics3DAbiContactValue.Friction
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_VALUE_RESTITUTION Physics3DAbiContactValue.Restitution
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_X Physics3DAbiContactPointValue.X
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_Y Physics3DAbiContactPointValue.Y
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_Z Physics3DAbiContactPointValue.Z
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_DEPTH Physics3DAbiContactPointValue.Depth
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX Physics3DAbiContactPointValue.RelativeAX
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY Physics3DAbiContactPointValue.RelativeAY
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AZ Physics3DAbiContactPointValue.RelativeAZ
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX Physics3DAbiContactPointValue.RelativeBX
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY Physics3DAbiContactPointValue.RelativeBY
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BZ Physics3DAbiContactPointValue.RelativeBZ
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_FORCE_X Physics3DAbiJointValue.ForceX
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_FORCE_Y Physics3DAbiJointValue.ForceY
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_FORCE_Z Physics3DAbiJointValue.ForceZ
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_TORQUE_X Physics3DAbiJointValue.TorqueX
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Y Physics3DAbiJointValue.TorqueY
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Z Physics3DAbiJointValue.TorqueZ
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_FRACTION Physics3DAbiQueryValue.Fraction
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_X Physics3DAbiQueryValue.X
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_Y Physics3DAbiQueryValue.Y
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_Z Physics3DAbiQueryValue.Z
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_NORMAL_X Physics3DAbiQueryValue.NormalX
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Y Physics3DAbiQueryValue.NormalY
//! flight-compiler: const-member PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Z Physics3DAbiQueryValue.NormalZ
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY Physics3DAbiCommandByteLength.SetGravity
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG Physics3DAbiCommandByteLength.SetSolverConfig
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_BODY Physics3DAbiCommandByteLength.SetBody
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY Physics3DAbiCommandByteLength.DestroyBody
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM Physics3DAbiCommandByteLength.SetColliderMinimum
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER Physics3DAbiCommandByteLength.DestroyCollider
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT Physics3DAbiCommandByteLength.SetJoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT Physics3DAbiCommandByteLength.DestroyJoint
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION Physics3DAbiCommandByteLength.BodyAction
//! flight-compiler: const-member PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY Physics3DAbiCommandByteLength.WakeBody
//! flight-compiler: const-member PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_FLAGS Physics3DAbiSetBodyPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_RESERVED Physics3DAbiSetBodyPayloadOffset.Reserved
//! flight-compiler: const-member PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES Physics3DAbiSetBodyPayloadOffset.Values
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FLAGS Physics3DAbiSetColliderPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_CATEGORY_BITS Physics3DAbiSetColliderPayloadOffset.CategoryBits
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_MASK_BITS Physics3DAbiSetColliderPayloadOffset.MaskBits
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_GROUP_INDEX Physics3DAbiSetColliderPayloadOffset.GroupIndex
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_DENSITY Physics3DAbiSetColliderPayloadOffset.Density
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FRICTION Physics3DAbiSetColliderPayloadOffset.Friction
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_RESTITUTION Physics3DAbiSetColliderPayloadOffset.Restitution
//! flight-compiler: const-member PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE Physics3DAbiSetColliderPayloadOffset.Shape
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND Physics3DAbiSetJointPayloadOffset.Kind
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A Physics3DAbiSetJointPayloadOffset.BodyA
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B Physics3DAbiSetJointPayloadOffset.BodyB
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS Physics3DAbiSetJointPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES Physics3DAbiSetJointPayloadOffset.CommonValues
//! flight-compiler: const-member PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES Physics3DAbiSetJointPayloadOffset.KindValues
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_FLAGS Physics3DAbiSetSolverConfigPayloadOffset.Flags
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_SUBSTEPS Physics3DAbiSetSolverConfigPayloadOffset.Substeps
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_SUBSTEPS Physics3DAbiSetSolverConfigPayloadOffset.MaxCcdSubsteps
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_ROTATION_SUBSTEPS Physics3DAbiSetSolverConfigPayloadOffset.MaxCcdRotationSubsteps
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VELOCITY_ITERATIONS Physics3DAbiSetSolverConfigPayloadOffset.VelocityIterations
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_POSITION_ITERATIONS Physics3DAbiSetSolverConfigPayloadOffset.PositionIterations
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0 Physics3DAbiSetSolverConfigPayloadOffset.Reserved0
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED1 Physics3DAbiSetSolverConfigPayloadOffset.Reserved1
//! flight-compiler: const-member PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES Physics3DAbiSetSolverConfigPayloadOffset.Values
//! flight-compiler: export-name PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH Physics3DAbiShapeHeaderByteLength
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_KIND Physics3DAbiShapeHeaderOffset.Kind
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_SCALAR_COUNT Physics3DAbiShapeHeaderOffset.ScalarCount
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_INTEGER_COUNT Physics3DAbiShapeHeaderOffset.IntegerCount
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_VERSION Physics3DAbiShapeHeaderOffset.Version
//! flight-compiler: const-member PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_SCALARS Physics3DAbiShapeHeaderOffset.Scalars
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_FLAG_TYPE_MASK Physics3DAbiBodyFlag.TypeMask
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_FLAG_FIXED_ROTATION Physics3DAbiBodyFlag.FixedRotation
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_FLAG_BULLET Physics3DAbiBodyFlag.Bullet
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_FLAG_SLEEPING Physics3DAbiBodyFlag.Sleeping
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_FLAG_SLEEP_ENABLED Physics3DAbiBodyFlag.SleepEnabled
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_FLAG_ENABLED Physics3DAbiContactFlag.Enabled
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_FLAG_SENSOR Physics3DAbiContactFlag.Sensor
//! flight-compiler: const-member PHYSICS3D_ABI_CONTACT_FLAG_TOUCHING Physics3DAbiContactFlag.Touching
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_FLAG_COLLIDE_CONNECTED Physics3DAbiJointFlag.CollideConnected
//! flight-compiler: const-member PHYSICS3D_ABI_JOINT_FLAG_BROKEN Physics3DAbiJointFlag.Broken
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_TYPE_DYNAMIC Physics3DAbiBodyType.Dynamic
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_TYPE_KINEMATIC Physics3DAbiBodyType.Kinematic
//! flight-compiler: const-member PHYSICS3D_ABI_BODY_TYPE_STATIC Physics3DAbiBodyType.Static

//! The Physics3D ABI wire layout (TS `physics3DAbiLayout.ts`). Each TS `as const` group is a set
//! of flat, group-prefixed constants (the `BITMAP_NOISE_CHANNEL_*` convention): wire words are `u32`,
//! byte lengths, offsets and strides are `usize`.

/// Wire version for the command stream and backend surface (TS `Physics3DAbiVersion`). Increment
/// when an existing numeric discriminant, field position, or meaning changes. Additive commands may
/// retain the version because every record is length-delimited.
pub const PHYSICS3D_ABI_VERSION: u32 = 1;

/// The bytes `P3DA`, read little-endian (TS `Physics3DAbiCommandMagic`).
pub const PHYSICS3D_ABI_COMMAND_MAGIC: u32 = 0x41443350;
pub const PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH: usize = 16;
pub const PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH: usize = 16;

// TS `Physics3DAbiCommandHeaderOffset`.
pub const PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_MAGIC: usize = 0;
pub const PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_VERSION: usize = 4;
pub const PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH: usize = 8;
pub const PHYSICS3D_ABI_COMMAND_HEADER_OFFSET_COMMAND_COUNT: usize = 12;

// TS `Physics3DAbiCommandRecordOffset`.
pub const PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_KIND: usize = 0;
pub const PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH: usize = 4;
pub const PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_OBJECT_ID: usize = 8;
pub const PHYSICS3D_ABI_COMMAND_RECORD_OFFSET_RELATED_ID: usize = 12;

// TS `Physics3DAbiCapability`: one bit per optional backend feature.
pub const PHYSICS3D_ABI_CAPABILITY_CONTACT_HOOKS: u32 = 1 << 0;
pub const PHYSICS3D_ABI_CAPABILITY_PERSISTENT_WORLDS: u32 = 1 << 1;
pub const PHYSICS3D_ABI_CAPABILITY_QUERIES: u32 = 1 << 2;
pub const PHYSICS3D_ABI_CAPABILITY_SELECTIVE_READBACK: u32 = 1 << 3;

// TS `Physics3DAbiCommandKind`.
pub const PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY: u32 = 1;
pub const PHYSICS3D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG: u32 = 2;
pub const PHYSICS3D_ABI_COMMAND_KIND_SET_BODY: u32 = 3;
pub const PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY: u32 = 4;
pub const PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER: u32 = 5;
pub const PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER: u32 = 6;
pub const PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT: u32 = 7;
pub const PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT: u32 = 8;
pub const PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE: u32 = 9;
pub const PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT: u32 = 10;
pub const PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE: u32 = 11;
pub const PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT: u32 = 12;
pub const PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE: u32 = 13;
pub const PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY: u32 = 14;

// TS `Physics3DAbiShapeKind`: every kind `CollisionColliderShape3D` admits, including the two
// static concave descriptors.
pub const PHYSICS3D_ABI_SHAPE_KIND_SPHERE: u32 = 1;
pub const PHYSICS3D_ABI_SHAPE_KIND_AABB: u32 = 2;
pub const PHYSICS3D_ABI_SHAPE_KIND_BOX: u32 = 3;
pub const PHYSICS3D_ABI_SHAPE_KIND_CAPSULE: u32 = 4;
pub const PHYSICS3D_ABI_SHAPE_KIND_CYLINDER: u32 = 5;
pub const PHYSICS3D_ABI_SHAPE_KIND_CONE: u32 = 6;
pub const PHYSICS3D_ABI_SHAPE_KIND_CONVEX: u32 = 7;
pub const PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH: u32 = 8;
pub const PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD: u32 = 9;

// TS `Physics3DAbiJointKind`.
pub const PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET: u32 = 1;
pub const PHYSICS3D_ABI_JOINT_KIND_DISTANCE: u32 = 2;
pub const PHYSICS3D_ABI_JOINT_KIND_FIXED: u32 = 3;
pub const PHYSICS3D_ABI_JOINT_KIND_HINGE: u32 = 4;
pub const PHYSICS3D_ABI_JOINT_KIND_SLIDER: u32 = 5;
pub const PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST: u32 = 6;
pub const PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF: u32 = 7;

pub const PHYSICS3D_ABI_BODY_VALUE_STRIDE: usize = 33;
pub const PHYSICS3D_ABI_CONTACT_ID_STRIDE: usize = 4;
pub const PHYSICS3D_ABI_CONTACT_VALUE_STRIDE: usize = 5;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE: usize = 10;
pub const PHYSICS3D_ABI_JOINT_VALUE_STRIDE: usize = 6;
pub const PHYSICS3D_ABI_QUERY_VALUE_STRIDE: usize = 7;

/// A 3D face-face manifold can carry four points (TS `Physics3DAbiMaxContactPoints`). The bound is
/// an ABI-owned constant so a collision-manifold expansion forces a reviewed contract update.
pub const PHYSICS3D_ABI_MAX_CONTACT_POINTS: usize = 4;

// TS `Physics3DAbiBodyValue`: authored and dynamic body scalars in wire order.
pub const PHYSICS3D_ABI_BODY_VALUE_X: usize = 0;
pub const PHYSICS3D_ABI_BODY_VALUE_Y: usize = 1;
pub const PHYSICS3D_ABI_BODY_VALUE_Z: usize = 2;
pub const PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_X: usize = 3;
pub const PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Y: usize = 4;
pub const PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Z: usize = 5;
pub const PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_W: usize = 6;
pub const PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X: usize = 7;
pub const PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y: usize = 8;
pub const PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Z: usize = 9;
pub const PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_X: usize = 10;
pub const PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Y: usize = 11;
pub const PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Z: usize = 12;
pub const PHYSICS3D_ABI_BODY_VALUE_FORCE_X: usize = 13;
pub const PHYSICS3D_ABI_BODY_VALUE_FORCE_Y: usize = 14;
pub const PHYSICS3D_ABI_BODY_VALUE_FORCE_Z: usize = 15;
pub const PHYSICS3D_ABI_BODY_VALUE_TORQUE_X: usize = 16;
pub const PHYSICS3D_ABI_BODY_VALUE_TORQUE_Y: usize = 17;
pub const PHYSICS3D_ABI_BODY_VALUE_TORQUE_Z: usize = 18;
pub const PHYSICS3D_ABI_BODY_VALUE_MASS: usize = 19;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_XX: usize = 20;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_YY: usize = 21;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_ZZ: usize = 22;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_XY: usize = 23;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_XZ: usize = 24;
pub const PHYSICS3D_ABI_BODY_VALUE_INERTIA_YZ: usize = 25;
pub const PHYSICS3D_ABI_BODY_VALUE_CENTER_X: usize = 26;
pub const PHYSICS3D_ABI_BODY_VALUE_CENTER_Y: usize = 27;
pub const PHYSICS3D_ABI_BODY_VALUE_CENTER_Z: usize = 28;
pub const PHYSICS3D_ABI_BODY_VALUE_LINEAR_DAMPING: usize = 29;
pub const PHYSICS3D_ABI_BODY_VALUE_ANGULAR_DAMPING: usize = 30;
pub const PHYSICS3D_ABI_BODY_VALUE_GRAVITY_SCALE: usize = 31;
pub const PHYSICS3D_ABI_BODY_VALUE_SLEEP_TIMER: usize = 32;

// TS `Physics3DAbiContactId`.
pub const PHYSICS3D_ABI_CONTACT_ID_BODY_A: usize = 0;
pub const PHYSICS3D_ABI_CONTACT_ID_BODY_B: usize = 1;
pub const PHYSICS3D_ABI_CONTACT_ID_COLLIDER_A: usize = 2;
pub const PHYSICS3D_ABI_CONTACT_ID_COLLIDER_B: usize = 3;

// TS `Physics3DAbiContactValue`.
pub const PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_X: usize = 0;
pub const PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Y: usize = 1;
pub const PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Z: usize = 2;
pub const PHYSICS3D_ABI_CONTACT_VALUE_FRICTION: usize = 3;
pub const PHYSICS3D_ABI_CONTACT_VALUE_RESTITUTION: usize = 4;

// TS `Physics3DAbiContactPointValue`.
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_X: usize = 0;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_Y: usize = 1;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_Z: usize = 2;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_DEPTH: usize = 3;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX: usize = 4;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY: usize = 5;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AZ: usize = 6;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX: usize = 7;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY: usize = 8;
pub const PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BZ: usize = 9;

// TS `Physics3DAbiJointValue`: a 3D reaction is a force vector plus a torque vector.
pub const PHYSICS3D_ABI_JOINT_VALUE_FORCE_X: usize = 0;
pub const PHYSICS3D_ABI_JOINT_VALUE_FORCE_Y: usize = 1;
pub const PHYSICS3D_ABI_JOINT_VALUE_FORCE_Z: usize = 2;
pub const PHYSICS3D_ABI_JOINT_VALUE_TORQUE_X: usize = 3;
pub const PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Y: usize = 4;
pub const PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Z: usize = 5;

// TS `Physics3DAbiQueryValue`.
pub const PHYSICS3D_ABI_QUERY_VALUE_FRACTION: usize = 0;
pub const PHYSICS3D_ABI_QUERY_VALUE_X: usize = 1;
pub const PHYSICS3D_ABI_QUERY_VALUE_Y: usize = 2;
pub const PHYSICS3D_ABI_QUERY_VALUE_Z: usize = 3;
pub const PHYSICS3D_ABI_QUERY_VALUE_NORMAL_X: usize = 4;
pub const PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Y: usize = 5;
pub const PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Z: usize = 6;

// TS `Physics3DAbiCommandByteLength`: record lengths include the 16-byte record header. Variable
// collider records end after their aligned shape block.
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY: usize = 40;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG: usize = 96;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_BODY: usize = 288;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY: usize = 16;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM: usize = 72;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER: usize = 16;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT: usize = 272;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT: usize = 16;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION: usize = 64;
pub const PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY: usize = 16;

// TS `Physics3DAbiSetBodyPayloadOffset`.
pub const PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_RESERVED: usize = 4;
pub const PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES: usize = 8;

// TS `Physics3DAbiSetColliderPayloadOffset`.
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_CATEGORY_BITS: usize = 4;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_MASK_BITS: usize = 8;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_GROUP_INDEX: usize = 12;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_DENSITY: usize = 16;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_FRICTION: usize = 24;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_RESTITUTION: usize = 32;
pub const PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE: usize = 40;

// TS `Physics3DAbiSetJointPayloadOffset`.
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND: usize = 0;
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A: usize = 4;
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B: usize = 8;
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS: usize = 12;
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES: usize = 16;
pub const PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES: usize = 144;

// TS `Physics3DAbiSetSolverConfigPayloadOffset`.
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_FLAGS: usize = 0;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_SUBSTEPS: usize = 4;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_SUBSTEPS: usize = 8;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_ROTATION_SUBSTEPS: usize = 12;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VELOCITY_ITERATIONS: usize = 16;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_POSITION_ITERATIONS: usize = 20;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0: usize = 24;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED1: usize = 28;
pub const PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES: usize = 32;

pub const PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH: usize = 16;

// TS `Physics3DAbiShapeHeaderOffset`.
pub const PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_KIND: usize = 0;
pub const PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_SCALAR_COUNT: usize = 4;
pub const PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_INTEGER_COUNT: usize = 8;
pub const PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_VERSION: usize = 12;
pub const PHYSICS3D_ABI_SHAPE_HEADER_OFFSET_SCALARS: usize = 16;

// TS `Physics3DAbiBodyFlag`.
pub const PHYSICS3D_ABI_BODY_FLAG_TYPE_MASK: u32 = 0b11;
pub const PHYSICS3D_ABI_BODY_FLAG_FIXED_ROTATION: u32 = 1 << 2;
pub const PHYSICS3D_ABI_BODY_FLAG_BULLET: u32 = 1 << 3;
pub const PHYSICS3D_ABI_BODY_FLAG_SLEEPING: u32 = 1 << 4;
pub const PHYSICS3D_ABI_BODY_FLAG_SLEEP_ENABLED: u32 = 1 << 5;

// TS `Physics3DAbiContactFlag`.
pub const PHYSICS3D_ABI_CONTACT_FLAG_ENABLED: u32 = 1 << 0;
pub const PHYSICS3D_ABI_CONTACT_FLAG_SENSOR: u32 = 1 << 1;
pub const PHYSICS3D_ABI_CONTACT_FLAG_TOUCHING: u32 = 1 << 2;

// TS `Physics3DAbiJointFlag`: one joint flag word shared by the SetJoint record and the joint
// readback, as in the 2D ABI. Bits 0-1 are common to every kind; bits 2-4 are the kind's own enable
// bits. The pinned TS readback reported Broken at bit 0, colliding with CollideConnected
// (api-drift, TS defect).
pub const PHYSICS3D_ABI_JOINT_FLAG_COLLIDE_CONNECTED: u32 = 1 << 0;
pub const PHYSICS3D_ABI_JOINT_FLAG_BROKEN: u32 = 1 << 1;

// TS `Physics3DAbiBodyType`.
pub const PHYSICS3D_ABI_BODY_TYPE_DYNAMIC: u32 = 0;
pub const PHYSICS3D_ABI_BODY_TYPE_KINEMATIC: u32 = 1;
pub const PHYSICS3D_ABI_BODY_TYPE_STATIC: u32 = 2;
