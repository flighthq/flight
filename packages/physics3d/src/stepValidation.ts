import type {
  Physics3DContact,
  Physics3DJoint,
  Physics3DSolverConfig,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

// The preconditions one explicit step needs to be meaningful, each asked as its own question.
//
// Separate predicates rather than one `canStep`, because they are the rows of `Physics3DStepExplanation`
// and a caller diagnosing a world that will not advance needs to know WHICH one failed. `stepPhysics3D`
// asks all of them and returns silently on any false; `explainPhysics3DStep` asks the same ones and
// reports. That is the diagnostics inversion — the step carries no messages, and the explain seam is
// separately importable so a shipping build that never asks never links it.
//
// A world that fails one of these is not an error to throw on: a NaN velocity, a zero timestep, or a
// negative iteration count is a state a caller can reach by writing a field, and a throw from inside the
// step would take down a frame loop for something the caller can inspect and repair.

export function isPhysics3DBodyStateValid(world: Readonly<Physics3DWorld>): boolean {
  if (!Number.isSafeInteger(world.nextBodyIndex) || world.nextBodyIndex < 0) return false;
  for (const body of world.bodies) {
    if (!isRigidBody3DStateValid(body) || world.bodyByIndex.get(body.index) !== body) return false;
  }
  return true;
}

export function isPhysics3DContactStateValid(world: Readonly<Physics3DWorld>): boolean {
  for (const contact of world.contacts) {
    if (!isPhysics3DContactValid(contact)) return false;
  }
  return true;
}

// Also the post-hook check: a pre-solve or post-solve callback may write contact fields, and this is what
// says whether what it wrote is still steppable.
export function isPhysics3DContactValid(contact: Readonly<Physics3DContact>): boolean {
  if (
    !Number.isSafeInteger(contact.bodyA) ||
    !Number.isSafeInteger(contact.bodyB) ||
    !Number.isSafeInteger(contact.pointCount) ||
    contact.pointCount < 0 ||
    contact.pointCount > contact.points.length ||
    !Number.isFinite(contact.normalX) ||
    !Number.isFinite(contact.normalY) ||
    !Number.isFinite(contact.normalZ) ||
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
  for (let i = 0; i < contact.pointCount; i += 1) {
    const point = contact.points[i];
    if (point === undefined) return false;
    for (const key in point) {
      const value = point[key as keyof typeof point];
      if (typeof value === 'number' && !Number.isFinite(value)) return false;
    }
  }
  return true;
}

export function isPhysics3DGravityValid(world: Readonly<Physics3DWorld>): boolean {
  return Number.isFinite(world.gravityX) && Number.isFinite(world.gravityY) && Number.isFinite(world.gravityZ);
}

export function isPhysics3DJointStateValid(world: Readonly<Physics3DWorld>): boolean {
  for (const joint of world.joints) {
    if (!isPhysics3DJointValid(joint)) return false;
  }
  return true;
}

export function isPhysics3DPositionIterationsValid(config: Readonly<Physics3DSolverConfig>): boolean {
  const iterations = config.sequentialImpulse.positionIterations;
  return Number.isSafeInteger(iterations) && iterations >= 0;
}

// The solver-independent knobs plus the sequential-impulse block. Iteration counts and `substeps` are
// asked separately, because they are the three a caller is most likely to have tuned by hand and the
// explanation names each of them.
export function isPhysics3DSolverConfigValid(config: Readonly<Physics3DSolverConfig>): boolean {
  const sequential = config.sequentialImpulse;
  return (
    typeof config.allowSleeping === 'boolean' &&
    Number.isFinite(config.sleepLinearThreshold) &&
    config.sleepLinearThreshold >= 0 &&
    Number.isFinite(config.sleepAngularThreshold) &&
    config.sleepAngularThreshold >= 0 &&
    Number.isFinite(config.timeToSleep) &&
    config.timeToSleep >= 0 &&
    typeof config.continuousCollision === 'boolean' &&
    Number.isSafeInteger(config.maxCcdSubsteps) &&
    config.maxCcdSubsteps >= 0 &&
    Number.isFinite(sequential.penetrationSlop) &&
    sequential.penetrationSlop >= 0 &&
    Number.isFinite(sequential.positionCorrection) &&
    sequential.positionCorrection >= 0 &&
    sequential.positionCorrection <= 1 &&
    Number.isFinite(sequential.restitutionThreshold) &&
    sequential.restitutionThreshold >= 0 &&
    typeof sequential.warmStarting === 'boolean'
  );
}

// At least one, because `substeps` divides the timestep and the step runs the loop that many times. Zero
// would advance nothing while reporting a completed step, which is worse than declining to step at all.
export function isPhysics3DSubstepsValid(config: Readonly<Physics3DSolverConfig>): boolean {
  return Number.isSafeInteger(config.substeps) && config.substeps >= 1;
}

export function isPhysics3DTimestepValid(dt: number): boolean {
  return Number.isFinite(dt) && dt > 0;
}

export function isPhysics3DVelocityIterationsValid(config: Readonly<Physics3DSolverConfig>): boolean {
  const iterations = config.sequentialImpulse.velocityIterations;
  return Number.isSafeInteger(iterations) && iterations >= 0;
}

function isPhysics3DJointValid(joint: Readonly<Physics3DJoint>): boolean {
  if (
    typeof joint.kind !== 'string' ||
    joint.kind.length === 0 ||
    !Number.isSafeInteger(joint.bodyA) ||
    !Number.isSafeInteger(joint.bodyB) ||
    typeof joint.collideConnected !== 'boolean'
  ) {
    return false;
  }
  // Every numeric field, whatever the kind added — a limit, a motor speed, a frame component. Walking the
  // object rather than a fixed key list is what makes this cover a user's own joint kind, which is the
  // point of an open registry.
  //
  // Except the fields where INFINITY IS THE VALUE, not a symptom. A `breakForce` of infinity is a joint
  // that never breaks and a `maxLength` of infinity is a rope with no far stop, and both are the natural
  // defaults — so a blanket finiteness walk declares every ordinary joint invalid and the world declines
  // to step at all. That failure is silent by design (an invalid step is skipped, not thrown), so it
  // presents as a motor that does not turn and contacts that never fire, with nothing pointing at the
  // joint. Adding a field whose unset state is "no bound" means adding it here too.
  for (const key in joint) {
    if (UNBOUNDED_JOINT_FIELDS.has(key)) continue;
    const value = joint[key as keyof typeof joint];
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
  }
  return true;
}

function isRigidBody3DStateValid(body: Readonly<RigidBody3D>): boolean {
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
    body.inverseMass < 0
  ) {
    return false;
  }
  for (const key of rigidBody3DFiniteKeys) {
    if (!Number.isFinite(body[key])) return false;
  }
  return true;
}

// Every field that has to be a real number for the step to mean anything: the pose, the velocities, the
// accumulators, the centre of mass, and all three inertia tensors. The world tensor is derived and is
// included anyway — it is what every constraint row multiplies by, so a NaN there reaches both bodies of
// every contact and joint within one substep.
const rigidBody3DFiniteKeys = [
  'x',
  'y',
  'z',
  'orientationX',
  'orientationY',
  'orientationZ',
  'orientationW',
  'velocityX',
  'velocityY',
  'velocityZ',
  'angularVelocityX',
  'angularVelocityY',
  'angularVelocityZ',
  'forceX',
  'forceY',
  'forceZ',
  'torqueX',
  'torqueY',
  'torqueZ',
  'centerX',
  'centerY',
  'centerZ',
  'inertiaXX',
  'inertiaYY',
  'inertiaZZ',
  'inertiaXY',
  'inertiaXZ',
  'inertiaYZ',
  'inverseInertiaXX',
  'inverseInertiaYY',
  'inverseInertiaZZ',
  'inverseInertiaXY',
  'inverseInertiaXZ',
  'inverseInertiaYZ',
  'inverseInertiaWorldXX',
  'inverseInertiaWorldYY',
  'inverseInertiaWorldZZ',
  'inverseInertiaWorldXY',
  'inverseInertiaWorldXZ',
  'inverseInertiaWorldYZ',
] as const;

// Joint fields whose infinite value is meaningful rather than corrupt: a threshold that is never reached
// and a bound that never stops anything.
const UNBOUNDED_JOINT_FIELDS = new Set(['breakForce', 'breakTorque', 'maxLength']);
