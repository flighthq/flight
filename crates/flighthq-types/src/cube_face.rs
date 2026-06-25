//! Cubemap face indices.
//!
//! Named indices into a [`crate::CubeTexture`]'s six-element `faces` array, in
//! the canonical `+X, -X, +Y, -Y, +Z, -Z` order. Use these instead of
//! magic-number indices when binding or reading a cube face.

/// `+X` face index.
pub const CUBE_FACE_POSITIVE_X: usize = 0;
/// `-X` face index.
pub const CUBE_FACE_NEGATIVE_X: usize = 1;
/// `+Y` face index.
pub const CUBE_FACE_POSITIVE_Y: usize = 2;
/// `-Y` face index.
pub const CUBE_FACE_NEGATIVE_Y: usize = 3;
/// `+Z` face index.
pub const CUBE_FACE_POSITIVE_Z: usize = 4;
/// `-Z` face index.
pub const CUBE_FACE_NEGATIVE_Z: usize = 5;
