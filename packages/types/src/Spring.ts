// Spring header. `@flighthq/spring` steps these plain-data springs with a numerically stable
// damped-harmonic integrator: a value chases a moving target with second-order motion (accelerate,
// overshoot, settle) driven by a per-frame `deltaTime`, not a fixed duration. This is the duration-
// less, interruptible complement to `Tween` (fixed-duration interpolation) and the easing curves
// (fixed shape); unlike `@flighthq/math`'s first-order `damp`, a spring carries velocity and can
// overshoot. The target is passed to the step per frame and is NOT stored on the spring, so it can
// change mid-flight for free.

// A 1D spring's motion state: its current `value` and the `velocity` carried into the next step.
// `velocity` is what makes the motion second-order (overshoot-capable); a fresh spring has velocity
// 0. Both are plain numbers in whatever unit the value drives (pixels, radians, a normalized 0..1).
export interface Spring {
  value: number;
  velocity: number;
}

// Mass-independent spring tuning, the designer-intuitive parameterization.
//
// `frequency` is in Hz — how fast the spring responds (higher = snappier, reaches the target
// sooner). `dampingRatio` is dimensionless: 0 is undamped (oscillates forever), between 0 and 1 is
// underdamped (overshoots the target then settles), exactly 1 is critically damped (the fastest
// approach with no overshoot), and greater than 1 is overdamped (slow, sluggish, no overshoot).
// Both are independent of the value's mass; `createSpringConfigFromPhysical` converts a physical
// stiffness/damping/mass triple into this form.
export interface SpringConfig {
  dampingRatio: number;
  frequency: number;
}

// A 2D spring as a pair of independent scalar `Spring`s, one per axis. The vector step applies the
// same scalar integrator per component, so a `Spring2D` is exactly a composition of two `Spring`s
// with nothing extra — `spring2D.x` is a full `Spring` usable with the scalar functions directly.
export interface Spring2D {
  x: Spring;
  y: Spring;
}

// A 3D spring as three independent scalar `Spring`s. Like `Spring2D`, this is a plain composition of
// per-axis `Spring`s stepped by the same scalar integrator.
export interface Spring3D {
  x: Spring;
  y: Spring;
  z: Spring;
}
