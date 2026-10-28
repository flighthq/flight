//! flight-compiler: target-native

use std::cell::RefCell;

use flight_entity::Entity;

use crate::matrix3::{Matrix3, create_matrix3, set_matrix3_identity};

pub fn acquire_identity_matrix3() -> Matrix3 {
    let mut m = acquire_matrix3();
    set_matrix3_identity(&mut m);
    return m;
}

/// Acquires without initializing the elements. Use `acquire_identity_matrix3` when a known value is required.
pub fn acquire_matrix3() -> Matrix3 {
    return MATRIX3_POOL.with(|pool| pool.borrow_mut().pop().unwrap_or_else(create_matrix3));
}

pub fn clear_matrix3_pool() {
    MATRIX3_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_matrix3(mut m: Matrix3) {
    m.entity_runtime_mut().data = None;
    MATRIX3_POOL.with(|pool| pool.borrow_mut().push(m));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static MATRIX3_POOL: RefCell<Vec<Matrix3>> = const { RefCell::new(Vec::new()) };
}
