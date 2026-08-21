import { logOnce } from '@flighthq/log/contract';
import type { Physics3DStepExplanation, Physics3DWorld } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setPhysics3DContactIntakeGuard } from './contactIntake';
import { explainPhysics3DCollision } from './explainPhysics3DCollision';
import { explainPhysics3DStep } from './explainPhysics3DStep';
import { setPhysics3DStepGuard } from './step';

export function arePhysics3DGuardsEnabled(): boolean {
  return physics3DGuardsEnabled;
}

export function disablePhysics3DGuards(): void {
  setPhysics3DStepGuard(null);
  setPhysics3DContactIntakeGuard(null);
  physics3DGuardsEnabled = false;
}

// Installs opt-in diagnostics for the two ways a world can advance without simulating.
//
// `stepPhysics3D` declines silently on any failed precondition, which is the right behaviour — a NaN
// velocity is a state a caller reaches by writing a field, and throwing would take down a frame loop over
// something inspectable. But silence and success are indistinguishable from the callsite: a world that
// stopped simulating looks exactly like a world where nothing happens to be moving. This is the seam that
// tells them apart, and applications that omit this module shed both the message text and
// `@flighthq/log`.
// The second is worse than the first and needs its own seam: a step whose preconditions all hold still
// detects NOTHING if the 3D collision registries were never populated, because the narrow phase
// dispatches through them. That world steps, integrates, and reports success while its bodies fall
// through every floor.
export function enablePhysics3DGuards(): void {
  setPhysics3DStepGuard(warnOnUnsteppablePhysics3DWorld);
  setPhysics3DContactIntakeGuard(warnOnUndetectablePhysics3DColliders);
  physics3DGuardsEnabled = true;
}

// Warns once per distinct set of undetectable collider kinds.
//
// Keyed on the kinds rather than logged per step, so a 60Hz loop says this once — and a world that later
// gains a second unsupported kind still says so.
function warnOnUndetectablePhysics3DColliders(world: Readonly<Physics3DWorld>): void {
  const explanation = explainPhysics3DCollision(world);
  if (explanation.status === 'ready') return;

  const kinds = explanation.unsupportedKinds;
  logOnce(
    `physics3d:missing-support:${kinds.join(',')}`,
    LogLevel.Warn,
    {
      kinds,
      message: `buildPhysics3DContacts: no support function is registered for collider ${kinds.length === 1 ? 'kind' : 'kinds'} ${kinds.join(', ')}, so these generate no contacts and the bodies carrying them pass through everything — call registerBuiltInCollisionSupports3D() and registerBuiltInCollisionFaceQueries3D() from @flighthq/collision, or register your own support for a vendor kind.`,
      status: explanation.status,
    },
    'physics3d',
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
function warnOnUnsteppablePhysics3DWorld(world: Readonly<Physics3DWorld>, dt: number): void {
  const explanation = explainPhysics3DStep(world, dt);
  const failing = getFailingPhysics3DPreconditions(explanation);
  if (failing.length === 0) return;

  logOnce(
    `physics3d:${explanation.status}:${failing.join(',')}`,
    LogLevel.Warn,
    {
      failing,
      message: `stepPhysics3D: the world advanced nothing because ${failing.length === 1 ? 'a precondition' : 'several preconditions'} failed (${failing.join(', ')}) — call explainPhysics3DStep(world, dt) for the same flags as data, and repair the reported fields.`,
      status: explanation.status,
    },
    'physics3d',
  );
}

// The names of the flags that are false, in the explanation's own field order so the key is stable for a
// given set of faults however they arose.
function getFailingPhysics3DPreconditions(explanation: Readonly<Physics3DStepExplanation>): string[] {
  const failing: string[] = [];
  for (const flag of physics3DPreconditionFlags) {
    if (!explanation[flag]) failing.push(flag);
  }
  return failing;
}

// Listed rather than derived by walking the object, so `status` — which is a summary and not a
// precondition — cannot be swept in, and so a flag added to the explanation is a deliberate addition here.
const physics3DPreconditionFlags = [
  'bodyStateValid',
  'contactStateValid',
  'gravityValid',
  'jointStateValid',
  'solverConfigValid',
  'substepsValid',
  'timestepValid',
  'velocityIterationsValid',
  'positionIterationsValid',
] as const;

let physics3DGuardsEnabled = false;
