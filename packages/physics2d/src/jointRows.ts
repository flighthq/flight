// Derives the three numbers a SOFT constraint row needs from the motion a caller described, writing
// `[mass, biasFactor, gamma]`.
//
// A frequency and a damping ratio describe the motion wanted; stiffness and damping are what the solver
// needs, and converting between them requires the mass being moved. Deriving them here, per-step and
// per-pair, is what makes a 2 Hz spring oscillate at 2 Hz whatever it is attached to — an authored
// stiffness would change frequency the moment either body's mass did.
//
// `mass` is the row's EFFECTIVE MASS, not its reciprocal. The distinction is the whole reason this
// function exists rather than being written out at each spring: a solver's row denominator is naturally
// an INVERSE mass (a sum of `inverseMass` and `inverseInertia` terms), and passing that sum in here
// unchanged is a silent defect rather than a visible one. Mass cancels out of `biasFactor` — the
// returned factor is `angular^2 / (2 * dampingRatio * angular + dt * angular^2)` however it is derived —
// so the authored frequency looks correct in a single-mass test and only the damping and the softness
// come out wrong, by the square of the mass ratio, whenever the two bodies are not unit-mass.
//
// `biasFactor` is returned in the position a hard row's own bias factor occupies, so a row solves
// identically either way and the only difference between a stop and a spring is which three numbers it
// was handed. It is a FACTOR: callers multiply it by their own constraint error.
//
// `hardBiasFactor` is what to fall back to when the spring cannot be computed, and it is a PARAMETER
// rather than a constant because callers legitimately disagree about it: a two-sided rest row corrects
// at `BAUMGARTE / dt`, while a one-sided limit row corrects fully at `1 / dt`. Baking either in would
// silently change the other's hard behaviour the first time it took this path.
//
// Compliance adds to the INVERSE mass, which is why the returned mass is not a scaled version of the
// input: softening makes a constraint easier to violate, and that is an addition on the reciprocal side.
// A non-positive frequency or timestep returns the HARD parameters, so "spring enabled with no
// frequency set" degrades to the stop it replaced rather than to a constraint that does nothing.
//
// The derivation is dimension-free and its 3D twin is `writePhysics3DSoftRowParameters`. They are
// written out separately because `@flighthq/physics2d` does not depend on `@flighthq/physics3d` and must
// not start: a 2D game would then carry a 3D solver for fifteen lines of scalar algebra.
export function writePhysics2DSoftRowParameters(
  mass: number,
  frequencyHz: number,
  dampingRatio: number,
  dt: number,
  hardBiasFactor: number,
  out: number[],
): void {
  if (!(frequencyHz > 0) || !(dt > 0)) {
    out[0] = mass;
    out[1] = hardBiasFactor;
    out[2] = 0;
    return;
  }
  const angular = TAU * frequencyHz;
  const damping = 2 * mass * dampingRatio * angular;
  const stiffness = mass * angular * angular;
  const gammaDenominator = dt * (damping + dt * stiffness);
  const gamma = gammaDenominator > 0 ? 1 / gammaDenominator : 0;
  const inverseMass = mass > 0 ? 1 / mass : 0;
  const softened = inverseMass + gamma;
  out[0] = softened > 0 ? 1 / softened : 0;
  out[1] = dt * stiffness * gamma;
  out[2] = gamma;
}

const TAU = 2 * Math.PI;
