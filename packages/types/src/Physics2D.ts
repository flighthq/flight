import type { CollisionBuiltInShape2D } from './Collision';
import type { Entity } from './Entity';
import type { SpatialIndexBackend2D } from './Spatial';

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
// The two shapes exist because a collision shape is world-space by construction — a circle carries
// its centre, an oriented box its centre and rotation, and a polygon its absolute points with no
// centre or rotation field to move at all — so a body's position and angle cannot live inside the
// shape. Hence: author in local space, and let the step transform. `world` is owned by the collider
// and rewritten every step; a caller must treat it as read-only and must not retain it across steps.
//
// A `sensor` collider is tested and reported but never resolved: it produces contact events without
// producing an impulse, which is how a trigger volume is built. After mutating `local`, `material`,
// `filter`, or `sensor`, call `invalidatePhysics2DCollider` so the world can rebuild all derived state.
// Built-in shapes only, and that is a real bound rather than an oversight: this package CLONES a
// collider's shape, transforms it local-to-world by kind, validates its fields, and generates contacts
// for it — none of which a vendor kind can answer, because only the support function registered for that
// kind knows what its parameters mean. A vendor collider reaches `testCollision2D` through the
// registries; it does not become a rigid body here.
export interface Physics2DCollider extends Entity {
  local: CollisionBuiltInShape2D;
  // The world-space shape, rewritten every step. Its KIND may differ from `local`'s: a rotated
  // axis-aligned box is not an axis-aligned box, so an `aabb` local shape carries an `obb` world shape.
  // The alternative — forbidding aabb colliders on rotating bodies — would make a legal authoring choice
  // depend on a runtime property, and would fail silently the first time a body was given angular
  // velocity. Local kind is what you author; world kind is what the narrow phase needs.
  world: CollisionBuiltInShape2D;
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
export interface RigidBody2D extends Entity {
  index: number;
  // Once inserted, change participation through `setPhysics2DBodyType` so mass and constraints follow.
  type: Physics2DBodyType;

  // Once inserted, teleport through `setPhysics2DBodyTransform` so bounds and caches follow.
  x: number;
  y: number;
  // RADIANS, unlike the scene graph's degrees-valued `node.rotation`. This is the math layer, where
  // every trig call wants radians and a per-step conversion would be waste; the sync layer that copies
  // a body onto a display object converts at that seam, which is where the SDK converts everywhere else.
  angle: number;

  velocityX: number;
  velocityY: number;
  angularVelocity: number;

  // Prefer the apply-force/torque helpers: they reject unsupported bodies and wake accepted work.
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
  // A fixed-rotation dynamic body retains translational mass but exposes zero inverse inertia to every
  // contact and joint equation. Change this through setPhysics2DBodyFixedRotation after insertion.
  fixedRotation: boolean;
  // Opts a dynamic body into continuous collision detection for fast translation or rotation. The
  // ordinary discrete path remains the default; change this through setPhysics2DBodyBullet after insertion.
  bullet: boolean;

  // A sleeping body is skipped by integration and by the solver: it holds its pose, spends no
  // iterations, and its contacts contribute nothing. Sleep is decided per ISLAND rather than per body,
  // because a body resting on a moving neighbour is not at rest — the island is the unit that can
  // truthfully be called still. Static bodies are never asleep or awake; they simply do not move.
  sleeping: boolean;
  // Per-body opt-out from world sleeping. A disabled member keeps its whole connected island awake,
  // because constraints can transmit its continuing motion or external control to every neighbour.
  sleepEnabled: boolean;
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
// `enabled=false` for this step. Post-solve runs once the step has committed and exposes the accumulated
// point impulses. A post-solve exception therefore cannot leave integration or force cleanup half-done.
// World lifecycle and body-action helpers reject calls from either hook: contact fields are the hook's
// sole mutation surface. Sensors do not invoke either hook because they produce no constraint to solve.
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
  // Bullet CCD resolves at most this many chronological impacts per world step before advancing the
  // remaining time discretely. This hard bound keeps adversarial pinball scenes deterministic in cost.
  continuousCollision: boolean;
  maxCcdSubsteps: number;
  // Maximum angular samples used to bracket one swept rotational impact. Zero keeps linear CCD only;
  // the bound makes even adversarial multi-revolution steps deterministic in cost.
  maxCcdRotationSubsteps: number;
}

// Pure diagnosis of whether one explicit step can run. Individual flags keep simultaneous faults
// visible; `status` is the stable summary for callers that need only a ready/not-ready branch.
export interface Physics2DStepExplanation {
  readonly bodyStateValid: boolean;
  readonly contactStateValid: boolean;
  readonly gravityValid: boolean;
  readonly jointStateValid: boolean;
  readonly previousTimestepValid: boolean;
  readonly solverConfigValid: boolean;
  readonly timestepValid: boolean;
  readonly velocityIterationsValid: boolean;
  readonly positionIterationsValid: boolean;
  readonly status: 'invalid-step' | 'ready';
}

// The simulation. A world owns its bodies, its persistent contacts, and the broadphase index it keeps
// body bounds in — the index directly rather than behind a physics-specific broadphase seam, because
// `SpatialIndexBackend2D` is already the swap point and a seam over a seam buys no capability.
//
// `gravityX`/`gravityY` is an acceleration, scaled per body by `gravityScale`, so a balloon is one
// field rather than a special case in the integrator.
export interface Physics2DWorld extends Entity {
  // Version of the serializable physics fields on this record. Runtime-owned maps, solver registries,
  // and the spatial index are reconstructed by the caller's format layer; hydratePhysics2DWorld upgrades
  // older reconstructed records before they enter the explicit step path.
  version: number;
  bodies: RigidBody2D[];
  // Persistent identity lookup kept in lockstep with `bodies` by the world lifecycle helpers. Contacts
  // and joints resolve this map inside solver loops, so body identity lookup does not scale with the
  // number of bodies in the world.
  bodyByIndex: Map<number, RigidBody2D>;
  contacts: Physics2DContact[];
  joints: Physics2DJoint[];
  // Joint solvers by kind, scoped to the world rather than module-global, so two worlds in one process
  // can register different custom joints without one seeing the other's.
  jointSolvers: Map<Physics2DJointKind, Physics2DJointSolver>;
  // Active two-body joints with `collideConnected=false`, indexed by canonical body pair. The nested
  // value is a reference count so removing one of several suppressing joints cannot re-enable the pair.
  jointCollisionSuppressions: Map<number, Map<number, number>>;
  // This step's contact transitions, refilled by each step. A per-step output buffer, not a second
  // record of contact state: the persistent cache already knows which pairs are touching, and these are
  // read off the moments it gains and loses entries.
  events: Physics2DContactEvents;
  jointEvents: Physics2DJointEvents;
  contactHooks: Physics2DContactHooks;
  index: SpatialIndexBackend2D;
  config: Physics2DSolverConfig;

  // Reusable union-find and reduction scratch for sleeping islands. These maps are allocated with the
  // world and cleared in place; keeping them on the plain world record makes the no-per-step-allocation
  // contract explicit and maps directly to owned scratch tables in the native port.
  islandParents: Map<number, number>;
  islandSleepTimers: Map<number, number>;

  // Deterministic, flattened solve-island workspace. The builder refills these arrays in place after
  // sleep has resolved the active constraint graph. Each island owns contiguous slices of the body,
  // contact, and joint index arrays, so the solver never scans unrelated or sleeping constraints.
  solveIslandByRoot: Map<number, number>;
  solveIslandRoots: number[];
  solveIslandBodyStarts: number[];
  solveIslandBodyCounts: number[];
  solveIslandContactStarts: number[];
  solveIslandContactCounts: number[];
  solveIslandJointStarts: number[];
  solveIslandJointCounts: number[];
  solveIslandBodyIndices: number[];
  solveIslandContactIndices: number[];
  solveIslandJointIndices: number[];
  solveIslandCursors: number[];

  gravityX: number;
  gravityY: number;

  // The last successfully completed step, used to express cached impulses in the next step's time
  // interval. Zero means the world has not completed a step yet.
  previousTimestep: number;

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
export interface Physics2DJoint extends Entity {
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

  // The load this joint fails at, compared each step against what it actually applied — the force and
  // couple `writePhysics2DJointReaction` reports. Exceeding either one breaks the joint: the step
  // removes it from the world and records it in `world.jointEvents.broke` with the load that did it.
  //
  // `Infinity` means unbreakable, and is the default. It reads as what it is where a flag plus a
  // threshold would need two fields kept consistent with each other, and where a magic -1 would need
  // explaining. It is also the ONE place a joint may hold a non-finite number: the step's validator
  // rejects every other non-finite field, and admits these two by name.
  //
  // The two are independent rather than combined into one scalar, because a joint can fail either way
  // and the two are not comparable — a weld holding a heavy sign may be nowhere near its shear limit
  // while the wind twists it apart.
  breakForce: number;
  breakTorque: number;
}

// A joint that broke this step, kept with the load that broke it so a caller can scale what it does
// about it. The `joint` is the caller's own object, already removed from the world; re-adding it with
// `addPhysics2DJoint` is a legitimate way to repair one.
export interface Physics2DBrokenJoint {
  joint: Physics2DJoint;
  forceX: number;
  forceY: number;
  torque: number;
}

// What happened to the world's joints this step. Separate from `Physics2DContactEvents` rather than
// folded into it because a contact's life is a pairing the solver discovers, while a joint's is
// authored — the two are read by different code for different reasons.
export interface Physics2DJointEvents {
  broke: Physics2DBrokenJoint[];
}

// A distance joint: holds two anchors a fixed distance apart. Zero `frequencyHz` makes a rigid bar;
// positive frequency turns the constraint into a spring, and `dampingRatio` controls its decay where
// zero is undamped and one is critically damped. These are authoring units, not force coefficients.
export interface Physics2DDistanceJoint extends Physics2DJoint {
  length: number;
  frequencyHz: number;
  dampingRatio: number;
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
  // A COMPLIANT limit: once the bound is crossed, the stop pushes back like a spring of
  // `limitFrequencyHz` and `limitDampingRatio` instead of arresting the coordinate outright. What a
  // ragdoll wants at the end of a joint's range and a suspension wants at the end of its travel.
  //
  // The stop stays ONE-SIDED whichever it is: softening changes how hard the row resists being crossed,
  // never whether it may pull the coordinate back the other way. A spring that could pull would be a
  // rest length, which is the distance joint's job.
  //
  // Both parameters are ignored unless `enableLimitSpring` is true and the frequency is positive, so a
  // joint that never sets them behaves exactly as the hard stop it replaced.
  enableLimitSpring: boolean;
  limitFrequencyHz: number;
  limitDampingRatio: number;
}

// A weld joint: pins the anchors together AND locks the relative angle. Rigid attachment — a crate nailed
// to a cart. Not the same as a body with two colliders: a weld is solved rather than exact, so it flexes
// under enough load, and being a joint it carries `breakForce`/`breakTorque` and can fail outright. It is
// the kind those two thresholds fit best, because it is the only built-in that resists both ways at once.
export interface Physics2DWeldJoint extends Physics2DJoint {
  referenceAngle: number;
}

// A rope joint: an inequality constraint that only acts at full extension, so the bodies move freely
// within `maxLength` and are caught at it. Distinct from a stiff distance joint, which also PUSHES the
// bodies apart when they close; a rope goes slack.
export interface Physics2DRopeJoint extends Physics2DJoint {
  maxLength: number;
}

// A pulley joint couples each body's anchor distance from a fixed world-space ground anchor:
// `lengthA + ratio * lengthB = constant`. The ground absorbs the net reaction, so unlike an ordinary
// two-body joint its impulses are not equal and opposite when `ratio` differs from one.
export interface Physics2DPulleyJoint extends Physics2DJoint {
  groundAnchorAX: number;
  groundAnchorAY: number;
  groundAnchorBX: number;
  groundAnchorBY: number;
  ratio: number;
  constant: number;
}

export type Physics2DGearCoordinateKind = 'angular' | 'linear';

// A gear joint couples one world-referenced degree of freedom from each body:
// `coordinateA + ratio * coordinateB = constant`. An angular coordinate is the body's angle; a linear
// coordinate is its anchor projected onto the corresponding fixed world-space axis. Combining the two
// gives ordinary gears, linked sliders, and rack-and-pinion constraints without retaining references to
// other joints or introducing a four-body entity into the plain-data world model.
export interface Physics2DGearJoint extends Physics2DJoint {
  coordinateA: Physics2DGearCoordinateKind;
  coordinateB: Physics2DGearCoordinateKind;
  axisAX: number;
  axisAY: number;
  axisBX: number;
  axisBY: number;
  ratio: number;
  constant: number;
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
  // A COMPLIANT limit: once the bound is crossed, the stop pushes back like a spring of
  // `limitFrequencyHz` and `limitDampingRatio` instead of arresting the coordinate outright. What a
  // ragdoll wants at the end of a joint's range and a suspension wants at the end of its travel.
  //
  // The stop stays ONE-SIDED whichever it is: softening changes how hard the row resists being crossed,
  // never whether it may pull the coordinate back the other way. A spring that could pull would be a
  // rest length, which is the distance joint's job.
  //
  // Both parameters are ignored unless `enableLimitSpring` is true and the frequency is positive, so a
  // joint that never sets them behaves exactly as the hard stop it replaced.
  enableLimitSpring: boolean;
  limitFrequencyHz: number;
  limitDampingRatio: number;
}

// A wheel joint: constrains the anchors laterally while allowing suspension travel along body A's
// local axis. The suspension is a damped spring around `restTranslation`; zero `frequencyHz` leaves that
// axis free and `dampingRatio` controls the spring's decay. The optional angular motor drives B relative
// to A, independently of suspension travel.
export interface Physics2DWheelJoint extends Physics2DJoint {
  localAxisAX: number;
  localAxisAY: number;
  restTranslation: number;
  frequencyHz: number;
  dampingRatio: number;
  enableMotor: boolean;
  motorSpeed: number;
  maxMotorTorque: number;
  motorImpulse: number;
}

// A mouse joint: drags one body toward a moving world-space target with bounded force. The odd one out —
// it constrains a body to a POINT rather than to another body, which is why it is soft by construction:
// a rigid drag would let a user inject unbounded energy by moving the cursor faster than the simulation.
// `frequencyHz` is the response frequency and `dampingRatio` is its dimensionless decay ratio.
export interface Physics2DMouseJoint extends Physics2DJoint {
  targetX: number;
  targetY: number;
  maxForce: number;
  frequencyHz: number;
  dampingRatio: number;
}

// Authoring inputs for a two-body joint. Factories accept the semantic state a caller owns and fill
// the solver cache themselves; impulse and world-space lever-arm fields deliberately do not appear
// here. Anchors default to each body's local origin and connected bodies do not collide by default.
export interface Physics2DJointOptions {
  bodyA: number;
  bodyB: number;
  localAnchorAX?: number;
  localAnchorAY?: number;
  localAnchorBX?: number;
  localAnchorBY?: number;
  collideConnected?: boolean;
  // Both default to `Infinity` — unbreakable.
  breakForce?: number;
  breakTorque?: number;
}

export interface Physics2DDistanceJointOptions extends Physics2DJointOptions {
  length: number;
  frequencyHz?: number;
  dampingRatio?: number;
}

export interface Physics2DRevoluteJointOptions extends Physics2DJointOptions {
  enableMotor?: boolean;
  motorSpeed?: number;
  maxMotorTorque?: number;
  enableLimit?: boolean;
  lowerAngle?: number;
  upperAngle?: number;
  referenceAngle?: number;
  enableLimitSpring?: boolean;
  limitFrequencyHz?: number;
  limitDampingRatio?: number;
}

export interface Physics2DWeldJointOptions extends Physics2DJointOptions {
  referenceAngle?: number;
}

export interface Physics2DRopeJointOptions extends Physics2DJointOptions {
  maxLength: number;
}

export interface Physics2DPulleyJointOptions extends Physics2DJointOptions {
  groundAnchorAX: number;
  groundAnchorAY: number;
  groundAnchorBX: number;
  groundAnchorBY: number;
  constant: number;
  ratio?: number;
}

export interface Physics2DGearJointOptions extends Physics2DJointOptions {
  coordinateA: Physics2DGearCoordinateKind;
  coordinateB: Physics2DGearCoordinateKind;
  constant: number;
  axisAX?: number;
  axisAY?: number;
  axisBX?: number;
  axisBY?: number;
  ratio?: number;
}

export interface Physics2DPrismaticJointOptions extends Physics2DJointOptions {
  localAxisAX?: number;
  localAxisAY?: number;
  referenceAngle?: number;
  enableMotor?: boolean;
  motorSpeed?: number;
  maxMotorForce?: number;
  enableLimit?: boolean;
  lowerTranslation?: number;
  upperTranslation?: number;
  enableLimitSpring?: boolean;
  limitFrequencyHz?: number;
  limitDampingRatio?: number;
}

export interface Physics2DWheelJointOptions extends Physics2DJointOptions {
  localAxisAX?: number;
  localAxisAY?: number;
  restTranslation?: number;
  frequencyHz?: number;
  dampingRatio?: number;
  enableMotor?: boolean;
  motorSpeed?: number;
  maxMotorTorque?: number;
}

// A mouse joint has one body and one world-space target, so its authoring shape does not expose the
// dummy second body endpoint required by the generic solver record.
export interface Physics2DMouseJointOptions {
  body: number;
  targetX: number;
  targetY: number;
  maxForce: number;
  localAnchorX?: number;
  localAnchorY?: number;
  frequencyHz?: number;
  dampingRatio?: number;
  // Both default to `Infinity` — unbreakable. A mouse joint's `maxForce` CLAMPS what it applies;
  // these destroy it instead, which is a different thing to want.
  breakForce?: number;
  breakTorque?: number;
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
  // Whether bodyA participates in this kind's constraint. Omit for the ordinary two-body case. A
  // one-body kind sets false so world services do not resolve, wake, remove, island-connect, or suppress
  // collisions through a placeholder endpoint the solver never reads.
  usesBodyA?: boolean;
  // Whether this constraint represents continuing external control and therefore keeps its participating
  // non-static bodies awake. A mouse drag is the canonical case: its target may move through bare data
  // assignment at any time, so allowing the dragged body to sleep would make later target writes inert.
  keepsBodiesAwake?: boolean;
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
  // Scales kind-specific impulse accumulators when the caller changes timestep. The common
  // `impulse0..2` block is scaled by the step itself; a motor or another extra accumulator belongs here.
  scaleAccumulatedImpulses?(joint: Physics2DJoint, timestepRatio: number): void;
  // Discards the accumulated impulses, so a world with warm starting switched off does not keep
  // seeding each step from a cache it has been told not to use.
  clearAccumulatedImpulses?(joint: Physics2DJoint): void;
  // Converts this kind's converged accumulators into the force and couple it applied to body B, scaling
  // by `inverseTimestep` to turn impulses into forces. Reached through writePhysics2DJointReaction.
  //
  // The kind owns it for the same reason it owns warmStart: the impulse block is deliberately untyped,
  // so only the kind knows whether `impulse0` is a scalar along an axis, a world-x component, or an
  // angular impulse — and only the kind knows which of its per-step state slots carry the axes needed to
  // put a scalar back into world space.
  //
  // Omitting it is a real answer, not an oversight, and writePhysics2DJointReaction returns false for a
  // kind that does: a gear joint couples two scalar coordinates that may not even have the same units,
  // so there is no single force it applies anywhere.
  writeReaction?(
    world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean;
}

// What happened to a contact this step, read off the contact cache rather than tracked alongside it.
// `began` is a pair that was not touching last step and is now; `ended` was touching and is not.
export interface Physics2DContactEvents {
  began: Physics2DContact[];
  ended: Physics2DContact[];
}

// One exact collider hit from a world query. References point at the world's existing plain-data
// records; the query allocates neither a body nor a collider and `colliderIndex` preserves the stable
// route back through `body.colliders` when a caller needs to retain an identity instead of a reference.
export interface Physics2DQueryHit {
  body: RigidBody2D;
  collider: Physics2DCollider;
  colliderIndex: number;
}

// Query output retains its high-water storage, following the debug-geometry buffer convention. Only
// entries below `hitCount` belong to the latest query.
export interface Physics2DQueryResult extends Entity {
  hits: Physics2DQueryHit[];
  hitCount: number;
}

// Reusable, callback-free selection applied consistently by point, ray, and region queries. The bit
// masks select colliders whose corresponding authored filter field shares at least one bit; body and
// sensor flags then select participation. Query filtering does not mutate or wake simulation state.
export interface Physics2DQueryFilter {
  categoryBits: number;
  maskBits: number;
  includeSensors: boolean;
  includeDynamic: boolean;
  includeKinematic: boolean;
  includeStatic: boolean;
}

export interface Physics2DRayHit extends Physics2DQueryHit {
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

// Ray output follows the same high-water convention as point and region queries. Hits below
// `hitCount` are ordered by fraction, then persistent body identity and collider index.
export interface Physics2DRayResult extends Entity {
  hits: Physics2DRayHit[];
  hitCount: number;
}

// Where a shape swept along a displacement first touches the world, or that it touched nothing.
//
// `hit` false leaves every other field zeroed and means the shape swept its whole displacement freely.
// `fraction` is on the same normalized [0,1] interval as `CollisionTimeOfImpact2D` — the displacement
// vector IS the sweep, so 0.25 means a quarter of the way along it, and there is no separate distance to
// reconcile against the direction's length.
//
// TRANSLATIONAL. The shape is carried along the displacement without turning, and a rotating cast is a
// different query rather than a parameter this one is missing: a rotating convex shape sweeps a region
// no convex primitive describes, so it is found by substepping rather than in closed form. The step's
// own continuous collision does sweep rotation, under `maxCcdRotationSubsteps`; this query does not.
//
// Only the FIRST hit is reported, where the ray queries report all of them. That is not a reduced version
// of the same feature: a ray passes THROUGH a surface and keeps going, so "the hits along it" is well
// defined, while a swept shape STOPS at first contact and everything past that point is a position it
// never reached. A caller wanting what lies beyond resolves the contact and casts again.
//
// A shape that ALREADY overlaps something at the start is a hit at fraction 0, carrying that overlap's
// contact normal. It is not a miss and not an error: "can I move from here" has the honest answer "you
// are not free where you are", and a character controller depends on being told so rather than being
// handed a clear path out of a wall.
//
// `body` and `collider` are null exactly when `hit` is false. They are references rather than indices,
// matching the ray hits, so a caller acts on what it found without a second lookup.
export interface Physics2DShapeCastResult extends Entity {
  body: RigidBody2D | null;
  collider: Physics2DCollider | null;
  colliderIndex: number;
  hit: boolean;
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

// Which collider kinds in a world produce no contacts, because the 2D contact dispatcher has no arm for
// them. A body carrying one of these falls through everything with nothing failing.
//
// The list is of KINDS rather than of colliders: a level with four hundred capsules is one mistake, and
// four hundred indices read as four hundred.
export interface Physics2DCollisionExplanation {
  readonly unsupportedKinds: readonly string[];
  readonly status: 'missing-contact-support' | 'ready';
}

export type Physics2DJointResolutionStatus =
  | 'bodies-missing'
  | 'body-a-missing'
  | 'body-b-missing'
  | 'ready'
  | 'solver-unregistered';

// Plain-data diagnosis of whether one stored joint can reach its solver. The individual booleans keep
// simultaneous faults visible even though `status` provides one stable primary classification.
export interface Physics2DJointResolution {
  readonly jointIndex: number;
  readonly kind: Physics2DJointKind;
  readonly bodyA: number;
  readonly bodyB: number;
  readonly bodyAFound: boolean;
  readonly bodyAUsed: boolean;
  readonly bodyBFound: boolean;
  readonly solverRegistered: boolean;
  readonly status: Physics2DJointResolutionStatus;
}

export interface Physics2DJointResolutionExplanation {
  readonly joints: readonly Readonly<Physics2DJointResolution>[];
  readonly readyCount: number;
  readonly status: 'complete' | 'unresolved-joints';
}

// What a joint is doing to body B, as a world-space force at body B's anchor plus a scalar couple.
//
// ON BODY B, not on body A and not "in the joint". A constraint acts equally and oppositely on its two
// ends, so one of them has to be named or the sign means nothing; B is the convention because a joint is
// read as attaching B to A. Negate for body A's side.
//
// The split between `forceX`/`forceY` and `torque` is the split between a force acting AT the anchor and
// a couple acting about it. A distance joint pulls along its axis and twists nothing, so its torque is
// zero even though the pull plainly rotates a body it is attached to off-centre — that rotation is
// `r x F` from the anchor force, which the caller already has, and counting it twice would make the pair
// unusable for anything. A revolute joint is the mirror image: it holds two anchors together with a pure
// force and adds a torque only when its motor or its limits are engaged.
//
// These are FORCES, already divided by the timestep, not the impulses the solver accumulates. A force is
// what a breakable joint's threshold is authored in and what a reader compares against a weight.
export interface Physics2DJointReaction extends Entity {
  forceX: number;
  forceY: number;
  torque: number;
}

// The diagnostics seam consulted only when `stepPhysics2D` declines to advance the world. Installed by
// `enablePhysics2DGuards` and null otherwise, which is what keeps the message text and `@flighthq/log`
// out of a build that never asks for them.
export type Physics2DStepGuard = (world: Readonly<Physics2DWorld>, dt: number) => void;

// The diagnostics seam consulted once per successful step, before contacts are built. Installed by
// `enablePhysics2DGuards` and null otherwise.
export type Physics2DContactIntakeGuard = (world: Readonly<Physics2DWorld>) => void;

// The diagnostics seam consulted once per SUCCESSFUL step, before the joint solvers are prepared.
// Installed by `enablePhysics2DGuards` and null otherwise.
//
// Deliberately separate from `Physics2DStepGuard` rather than folded into it, because the two describe
// opposite situations. A declined step advanced nothing and says so once. An unresolved joint is worse
// disguised: the step succeeds, the bodies move, and only that one constraint is quietly absent — a rope
// that does not pull, a hinge that does not hold — with no failure anywhere for a caller to notice.
export type Physics2DJointResolutionGuard = (world: Readonly<Physics2DWorld>) => void;

export type Physics2DDebugFeature = 'center-of-mass' | 'collider' | 'contact-normal' | 'joint';

// Renderer-neutral output from a physics debug query. `bodyA`/`bodyB` retain the source identities so a
// renderer can style or inspect a primitive without geometry knowing anything about colors, cameras, or
// a graphics backend. `bodyB` is -1 for a primitive sourced from one body.
export interface Physics2DDebugLine {
  feature: Physics2DDebugFeature;
  bodyA: number;
  bodyB: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Physics2DDebugCircle {
  feature: Physics2DDebugFeature;
  bodyA: number;
  bodyB: number;
  x: number;
  y: number;
  radius: number;
}

// Arrays retain their high-water capacity; only entries below the corresponding count are live. That
// lets a caller keep one buffer and refill it every frame without allocating as the scene fluctuates.
export interface Physics2DDebugGeometry extends Entity {
  lines: Physics2DDebugLine[];
  lineCount: number;
  circles: Physics2DDebugCircle[];
  circleCount: number;
}

export interface Physics2DDebugGeometryOptions {
  drawCentersOfMass: boolean;
  drawColliders: boolean;
  drawContacts: boolean;
  drawJoints: boolean;
  centerOfMassRadius: number;
  contactNormalLength: number;
  pointRadius: number;
}
