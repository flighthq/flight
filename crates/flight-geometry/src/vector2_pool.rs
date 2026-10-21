use std::cell::RefCell;

use flight_entity::Entity;

use crate::vector2::{Vector2, create_vector2};

pub fn acquire_empty_vector2() -> Vector2 {
    let mut v = acquire_vector2();
    v.x = 0.0;
    v.y = 0.0;
    return v;
}

/// Acquires without initializing the components. Use `acquire_empty_vector2` when a zero value is required.
pub fn acquire_vector2() -> Vector2 {
    return VECTOR2_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_vector2(0.0, 0.0))
    });
}

pub fn clear_vector2_pool() {
    VECTOR2_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_vector2(mut v: Vector2) {
    v.entity_runtime_mut().data = None;
    VECTOR2_POOL.with(|pool| pool.borrow_mut().push(v));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static VECTOR2_POOL: RefCell<Vec<Vector2>> = const { RefCell::new(Vec::new()) };
}
