//! flight-compiler: target-native

pub fn create_statechart_float32_array(length: usize) -> Box<[f32]> {
    return vec![0.0; length].into_boxed_slice();
}

pub fn create_statechart_float64_array(length: usize) -> Box<[f64]> {
    return vec![0.0; length].into_boxed_slice();
}

pub fn create_statechart_int32_array(length: usize, value: i32) -> Box<[i32]> {
    return vec![value; length].into_boxed_slice();
}
