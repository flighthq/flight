//! D9e string tables for the scene-document closed string unions.

use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FlightDocumentRefusalReason string union; the TS package exports no get_/parse_ free functions
pub fn get_flight_document_refusal_reason_string(
    value: FlightDocumentRefusalReason,
) -> &'static str {
    return match value {
        FlightDocumentRefusalReason::AliasUnsupported => "flight-document.unsupported.alias",
        FlightDocumentRefusalReason::AnchorUnsupported => "flight-document.unsupported.anchor",
        FlightDocumentRefusalReason::BlockScalarUnsupported => {
            "flight-document.unsupported.block-scalar"
        }
        FlightDocumentRefusalReason::CollectionEntriesLimitExceeded => {
            "flight-document.limit.collection-entries"
        }
        FlightDocumentRefusalReason::DefaultSceneOutOfRange => {
            "flight-document.structure.default-scene-out-of-range"
        }
        FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded => {
            "flight-document.limit.document-code-units"
        }
        FlightDocumentRefusalReason::DocumentSeparatorUnsupported => {
            "flight-document.unsupported.document-separator"
        }
        FlightDocumentRefusalReason::DuplicateAmbientLight => {
            "flight-document.structure.duplicate-ambient-light"
        }
        FlightDocumentRefusalReason::DuplicateDirectionalLight => {
            "flight-document.structure.duplicate-directional-light"
        }
        FlightDocumentRefusalReason::DuplicateKey => "flight-document.syntax.duplicate-key",
        FlightDocumentRefusalReason::ExpectedFlowDelimiter => {
            "flight-document.syntax.expected-flow-delimiter"
        }
        FlightDocumentRefusalReason::ExpectedMappingEntry => {
            "flight-document.syntax.expected-mapping-entry"
        }
        FlightDocumentRefusalReason::ExpectedMappingKey => {
            "flight-document.syntax.expected-mapping-key"
        }
        FlightDocumentRefusalReason::ExpectedScalar => "flight-document.syntax.expected-scalar",
        FlightDocumentRefusalReason::ExpectedValue => "flight-document.syntax.expected-value",
        FlightDocumentRefusalReason::FieldInvalid => "flight-document.field.invalid",
        FlightDocumentRefusalReason::FlowSequenceUnsupported => {
            "flight-document.unsupported.flow-sequence"
        }
        FlightDocumentRefusalReason::InvalidDocument => "flight-document.syntax.invalid-document",
        FlightDocumentRefusalReason::InvalidEscape => "flight-document.syntax.invalid-escape",
        FlightDocumentRefusalReason::InteractiveStateExtensionKindDuplicate => {
            "flight-document.interactive-state.extension-kind.duplicate"
        }
        FlightDocumentRefusalReason::InteractiveStateExtensionKindUnregistered => {
            "flight-document.interactive-state.extension-kind.unregistered"
        }
        FlightDocumentRefusalReason::InteractiveStateTargetUnsupported => {
            "flight-document.interactive-state.target.unsupported"
        }
        FlightDocumentRefusalReason::InteractiveStateTransitionKindUnregistered => {
            "flight-document.interactive-state.transition-kind.unregistered"
        }
        FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded => {
            "flight-document.limit.key-code-units"
        }
        FlightDocumentRefusalReason::LayoutTargetAmbiguous => {
            "flight-document.layout-target.ambiguous"
        }
        FlightDocumentRefusalReason::LayoutTargetUnresolved => {
            "flight-document.layout-target.unresolved"
        }
        FlightDocumentRefusalReason::MixedCollection => "flight-document.syntax.mixed-collection",
        FlightDocumentRefusalReason::MultipleRootValues => {
            "flight-document.syntax.multiple-root-values"
        }
        FlightDocumentRefusalReason::NestingDepthLimitExceeded => {
            "flight-document.limit.nesting-depth"
        }
        FlightDocumentRefusalReason::NodeKindUnregistered => {
            "flight-document.node-kind.unregistered"
        }
        FlightDocumentRefusalReason::NumberOutOfRange => {
            "flight-document.scalar.number-out-of-range"
        }
        FlightDocumentRefusalReason::ResourceKindUnregistered => {
            "flight-document.resource-kind.unregistered"
        }
        FlightDocumentRefusalReason::ResourceResolverUnregistered => {
            "flight-document.resource-resolver.unregistered"
        }
        FlightDocumentRefusalReason::ResourceUnresolved => "flight-document.resource.unresolved",
        FlightDocumentRefusalReason::RootIndentation => "flight-document.syntax.root-indentation",
        FlightDocumentRefusalReason::RootKindMismatch => {
            "flight-document.structure.root-kind-mismatch"
        }
        FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded => {
            "flight-document.limit.scalar-code-units"
        }
        FlightDocumentRefusalReason::ScalarInvalid => "flight-document.scalar.invalid",
        FlightDocumentRefusalReason::ShapeCommandUnregistered => {
            "flight-document.shape-command.unregistered"
        }
        FlightDocumentRefusalReason::ScenesEmpty => "flight-document.structure.scenes-empty",
        FlightDocumentRefusalReason::StructureInvalid => "flight-document.structure.invalid",
        FlightDocumentRefusalReason::TabCharacter => "flight-document.syntax.tab-character",
        FlightDocumentRefusalReason::TagUnsupported => "flight-document.unsupported.tag",
        FlightDocumentRefusalReason::TokenKeyDuplicate => "flight-document.token.key-duplicate",
        FlightDocumentRefusalReason::TokenKeyInvalid => "flight-document.token.key-invalid",
        FlightDocumentRefusalReason::TokenKindMismatch => "flight-document.token.kind-mismatch",
        FlightDocumentRefusalReason::TokenModeInvalid => "flight-document.token.mode-invalid",
        FlightDocumentRefusalReason::TokenModeUnresolved => "flight-document.token.mode-unresolved",
        FlightDocumentRefusalReason::TokenReferenceCycle => "flight-document.token.reference-cycle",
        FlightDocumentRefusalReason::TokenReferenceInvalid => {
            "flight-document.token.reference-invalid"
        }
        FlightDocumentRefusalReason::TokenResolverUnregistered => {
            "flight-document.token-resolver.unregistered"
        }
        FlightDocumentRefusalReason::TokenUnresolved => "flight-document.token.unresolved",
        FlightDocumentRefusalReason::TokenValueInvalid => "flight-document.token.value-invalid",
        FlightDocumentRefusalReason::TotalNodesLimitExceeded => "flight-document.limit.total-nodes",
        FlightDocumentRefusalReason::TrailingFlowComma => {
            "flight-document.syntax.trailing-flow-comma"
        }
        FlightDocumentRefusalReason::TrailingFlowContent => {
            "flight-document.syntax.trailing-flow-content"
        }
        FlightDocumentRefusalReason::UnexpectedIndentation => {
            "flight-document.syntax.unexpected-indentation"
        }
        FlightDocumentRefusalReason::UnexpectedToken => "flight-document.syntax.unexpected-token",
        FlightDocumentRefusalReason::UnterminatedFlowMapping => {
            "flight-document.syntax.unterminated-flow-mapping"
        }
        FlightDocumentRefusalReason::UnterminatedQuotedScalar => {
            "flight-document.syntax.unterminated-quoted-scalar"
        }
        FlightDocumentRefusalReason::VersionUnsupported => "flight-document.version.unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NodeInteractiveStateProperty string union; the TS package exports no get_/parse_ free functions
pub fn get_node_interactive_state_property_string(
    value: NodeInteractiveStateProperty,
) -> &'static str {
    return match value {
        NodeInteractiveStateProperty::Alpha => "alpha",
        NodeInteractiveStateProperty::ScaleX => "scaleX",
        NodeInteractiveStateProperty::ScaleY => "scaleY",
        NodeInteractiveStateProperty::Visible => "visible",
        NodeInteractiveStateProperty::X => "x",
        NodeInteractiveStateProperty::Y => "y",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NodeInteractiveStateRefusalReason string union; the TS package exports no get_/parse_ free functions
pub fn get_node_interactive_state_refusal_reason_string(
    value: NodeInteractiveStateRefusalReason,
) -> &'static str {
    return match value {
        NodeInteractiveStateRefusalReason::ExtensionCreationFailed => {
            "node-interactive-state.extension.creation-failed"
        }
        NodeInteractiveStateRefusalReason::ExtensionKindUnregistered => {
            "node-interactive-state.extension-kind.unregistered"
        }
        NodeInteractiveStateRefusalReason::ExtensionTargetUnsupported => {
            "node-interactive-state.extension.target-unsupported"
        }
        NodeInteractiveStateRefusalReason::PropertyTargetUnsupported => {
            "node-interactive-state.property.target-unsupported"
        }
        NodeInteractiveStateRefusalReason::TransitionCreationFailed => {
            "node-interactive-state.transition.creation-failed"
        }
        NodeInteractiveStateRefusalReason::TransitionKindUnregistered => {
            "node-interactive-state.transition-kind.unregistered"
        }
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FlightDocumentRefusalReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_flight_document_refusal_reason(value: &str) -> Option<FlightDocumentRefusalReason> {
    return match value {
        "flight-document.unsupported.alias" => Some(FlightDocumentRefusalReason::AliasUnsupported),
        "flight-document.unsupported.anchor" => {
            Some(FlightDocumentRefusalReason::AnchorUnsupported)
        }
        "flight-document.unsupported.block-scalar" => {
            Some(FlightDocumentRefusalReason::BlockScalarUnsupported)
        }
        "flight-document.limit.collection-entries" => {
            Some(FlightDocumentRefusalReason::CollectionEntriesLimitExceeded)
        }
        "flight-document.structure.default-scene-out-of-range" => {
            Some(FlightDocumentRefusalReason::DefaultSceneOutOfRange)
        }
        "flight-document.limit.document-code-units" => {
            Some(FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded)
        }
        "flight-document.unsupported.document-separator" => {
            Some(FlightDocumentRefusalReason::DocumentSeparatorUnsupported)
        }
        "flight-document.structure.duplicate-ambient-light" => {
            Some(FlightDocumentRefusalReason::DuplicateAmbientLight)
        }
        "flight-document.structure.duplicate-directional-light" => {
            Some(FlightDocumentRefusalReason::DuplicateDirectionalLight)
        }
        "flight-document.syntax.duplicate-key" => Some(FlightDocumentRefusalReason::DuplicateKey),
        "flight-document.syntax.expected-flow-delimiter" => {
            Some(FlightDocumentRefusalReason::ExpectedFlowDelimiter)
        }
        "flight-document.syntax.expected-mapping-entry" => {
            Some(FlightDocumentRefusalReason::ExpectedMappingEntry)
        }
        "flight-document.syntax.expected-mapping-key" => {
            Some(FlightDocumentRefusalReason::ExpectedMappingKey)
        }
        "flight-document.syntax.expected-scalar" => {
            Some(FlightDocumentRefusalReason::ExpectedScalar)
        }
        "flight-document.syntax.expected-value" => Some(FlightDocumentRefusalReason::ExpectedValue),
        "flight-document.field.invalid" => Some(FlightDocumentRefusalReason::FieldInvalid),
        "flight-document.unsupported.flow-sequence" => {
            Some(FlightDocumentRefusalReason::FlowSequenceUnsupported)
        }
        "flight-document.syntax.invalid-document" => {
            Some(FlightDocumentRefusalReason::InvalidDocument)
        }
        "flight-document.syntax.invalid-escape" => Some(FlightDocumentRefusalReason::InvalidEscape),
        "flight-document.interactive-state.extension-kind.duplicate" => {
            Some(FlightDocumentRefusalReason::InteractiveStateExtensionKindDuplicate)
        }
        "flight-document.interactive-state.extension-kind.unregistered" => {
            Some(FlightDocumentRefusalReason::InteractiveStateExtensionKindUnregistered)
        }
        "flight-document.interactive-state.target.unsupported" => {
            Some(FlightDocumentRefusalReason::InteractiveStateTargetUnsupported)
        }
        "flight-document.interactive-state.transition-kind.unregistered" => {
            Some(FlightDocumentRefusalReason::InteractiveStateTransitionKindUnregistered)
        }
        "flight-document.limit.key-code-units" => {
            Some(FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded)
        }
        "flight-document.layout-target.ambiguous" => {
            Some(FlightDocumentRefusalReason::LayoutTargetAmbiguous)
        }
        "flight-document.layout-target.unresolved" => {
            Some(FlightDocumentRefusalReason::LayoutTargetUnresolved)
        }
        "flight-document.syntax.mixed-collection" => {
            Some(FlightDocumentRefusalReason::MixedCollection)
        }
        "flight-document.syntax.multiple-root-values" => {
            Some(FlightDocumentRefusalReason::MultipleRootValues)
        }
        "flight-document.limit.nesting-depth" => {
            Some(FlightDocumentRefusalReason::NestingDepthLimitExceeded)
        }
        "flight-document.node-kind.unregistered" => {
            Some(FlightDocumentRefusalReason::NodeKindUnregistered)
        }
        "flight-document.scalar.number-out-of-range" => {
            Some(FlightDocumentRefusalReason::NumberOutOfRange)
        }
        "flight-document.resource-kind.unregistered" => {
            Some(FlightDocumentRefusalReason::ResourceKindUnregistered)
        }
        "flight-document.resource-resolver.unregistered" => {
            Some(FlightDocumentRefusalReason::ResourceResolverUnregistered)
        }
        "flight-document.resource.unresolved" => {
            Some(FlightDocumentRefusalReason::ResourceUnresolved)
        }
        "flight-document.syntax.root-indentation" => {
            Some(FlightDocumentRefusalReason::RootIndentation)
        }
        "flight-document.structure.root-kind-mismatch" => {
            Some(FlightDocumentRefusalReason::RootKindMismatch)
        }
        "flight-document.limit.scalar-code-units" => {
            Some(FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded)
        }
        "flight-document.scalar.invalid" => Some(FlightDocumentRefusalReason::ScalarInvalid),
        "flight-document.shape-command.unregistered" => {
            Some(FlightDocumentRefusalReason::ShapeCommandUnregistered)
        }
        "flight-document.structure.scenes-empty" => Some(FlightDocumentRefusalReason::ScenesEmpty),
        "flight-document.structure.invalid" => Some(FlightDocumentRefusalReason::StructureInvalid),
        "flight-document.syntax.tab-character" => Some(FlightDocumentRefusalReason::TabCharacter),
        "flight-document.unsupported.tag" => Some(FlightDocumentRefusalReason::TagUnsupported),
        "flight-document.token.key-duplicate" => {
            Some(FlightDocumentRefusalReason::TokenKeyDuplicate)
        }
        "flight-document.token.key-invalid" => Some(FlightDocumentRefusalReason::TokenKeyInvalid),
        "flight-document.token.kind-mismatch" => {
            Some(FlightDocumentRefusalReason::TokenKindMismatch)
        }
        "flight-document.token.mode-invalid" => Some(FlightDocumentRefusalReason::TokenModeInvalid),
        "flight-document.token.mode-unresolved" => {
            Some(FlightDocumentRefusalReason::TokenModeUnresolved)
        }
        "flight-document.token.reference-cycle" => {
            Some(FlightDocumentRefusalReason::TokenReferenceCycle)
        }
        "flight-document.token.reference-invalid" => {
            Some(FlightDocumentRefusalReason::TokenReferenceInvalid)
        }
        "flight-document.token-resolver.unregistered" => {
            Some(FlightDocumentRefusalReason::TokenResolverUnregistered)
        }
        "flight-document.token.unresolved" => Some(FlightDocumentRefusalReason::TokenUnresolved),
        "flight-document.token.value-invalid" => {
            Some(FlightDocumentRefusalReason::TokenValueInvalid)
        }
        "flight-document.limit.total-nodes" => {
            Some(FlightDocumentRefusalReason::TotalNodesLimitExceeded)
        }
        "flight-document.syntax.trailing-flow-comma" => {
            Some(FlightDocumentRefusalReason::TrailingFlowComma)
        }
        "flight-document.syntax.trailing-flow-content" => {
            Some(FlightDocumentRefusalReason::TrailingFlowContent)
        }
        "flight-document.syntax.unexpected-indentation" => {
            Some(FlightDocumentRefusalReason::UnexpectedIndentation)
        }
        "flight-document.syntax.unexpected-token" => {
            Some(FlightDocumentRefusalReason::UnexpectedToken)
        }
        "flight-document.syntax.unterminated-flow-mapping" => {
            Some(FlightDocumentRefusalReason::UnterminatedFlowMapping)
        }
        "flight-document.syntax.unterminated-quoted-scalar" => {
            Some(FlightDocumentRefusalReason::UnterminatedQuotedScalar)
        }
        "flight-document.version.unsupported" => {
            Some(FlightDocumentRefusalReason::VersionUnsupported)
        }
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NodeInteractiveStateProperty string union; the TS package exports no get_/parse_ free functions
pub fn parse_node_interactive_state_property(value: &str) -> Option<NodeInteractiveStateProperty> {
    return match value {
        "alpha" => Some(NodeInteractiveStateProperty::Alpha),
        "scaleX" => Some(NodeInteractiveStateProperty::ScaleX),
        "scaleY" => Some(NodeInteractiveStateProperty::ScaleY),
        "visible" => Some(NodeInteractiveStateProperty::Visible),
        "x" => Some(NodeInteractiveStateProperty::X),
        "y" => Some(NodeInteractiveStateProperty::Y),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS NodeInteractiveStateRefusalReason string union; the TS package exports no get_/parse_ free functions
pub fn parse_node_interactive_state_refusal_reason(
    value: &str,
) -> Option<NodeInteractiveStateRefusalReason> {
    return match value {
        "node-interactive-state.extension.creation-failed" => {
            Some(NodeInteractiveStateRefusalReason::ExtensionCreationFailed)
        }
        "node-interactive-state.extension-kind.unregistered" => {
            Some(NodeInteractiveStateRefusalReason::ExtensionKindUnregistered)
        }
        "node-interactive-state.extension.target-unsupported" => {
            Some(NodeInteractiveStateRefusalReason::ExtensionTargetUnsupported)
        }
        "node-interactive-state.property.target-unsupported" => {
            Some(NodeInteractiveStateRefusalReason::PropertyTargetUnsupported)
        }
        "node-interactive-state.transition.creation-failed" => {
            Some(NodeInteractiveStateRefusalReason::TransitionCreationFailed)
        }
        "node-interactive-state.transition-kind.unregistered" => {
            Some(NodeInteractiveStateRefusalReason::TransitionKindUnregistered)
        }
        _ => None,
    };
}
