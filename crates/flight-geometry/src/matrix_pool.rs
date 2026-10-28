//! flight-compiler: target-native

use std::cell::RefCell;

use flight_entity::Entity;

use crate::matrix::{Matrix, create_matrix, set_matrix_identity};

pub fn acquire_identity_matrix() -> Matrix {
    let mut m = acquire_matrix();
    set_matrix_identity(&mut m);
    return m;
}

/// Acquires without initializing the components. Use `acquire_identity_matrix` when a known value is required.
pub fn acquire_matrix() -> Matrix {
    return MATRIX_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
    });
}

pub fn clear_matrix_pool() {
    MATRIX_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_matrix(mut m: Matrix) {
    m.entity_runtime_mut().data = None;
    MATRIX_POOL.with(|pool| pool.borrow_mut().push(m));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static MATRIX_POOL: RefCell<Vec<Matrix>> = const { RefCell::new(Vec::new()) };
}
