//! flight-compiler: string-union BackendExplanationLayer=kebab-case BackendExplanationViability=kebab-case
//! flight-compiler: nullable-option BackendExplanation.operation

/// Which layer answers for a backend (TS inline `BackendExplanation['layer']`): `custom` or `host`
/// backends, a host that exists but has not enabled one, or a host with no implementation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackendExplanationLayer {
    Custom,
    Host,
    HostNotEnabled,
    NoHostImplementation,
}

/// Whether the explained backend can run (TS inline `BackendExplanation['viability']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackendExplanationViability {
    Available,
    RuntimeApiUnavailable,
    Unobserved,
}

/// Per-backend explanation (TS `BackendExplanation`, types/src/BackendExplanation.ts): plain data,
/// built as a struct literal. `operation` is None where TS has `null`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackendExplanation {
    pub conflict: bool,
    pub layer: BackendExplanationLayer,
    pub operation: Option<String>,
    pub viability: BackendExplanationViability,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendExplanation.layer string union; TS exports no get_/parse_ free functions
pub fn get_backend_explanation_layer_string(value: BackendExplanationLayer) -> &'static str {
    return match value {
        BackendExplanationLayer::Custom => "custom",
        BackendExplanationLayer::Host => "host",
        BackendExplanationLayer::HostNotEnabled => "host-not-enabled",
        BackendExplanationLayer::NoHostImplementation => "no-host-implementation",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendExplanation.viability string union; TS exports no get_/parse_ free functions
pub fn get_backend_explanation_viability_string(
    value: BackendExplanationViability,
) -> &'static str {
    return match value {
        BackendExplanationViability::Available => "available",
        BackendExplanationViability::RuntimeApiUnavailable => "runtime-api-unavailable",
        BackendExplanationViability::Unobserved => "unobserved",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendExplanation.layer string union; TS exports no get_/parse_ free functions
pub fn parse_backend_explanation_layer(value: &str) -> Option<BackendExplanationLayer> {
    return match value {
        "custom" => Some(BackendExplanationLayer::Custom),
        "host" => Some(BackendExplanationLayer::Host),
        "host-not-enabled" => Some(BackendExplanationLayer::HostNotEnabled),
        "no-host-implementation" => Some(BackendExplanationLayer::NoHostImplementation),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendExplanation.viability string union; TS exports no get_/parse_ free functions
pub fn parse_backend_explanation_viability(value: &str) -> Option<BackendExplanationViability> {
    return match value {
        "available" => Some(BackendExplanationViability::Available),
        "runtime-api-unavailable" => Some(BackendExplanationViability::RuntimeApiUnavailable),
        "unobserved" => Some(BackendExplanationViability::Unobserved),
        _ => None,
    };
}
