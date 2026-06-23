//! `flighthq-filters-surface` — surface (CPU pixel) implementations for bitmap
//! filter effects.
//!
//! This is the thin bridge layer: each `apply_*_filter_to_surface` takes a
//! bitmap-filter descriptor from `flighthq-filters` and applies it by calling the
//! pixel operations in `flighthq-surface`. It allocates no GPU resources and owns
//! no pixel algorithms of its own — the heavy per-pixel work lives in
//! `flighthq-surface`; this crate only maps a descriptor's intent onto those ops.

mod apply;

pub use apply::*;
