/// Frame-rate-independent exponential decay toward `target`.
///
/// Equivalent to `lerp(current, target, 1 - exp(-lambda * delta_time))`.
/// Higher `lambda` = faster convergence. `delta_time` should be in seconds.
///
/// Returns `current` when `delta_time <= 0` or `lambda <= 0`.
pub fn damp(current: f32, target: f32, lambda: f32, delta_time: f32) -> f32 {
    if delta_time <= 0.0 || lambda <= 0.0 {
        return current;
    }
    return target + (current - target) * (-lambda * delta_time).exp();
}

/// Linearly interpolate between two angles `a` and `b` (radians) by factor `t`,
/// taking the shortest arc.
///
/// `t` is not clamped. The result wraps naturally; there is no explicit
/// normalize call on the output.
pub fn lerp_angle(a: f32, b: f32, t: f32) -> f32 {
    let tau = std::f32::consts::PI * 2.0;
    let mut diff = (((b - a) % tau) + tau) % tau;
    if diff > std::f32::consts::PI {
        diff -= tau;
    }
    return a + diff * t;
}

/// Move `current` toward `target` by at most `max_delta`, without overshooting.
///
/// `max_delta` should be positive; passing a negative `max_delta` moves away
/// from `target` instead.
pub fn move_towards(current: f32, target: f32, max_delta: f32) -> f32 {
    let delta = target - current;
    if delta.abs() <= max_delta {
        return target;
    }
    return current + delta.signum() * max_delta;
}

/// Bounce `t` back and forth over `[0, length]` like a ping-pong ball.
///
/// `ping_pong(t, 1)` cycles: 0 -> 1 -> 0 -> 1 -> ...
pub fn ping_pong(t: f32, length: f32) -> f32 {
    let cycle = 2.0 * length;
    let modulo = ((t % cycle) + cycle) % cycle;
    return if modulo <= length {
        modulo
    } else {
        cycle - modulo
    };
}

/// Wrap `t` over `[0, length)`.
///
/// `repeat(1.6, 1)` -> `0.6`. Analogous to Unity's `Mathf.Repeat`.
pub fn repeat(t: f32, length: f32) -> f32 {
    return ((t % length) + length) % length;
}

/// Hermite interpolation with a smoother quintic ease curve (Ken Perlin).
///
/// Uses `6t^5 - 15t^4 + 10t^3` — has zero first- and second-derivative at the
/// edges, making it smoother than the cubic `smooth_step`. Returns 0 for
/// `x <= edge0`, 1 for `x >= edge1`.
pub fn smoother_step(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = (x - edge0) / (edge1 - edge0);
    let s = if t < 0.0 {
        0.0
    } else if t > 1.0 {
        1.0
    } else {
        t
    };
    return s * s * s * (s * (s * 6.0 - 15.0) + 10.0);
}
