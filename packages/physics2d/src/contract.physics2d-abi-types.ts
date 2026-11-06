// Temporary narrow bridge for the Physics2D contracts embedded by the separately owned ABI surface.
// Physics2D still owns these declarations in the global Types package; its ownership recovery can
// replace this file in place without changing ABI consumers.
export type {
  Physics2DCollider,
  Physics2DContact,
  Physics2DContactCallback,
  Physics2DDistanceJoint,
  Physics2DGearJoint,
  Physics2DJoint,
  Physics2DMouseJoint,
  Physics2DPrismaticJoint,
  Physics2DPulleyJoint,
  Physics2DQueryFilter,
  Physics2DQueryHit,
  Physics2DRevoluteJoint,
  Physics2DRopeJoint,
  Physics2DSolverConfig,
  Physics2DWeldJoint,
  Physics2DWheelJoint,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';
