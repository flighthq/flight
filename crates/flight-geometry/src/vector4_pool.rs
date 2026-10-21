use std::cell::RefCell;

use flight_entity::Entity;

use crate::vector4::{Vector4, create_vector4};

pub fn acquire_empty_vector4() -> Vector4 {
    let mut v = acquire_vector4();
    v.x = 0.0;
    v.y = 0.0;
    v.z = 0.0;
    v.w = 0.0;
    return v;
}

/// Acquires without initializing the components. Use `acquire_empty_vector4` when a zero value is required.
pub fn acquire_vector4() -> Vector4 {
    return VECTOR4_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_vector4(0.0, 0.0, 0.0, 0.0))
    });
}

pub fn clear_vector4_pool() {
    VECTOR4_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_vector4(mut v: Vector4) {
    v.entity_runtime_mut().data = None;
    VECTOR4_POOL.with(|pool| pool.borrow_mut().push(v));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static VECTOR4_POOL: RefCell<Vec<Vector4>> = const { RefCell::new(Vec::new()) };
}
