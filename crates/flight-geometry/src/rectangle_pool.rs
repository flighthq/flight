use std::cell::RefCell;

use flight_entity::Entity;

use crate::rectangle::{Rectangle, create_rectangle};

pub fn acquire_empty_rectangle() -> Rectangle {
    let mut r = acquire_rectangle();
    r.x = 0.0;
    r.y = 0.0;
    r.width = 0.0;
    r.height = 0.0;
    return r;
}

/// Acquires without initializing the fields. Use `acquire_empty_rectangle` when an empty value is required.
pub fn acquire_rectangle() -> Rectangle {
    return RECTANGLE_POOL.with(|pool| {
        pool.borrow_mut()
            .pop()
            .unwrap_or_else(|| create_rectangle(0.0, 0.0, 0.0, 0.0))
    });
}

pub fn clear_rectangle_pool() {
    RECTANGLE_POOL.with(|pool| pool.borrow_mut().clear());
}

pub fn release_rectangle(mut r: Rectangle) {
    r.entity_runtime_mut().data = None;
    RECTANGLE_POOL.with(|pool| pool.borrow_mut().push(r));
}

// flight-lint: allow(hidden-state) D25: explicit acquire/release scratch bank (user-approved)
thread_local! {
    static RECTANGLE_POOL: RefCell<Vec<Rectangle>> = const { RefCell::new(Vec::new()) };
}
