//! Named global object pools for the geometry entity types.
//!
//! These mirror the TS `*Pool` modules (`rectanglePool`, `vector2Pool`,
//! `matrixPool`, …): each type gets a thread-local stack pool exposed through
//! `acquire*` / `release*` / `clear*Pool` free functions. Every `acquire*` must
//! be paired with a matching `release*`; treat them like brackets.
//!
//! Pools store the entity types (`Rectangle`, `Vector2`, `Matrix`, …). When the
//! pool is empty, `acquire*` allocates a fresh value: vectors and rectangles
//! start at zero, matrices start at identity (matching `create*` in TS, where
//! the empty matrix constructors return identity). The `acquireEmpty*` and
//! `acquireIdentity*` variants additionally reset a reused value so callers do
//! not observe stale fields.

use std::cell::RefCell;

use flighthq_types::{Matrix, Matrix3, Matrix4, Rectangle, Vector2, Vector3, Vector4};

use crate::pool::Pool;

std::thread_local! {
    static RECTANGLE_POOL: RefCell<Pool<Rectangle>> = RefCell::new(Pool::new());
    static VECTOR2_POOL: RefCell<Pool<Vector2>> = RefCell::new(Pool::new());
    static VECTOR3_POOL: RefCell<Pool<Vector3>> = RefCell::new(Pool::new());
    static VECTOR4_POOL: RefCell<Pool<Vector4>> = RefCell::new(Pool::new());
    static MATRIX_POOL: RefCell<Pool<Matrix>> = RefCell::new(Pool::new());
    static MATRIX3_POOL: RefCell<Pool<Matrix3>> = RefCell::new(Pool::new());
    static MATRIX4_POOL: RefCell<Pool<Matrix4>> = RefCell::new(Pool::new());
}

#[rustfmt::skip]
const MATRIX3_IDENTITY: [f32; 9] = [
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,
];

#[rustfmt::skip]
const MATRIX4_IDENTITY: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
];

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Acquires a [`Rectangle`] and resets it to an empty rectangle at the origin.
pub fn acquire_empty_rectangle() -> Rectangle {
    let mut r = acquire_rectangle();
    r.x = 0.0;
    r.y = 0.0;
    r.width = 0.0;
    r.height = 0.0;
    r
}

/// Acquires a [`Vector2`] and resets it to `(0, 0)`.
pub fn acquire_empty_vector2() -> Vector2 {
    let mut v = acquire_vector2();
    v.x = 0.0;
    v.y = 0.0;
    v
}

/// Acquires a [`Vector3`] and resets it to `(0, 0, 0)`.
pub fn acquire_empty_vector3() -> Vector3 {
    let mut v = acquire_vector3();
    v.x = 0.0;
    v.y = 0.0;
    v.z = 0.0;
    v
}

/// Acquires a [`Vector4`] and resets it to `(0, 0, 0, 0)`.
pub fn acquire_empty_vector4() -> Vector4 {
    let mut v = acquire_vector4();
    v.x = 0.0;
    v.y = 0.0;
    v.z = 0.0;
    v.w = 0.0;
    v
}

/// Acquires a [`Matrix`] and resets it to identity.
pub fn acquire_identity_matrix() -> Matrix {
    let mut m = acquire_matrix();
    m.a = 1.0;
    m.b = 0.0;
    m.c = 0.0;
    m.d = 1.0;
    m.tx = 0.0;
    m.ty = 0.0;
    m
}

/// Acquires a [`Matrix3`] and resets it to identity.
pub fn acquire_identity_matrix3() -> Matrix3 {
    let mut m = acquire_matrix3();
    m.m = MATRIX3_IDENTITY;
    m
}

/// Acquires a [`Matrix4`] and resets it to identity.
pub fn acquire_identity_matrix4() -> Matrix4 {
    let mut m = acquire_matrix4();
    m.m = MATRIX4_IDENTITY;
    m
}

/// Acquires a [`Matrix`] from the pool, or a new identity matrix if the pool is empty.
pub fn acquire_matrix() -> Matrix {
    MATRIX_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Matrix3`] from the pool, or a new identity matrix if the pool is empty.
pub fn acquire_matrix3() -> Matrix3 {
    MATRIX3_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Matrix4`] from the pool, or a new identity matrix if the pool is empty.
pub fn acquire_matrix4() -> Matrix4 {
    MATRIX4_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Rectangle`] from the pool, or a new zero rectangle if the pool is empty.
pub fn acquire_rectangle() -> Rectangle {
    RECTANGLE_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Vector2`] from the pool, or a new zero vector if the pool is empty.
pub fn acquire_vector2() -> Vector2 {
    VECTOR2_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Vector3`] from the pool, or a new zero vector if the pool is empty.
pub fn acquire_vector3() -> Vector3 {
    VECTOR3_POOL.with(|p| p.borrow_mut().acquire())
}

/// Acquires a [`Vector4`] from the pool, or a new zero vector if the pool is empty.
pub fn acquire_vector4() -> Vector4 {
    VECTOR4_POOL.with(|p| p.borrow_mut().acquire())
}

/// Empties the [`Matrix`] pool.
pub fn clear_matrix_pool() {
    MATRIX_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Matrix3`] pool.
pub fn clear_matrix3_pool() {
    MATRIX3_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Matrix4`] pool.
pub fn clear_matrix4_pool() {
    MATRIX4_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Rectangle`] pool.
pub fn clear_rectangle_pool() {
    RECTANGLE_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Vector2`] pool.
pub fn clear_vector2_pool() {
    VECTOR2_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Vector3`] pool.
pub fn clear_vector3_pool() {
    VECTOR3_POOL.with(|p| p.borrow_mut().clear());
}

/// Empties the [`Vector4`] pool.
pub fn clear_vector4_pool() {
    VECTOR4_POOL.with(|p| p.borrow_mut().clear());
}

/// Returns a [`Matrix`] to the pool.
pub fn release_matrix(m: Matrix) {
    MATRIX_POOL.with(|p| p.borrow_mut().release(m));
}

/// Returns a [`Matrix3`] to the pool.
pub fn release_matrix3(m: Matrix3) {
    MATRIX3_POOL.with(|p| p.borrow_mut().release(m));
}

/// Returns a [`Matrix4`] to the pool.
pub fn release_matrix4(m: Matrix4) {
    MATRIX4_POOL.with(|p| p.borrow_mut().release(m));
}

/// Returns a [`Rectangle`] to the pool.
pub fn release_rectangle(r: Rectangle) {
    RECTANGLE_POOL.with(|p| p.borrow_mut().release(r));
}

/// Returns a [`Vector2`] to the pool.
pub fn release_vector2(v: Vector2) {
    VECTOR2_POOL.with(|p| p.borrow_mut().release(v));
}

/// Returns a [`Vector3`] to the pool.
pub fn release_vector3(v: Vector3) {
    VECTOR3_POOL.with(|p| p.borrow_mut().release(v));
}

/// Returns a [`Vector4`] to the pool.
pub fn release_vector4(v: Vector4) {
    VECTOR4_POOL.with(|p| p.borrow_mut().release(v));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // acquire_empty_rectangle
    #[test]
    fn acquire_empty_rectangle_returns_zeroed_rectangle() {
        clear_rectangle_pool();
        let r = acquire_empty_rectangle();
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 0.0);
        assert_eq!(r.width, 0.0);
        assert_eq!(r.height, 0.0);
    }

    #[test]
    fn acquire_empty_rectangle_resets_released_rectangle() {
        clear_rectangle_pool();
        let mut r1 = acquire_rectangle();
        r1.x = 5.0;
        r1.y = 10.0;
        r1.width = 50.0;
        r1.height = 100.0;
        release_rectangle(r1);
        let r2 = acquire_empty_rectangle();
        assert_eq!(r2.x, 0.0);
        assert_eq!(r2.y, 0.0);
        assert_eq!(r2.width, 0.0);
        assert_eq!(r2.height, 0.0);
    }

    // acquire_empty_vector2
    #[test]
    fn acquire_empty_vector2_returns_zeroed_vector() {
        clear_vector2_pool();
        let mut v1 = acquire_vector2();
        v1.x = 3.0;
        v1.y = 4.0;
        release_vector2(v1);
        let v2 = acquire_empty_vector2();
        assert_eq!(v2.x, 0.0);
        assert_eq!(v2.y, 0.0);
    }

    // acquire_empty_vector3
    #[test]
    fn acquire_empty_vector3_returns_zeroed_vector() {
        clear_vector3_pool();
        let mut v1 = acquire_vector3();
        v1.x = 1.0;
        v1.y = 2.0;
        v1.z = 3.0;
        release_vector3(v1);
        let v2 = acquire_empty_vector3();
        assert_eq!(v2.x, 0.0);
        assert_eq!(v2.y, 0.0);
        assert_eq!(v2.z, 0.0);
    }

    // acquire_empty_vector4
    #[test]
    fn acquire_empty_vector4_returns_zeroed_vector() {
        clear_vector4_pool();
        let mut v1 = acquire_vector4();
        v1.x = 1.0;
        v1.y = 2.0;
        v1.z = 3.0;
        v1.w = 4.0;
        release_vector4(v1);
        let v2 = acquire_empty_vector4();
        assert_eq!(v2.x, 0.0);
        assert_eq!(v2.y, 0.0);
        assert_eq!(v2.z, 0.0);
        assert_eq!(v2.w, 0.0);
    }

    // acquire_identity_matrix
    #[test]
    fn acquire_identity_matrix_returns_identity() {
        clear_matrix_pool();
        let m = acquire_identity_matrix();
        assert_eq!(m.a, 1.0);
        assert_eq!(m.b, 0.0);
        assert_eq!(m.c, 0.0);
        assert_eq!(m.d, 1.0);
        assert_eq!(m.tx, 0.0);
        assert_eq!(m.ty, 0.0);
    }

    #[test]
    fn acquire_identity_matrix_resets_released_matrix() {
        clear_matrix_pool();
        let mut m1 = acquire_matrix();
        m1.a = 5.0;
        m1.tx = 10.0;
        release_matrix(m1);
        let m2 = acquire_identity_matrix();
        assert_eq!(m2.a, 1.0);
        assert_eq!(m2.tx, 0.0);
    }

    // acquire_identity_matrix3
    #[test]
    fn acquire_identity_matrix3_returns_identity() {
        clear_matrix3_pool();
        let mut m1 = acquire_matrix3();
        m1.m[0] = 9.0;
        release_matrix3(m1);
        let m2 = acquire_identity_matrix3();
        assert_eq!(m2.m, MATRIX3_IDENTITY);
    }

    // acquire_identity_matrix4
    #[test]
    fn acquire_identity_matrix4_returns_identity() {
        clear_matrix4_pool();
        let mut m1 = acquire_matrix4();
        m1.m[0] = 9.0;
        release_matrix4(m1);
        let m2 = acquire_identity_matrix4();
        assert_eq!(m2.m, MATRIX4_IDENTITY);
    }

    // acquire_matrix
    #[test]
    fn acquire_matrix_from_empty_pool_returns_identity() {
        clear_matrix_pool();
        let m = acquire_matrix();
        assert_eq!(m.a, 1.0);
        assert_eq!(m.d, 1.0);
        assert_eq!(m.tx, 0.0);
    }

    #[test]
    fn acquire_matrix_reuses_released_matrix() {
        clear_matrix_pool();
        let mut m1 = acquire_matrix();
        m1.tx = 7.0;
        release_matrix(m1);
        let m2 = acquire_matrix();
        assert_eq!(m2.tx, 7.0);
    }

    // acquire_matrix3
    #[test]
    fn acquire_matrix3_reuses_released_matrix() {
        clear_matrix3_pool();
        let mut m1 = acquire_matrix3();
        m1.m[0] = 3.0;
        release_matrix3(m1);
        let m2 = acquire_matrix3();
        assert_eq!(m2.m[0], 3.0);
    }

    // acquire_matrix4
    #[test]
    fn acquire_matrix4_reuses_released_matrix() {
        clear_matrix4_pool();
        let mut m1 = acquire_matrix4();
        m1.m[0] = 4.0;
        release_matrix4(m1);
        let m2 = acquire_matrix4();
        assert_eq!(m2.m[0], 4.0);
    }

    // acquire_rectangle
    #[test]
    fn acquire_rectangle_reuses_released_rectangle() {
        clear_rectangle_pool();
        let mut r1 = acquire_rectangle();
        r1.x = 11.0;
        release_rectangle(r1);
        let r2 = acquire_rectangle();
        assert_eq!(r2.x, 11.0);
    }

    #[test]
    fn acquire_rectangle_reuses_in_lifo_order() {
        clear_rectangle_pool();
        let mut r1 = acquire_rectangle();
        r1.x = 1.0;
        let mut r2 = acquire_rectangle();
        r2.x = 2.0;
        release_rectangle(r1);
        release_rectangle(r2);
        assert_eq!(acquire_rectangle().x, 2.0);
        assert_eq!(acquire_rectangle().x, 1.0);
    }

    // acquire_vector2
    #[test]
    fn acquire_vector2_reuses_released_vector() {
        clear_vector2_pool();
        let mut v1 = acquire_vector2();
        v1.x = 8.0;
        release_vector2(v1);
        let v2 = acquire_vector2();
        assert_eq!(v2.x, 8.0);
    }

    // acquire_vector3
    #[test]
    fn acquire_vector3_reuses_released_vector() {
        clear_vector3_pool();
        let mut v1 = acquire_vector3();
        v1.z = 9.0;
        release_vector3(v1);
        let v2 = acquire_vector3();
        assert_eq!(v2.z, 9.0);
    }

    // acquire_vector4
    #[test]
    fn acquire_vector4_reuses_released_vector() {
        clear_vector4_pool();
        let mut v1 = acquire_vector4();
        v1.w = 6.0;
        release_vector4(v1);
        let v2 = acquire_vector4();
        assert_eq!(v2.w, 6.0);
    }

    // clear_matrix_pool
    #[test]
    fn clear_matrix_pool_empties_the_pool() {
        let mut m = acquire_matrix();
        m.tx = 42.0;
        release_matrix(m);
        clear_matrix_pool();
        let m2 = acquire_matrix();
        assert_eq!(m2.tx, 0.0);
    }

    // clear_matrix3_pool
    #[test]
    fn clear_matrix3_pool_empties_the_pool() {
        let mut m = acquire_matrix3();
        m.m[0] = 42.0;
        release_matrix3(m);
        clear_matrix3_pool();
        let m2 = acquire_matrix3();
        assert_eq!(m2.m[0], 1.0);
    }

    // clear_matrix4_pool
    #[test]
    fn clear_matrix4_pool_empties_the_pool() {
        let mut m = acquire_matrix4();
        m.m[0] = 42.0;
        release_matrix4(m);
        clear_matrix4_pool();
        let m2 = acquire_matrix4();
        assert_eq!(m2.m[0], 1.0);
    }

    // clear_rectangle_pool
    #[test]
    fn clear_rectangle_pool_empties_the_pool() {
        let mut r = acquire_rectangle();
        r.x = 42.0;
        release_rectangle(r);
        clear_rectangle_pool();
        let r2 = acquire_rectangle();
        assert_eq!(r2.x, 0.0);
    }

    // clear_vector2_pool
    #[test]
    fn clear_vector2_pool_empties_the_pool() {
        let mut v = acquire_vector2();
        v.x = 42.0;
        release_vector2(v);
        clear_vector2_pool();
        let v2 = acquire_vector2();
        assert_eq!(v2.x, 0.0);
    }

    // clear_vector3_pool
    #[test]
    fn clear_vector3_pool_empties_the_pool() {
        let mut v = acquire_vector3();
        v.x = 42.0;
        release_vector3(v);
        clear_vector3_pool();
        let v2 = acquire_vector3();
        assert_eq!(v2.x, 0.0);
    }

    // clear_vector4_pool
    #[test]
    fn clear_vector4_pool_empties_the_pool() {
        let mut v = acquire_vector4();
        v.x = 42.0;
        release_vector4(v);
        clear_vector4_pool();
        let v2 = acquire_vector4();
        assert_eq!(v2.x, 0.0);
    }

    // release_matrix
    #[test]
    fn release_matrix_returns_value_to_pool() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        m.b = 2.0;
        release_matrix(m);
        assert_eq!(acquire_matrix().b, 2.0);
    }

    // release_matrix3
    #[test]
    fn release_matrix3_returns_value_to_pool() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        m.m[1] = 2.0;
        release_matrix3(m);
        assert_eq!(acquire_matrix3().m[1], 2.0);
    }

    // release_matrix4
    #[test]
    fn release_matrix4_returns_value_to_pool() {
        clear_matrix4_pool();
        let mut m = acquire_matrix4();
        m.m[1] = 2.0;
        release_matrix4(m);
        assert_eq!(acquire_matrix4().m[1], 2.0);
    }

    // release_rectangle
    #[test]
    fn release_rectangle_returns_value_to_pool() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        r.width = 12.0;
        release_rectangle(r);
        assert_eq!(acquire_rectangle().width, 12.0);
    }

    // release_vector2
    #[test]
    fn release_vector2_returns_value_to_pool() {
        clear_vector2_pool();
        let mut v = acquire_vector2();
        v.y = 5.0;
        release_vector2(v);
        assert_eq!(acquire_vector2().y, 5.0);
    }

    // release_vector3
    #[test]
    fn release_vector3_returns_value_to_pool() {
        clear_vector3_pool();
        let mut v = acquire_vector3();
        v.y = 5.0;
        release_vector3(v);
        assert_eq!(acquire_vector3().y, 5.0);
    }

    // release_vector4
    #[test]
    fn release_vector4_returns_value_to_pool() {
        clear_vector4_pool();
        let mut v = acquire_vector4();
        v.y = 5.0;
        release_vector4(v);
        assert_eq!(acquire_vector4().y, 5.0);
    }
}
