//! D10 error primitives: a TypeScript `throw` translates to a typed panic whose payload names
//! the error class, so the transpiler can emit `throw new Error(...)`, `RangeError`, or
//! `TypeError` and an FFI boundary can catch it and return a status.

/// The error class a typed panic translates to. TS union: `'Error' | 'RangeError' | 'TypeError'`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlightErrorKind {
    Error,
    RangeError,
    TypeError,
}

/// Payload carried by every typed panic (D10).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlightError {
    pub kind: FlightErrorKind,
    pub message: String,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS error-kind union; the TS package exports no get_/parse_ free functions
pub fn get_flight_error_kind_string(value: FlightErrorKind) -> &'static str {
    return match value {
        FlightErrorKind::Error => "Error",
        FlightErrorKind::RangeError => "RangeError",
        FlightErrorKind::TypeError => "TypeError",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS error-kind union; the TS package exports no get_/parse_ free functions
pub fn parse_flight_error_kind(value: &str) -> Option<FlightErrorKind> {
    return match value {
        "Error" => Some(FlightErrorKind::Error),
        "RangeError" => Some(FlightErrorKind::RangeError),
        "TypeError" => Some(FlightErrorKind::TypeError),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D10 IR translation primitive for TS `throw new Error(...)`; no TS package function exists
pub fn throw_error(message: &str) -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    });
}

// flight-lint: allow(conform-extra) D10 IR translation primitive for TS `throw new RangeError(...)`; no TS package function exists
pub fn throw_range_error(message: &str) -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::RangeError,
        message: message.to_string(),
    });
}

// flight-lint: allow(conform-extra) D10 IR translation primitive for TS `throw new TypeError(...)`; no TS package function exists
pub fn throw_type_error(message: &str) -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::TypeError,
        message: message.to_string(),
    });
}
