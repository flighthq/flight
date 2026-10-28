//! flight-compiler: target-native

use flight_geometry::contract::*;

mod reserve_float32_array {
    use super::*;

    #[test]
    fn allocates_exact_capacity_and_copies_existing_values() {
        let array = vec![1.0, 2.0].into_boxed_slice();
        let old_pointer = array.as_ptr();
        let out = reserve_float32_array(array, 4);
        assert_ne!(out.as_ptr(), old_pointer);
        assert_eq!(&*out, &[1.0, 2.0, 0.0, 0.0]);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_equal() {
        let array = vec![1.0; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_float32_array(array, 100);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_smaller() {
        let array = vec![1.0; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_float32_array(array, 10);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }
}

mod reserve_int16_array {
    use super::*;

    #[test]
    fn allocates_exact_capacity_and_copies_existing_values() {
        let array = vec![1_i16, 2].into_boxed_slice();
        let old_pointer = array.as_ptr();
        let out = reserve_int16_array(array, 4);
        assert_ne!(out.as_ptr(), old_pointer);
        assert_eq!(&*out, &[1, 2, 0, 0]);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_equal() {
        let array = vec![1_i16; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_int16_array(array, 100);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_smaller() {
        let array = vec![1_i16; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_int16_array(array, 10);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }
}

mod reserve_uint16_array {
    use super::*;

    #[test]
    fn allocates_exact_capacity_and_copies_existing_values() {
        let array = vec![1_u16, 2].into_boxed_slice();
        let old_pointer = array.as_ptr();
        let out = reserve_uint16_array(array, 4);
        assert_ne!(out.as_ptr(), old_pointer);
        assert_eq!(&*out, &[1, 2, 0, 0]);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_equal() {
        let array = vec![1_u16; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_uint16_array(array, 100);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }

    #[test]
    fn returns_the_same_allocation_when_capacity_is_smaller() {
        let array = vec![1_u16; 100].into_boxed_slice();
        let pointer = array.as_ptr();
        let out = reserve_uint16_array(array, 10);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.len(), 100);
    }
}
