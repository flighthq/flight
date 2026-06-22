//! Typed-array capacity and resize helpers.
//!
//! These functions mirror the TS `reserveFloat32Array` / `reserveInt16Array` /
//! `reserveUint16Array` helpers: return the existing slice unchanged when it is
//! large enough, otherwise allocate a new `Vec` that holds at least `capacity`
//! elements and copy the existing data into it.
//!
//! In Rust there is no `Float32Array` / `Int16Array` distinction at the type
//! system level, so the helpers are generic over element types that are `Copy`
//! and `Default` (for zero-filling new slots).

/// Ensures `buf` has at least `capacity` elements.
///
/// If the current length is already sufficient the buffer is returned unchanged.
/// Otherwise a new `Vec<T>` of exactly `capacity` elements is allocated, the
/// existing data is copied into the front, and the remainder is zero-initialised.
pub fn reserve<T: Copy + Default>(buf: Vec<T>, capacity: usize) -> Vec<T> {
    if buf.len() >= capacity {
        return buf;
    }
    let mut out = vec![T::default(); capacity];
    out[..buf.len()].copy_from_slice(&buf);
    out
}

/// Typed alias: ensures an `f32` buffer has at least `capacity` elements.
pub fn reserve_f32(buf: Vec<f32>, capacity: usize) -> Vec<f32> {
    reserve(buf, capacity)
}

/// Ensures an `f32` buffer has at least `capacity` elements (TS `reserveFloat32Array`).
pub fn reserve_float32_array(buf: Vec<f32>, capacity: usize) -> Vec<f32> {
    reserve(buf, capacity)
}

/// Typed alias: ensures an `i16` buffer has at least `capacity` elements.
pub fn reserve_i16(buf: Vec<i16>, capacity: usize) -> Vec<i16> {
    reserve(buf, capacity)
}

/// Ensures an `i16` buffer has at least `capacity` elements (TS `reserveInt16Array`).
pub fn reserve_int16_array(buf: Vec<i16>, capacity: usize) -> Vec<i16> {
    reserve(buf, capacity)
}

/// Typed alias: ensures a `u16` buffer has at least `capacity` elements.
pub fn reserve_u16(buf: Vec<u16>, capacity: usize) -> Vec<u16> {
    reserve(buf, capacity)
}

/// Ensures a `u16` buffer has at least `capacity` elements (TS `reserveUint16Array`).
pub fn reserve_uint16_array(buf: Vec<u16>, capacity: usize) -> Vec<u16> {
    reserve(buf, capacity)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // reserve_f32
    #[test]
    fn reserve_f32_already_large_enough_returns_unchanged() {
        let buf = vec![1.0f32, 2.0, 3.0];
        let result = reserve_f32(buf.clone(), 2);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], 1.0);
    }

    #[test]
    fn reserve_f32_exact_capacity_unchanged() {
        let buf = vec![1.0f32, 2.0];
        let result = reserve_f32(buf, 2);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn reserve_f32_grows_and_copies() {
        let buf = vec![1.0f32, 2.0];
        let result = reserve_f32(buf, 5);
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], 2.0);
        assert_eq!(result[2], 0.0);
    }

    #[test]
    fn reserve_f32_from_empty() {
        let buf: Vec<f32> = vec![];
        let result = reserve_f32(buf, 3);
        assert_eq!(result.len(), 3);
        assert!(result.iter().all(|&v| v == 0.0));
    }

    // reserve_float32_array
    #[test]
    fn reserve_float32_array_equal_capacity_unchanged() {
        let array = vec![0.0f32; 100];
        let out = reserve_float32_array(array, 100);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_float32_array_less_capacity_unchanged() {
        let array = vec![0.0f32; 100];
        let out = reserve_float32_array(array, 10);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_float32_array_larger_capacity_allocates() {
        let array = vec![0.0f32; 100];
        let out = reserve_float32_array(array, 1000);
        assert_eq!(out.len(), 1000);
    }

    #[test]
    fn reserve_float32_array_zero_fills_extension() {
        let array = vec![1.0f32, 2.0];
        let out = reserve_float32_array(array, 4);
        assert_eq!(out, vec![1.0, 2.0, 0.0, 0.0]);
    }

    #[test]
    fn reserve_float32_array_copies_existing_values() {
        let array: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let out = reserve_float32_array(array.clone(), 100);
        for i in 0..10 {
            assert_eq!(out[i], array[i]);
        }
    }

    // reserve_i16
    #[test]
    fn reserve_i16_grows_and_copies() {
        let buf = vec![10i16, 20];
        let result = reserve_i16(buf, 4);
        assert_eq!(result.len(), 4);
        assert_eq!(result[0], 10);
        assert_eq!(result[3], 0);
    }

    #[test]
    fn reserve_i16_sufficient_unchanged() {
        let buf = vec![1i16, 2, 3];
        let result = reserve_i16(buf, 3);
        assert_eq!(result.len(), 3);
    }

    // reserve_int16_array
    #[test]
    fn reserve_int16_array_equal_capacity_unchanged() {
        let array = vec![0i16; 100];
        let out = reserve_int16_array(array, 100);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_int16_array_less_capacity_unchanged() {
        let array = vec![0i16; 100];
        let out = reserve_int16_array(array, 10);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_int16_array_larger_capacity_allocates() {
        let array = vec![0i16; 100];
        let out = reserve_int16_array(array, 1000);
        assert_eq!(out.len(), 1000);
    }

    #[test]
    fn reserve_int16_array_zero_fills_extension() {
        let array = vec![1i16, 2];
        let out = reserve_int16_array(array, 4);
        assert_eq!(out, vec![1, 2, 0, 0]);
    }

    #[test]
    fn reserve_int16_array_copies_existing_values() {
        let array: Vec<i16> = (0..10).collect();
        let out = reserve_int16_array(array.clone(), 100);
        for i in 0..10 {
            assert_eq!(out[i], array[i]);
        }
    }

    // reserve_u16
    #[test]
    fn reserve_u16_grows_and_copies() {
        let buf = vec![100u16, 200];
        let result = reserve_u16(buf, 5);
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], 100);
        assert_eq!(result[4], 0);
    }

    #[test]
    fn reserve_u16_sufficient_unchanged() {
        let buf = vec![1u16, 2, 3, 4];
        let result = reserve_u16(buf, 4);
        assert_eq!(result.len(), 4);
    }

    // reserve_uint16_array
    #[test]
    fn reserve_uint16_array_equal_capacity_unchanged() {
        let array = vec![0u16; 100];
        let out = reserve_uint16_array(array, 100);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_uint16_array_less_capacity_unchanged() {
        let array = vec![0u16; 100];
        let out = reserve_uint16_array(array, 10);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn reserve_uint16_array_larger_capacity_allocates() {
        let array = vec![0u16; 100];
        let out = reserve_uint16_array(array, 1000);
        assert_eq!(out.len(), 1000);
    }

    #[test]
    fn reserve_uint16_array_zero_fills_extension() {
        let array = vec![1u16, 2];
        let out = reserve_uint16_array(array, 4);
        assert_eq!(out, vec![1, 2, 0, 0]);
    }

    #[test]
    fn reserve_uint16_array_copies_existing_values() {
        let array: Vec<u16> = (0..10).collect();
        let out = reserve_uint16_array(array.clone(), 100);
        for i in 0..10 {
            assert_eq!(out[i], array[i]);
        }
    }
}
