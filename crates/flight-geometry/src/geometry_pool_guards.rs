//! flight-compiler: target-native

use std::cell::RefCell;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeometryPoolReleaseFunction {
    ReleaseMatrix,
    ReleaseMatrix3,
    ReleaseMatrix4,
    ReleaseQuaternion,
    ReleaseRectangle,
    ReleaseVector2,
    ReleaseVector3,
    ReleaseVector4,
}

pub type GeometryPoolReleaseGuard = Arc<dyn Fn(GeometryPoolReleaseFunction) + Send + Sync>;

pub(crate) fn get_geometry_pool_release_guard() -> Option<GeometryPoolReleaseGuard> {
    return GEOMETRY_POOL_RELEASE_GUARD.with(|slot| slot.borrow().clone());
}

pub fn set_geometry_pool_release_guard(guard: Option<GeometryPoolReleaseGuard>) {
    GEOMETRY_POOL_RELEASE_GUARD.with(|slot| *slot.borrow_mut() = guard);
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static GEOMETRY_POOL_RELEASE_GUARD: RefCell<Option<GeometryPoolReleaseGuard>> = const { RefCell::new(None) };
}
