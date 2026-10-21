use std::cell::RefCell;

use flight_entity::Entity;

use crate::vector3::{Vector3, create_vector3};

pub fn acquire_empty_vector3() -> Vector3 {
    let mut v = acquire_vector3();
    v.x = 0.0;
    v.y = 0.0;
    v.z = 0.0;
    return v;
}

/// Acquires without initializing the components. Use `acquire_empty_vector3` when a zero value is required.
pub fn acquire_vector3() -> Vector3 {
    return VECTOR3_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_vector3(0.0, 0.0, 0.0))
    });
}

pub fn clear_vector3_pool() {
    VECTOR3_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_vector3(mut v: Vector3) {
    v.entity_runtime_mut().data = None;
    VECTOR3_POOL.with(|pool| pool.borrow_mut().push(v));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static VECTOR3_POOL: RefCell<Vec<Vector3>> = const { RefCell::new(Vec::new()) };
}
