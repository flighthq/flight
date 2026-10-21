use crate::geometry_pool_guards::{
    get_geometry_pool_release_guard, set_geometry_pool_release_guard,
};

pub fn are_geometry_pool_guards_enabled() -> bool {
    return get_geometry_pool_release_guard().is_some();
}

pub fn disable_geometry_pool_guards() {
    set_geometry_pool_release_guard(None);
}
