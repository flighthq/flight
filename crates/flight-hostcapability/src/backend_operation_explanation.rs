/// Which layer provides one operation (TS inline `BackendOperationExplanation['layer']`). A
/// different vocabulary from `BackendExplanationLayer`, which never had to name what serves an
/// unimplemented operation. `Sentinel` and `None` both mean nothing real implements it, and stay
/// distinct: `Sentinel` is a fall-through object that answers so the call cannot throw; `None` means
/// there is no fall-through at all (nullable single-slot capabilities return null from their getter).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackendOperationExplanationLayer {
    Custom,
    Host,
    None,
    Sentinel,
}

/// Per-operation availability, one level below `BackendExplanation` (TS
/// `BackendOperationExplanation`, types/src/BackendOperationExplanation.ts): plain data, built as a
/// struct literal. `implemented` is true iff a custom or host backend provides the operation, and
/// false whenever only the sentinel serves it: the sentinel never counts as support.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackendOperationExplanation {
    pub implemented: bool,
    pub layer: BackendOperationExplanationLayer,
    pub operation: String,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendOperationExplanation.layer string union; TS exports no get_/parse_ free functions
pub fn get_backend_operation_explanation_layer_string(value: BackendOperationExplanationLayer) -> &'static str {
    return match value {
        BackendOperationExplanationLayer::Custom => "custom",
        BackendOperationExplanationLayer::Host => "host",
        BackendOperationExplanationLayer::None => "none",
        BackendOperationExplanationLayer::Sentinel => "sentinel",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the inline TS BackendOperationExplanation.layer string union; TS exports no get_/parse_ free functions
pub fn parse_backend_operation_explanation_layer(value: &str) -> Option<BackendOperationExplanationLayer> {
    return match value {
        "custom" => Some(BackendOperationExplanationLayer::Custom),
        "host" => Some(BackendOperationExplanationLayer::Host),
        "none" => Some(BackendOperationExplanationLayer::None),
        "sentinel" => Some(BackendOperationExplanationLayer::Sentinel),
        _ => None,
    };
}
