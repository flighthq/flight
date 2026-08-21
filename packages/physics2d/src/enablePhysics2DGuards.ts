import { logOnce } from '@flighthq/log/contract';
import type {
  Physics2DJointResolutionExplanation,
  Physics2DStepExplanation,
  Physics2DWorld,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { explainPhysics2DCollision } from './explainPhysics2DCollision';
import { explainPhysics2DJoints } from './explainPhysics2DJoints';
import { explainPhysics2DStep } from './explainPhysics2DStep';
import { setPhysics2DContactIntakeGuard, setPhysics2DJointResolutionGuard, setPhysics2DStepGuard } from './step';

export function arePhysics2DGuardsEnabled(): boolean {
  return physics2DGuardsEnabled;
}

export function disablePhysics2DGuards(): void {
  setPhysics2DStepGuard(null);
  setPhysics2DJointResolutionGuard(null);
  setPhysics2DContactIntakeGuard(null);
  physics2DGuardsEnabled = false;
}

// Installs opt-in diagnostics for the two ways a 2D world can look like it is simulating when it is not.
//
// The first is a step that declines. `stepPhysics2D` returns silently on any failed precondition, which
// is the right behaviour — a NaN velocity is a state a caller reaches by writing a field, and throwing
// would take down a frame loop over something inspectable. But silence and success are indistinguishable
// from the callsite: a world that stopped simulating looks exactly like a world where nothing happens to
// be moving.
//
// The second is quieter and needs its own seam. A step whose preconditions all hold still SKIPS any joint
// whose kind has no registered solver or whose endpoints have gone missing, because the solve pass
// dispatches with `world.jointSolvers.get(joint.kind)?.prepare(...)` and an absent solver is simply an
// absent call. Everything else in the world then simulates correctly around a constraint that is not
// there: the rope does not pull, the hinge does not hold, and nothing failed. Registration is opt-in
// precisely so unused solvers tree-shake out, which makes forgetting `registerBuiltInPhysics2DJointSolvers`
// an ordinary mistake rather than an exotic one.
//
// The third is a collider the contact dispatcher has no arm for. `collideContactManifold2D` is a closed
// switch, so unlike 3D there is nothing to REGISTER and no way to forget to — but its coverage is
// narrower than the collider type allows, and a kind it does not answer for is reported as
// non-overlapping. A body carrying one falls through the floor with nothing failing anywhere.
//
// Applications that never import this module shed both the message text and `@flighthq/log`.
export function enablePhysics2DGuards(): void {
  setPhysics2DStepGuard(warnOnUnsteppablePhysics2DWorld);
  setPhysics2DJointResolutionGuard(warnOnUnresolvedPhysics2DJoints);
  setPhysics2DContactIntakeGuard(warnOnUndetectablePhysics2DColliders);
  physics2DGuardsEnabled = true;
}

// Warns once per distinct set of undetectable collider kinds.
//
// The advice differs by kind, because the two causes are not the same problem. `segment` and `point` are
// area-less by definition and carry no contact to find, so putting one on a rigid body is a modelling
// mistake with no fix in this package. A `capsule` has no pair functions YET, which is a gap rather than
// a rule — and a caller deserves to be told which of the two it has hit.
function warnOnUndetectablePhysics2DColliders(world: Readonly<Physics2DWorld>): void {
  const explanation = explainPhysics2DCollision(world);
  if (explanation.status === 'ready') return;

  const kinds = explanation.unsupportedKinds;
  const arealess = kinds.filter((kind) => kind === 'segment' || kind === 'point');
  const unimplemented = kinds.filter((kind) => kind !== 'segment' && kind !== 'point');
  const areaFix =
    arealess.length > 0
      ? ` ${arealess.join(' and ')} carr${arealess.length === 1 ? 'ies' : 'y'} no area and so no contact, and cannot be a rigid body's collider — give the body a shape with area.`
      : '';
  const gapFix =
    unimplemented.length > 0
      ? ` collideContactManifold2D has no pair functions for ${unimplemented.join(', ')} yet, so ${unimplemented.length === 1 ? 'it is' : 'they are'} usable for queries and raycasts but not as a simulated collider.`
      : '';

  logOnce(
    `physics2d:${explanation.status}:${kinds.join(',')}`,
    LogLevel.Warn,
    {
      kinds,
      message: `stepPhysics2D: collider kind${kinds.length === 1 ? '' : 's'} ${kinds.join(', ')} generate${kinds.length === 1 ? 's' : ''} no contacts, so the bodies carrying ${kinds.length === 1 ? 'it' : 'them'} pass through everything.${areaFix}${gapFix} Call explainPhysics2DCollision(world) for the same finding as data.`,
      status: explanation.status,
    },
    'physics2d',
  );
}

// The names of the flags that are false, in the explanation's own field order so the key is stable for a
// given set of faults however they arose.
function getFailingPhysics2DPreconditions(explanation: Readonly<Physics2DStepExplanation>): string[] {
  const failing: string[] = [];
  for (const flag of physics2DPreconditionFlags) {
    if (!explanation[flag]) failing.push(flag);
  }
  return failing;
}

// One `kind:status` token per unresolved joint, deduplicated and sorted.
//
// Deduplicated because a ragdoll with twelve identically unregistered joints is ONE mistake, and a list
// of twelve indices reads as twelve. Sorted so the key does not depend on the order joints were added,
// which would otherwise make the same world log twice.
function getUnresolvedPhysics2DJointFaults(explanation: Readonly<Physics2DJointResolutionExplanation>): string[] {
  const faults = new Set<string>();
  for (const joint of explanation.joints) {
    if (joint.status === 'ready') continue;
    faults.add(`${joint.kind}:${joint.status}`);
  }
  return [...faults].sort();
}

// Warns once per distinct set of unresolved joint faults.
//
// The two fault families need different advice, so the message names whichever applies rather than
// reciting a generic one: an unregistered solver is repaired by registering it, while a missing endpoint
// means the joint outlived a body and should have been removed with it.
function warnOnUnresolvedPhysics2DJoints(world: Readonly<Physics2DWorld>): void {
  const explanation = explainPhysics2DJoints(world);
  if (explanation.status === 'complete') return;

  const faults = getUnresolvedPhysics2DJointFaults(explanation);
  const unregistered = faults.some((fault) => fault.endsWith(':solver-unregistered'));
  const missing = faults.some((fault) => !fault.endsWith(':solver-unregistered'));
  const unresolvedCount = explanation.joints.length - explanation.readyCount;
  const advice = unregistered
    ? ' — an unregistered kind is never solved and its constraint simply does not exist, so call registerBuiltInPhysics2DJointSolvers(world) or registerPhysics2DJointSolver(world, kind, solver) for your own kind'
    : '';
  const endpointAdvice = missing
    ? " — a joint whose endpoint body is gone is skipped for the rest of the world's life and should be removed with the body"
    : '';

  logOnce(
    `physics2d:${explanation.status}:${faults.join(',')}`,
    LogLevel.Warn,
    {
      faults,
      message: `stepPhysics2D: ${String(unresolvedCount)} of ${String(explanation.joints.length)} joint${explanation.joints.length === 1 ? '' : 's'} ${unresolvedCount === 1 ? 'is' : 'are'} never solved (${faults.join(', ')}), and the rest of the world simulates normally around ${unresolvedCount === 1 ? 'it' : 'them'}${advice}${endpointAdvice}. Call explainPhysics2DJoints(world) for the same findings as data, per joint.`,
      status: explanation.status,
    },
    'physics2d',
  );
}

// Warns once per distinct set of failing preconditions.
//
// EVERY failing flag is reported in one message rather than the first. The step's own condition
// short-circuits, so a world with a bad timestep and a NaN velocity would otherwise surface the timestep,
// get repaired, and reveal the next fault a frame later — one round trip per fault, which is the failure
// the explain seam was built to avoid and would be pointless to reintroduce here.
//
// Keyed on the failing set, so a loop calling this at 60Hz logs once and not once per frame, while a world
// that develops a SECOND fault after the first is repaired still says so.
function warnOnUnsteppablePhysics2DWorld(world: Readonly<Physics2DWorld>, dt: number): void {
  const explanation = explainPhysics2DStep(world, dt);
  const failing = getFailingPhysics2DPreconditions(explanation);
  if (failing.length === 0) return;

  logOnce(
    `physics2d:${explanation.status}:${failing.join(',')}`,
    LogLevel.Warn,
    {
      failing,
      message: `stepPhysics2D: the world advanced nothing because ${failing.length === 1 ? 'a precondition' : 'several preconditions'} failed (${failing.join(', ')}) — call explainPhysics2DStep(world, dt) for the same flags as data, and repair the reported fields.`,
      status: explanation.status,
    },
    'physics2d',
  );
}

// Listed rather than derived by walking the object, so `status` — which is a summary and not a
// precondition — cannot be swept in, and so a flag added to the explanation is a deliberate addition here.
const physics2DPreconditionFlags = [
  'bodyStateValid',
  'contactStateValid',
  'gravityValid',
  'jointStateValid',
  'previousTimestepValid',
  'solverConfigValid',
  'timestepValid',
  'velocityIterationsValid',
  'positionIterationsValid',
] as const;

let physics2DGuardsEnabled = false;
