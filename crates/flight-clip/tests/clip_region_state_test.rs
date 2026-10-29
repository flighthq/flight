//! flight-compiler: target-native
//!
//! Rust verifies the implicit module binding through public operations; TypeScript reflects the
//! lazy binding object itself in the target-native companion.

use std::sync::Arc;

use super::*;

#[test]
fn shares_one_module_binding_across_operations() {
    let clip = acquire_clip_region();
    release_clip_region(&clip);
    assert!(Arc::ptr_eq(&clip, &acquire_clip_region()));
}
