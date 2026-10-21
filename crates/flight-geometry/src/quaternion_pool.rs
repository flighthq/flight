use std::cell::RefCell;

use flight_entity::Entity;

use crate::quaternion::{Quaternion, create_quaternion};

pub fn acquire_identity_quaternion() -> Quaternion {
    let mut q = acquire_quaternion();
    q.x = 0.0;
    q.y = 0.0;
    q.z = 0.0;
    q.w = 1.0;
    return q;
}

/// Acquires without initializing the components. Use `acquire_identity_quaternion` when a known value is required.
pub fn acquire_quaternion() -> Quaternion {
    return QUATERNION_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_quaternion(0.0, 0.0, 0.0, 1.0))
    });
}

pub fn clear_quaternion_pool() {
    QUATERNION_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_quaternion(mut q: Quaternion) {
    q.entity_runtime_mut().data = None;
    QUATERNION_POOL.with(|pool| pool.borrow_mut().push(q));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static QUATERNION_POOL: RefCell<Vec<Quaternion>> = const { RefCell::new(Vec::new()) };
}
