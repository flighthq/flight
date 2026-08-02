import type { CollisionShape } from './Collision';
import type { SpatialIndexBackend } from './Spatial';

// 2D rigid-body dynamics header. `@flighthq/physics2d` is the solver that sits on top of
// `@flighthq/spatial` (broadphase) and `@flighthq/collision` (narrow-phase): it owns integration and
// constraint resolution, and owns no detection of its own. Everything here is plain data stepped by an
// explicit `stepPhysics2D(world, dt)` — no implicit world object, no hidden per-frame allocation, and
// no scene-graph reference. Copying a body's transform onto a display object is the caller's job, the
// same separation `particles` keeps from `particleemitter`.
//
// 3D rigid-body dynamics is `@flighthq/physics3d`, a separate package: the dimension changes the model,
// starting here — a 2D rotational inertia is one scalar, where 3D needs an inertia tensor.

// How a body participates in the simulation. `dynamic` is integrated by forces and resolved by
// constraints. `static` never moves and behaves as infinite mass; it is the ground, the walls. A
// `kinematic` body is moved by the caller through its velocity and pushes dynamic bodies without being
// pushed back — a moving platform or a scripted door. Static and kinematic bodies both carry zero
// inverse mass, so the solver applies no impulse to them, and two of them in contact generate no
// constraint at all.
export type Physics2DBodyType = 'dynamic' | 'kinematic' | 'static';

// The surface properties a contact between two colliders is resolved with. Distinct from the particle
// system's `CollisionResponse` (whose fields are optional and which carries no density) because these
// are required inputs to a mass computation and a constraint: a missing density has no sane default
// when it is what gives a body its mass.
//
// `density` is mass per unit area, and is the only route to a body's mass — mass is derived from the
// collider geometry rather than set directly, so a body's inertia can never disagree with its shape.
// `friction` is the Coulomb coefficient and `restitution` the normal-direction bounce, both in [0,1]
// by convention though neither is clamped: a restitution above 1 adds energy, which is occasionally
// what a game wants and is never what a solver can promise to keep stable.
export interface Physics2DMaterial {
  density: number;
  friction: number;
  restitution: number;
}

// Which other colliders one collider may contact. Categories and masks use the familiar symmetric
// rule: A's mask must include B's category AND B's mask must include A's category. A matching non-zero
// group overrides both masks — positive always collides, negative never collides — for assemblies whose
// pieces must make one decision regardless of their ordinary categories.
export interface Physics2DCollisionFilter {
  categoryBits: number;
  maskBits: number;
  groupIndex: number;
}

// One piece of a body's shape. A collider carries its shape in the body's LOCAL space and a
// preallocated world-space copy that `stepPhysics2D` refreshes once per step.
//
// The two shapes exist because a `CollisionShape` is world-space by construction — a circle carries
// its centre, an oriented box its centre and rotation, and a polygon its absolute points with no
// centre or rotation field to move at all — so a body's position and angle cannot live inside the
// shape. Hence: author in local space, and let the step transform. `world` is owned by the collider
// and rewritten every step; a caller must treat it as read-only and must not retain it across steps.
//
// A `sensor` collider is tested and reported but never resolved: it produces contact events without
// producing an impulse, which is how a trigger volume is built.
export interface Physics2DCollider {
  local: CollisionShape;
  // The world-space shape, rewritten every step. Its KIND may differ from `local`'s: a rotated
  // axis-aligned box is not an axis-aligned box, so an `aabb` local shape carries an `obb` world shape.
  // The alternative — forbidding aabb colliders on rotating bodies — would make a legal authoring choice
  // depend on a runtime property, and would fail silently the first time a body was given angular
  // velocity. Local kind is what you author; world kind is what the narrow phase needs.
  world: CollisionShape;
  material: Physics2DMaterial;
  filter: Physics2DCollisionFilter;
  sensor: boolean;
}

// The mass properties derived from a body's colliders. `inertia` is the rotational inertia about the
// centre of mass — one scalar in 2D, where the axis of rotation is fixed — and (`centerX`,`centerY`)
// is that centre in the body's LOCAL space. It is rarely the body's origin, and the difference is not
// cosmetic: torque acts about the centre of mass, so a solver that rotates about the origin gives an
// L-shaped body the swing of a shape it does not have.
export interface Physics2DMassData {
  mass: number;
  inertia: number;
  centerX: number;
  centerY: number;
}

// A rigid body: the simulated entity. Position and velocity are flat fields rather than nested vector
// objects, so the integrator writes through them without dereferencing and a body array stays one
// contiguous block of plain numbers for the C/C++ port.
//
// `index` is the body's persistent identity and is assigned by the world at creation. It is not a
// convenience: it is what every pair of bodies is canonically ordered by before a contact is created,
// which is what keeps contact identity — and therefore the solver's warm-start cache — stable while
// the bodies move. Geometry cannot supply that order, because any order derived from coordinates flips
// the moment those coordinates cross. Identity survives motion; position does not.
//
// The inverse mass and inverse inertia are stored alongside the forward values because the solver
// divides by them on every constraint iteration and a static body's is exactly zero — a sentinel that
// makes "infinite mass" fall out of the same arithmetic as any other body, with no branch.
export interface RigidBody2D {
  index: number;
  type: Physics2DBodyType;

  x: number;
  y: number;
  // RADIANS, unlike the scene graph's degrees-valued `node.rotation`. This is the math layer, where
  // every trig call wants radians and a per-step conversion would be waste; the sync layer that copies
  // a body onto a display object converts at that seam, which is where the SDK converts everywhere else.
  angle: number;

  velocityX: number;
  velocityY: number;
  angularVelocity: number;

  forceX: number;
  forceY: number;
  torque: number;

  mass: number;
  inverseMass: number;
  inertia: number;
  inverseInertia: number;
  // The centre of mass, in local space, from the colliders' combined mass data.
  centerX: number;
  centerY: number;

  linearDamping: number;
  angularDamping: number;
  gravityScale: number;

  // A sleeping body is skipped by integration and by the solver: it holds its pose, spends no
  // iterations, and its contacts contribute nothing. Sleep is decided per ISLAND rather than per body,
  // because a body resting on a moving neighbour is not at rest — the island is the unit that can
  // truthfully be called still. Static bodies are never asleep or awake; they simply do not move.
  sleeping: boolean;
  // Seconds this body has been continuously below both sleep thresholds. Reset the moment it exceeds
  // either, so the timer measures an unbroken stretch of stillness rather than a total.
  sleepTimer: number;

  colliders: Physics2DCollider[];
}

// One point of a persistent contact, carrying both the geometry the solver needs and the impulses it
// converged on last step.
//
// (`x`,`y`) is the world-space contact point and (`rAX`,`rAY`)/(`rBX`,`rBY`) are the lever arms from
// each body's centre of mass to it — the vectors whose cross product with the normal is the entire
// reason a contact can produce torque. `normalImpulse` and `tangentImpulse` are the warm-start cache:
// re-applying last step's converged impulse before iterating is what lets a stack settle in a handful
// of iterations instead of visibly sinking. They are matched across steps by `featureId`, so a point
// that is no longer the same feature starts from zero rather than inheriting a stranger's force.
export interface Physics2DContactPoint {
  x: number;
  y: number;
  depth: number;
  featureId: number;

  rAX: number;
  rAY: number;
  rBX: number;
  rBY: number;

  normalImpulse: number;
  tangentImpulse: number;
  // Precomputed constraint denominators, rebuilt each step from the lever arms.
  normalMass: number;
  tangentMass: number;
  // The restitution velocity bias applied along the normal. Penetration recovery is a separate
  // position-iteration pass, so correcting overlap does not inject artificial separating velocity.
  bias: number;
}

// A persistent contact between two colliders. Persistent is the point: the record survives between
// steps so its impulses can be reused, which is why it is a stored entity rather than a per-step
// value.
//
// `bodyA` and `bodyB` are body indices, ALWAYS ordered so `bodyA < bodyB`. That ordering is an
// invariant of contact creation, not a convention a caller is asked to respect: `@flighthq/collision`
// resolves contact points on the reference shape's surface and ties toward its first argument, so
// passing the same pair the other way round moves the points and renumbers their feature ids. The
// broadphase reports pairs in an order that follows insertion history, so without this the warm-start
// cache would silently reset whenever a body was added mid-simulation.
//
// `friction` and `restitution` are the combined surface values for the pair, mixed once when the
// contact is created rather than re-derived per iteration.
export interface Physics2DContact {
  bodyA: number;
  bodyB: number;
  colliderA: number;
  colliderB: number;

  normalX: number;
  normalY: number;

  pointCount: number;
  points: Physics2DContactPoint[];

  friction: number;
  restitution: number;

  // Reset to true when the pair is found each step. A pre-solve hook may set it false to keep the
  // contact and its begin/end lifecycle while omitting every solver and island effect for this step.
  enabled: boolean;
  // Whether either collider is a sensor: the contact is reported but generates no impulse.
  sensor: boolean;
  // Whether the pair was overlapping this step. A contact that stops touching is kept for one step so
  // an end-of-contact event can be reported before it is retired.
  touching: boolean;
}

// A strict per-contact callback invoked by the explicit world step. Pre-solve runs after contact
// generation and before constraint preparation, so it may adjust friction/restitution or set
// `enabled=false` for this step. Post-solve runs after velocity iterations and exposes the accumulated
// point impulses. Sensors do not invoke either hook because they produce no constraint to solve.
export type Physics2DContactCallback = (world: Physics2DWorld, contact: Physics2DContact) => void;

export interface Physics2DContactHooks {
  preSolve: Physics2DContactCallback | null;
  postSolve: Physics2DContactCallback | null;
}

// The knobs a sequential-impulse solver is tuned by. Defaults live in `@flighthq/physics2d`; these are
// the values a caller may reasonably want to change per world, not per step.
//
// More `velocityIterations` buys accuracy in the impulse solve (stacks that do not squash); more
// `positionIterations` buys penetration recovery. `penetrationSlop` is the overlap deliberately left
// unresolved, so resting bodies stop twitching against a target of exactly zero, and
// `positionCorrection` is the fraction of the excess corrected per iteration — correcting all of it at
// once makes a deep overlap explode outward. `restitutionThreshold` is the approach speed below which
// restitution is dropped, without which a ball bounces forever at ever smaller amplitudes and never
// comes to rest.
export interface Physics2DSolverConfig {
  // Sleeping trades simulation cost for the fact that a settled stack does not need re-solving every
  // step. `allowSleeping` turns the whole mechanism off for a world that would rather burn the time
  // than risk a body that should have woken. A body counts as still while its linear speed is under
  // `sleepLinearThreshold` and its angular speed under `sleepAngularThreshold`; the island sleeps once
  // EVERY member has been still continuously for `timeToSleep` seconds. Requiring the whole island
  // prevents the visible failure where a settled crate sleeps while the crate it leans on is still
  // sliding out from under it.
  allowSleeping: boolean;
  sleepLinearThreshold: number;
  sleepAngularThreshold: number;
  timeToSleep: number;
  velocityIterations: number;
  positionIterations: number;
  penetrationSlop: number;
  positionCorrection: number;
  restitutionThreshold: number;
  warmStarting: boolean;
}

// The simulation. A world owns its bodies, its persistent contacts, and the broadphase index it keeps
// body bounds in — the index directly rather than behind a physics-specific broadphase seam, because
// `SpatialIndexBackend` is already the swap point and a seam over a seam buys no capability.
//
// `gravityX`/`gravityY` is an acceleration, scaled per body by `gravityScale`, so a balloon is one
// field rather than a special case in the integrator.
export interface Physics2DWorld {
  bodies: RigidBody2D[];
  contacts: Physics2DContact[];
  joints: Physics2DJoint[];
  // Joint solvers by kind, scoped to the world rather than module-global, so two worlds in one process
  // can register different custom joints without one seeing the other's.
  jointSolvers: Map<Physics2DJointKind, Physics2DJointSolver>;
  // This step's contact transitions, refilled by each step. A per-step output buffer, not a second
  // record of contact state: the persistent cache already knows which pairs are touching, and these are
  // read off the moments it gains and loses entries.
  events: Physics2DContactEvents;
  contactHooks: Physics2DContactHooks;
  index: SpatialIndexBackend;
  config: Physics2DSolverConfig;

  gravityX: number;
  gravityY: number;

  // Monotonic counter backing `RigidBody2D.index`, so an index is never reused by a later body and a
  // stale contact can never be revived against a different body that inherited its slot.
  nextBodyIndex: number;
}

// A joint's type identifier. A plain string, not a closed union, because joints are the family a physics
// package is most likely to be extended in: nine built-in kinds are planned, and a game with a bespoke
// constraint (a conveyor, a ragdoll limit, a rail with a custom profile) should be able to register its
// own without this package knowing. Built-in kinds take bare names; a user's take a vendor prefix
// (`acme.Conveyor`), which is what keeps the two from colliding without a registration guard.
export type Physics2DJointKind = string;

// The fields every joint carries, whatever its kind. A concrete joint is this plus its own parameters,
// and the solver registered for its kind is what knows the difference.
//
// `bodyA` and `bodyB` are body indices under the SAME canonical ordering contacts use — lower index
// first. A joint is a constraint in the same solve list as a contact, so it inherits the same obligation:
// the solve is sequential, each impulse lands on the velocities the previous one left, and an ordering
// that varied with insertion history would make the result vary with it too.
//
// The anchors are in each body's LOCAL space, so a joint keeps its attachment as the bodies move. The
// scratch fields below them are rebuilt every step from the current transforms — a joint stores where it
// is attached, never where that attachment currently is.
export interface Physics2DJoint {
  kind: Physics2DJointKind;
  bodyA: number;
  bodyB: number;

  localAnchorAX: number;
  localAnchorAY: number;
  localAnchorBX: number;
  localAnchorBY: number;

  // Whether the two bodies still collide with each other. Off by default: a pinned pair almost always
  // overlaps at the joint, and resolving that contact fights the constraint holding them together.
  collideConnected: boolean;

  // The accumulated impulses this joint converged on, reused as the next step's warm start exactly as a
  // contact's are. Their meaning is the solver's to define — a distance joint uses one scalar, a revolute
  // uses two — so they are a fixed-width block rather than per-kind fields.
  impulse0: number;
  impulse1: number;
  impulse2: number;

  // World-space lever arms from each body's centre of mass to its anchor, rebuilt per step.
  rAX: number;
  rAY: number;
  rBX: number;
  rBY: number;
}

// A distance joint: holds two anchors a fixed distance apart. The bar of a linkage when stiff, a spring
// when soft. `stiffness` and `damping` are zero for a rigid bar; giving them values turns the constraint
// into a damped spring, which is the same solve with a softened effective mass.
export interface Physics2DDistanceJoint extends Physics2DJoint {
  length: number;
  stiffness: number;
  damping: number;
}

// A revolute joint: pins two bodies at a point, leaving rotation free. A hinge, an axle, a shoulder.
// A motor drives the relative angle toward `motorSpeed` with at most `maxMotorTorque`; limits clamp the
// relative angle into [`lowerAngle`, `upperAngle`] radians.
export interface Physics2DRevoluteJoint extends Physics2DJoint {
  enableMotor: boolean;
  motorSpeed: number;
  maxMotorTorque: number;
  motorImpulse: number;
  enableLimit: boolean;
  lowerAngle: number;
  upperAngle: number;
  referenceAngle: number;
}

// A weld joint: pins the anchors together AND locks the relative angle. Rigid attachment — a crate nailed
// to a cart. Not the same as a body with two colliders: a weld can be broken at runtime, and it is solved
// rather than exact, so it flexes under enough load.
export interface Physics2DWeldJoint extends Physics2DJoint {
  referenceAngle: number;
}

// A rope joint: an inequality constraint that only acts at full extension, so the bodies move freely
// within `maxLength` and are caught at it. Distinct from a stiff distance joint, which also PUSHES the
// bodies apart when they close; a rope goes slack.
export interface Physics2DRopeJoint extends Physics2DJoint {
  maxLength: number;
}

// A prismatic joint: constrains two bodies to slide along one axis with no relative rotation. A piston,
// an elevator, a drawer. `localAxisAX`/`localAxisAY` is the slide axis in body A's local space.
export interface Physics2DPrismaticJoint extends Physics2DJoint {
  localAxisAX: number;
  localAxisAY: number;
  referenceAngle: number;
  enableMotor: boolean;
  motorSpeed: number;
  maxMotorForce: number;
  motorImpulse: number;
  enableLimit: boolean;
  lowerTranslation: number;
  upperTranslation: number;
}

// A wheel joint: constrains the anchors laterally while allowing suspension travel along body A's
// local axis. The suspension is a damped spring around `restTranslation`; zero stiffness leaves that
// axis free. The optional angular motor drives B relative to A, independently of suspension travel.
export interface Physics2DWheelJoint extends Physics2DJoint {
  localAxisAX: number;
  localAxisAY: number;
  restTranslation: number;
  stiffness: number;
  damping: number;
  enableMotor: boolean;
  motorSpeed: number;
  maxMotorTorque: number;
  motorImpulse: number;
}

// A mouse joint: drags one body toward a moving world-space target with bounded force. The odd one out —
// it constrains a body to a POINT rather than to another body, which is why it is soft by construction:
// a rigid drag would let a user inject unbounded energy by moving the cursor faster than the simulation.
export interface Physics2DMouseJoint extends Physics2DJoint {
  targetX: number;
  targetY: number;
  maxForce: number;
  stiffness: number;
  damping: number;
}

// The two halves of a joint's solve, registered together under a kind.
//
// `prepare` runs once per step, after the bodies have their current transforms, and rebuilds whatever the
// iterations need — lever arms, effective masses, bias terms. `solve` runs once per velocity iteration
// and applies its impulses immediately, because that is what makes a sequential solver converge.
//
// Both take the world so a solver can resolve body indices; neither may add or remove bodies, contacts,
// or joints, since the solve list is fixed for the duration of a step.
export interface Physics2DJointSolver {
  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void;
  solve(world: Physics2DWorld, joint: Physics2DJoint): void;
  // Whether this kind's two ends may be exchanged, and its chance to carry its own direction-bearing
  // state across the exchange. Called by addPhysics2DJoint with the ends still in their original
  // order; return true to let the generic swap of bodies and anchors proceed, false to veto it.
  //
  // It exists because the generic swap can only move what every joint has — the two body indices and
  // the two anchors. Anything a kind measures FROM bodyA TO bodyB reverses sign when the ends trade
  // places, and the registry cannot know which fields those are. A kind that has such state
  // transforms it here; a kind whose second end is not a body at all vetoes instead.
  //
  // Omit it when the kind is direction-free (a distance or rope constraint reads only the anchor
  // separation, which is symmetric), and the ends swap with no further work.
  swapEnds?(joint: Physics2DJoint): boolean;
  // Reapplies the impulses this joint converged on last step, before the iterations begin — the joint
  // half of what warmStartPhysics2DContacts does for contacts, and what the impulse block on
  // Physics2DJoint is documented to be for.
  //
  // The kind owns it for the same reason it owns swapEnds: the impulse block is deliberately untyped
  // (a distance joint means one scalar along an axis, a revolute means two linear components at the
  // anchors), so only the kind knows what its stored numbers are and how to turn them back into an
  // impulse. Called after prepare, so the current lever arms are in place.
  //
  // Omit it and the kind simply starts each step cold, which is correct but converges more slowly.
  warmStart?(world: Physics2DWorld, joint: Physics2DJoint): void;
  // Discards the accumulated impulses, so a world with warm starting switched off does not keep
  // seeding each step from a cache it has been told not to use.
  clearAccumulatedImpulses?(joint: Physics2DJoint): void;
}

// What happened to a contact this step, read off the contact cache rather than tracked alongside it.
// `began` is a pair that was not touching last step and is now; `ended` was touching and is not.
export interface Physics2DContactEvents {
  began: Physics2DContact[];
  ended: Physics2DContact[];
}
