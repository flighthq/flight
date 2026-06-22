//! flighthq-math
//!
//! General math utilities: seeded random and power-of-two rounding.

// ---------------------------------------------------------------------------
// next_power_of_two
// ---------------------------------------------------------------------------

/// Return the smallest power of two that is greater than or equal to `n`.
///
/// Returns 1 for inputs ≤ 1 (mirrors the TypeScript implementation, which
/// treats 0, 1, and all negative numbers the same way).
pub fn next_power_of_two(n: u32) -> u32 {
    if n <= 1 {
        return 1;
    }
    // u32::next_power_of_two is available on stable Rust, but we replicate the
    // TS behaviour (ceil(log2(n))) exactly — they agree for all valid inputs.
    n.next_power_of_two()
}

// ---------------------------------------------------------------------------
// RandomSource
// ---------------------------------------------------------------------------

/// Seeded pseudo-random number generator using the mulberry32 algorithm.
///
/// Mulberry32 operates on a single 32-bit state and produces good statistical
/// quality for gameplay / VFX use while being fast and deterministic.  Two
/// `RandomSource` values created with the same seed produce the same sequence,
/// so seeding two consumers identically makes them run in lockstep.
pub struct RandomSource {
    /// Internal 32-bit state (`a` in the TypeScript reference).
    state: u32,
}

/// Create a fast, deterministic pseudo-random generator seeded by a `u64`.
///
/// Only the lower 32 bits of `seed` are used, matching the TypeScript
/// `seed >>> 0` coercion to an unsigned 32-bit integer.
pub fn create_random_source(seed: u64) -> RandomSource {
    RandomSource {
        state: (seed & 0xffff_ffff) as u32,
    }
}

/// Advance the generator and return the next raw `u32` output value.
pub fn random_next_u32(src: &mut RandomSource) -> u32 {
    // Step 1: add the mulberry32 increment (wrapping to stay in u32).
    src.state = src.state.wrapping_add(0x6d2b79f5);
    let a = src.state;

    // Step 2: first mixing step — mirrors Math.imul semantics (wrapping u32).
    let mut t = u32::wrapping_mul(a ^ (a >> 15), 1u32 | a);

    // Step 3: second mixing step.
    t = u32::wrapping_add(u32::wrapping_mul(t ^ (t >> 7), 61u32 | t), t) ^ t;

    // Step 4: final avalanche.
    t ^ (t >> 14)
}

/// Advance the generator and return a value in `[0.0, 1.0)` as `f64`.
pub fn random_next_f64(src: &mut RandomSource) -> f64 {
    // Divide the full u32 range by 2^32, identical to the TS `>>> 0 / 4294967296`.
    random_next_u32(src) as f64 / 4_294_967_296.0
}

/// Advance the generator and return a value in `[0.0, 1.0)` as `f32`.
pub fn random_next_f32(src: &mut RandomSource) -> f32 {
    random_next_f64(src) as f32
}

/// Advance the generator and return a value in `[min, max)`.
pub fn random_next_in_range(src: &mut RandomSource, min: f64, max: f64) -> f64 {
    min + random_next_f64(src) * (max - min)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- next_power_of_two ---------------------------------------------------

    #[test]
    fn next_power_of_two_returns_1_for_0() {
        assert_eq!(next_power_of_two(0), 1);
    }

    #[test]
    fn next_power_of_two_returns_1_for_1() {
        assert_eq!(next_power_of_two(1), 1);
    }

    #[test]
    fn next_power_of_two_returns_exact_power_of_two_unchanged() {
        assert_eq!(next_power_of_two(2), 2);
        assert_eq!(next_power_of_two(64), 64);
        assert_eq!(next_power_of_two(128), 128);
        assert_eq!(next_power_of_two(1024), 1024);
    }

    #[test]
    fn next_power_of_two_rounds_up_to_next_power_of_two() {
        assert_eq!(next_power_of_two(3), 4);
        assert_eq!(next_power_of_two(5), 8);
        assert_eq!(next_power_of_two(100), 128);
        assert_eq!(next_power_of_two(129), 256);
        assert_eq!(next_power_of_two(1000), 1024);
    }

    // -- create_random_source / random_next_f64 ------------------------------

    #[test]
    fn create_random_source_produces_values_in_0_1() {
        let mut rng = create_random_source(1);
        for _ in 0..1000 {
            let v = random_next_f64(&mut rng);
            assert!(v >= 0.0, "value {v} is below 0");
            assert!(v < 1.0, "value {v} is not below 1");
        }
    }

    #[test]
    fn create_random_source_is_deterministic_same_seed_same_sequence() {
        let mut a = create_random_source(0xc0ffee);
        let mut b = create_random_source(0xc0ffee);
        for _ in 0..100 {
            assert_eq!(random_next_f64(&mut a), random_next_f64(&mut b));
        }
    }

    #[test]
    fn create_random_source_different_seeds_yield_different_sequences() {
        let mut a = create_random_source(1);
        let mut b = create_random_source(2);
        let differs = (0..10).any(|_| random_next_f64(&mut a) != random_next_f64(&mut b));
        assert!(differs, "seeds 1 and 2 produced identical sequences");
    }

    #[test]
    fn random_next_f64_produces_values_in_0_1() {
        let mut rng = create_random_source(1);
        for _ in 0..1000 {
            let v = random_next_f64(&mut rng);
            assert!(v >= 0.0, "value {v} is below 0");
            assert!(v < 1.0, "value {v} is not below 1");
        }
    }

    #[test]
    fn random_next_f64_is_deterministic_same_seed_same_sequence() {
        let mut a = create_random_source(0xc0ffee);
        let mut b = create_random_source(0xc0ffee);
        for _ in 0..100 {
            assert_eq!(random_next_f64(&mut a), random_next_f64(&mut b));
        }
    }

    #[test]
    fn random_next_f64_different_seeds_yield_different_sequences() {
        let mut a = create_random_source(1);
        let mut b = create_random_source(2);
        let differs = (0..10).any(|_| random_next_f64(&mut a) != random_next_f64(&mut b));
        assert!(differs, "seeds 1 and 2 produced identical sequences");
    }

    // -- random_next_f32 -----------------------------------------------------

    #[test]
    fn random_next_f32_produces_values_in_0_1() {
        let mut rng = create_random_source(42);
        for _ in 0..1000 {
            let v = random_next_f32(&mut rng);
            assert!(v >= 0.0, "value {v} is below 0");
            assert!(v < 1.0, "value {v} is not below 1");
        }
    }

    // -- random_next_u32 -----------------------------------------------------

    #[test]
    fn random_next_u32_is_deterministic() {
        let mut a = create_random_source(99);
        let mut b = create_random_source(99);
        for _ in 0..50 {
            assert_eq!(random_next_u32(&mut a), random_next_u32(&mut b));
        }
    }

    // -- random_next_in_range ------------------------------------------------

    #[test]
    fn random_next_in_range_stays_within_bounds() {
        let mut rng = create_random_source(7);
        for _ in 0..1000 {
            let v = random_next_in_range(&mut rng, -5.0, 10.0);
            assert!(v >= -5.0, "value {v} below min");
            assert!(v < 10.0, "value {v} not below max");
        }
    }

    #[test]
    fn random_next_in_range_zero_width_returns_min() {
        let mut rng = create_random_source(3);
        let v = random_next_in_range(&mut rng, 7.0, 7.0);
        assert_eq!(v, 7.0);
    }
}
