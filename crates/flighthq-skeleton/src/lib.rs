//! `flighthq-skeleton` — skin skeleton: joint palette and bind-pose math.
//!
//! Ports `@flighthq/skeleton` from the TypeScript SDK. Provides the [`Skeleton`] struct plus three
//! free functions that cover skeleton creation, bind-pose capture, and per-frame palette update.

pub mod skeleton;

pub use skeleton::{
    Skeleton, compute_skeleton_joint_matrices, create_skeleton, set_skeleton_bind_pose,
};
