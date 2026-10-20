#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct RandomSource {
    pub state: u32,
}

/// Create a fast, deterministic pseudo-random generator seeded by an integer.
///
/// Uses the mulberry32 algorithm: a single 32-bit state, good statistical
/// quality for gameplay/VFX use, and identical output across platforms for a
/// given seed.
pub fn create_random_source(seed: u32) -> RandomSource {
    let mut out = RandomSource::default();
    initialize_random_source(&mut out, seed);
    return out;
}

/// Write the seed into a pre-allocated `RandomSource`.
pub fn initialize_random_source(out: &mut RandomSource, seed: u32) {
    out.state = seed;
}

/// Advance the random source and return the next value in `[0, 1)`.
pub fn next_random(source: &mut RandomSource) -> f32 {
    source.state = source.state.wrapping_add(0x6d2b79f5);
    let a = source.state;
    let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
    t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
    return ((t ^ (t >> 14)) as f32) / 4294967296.0;
}

impl RandomSource {
    pub fn new(seed: u32) -> Self {
        return create_random_source(seed);
    }

    pub fn next(&mut self) -> f32 {
        return next_random(self);
    }
}
