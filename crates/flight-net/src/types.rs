use crate::enums::*;
use flight_entity::{Record, Ref, Unknown};

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
