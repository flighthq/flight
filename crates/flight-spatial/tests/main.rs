mod bvh_3d_test;
mod explain_spatial_indexing_2d_test;
mod explain_spatial_indexing_3d_test;
mod format_spatial_indexing_notice_test;
mod spatial_index_3d_test;
mod spatial_index_test;
mod spatial_indexing_guard_test;
mod uniform_grid_3d_test;
mod uniform_grid_test;


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
