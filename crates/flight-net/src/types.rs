use crate::enums::*;
use flight_entity::{Record, Ref, Unknown};
use std::sync::Arc;

/// The source union contains unknown; retain the actual decoded object without serialization.
pub type NetResponseBody = Unknown;

#[derive(Clone)]
pub struct NetResponse {
    pub status: u32,
    pub status_text: String,
    pub ok: bool,
    pub headers: Ref<Record<String>>,
    pub body: NetResponseBody,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetResponseExplanation {
    pub reason: NetResponseExplanationReason,
    pub status: u32,
    pub status_text: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetProgress {
    pub phase: NetProgressPhase,
    pub loaded: usize,
    pub total: usize,
}

/// D5 injected live clock; diagnostics sample this at operation time.
// flight-lint: allow(f64) D1: existing log timestamps are millisecond instants, not transport payload arithmetic
pub type NetClock = Arc<dyn Fn() -> f64 + Send + Sync>;
