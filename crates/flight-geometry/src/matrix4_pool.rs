//! flight-compiler: target-native

use std::cell::RefCell;

use flight_entity::Entity;

use crate::matrix4::{Matrix4, create_matrix4, set_matrix4_identity};

pub fn acquire_identity_matrix4() -> Matrix4 {
    let mut m = acquire_matrix4();
    set_matrix4_identity(&mut m);
    return m;
}

/// Acquires without initializing the elements. Use `acquire_identity_matrix4` when a known value is required.
pub fn acquire_matrix4() -> Matrix4 {
    return MATRIX4_POOL.with(|pool| pool.borrow_mut().pop().unwrap_or_else(create_matrix4));
}

pub fn clear_matrix4_pool() {
    MATRIX4_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_matrix4(mut m: Matrix4) {
    m.entity_runtime_mut().data = None;
    MATRIX4_POOL.with(|pool| pool.borrow_mut().push(m));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static MATRIX4_POOL: RefCell<Vec<Matrix4>> = const { RefCell::new(Vec::new()) };
}
