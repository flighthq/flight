use std::sync::PoisonError;

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};

use crate::contract::Adjustment;
use crate::contract::COLOR_LUT_DEFAULT_SIZE;
use crate::contract::ColorLut;
use crate::contract::ColorTransformFunction;
use crate::contract::bake_color_lut;
use crate::contract::get_adjustment_color_transform;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use super::*;
    use crate::contract::create_invert_adjustment;

    #[test]
    fn new_matches_create_color_lut_cache() {
        let a = ColorLutCache::new();
        let b = create_color_lut_cache();
        assert_eq!(a.signature, b.signature);
        assert!(a.lut.is_none() && b.lut.is_none());
    }

    #[test]
    fn bake_color_lut_for_run_matches_the_free_function() {
        let run: Vec<Ref<dyn Adjustment>> =
            vec![Arc::new(RwLock::new(create_invert_adjustment(None)))];
        let mut a = create_color_lut_cache();
        let mut b = create_color_lut_cache();
        let la = a.bake_color_lut_for_run(&run, Some(4));
        let lb = bake_color_lut_for_run(&mut b, &run, Some(4));
        assert_eq!(la.samples, lb.samples);
        assert_eq!(a.signature, b.signature);
    }
}

/// Bake memo for the LUT-tier fuse: caches a baked ColorLut keyed by the run's content signature.
#[derive(Debug, Clone)]
pub struct ColorLutCache {
    runtime: EntityRuntimeSlot,
    pub signature: Option<String>,
    pub lut: Option<ColorLut>,
}

pub fn create_color_lut_cache() -> ColorLutCache {
    let mut out: ColorLutCache = allocate_entity();
    initialize_color_lut_cache(&mut out);
    return out;
}

pub fn initialize_color_lut_cache(out: &mut ColorLutCache) {
    out.signature = None;
    out.lut = None;
}

/// Bakes the fused ColorLut for a pointwise-adjustment run (`size` defaults to
/// `COLOR_LUT_DEFAULT_SIZE`), reusing the cache when the run's content signature is unchanged. The
/// signature is computed from the current field values at every call (TS `JSON.stringify(run)`), so
/// mutating an adjustment in place re-bakes. On a hit the cached ColorLut is returned; on a miss the
/// run's transforms are composed and baked afresh.
pub fn bake_color_lut_for_run(
    cache: &mut ColorLutCache,
    run: &[Ref<dyn Adjustment>],
    size: Option<u32>,
) -> ColorLut {
    let size = size.unwrap_or(COLOR_LUT_DEFAULT_SIZE);
    let signature = color_lut_run_signature(run, size);
    if cache.signature.as_deref() == Some(&signature) && cache.lut.is_some() {
        return cache.lut.clone().unwrap();
    }
    let mut transforms: Vec<ColorTransformFunction> = Vec::new();
    for operation in run {
        let operation = operation.read().unwrap_or_else(PoisonError::into_inner);
        if let Some(transform) = get_adjustment_color_transform(&*operation) {
            transforms.push(transform);
        }
    }
    let lut = bake_color_lut(&transforms, Some(size));
    cache.signature = Some(signature);
    cache.lut = Some(lut.clone());
    return lut;
}

/// Content signature of a run for cache keying: the per-axis size, then the run as TS
/// `JSON.stringify` serializes it.
fn color_lut_run_signature(run: &[Ref<dyn Adjustment>], size: u32) -> String {
    let mut sig = format!("{}\n[", size);
    for (i, operation) in run.iter().enumerate() {
        if i > 0 {
            sig.push(',');
        }
        operation
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .write_adjustment_signature(&mut sig);
    }
    sig.push(']');
    return sig;
}

impl Default for ColorLutCache {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            signature: None,
            lut: None,
        };
    }
}

impl ColorLutCache {
    pub fn new() -> Self {
        return create_color_lut_cache();
    }

    pub fn bake_color_lut_for_run(
        &mut self,
        run: &[Ref<dyn Adjustment>],
        size: Option<u32>,
    ) -> ColorLut {
        return bake_color_lut_for_run(self, run, size);
    }
}

flight_entity::impl_entity!(ColorLutCache);
