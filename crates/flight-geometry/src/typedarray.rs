//! flight-compiler: target-native

use flight_entity::{Float32Array, Int16Array, Uint16Array};

pub fn reserve_float32_array(array: Box<Float32Array>, capacity: usize) -> Box<Float32Array> {
    if array.len() >= capacity {
        return array;
    }
    let mut out = vec![0.0; capacity].into_boxed_slice();
    out[..array.len()].copy_from_slice(&array);
    return out;
}

pub fn reserve_int16_array(array: Box<Int16Array>, capacity: usize) -> Box<Int16Array> {
    if array.len() >= capacity {
        return array;
    }
    let mut out = vec![0; capacity].into_boxed_slice();
    out[..array.len()].copy_from_slice(&array);
    return out;
}

pub fn reserve_uint16_array(array: Box<Uint16Array>, capacity: usize) -> Box<Uint16Array> {
    if array.len() >= capacity {
        return array;
    }
    let mut out = vec![0; capacity].into_boxed_slice();
    out[..array.len()].copy_from_slice(&array);
    return out;
}
