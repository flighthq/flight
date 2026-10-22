static SPATIAL_GUARD_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct SpatialGuardTestScope {
    _lock: std::sync::MutexGuard<'static, ()>,
}

fn lock_spatial_guard_tests() -> SpatialGuardTestScope {
    let lock = SPATIAL_GUARD_TEST_LOCK.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    flight_spatial::set_spatial_indexing_guard(None);
    return SpatialGuardTestScope { _lock: lock };
}

impl Drop for SpatialGuardTestScope {
    fn drop(&mut self) {
        flight_spatial::set_spatial_indexing_guard(None);
    }
}

// Other tests may index objects while the shared diagnostic is installed. Capture only
// this test's operations so a worker thread cannot inherit another test's notices.
fn spatial_guard_for_current_test(callback: fn(&flight_spatial::SpatialIndexingNotice)) -> flight_spatial::SpatialIndexingGuard {
    let owner = std::thread::current().id();
    return std::sync::Arc::new(move |notice| {
        if std::thread::current().id() == owner { callback(notice); }
    });
}

#[path = "bvh_3d_test.rs"]
mod flight_spatial_bvh_3d_test;
#[path = "explain_spatial_indexing_2d_test.rs"]
mod flight_spatial_explain_spatial_indexing_2d_test;
#[path = "explain_spatial_indexing_3d_test.rs"]
mod flight_spatial_explain_spatial_indexing_3d_test;
#[path = "format_spatial_indexing_notice_test.rs"]
mod flight_spatial_format_spatial_indexing_notice_test;
#[path = "spatial_index_3d_test.rs"]
mod flight_spatial_spatial_index_3d_test;
#[path = "spatial_index_test.rs"]
mod flight_spatial_spatial_index_test;
#[path = "spatial_indexing_guard_test.rs"]
mod flight_spatial_spatial_indexing_guard_test;
#[path = "uniform_grid_3d_test.rs"]
mod flight_spatial_uniform_grid_3d_test;
#[path = "uniform_grid_test.rs"]
mod flight_spatial_uniform_grid_test;
