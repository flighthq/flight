//! Weighted mesh skin binding (TS `skin2D.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a weight binding over the two streams the caller owns (TS `createSkin2D`). The arrays
/// are adopted, not copied, so an importer's final-length buffers are what the deformers read.
// flight-lint: allow(conform-array) Rust adopts owned Vec streams where TS passes shared typed-array references
pub fn create_skin_2d(influence_counts: Vec<u16>, influences: Vec<f32>) -> Skin2D {
    let mut out: Skin2D = allocate_entity();
    initialize_skin_2d(&mut out, influence_counts, influences);
    return out;
}

/// The construction initializer of `create_skin_2d` (TS `initializeSkin2D`).
// flight-lint: allow(conform-array) Rust adopts an owned Vec<f32> where TS passes a shared Float32Array reference
pub fn initialize_skin_2d(out: &mut Skin2D, influence_counts: Vec<u16>, influences: Vec<f32>) {
    out.influence_counts = influence_counts;
    out.influences = influences;
}
