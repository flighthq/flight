//! D10 error primitives: a TypeScript `throw` translates to a typed panic whose payload names
//! the error class, so the transpiler can emit `throw new Error(...)`, `RangeError`, `TypeError`,
//! or the approved `NotReadableError` DOMException and an FFI boundary can catch it and return a
//! status.

use std::any::Any;
use std::sync::{Arc, Mutex, MutexGuard};

/// The error class a typed panic translates to, including the Blob reader's DOMException name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlightErrorKind {
    Error,
    NotReadableError,
    RangeError,
    TypeError,
}

/// Payload carried by every typed panic (D10).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlightError {
    pub kind: FlightErrorKind,
    pub message: String,
}

/// Lossless storage for a caught Rust panic payload that is not a `FlightError`. The mutex makes
/// an arbitrary Send-only payload safe to retain inside the shared `Unknown` representation while
/// access remains borrowed and guarded.
pub struct CaughtPanic {
    payload: Mutex<Box<dyn Any + Send>>,
}

// flight-lint: allow(contract-vocabulary, conform-extra) D10 Rust-only guarded access to the Send-only payload retained by CaughtPanic
pub fn get_caught_panic_payload(value: &CaughtPanic) -> MutexGuard<'_, Box<dyn Any + Send>> {
    return match value.payload.lock() {
        Ok(payload) => payload,
        Err(poisoned) => poisoned.into_inner(),
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS error-kind union; the TS package exports no get_/parse_ free functions
pub fn get_flight_error_kind_string(value: FlightErrorKind) -> &'static str {
    return match value {
        FlightErrorKind::Error => "Error",
        FlightErrorKind::NotReadableError => "NotReadableError",
        FlightErrorKind::RangeError => "RangeError",
        FlightErrorKind::TypeError => "TypeError",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS error-kind union; the TS package exports no get_/parse_ free functions
pub fn parse_flight_error_kind(value: &str) -> Option<FlightErrorKind> {
    return match value {
        "Error" => Some(FlightErrorKind::Error),
        "NotReadableError" => Some(FlightErrorKind::NotReadableError),
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

// flight-lint: allow(conform-extra) D10 Rust catch_unwind bridge; TS catch values are already unknown
pub fn unknown_from_panic(payload: Box<dyn Any + Send>) -> crate::Unknown {
    return match payload.downcast::<FlightError>() {
        Ok(error) => Some(Arc::new(*error)),
        Err(payload) => Some(Arc::new(CaughtPanic {
            payload: Mutex::new(payload),
        })),
    };
}
