use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

/// A callable random source. Cloning it shares the stream, as a TS function reference does.
/// flight-compiler: typescript-import @flighthq/types/contract
pub type RandomSource = Arc<dyn Fn() -> f32 + Send + Sync>;

/// Create a fast, deterministic pseudo-random generator seeded by an integer.
///
/// Uses the mulberry32 algorithm: a single 32-bit state, good statistical
/// quality for gameplay/VFX use, and identical output across platforms for a
/// given seed.
pub fn create_random_source(seed: u32) -> RandomSource {
    let state = AtomicU32::new(seed);
    return Arc::new(move || {
        let a = state
            .fetch_add(0x6d2b79f5, Ordering::Relaxed)
            .wrapping_add(0x6d2b79f5);
        let mut t = (a ^ a.wrapping_shr(15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ t.wrapping_shr(7)).wrapping_mul(61 | t))) ^ t;
        let sample = ((t ^ t.wrapping_shr(14)) as f32) / 4294967296.0;
        // A TS sample below one can round up at the f32 boundary. Preserve [0, 1).
        return sample.min(1.0 - f32::EPSILON / 2.0);
    });
}
