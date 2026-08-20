import type {
  CollisionShape2D,
  Physics2DCollider,
  Physics2DContact,
  Physics2DJoint,
  Physics2DSolverConfig,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';

export function isPhysics2DBodyStateValid(world: Readonly<Physics2DWorld>): boolean {
  if (!Number.isSafeInteger(world.nextBodyIndex) || world.nextBodyIndex < 0) return false;
  for (const body of world.bodies) {
    if (!isRigidBody2DStateValid(body) || world.bodyByIndex.get(body.index) !== body) return false;
  }
  return true;
}

export function isPhysics2DContactStateValid(world: Readonly<Physics2DWorld>): boolean {
  for (const contact of world.contacts) {
    if (!isPhysics2DContactValid(contact)) return false;
  }
  return true;
}

export function isPhysics2DContactValid(contact: Readonly<Physics2DContact>): boolean {
  if (
    !Number.isSafeInteger(contact.bodyA) ||
    !Number.isSafeInteger(contact.bodyB) ||
    !Number.isSafeInteger(contact.colliderA) ||
    !Number.isSafeInteger(contact.colliderB) ||
    !Number.isSafeInteger(contact.pointCount) ||
    contact.pointCount < 0 ||
    contact.pointCount > contact.points.length ||
    !Number.isFinite(contact.normalX) ||
    !Number.isFinite(contact.normalY) ||
    !Number.isFinite(contact.friction) ||
    contact.friction < 0 ||
    !Number.isFinite(contact.restitution) ||
    contact.restitution < 0 ||
    typeof contact.enabled !== 'boolean' ||
    typeof contact.sensor !== 'boolean' ||
    typeof contact.touching !== 'boolean'
  ) {
    return false;
  }
  for (let i = 0; i < contact.pointCount; i++) {
    const point = contact.points[i];
    if (point === undefined) return false;
    for (const key in point) {
      const value = point[key as keyof typeof point];
      if (typeof value === 'number' && !Number.isFinite(value)) return false;
    }
  }
  return true;
}

export function isPhysics2DGravityValid(world: Readonly<Physics2DWorld>): boolean {
  return Number.isFinite(world.gravityX) && Number.isFinite(world.gravityY);
}

export function isPhysics2DJointStateValid(world: Readonly<Physics2DWorld>): boolean {
  for (const joint of world.joints) {
    if (!isPhysics2DJointValid(joint)) return false;
  }
  return true;
}

export function isPhysics2DPreviousTimestepValid(world: Readonly<Physics2DWorld>): boolean {
  return world.previousTimestep === 0 || (Number.isFinite(world.previousTimestep) && world.previousTimestep > 0);
}

export function isPhysics2DSolverConfigValid(config: Readonly<Physics2DSolverConfig>): boolean {
  return (
    typeof config.allowSleeping === 'boolean' &&
    Number.isFinite(config.sleepLinearThreshold) &&
    config.sleepLinearThreshold >= 0 &&
    Number.isFinite(config.sleepAngularThreshold) &&
    config.sleepAngularThreshold >= 0 &&
    Number.isFinite(config.timeToSleep) &&
    config.timeToSleep >= 0 &&
    Number.isFinite(config.penetrationSlop) &&
    config.penetrationSlop >= 0 &&
    Number.isFinite(config.positionCorrection) &&
    config.positionCorrection >= 0 &&
    config.positionCorrection <= 1 &&
    Number.isFinite(config.restitutionThreshold) &&
    config.restitutionThreshold >= 0 &&
    typeof config.warmStarting === 'boolean' &&
    typeof config.continuousCollision === 'boolean' &&
    Number.isSafeInteger(config.maxCcdSubsteps) &&
    config.maxCcdSubsteps >= 0 &&
    Number.isSafeInteger(config.maxCcdRotationSubsteps) &&
    config.maxCcdRotationSubsteps >= 0
  );
}

function isCollisionShapeStateValid(shape: Readonly<CollisionShape2D>): boolean {
  switch (shape.kind) {
    case 'circle':
      return Number.isFinite(shape.x) && Number.isFinite(shape.y) && Number.isFinite(shape.radius) && shape.radius > 0;
    case 'aabb':
      return (
        Number.isFinite(shape.minX) &&
        Number.isFinite(shape.minY) &&
        Number.isFinite(shape.maxX) &&
        Number.isFinite(shape.maxY) &&
        shape.maxX > shape.minX &&
        shape.maxY > shape.minY
      );
    case 'obb':
      return (
        Number.isFinite(shape.x) &&
        Number.isFinite(shape.y) &&
        Number.isFinite(shape.halfW) &&
        Number.isFinite(shape.halfH) &&
        Number.isFinite(shape.rotation) &&
        shape.halfW > 0 &&
        shape.halfH > 0
      );
    case 'polygon':
      if (shape.points.length < 6 || (shape.points.length & 1) !== 0) return false;
      for (const coordinate of shape.points) {
        if (!Number.isFinite(coordinate)) return false;
      }
      return true;
    case 'segment':
      return (
        Number.isFinite(shape.x0) && Number.isFinite(shape.y0) && Number.isFinite(shape.x1) && Number.isFinite(shape.y1)
      );
    case 'point':
      return Number.isFinite(shape.x) && Number.isFinite(shape.y);
  }
}

function isPhysics2DColliderStateValid(collider: Readonly<Physics2DCollider>): boolean {
  const filter = collider.filter;
  return (
    isCollisionShapeStateValid(collider.local) &&
    Number.isFinite(collider.material.density) &&
    collider.material.density >= 0 &&
    Number.isFinite(collider.material.friction) &&
    collider.material.friction >= 0 &&
    Number.isFinite(collider.material.restitution) &&
    collider.material.restitution >= 0 &&
    typeof collider.sensor === 'boolean' &&
    (filter === undefined ||
      (Number.isSafeInteger(filter.categoryBits) &&
        Number.isSafeInteger(filter.maskBits) &&
        Number.isSafeInteger(filter.groupIndex)))
  );
}

export function isPhysics2DTimestepValid(dt: number): boolean {
  return Number.isFinite(dt) && dt > 0;
}

function isPhysics2DJointValid(joint: Readonly<Physics2DJoint>): boolean {
  if (
    typeof joint.kind !== 'string' ||
    joint.kind.length === 0 ||
    !Number.isSafeInteger(joint.bodyA) ||
    !Number.isSafeInteger(joint.bodyB) ||
    typeof joint.collideConnected !== 'boolean'
  ) {
    return false;
  }
  for (const key in joint) {
    const value = joint[key as keyof typeof joint];
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
  }
  return true;
}

function isRigidBody2DStateValid(body: Readonly<RigidBody2D>): boolean {
  if (
    !Number.isSafeInteger(body.index) ||
    body.index < 0 ||
    (body.type !== 'dynamic' && body.type !== 'kinematic' && body.type !== 'static') ||
    typeof body.fixedRotation !== 'boolean' ||
    typeof body.bullet !== 'boolean' ||
    typeof body.sleeping !== 'boolean' ||
    typeof body.sleepEnabled !== 'boolean' ||
    !Number.isFinite(body.sleepTimer) ||
    body.sleepTimer < 0 ||
    !Number.isFinite(body.linearDamping) ||
    body.linearDamping < 0 ||
    !Number.isFinite(body.angularDamping) ||
    body.angularDamping < 0 ||
    !Number.isFinite(body.gravityScale) ||
    !Number.isFinite(body.mass) ||
    body.mass < 0 ||
    !Number.isFinite(body.inverseMass) ||
    body.inverseMass < 0 ||
    !Number.isFinite(body.inertia) ||
    body.inertia < 0 ||
    !Number.isFinite(body.inverseInertia) ||
    body.inverseInertia < 0
  ) {
    return false;
  }
  for (const key of rigidBodyFiniteKeys) {
    if (!Number.isFinite(body[key])) return false;
  }
  for (const collider of body.colliders) {
    if (!isPhysics2DColliderStateValid(collider)) return false;
  }
  return true;
}

const rigidBodyFiniteKeys = [
  'x',
  'y',
  'angle',
  'velocityX',
  'velocityY',
  'angularVelocity',
  'forceX',
  'forceY',
  'torque',
  'centerX',
  'centerY',
] as const;
