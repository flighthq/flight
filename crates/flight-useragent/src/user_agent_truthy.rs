use flight_entity::UnknownValue;

// flight-lint: allow(f64) TS `number` values in an `unknown` slot arrive as f64; NaN and 0 are falsy as in JS
pub(crate) fn is_truthy(value: Option<Option<UnknownValue>>) -> bool {
    let Some(Some(value)) = value else {
        return false;
    };
    if let Some(b) = value.downcast_ref::<bool>() {
        return *b;
    }
    if let Some(s) = value.downcast_ref::<String>() {
        return !s.is_empty();
    }
    if let Some(s) = value.downcast_ref::<&'static str>() {
        return !s.is_empty();
    }
    if let Some(n) = value.downcast_ref::<f64>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<f32>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<i32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<i64>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u64>() {
        return *n != 0;
    }
    return true;
}
