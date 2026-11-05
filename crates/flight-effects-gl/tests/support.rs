use flight_entity::{Record, set_record_value};

/// D1 f32 bound: `max(TS bound, 4·ε·max(1, |expected|))`.
pub fn assert_close(actual: f32, expected: f32, ts_bound: f32) {
    let roundoff = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    let bound = ts_bound.max(roundoff);
    assert!(
        (actual - expected).abs() <= bound,
        "expected {actual} to be within {bound} of {expected}"
    );
}

/// TS `Record<string, number>` bindings for the GLSL evaluator.
pub fn bindings(entries: &[(&str, f32)]) -> Record<f32> {
    let mut record = Record::default();
    for (key, value) in entries {
        set_record_value(&mut record, key.to_string(), *value);
    }
    return record;
}
