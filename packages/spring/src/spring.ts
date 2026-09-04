import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { approxEqual, approxZero, TAU } from '@flighthq/math/contract';
import type { Spring, SpringConfig } from '@flighthq/types/contract';

// Add `velocity` to the spring's current velocity without changing its position. This is the
// allocation-free flick/throw control: repeated impulses compose additively, and the next analytic
// step carries their combined velocity into the motion.
export function applySpringImpulse(spring: Spring, velocity: number): void {
  spring.velocity += velocity;
}

// Allocate a scalar spring at `value` (default 0) with `velocity` (default 0). This is the only
// allocating function for scalar springs; `updateSpring`, `resetSpring`, and the settle query all
// write into or read an existing spring.
export function createSpring(value: number = 0, velocity: number = 0): Spring {
  const out = allocateEntity<Spring>();
  out.value = value;
  out.velocity = velocity;
  return finishEntity(out);
}

// Report whether `spring` has come to rest at `target`: its `value` is within `positionEpsilon` of
// the target AND its `velocity` is within `velocityEpsilon` of zero. Both conditions are required —
// a spring passing through the target at speed (an underdamped overshoot) is not settled.
//
// Settle is a property of position and velocity alone, independent of the `SpringConfig` that drove
// the motion, so no config is taken. Epsilons default to a UI-scale tolerance; pass tighter or
// looser values for the value's actual units.
export function isSpringSettled(
  spring: Readonly<Spring>,
  target: number,
  positionEpsilon: number = SPRING_SETTLE_EPSILON,
  velocityEpsilon: number = SPRING_SETTLE_EPSILON,
): boolean {
  return approxEqual(spring.value, target, positionEpsilon) && approxZero(spring.velocity, velocityEpsilon);
}

// Default position/velocity tolerance for settle detection: fine enough that motion has visually
// stopped for typical pixel/normalized values, loose enough not to wait on floating-point tails.
const SPRING_SETTLE_EPSILON = 1e-3;

// Snap `spring` to `value` with `velocity` (default 0), discarding its current motion. Use this to
// teleport a spring to a new state — e.g. initializing it at a target, or cutting a running spring
// dead. Unlike `updateSpring`, this applies no dynamics; the spring simply becomes what is passed.
export function resetSpring(spring: Spring, value: number, velocity: number = 0): void {
  spring.value = value;
  spring.velocity = velocity;
}

// Advance `spring` one step of `deltaTime` seconds toward `target` under `config`, writing the new
// `value` and `velocity` back into `spring`. This is the scalar primitive; `updateSpring2D` and
// `updateSpring3D` call it once per component. The `target` is per-step, not stored on the spring,
// so it can change every frame.
//
// The step is the closed-form analytic solution of the damped-harmonic equation
// `c'' + 2*zeta*omega*c' + omega^2*c = 0` (where `c = value - target`, `omega = 2*PI*frequency`,
// `zeta = dampingRatio`), evaluated exactly over `deltaTime`. Because it is exact rather than an
// explicit-Euler approximation, it is unconditionally stable: for a stiff spring at a large
// `deltaTime` the decaying exponentials underflow to 0 and the coefficients stay bounded, so the
// spring lands on the target with zero velocity instead of exploding. It behaves consistently across
// frame rates (it is the analytic answer at any `deltaTime`) up to the usual limit that a target
// which itself moves between steps is only sampled at step boundaries.
//
// `deltaTime <= 0` is a no-op. A non-positive `frequency` is an inert spring (no force, no change);
// `dampingRatio` is clamped to `>= 0`. Inputs are read into locals before any write, so passing a
// `spring` that also appears elsewhere is safe.
export function updateSpring(spring: Spring, target: number, config: Readonly<SpringConfig>, deltaTime: number): void {
  if (deltaTime <= 0) return;

  const frequency = config.frequency;
  if (frequency <= 0) return;

  const value = spring.value;
  const velocity = spring.velocity;

  const dampingRatio = config.dampingRatio < 0 ? 0 : config.dampingRatio;
  const omega = TAU * frequency;

  // Offset from equilibrium; the analytic solution is in terms of this displacement.
  const c0 = value - target;

  let posPosCoef: number;
  let posVelCoef: number;
  let velPosCoef: number;
  let velVelCoef: number;

  if (dampingRatio > 1 + CRITICAL_BAND) {
    // Overdamped: two distinct real roots z1 < z2 < 0 of s^2 + 2*zeta*omega*s + omega^2.
    const zb = omega * Math.sqrt(dampingRatio * dampingRatio - 1);
    const za = -omega * dampingRatio;
    const z1 = za - zb;
    const z2 = za + zb;
    const e1 = Math.exp(z1 * deltaTime);
    const e2 = Math.exp(z2 * deltaTime);
    const invDenominator = 1 / (z2 - z1);

    posPosCoef = (z2 * e1 - z1 * e2) * invDenominator;
    posVelCoef = (e2 - e1) * invDenominator;
    // z1 * z2 == omega^2 (product of the roots).
    velPosCoef = z1 * z2 * (e1 - e2) * invDenominator;
    velVelCoef = (z2 * e2 - z1 * e1) * invDenominator;
  } else if (dampingRatio < 1 - CRITICAL_BAND) {
    // Underdamped: complex roots -alpha +/- i*beta; oscillates within a decaying envelope.
    const alpha = dampingRatio * omega;
    const beta = omega * Math.sqrt(1 - dampingRatio * dampingRatio);
    const envelope = Math.exp(-alpha * deltaTime);
    const cosine = Math.cos(beta * deltaTime);
    const sine = Math.sin(beta * deltaTime);
    const invBeta = 1 / beta;

    posPosCoef = envelope * (cosine + alpha * invBeta * sine);
    posVelCoef = envelope * invBeta * sine;
    // omega^2 == alpha^2 + beta^2.
    velPosCoef = -envelope * omega * omega * invBeta * sine;
    velVelCoef = envelope * (cosine - alpha * invBeta * sine);
  } else {
    // Critically damped (dampingRatio within CRITICAL_BAND of 1): a repeated real root -omega. Using
    // the closed form here also avoids the divide-by-zero the over/under branches hit exactly at 1.
    const envelope = Math.exp(-omega * deltaTime);
    const omegaDt = omega * deltaTime;

    posPosCoef = envelope * (1 + omegaDt);
    posVelCoef = envelope * deltaTime;
    velPosCoef = -envelope * omega * omega * deltaTime;
    velVelCoef = envelope * (1 - omegaDt);
  }

  spring.value = target + posPosCoef * c0 + posVelCoef * velocity;
  spring.velocity = velPosCoef * c0 + velVelCoef * velocity;
}

// Advance an angular spring toward `target` along the shortest wrapped arc. `fullTurn` defines the
// caller's unit system — use 360 for degrees, `TAU` for radians, or 1 for turns; this function does
// no unit conversion. The chosen delta is in (-fullTurn / 2, fullTurn / 2], so exact half-turn ties
// consistently take the positive direction. The spring remains on its continuous, unwrapped branch
// to avoid position and velocity discontinuities; callers may normalize the value for presentation.
// A non-positive or non-finite `fullTurn` is an inert sentinel.
export function updateSpringAngle(
  spring: Spring,
  target: number,
  fullTurn: number,
  config: Readonly<SpringConfig>,
  deltaTime: number,
): void {
  if (!(fullTurn > 0) || !Number.isFinite(fullTurn)) return;

  const value = spring.value;
  const halfTurn = fullTurn * 0.5;
  const wrappedDelta = (((target - value) % fullTurn) + fullTurn) % fullTurn;
  const shortestDelta = wrappedDelta > halfTurn ? wrappedDelta - fullTurn : wrappedDelta;
  updateSpring(spring, value + shortestDelta, config, deltaTime);
}

// Half-width of the damping-ratio band around 1 treated as critically damped. Inside it the
// over/under-damped closed forms divide by a vanishing root separation, so the critical form is both
// numerically safer and physically indistinguishable this close to 1.
const CRITICAL_BAND = 1e-4;
