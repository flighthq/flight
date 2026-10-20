use crate::RandomSource;
use crate::create_random_source;

/// Create a `RandomSource` seeded from a deterministic hash of `x` and `y`.
///
/// Connects the stateless hash layer to the seeded-PRNG layer — each grid
/// cell gets an independent reproducible random stream.
pub fn create_random_source_from_hash(x: i32, y: i32) -> RandomSource {
    return create_random_source(hash_2d(x, y));
}

/// Stateless position-seeded hash over a 2D integer grid.
///
/// Returns a deterministic value in `[0, 2^32)`. Suitable for procedural
/// tile/cell content and gradient noise seed generation.
pub fn hash_2d(x: i32, y: i32) -> u32 {
    return hash_combine(hash_uint32(x as u32), y as u32);
}

/// Stateless position-seeded hash over a 3D integer grid.
pub fn hash_3d(x: i32, y: i32, z: i32) -> u32 {
    return hash_combine(hash_2d(x, y), z as u32);
}

/// Combine a running hash `seed` with a new `value` using a Murmur3-inspired mix.
///
/// Used to build multi-dimensional hashes from `hash_uint32`.
pub fn hash_combine(seed: u32, value: u32) -> u32 {
    let seed_i = seed as i32;
    let inner = value
        .wrapping_add(0x9e3779b9)
        .wrapping_add((seed_i << 6) as u32)
        .wrapping_add((seed_i >> 2) as u32);
    return hash_uint32(seed ^ inner);
}

/// Finalise an arbitrary 32-bit integer through the fmix32 finalizer (Murmur3).
///
/// Produces a deterministic, well-distributed 32-bit unsigned integer from any
/// input. Useful as a stateless hash function for individual values.
pub fn hash_uint32(value: u32) -> u32 {
    let mut h = value;
    h ^= h >> 16;
    h = h.wrapping_mul(0x85ebca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2ae35);
    h ^= h >> 16;
    return h;
}
