//! Pool for `ShapedRun` objects: acquire/release brackets to reuse heap
//! allocations in hot loops (layout, shaping) without per-frame allocation.

use std::sync::Mutex;

use flighthq_types::ShapedRun;

use crate::text_shaper_run::create_shaped_run;

/// Acquires a `ShapedRun` from the pool, allocating a new one when the pool is
/// empty. Must be paired with a matching [`release_shaped_run`] call. Treat as
/// paired brackets: every `acquire_shaped_run` call must have exactly one
/// `release_shaped_run` in its lifetime.
///
/// The returned run is in an unspecified state -- always populate it before use
/// (e.g. via `shape_text_run_into`).
pub fn acquire_shaped_run() -> ShapedRun {
    let mut pool = POOL.lock().expect("shaped run pool poisoned");
    pool.pop().unwrap_or_else(create_shaped_run)
}

/// Returns a `ShapedRun` to the pool. The run must not be used after release.
/// Pairs with [`acquire_shaped_run`]. Runs released beyond the pool capacity
/// are silently discarded (dropped).
pub fn release_shaped_run(run: ShapedRun) {
    let mut pool = POOL.lock().expect("shaped run pool poisoned");
    if pool.len() < POOL_MAX_SIZE {
        pool.push(run);
    }
}

/// Maximum number of `ShapedRun`s to retain in the pool before discarding on
/// release. Keeps memory bounded in cases where burst shaping produces many
/// runs.
const POOL_MAX_SIZE: usize = 64;

static POOL: Mutex<Vec<ShapedRun>> = Mutex::new(Vec::new());

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use super::*;

    fn drain_pool() {
        let mut pool = POOL.lock().expect("shaped run pool poisoned");
        pool.clear();
    }

    #[test]
    #[serial]
    fn acquire_shaped_run_returns_fresh_when_empty() {
        drain_pool();
        let run = acquire_shaped_run();
        assert_eq!(run.glyph_count, 0);
        assert!(run.glyphs.is_empty());
    }

    #[test]
    #[serial]
    fn release_and_acquire_reuses_allocation() {
        drain_pool();
        let mut run = acquire_shaped_run();
        run.glyphs.reserve(32);
        let cap = run.glyphs.capacity();
        release_shaped_run(run);
        let reused = acquire_shaped_run();
        // The vec allocation is reused, so capacity should be at least as large.
        assert!(reused.glyphs.capacity() >= cap);
    }

    #[test]
    #[serial]
    fn release_beyond_capacity_is_silently_dropped() {
        drain_pool();
        // Fill pool to max.
        for _ in 0..POOL_MAX_SIZE {
            release_shaped_run(create_shaped_run());
        }
        let pool_len = POOL.lock().unwrap().len();
        assert_eq!(pool_len, POOL_MAX_SIZE);
        // One more should be silently dropped.
        release_shaped_run(create_shaped_run());
        let pool_len = POOL.lock().unwrap().len();
        assert_eq!(pool_len, POOL_MAX_SIZE);
        drain_pool();
    }

    #[test]
    #[serial]
    fn pool_lifo_order() {
        drain_pool();
        let mut a = create_shaped_run();
        a.advance_width = 1.0;
        let mut b = create_shaped_run();
        b.advance_width = 2.0;
        release_shaped_run(a);
        release_shaped_run(b);
        // LIFO: b was pushed last, so it should come out first.
        let first = acquire_shaped_run();
        assert_eq!(first.advance_width, 2.0);
        let second = acquire_shaped_run();
        assert_eq!(second.advance_width, 1.0);
        drain_pool();
    }
}
