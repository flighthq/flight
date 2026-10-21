use std::sync::Arc;

use flight_entity::Ref;

use crate::text_shaper_run::create_shaped_run;
use crate::types::*;

// The most runs a pool retains; releases beyond it are dropped.
const POOL_MAX_SIZE: usize = 64;

/// A pooled run (most recently released first), or a new one when the pool is empty. Pair every
/// acquire with exactly one release; the run's contents are unspecified, so populate it before use.
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module pool
pub fn acquire_shaped_run(pool: &mut ShapedRunPool) -> Ref<ShapedRun> {
    return pool.pool.pop().unwrap_or_else(create_shaped_run);
}

/// Returns a run to the pool. A run already pooled is ignored (and reported to the release guard) so
/// it never appears twice; a release past capacity is dropped.
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module pool
pub fn release_shaped_run(pool: &mut ShapedRunPool, run: &Ref<ShapedRun>) {
    if pool.pool.iter().any(|pooled| Arc::ptr_eq(pooled, run)) {
        if let Some(guard) = &pool.release_guard {
            guard(run);
        }
        return;
    }
    if pool.pool.len() < POOL_MAX_SIZE {
        pool.pool.push(run.clone());
    }
}

/// Installs (or, with `None`, clears) the double-release guard. Prefer `enable_text_shaper_guards`.
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module guard slot
pub fn set_shaped_run_release_guard(
    pool: &mut ShapedRunPool,
    guard: Option<ShapedRunReleaseGuard>,
) {
    pool.release_guard = guard;
}
