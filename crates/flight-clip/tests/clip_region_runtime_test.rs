//! flight-compiler: target-native
//!
//! TypeScript reflects the WeakMap-backed private aggregate in the companion. Rust verifies its
//! public acquire/release behavior because the runtime module itself is crate-private.

use std::sync::Arc;

use super::*;

#[test]
fn reuses_released_regions_through_the_module_runtime() {
    let region = acquire_clip_region();
    release_clip_region(&region);
    assert!(Arc::ptr_eq(&region, &acquire_clip_region()));
}
