//! Gradient endpoint diagnostics (TS `explainMorphShapeGradientEndpoints.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use crate::types::*;

const GRADIENT_ENDPOINT_ISSUE_NONE: u32 = 0;
const GRADIENT_ENDPOINT_ISSUE_EMPTY: u32 = 1;
const GRADIENT_ENDPOINT_ISSUE_START_COMPONENTS: u32 = 2;
const GRADIENT_ENDPOINT_ISSUE_END_COMPONENTS: u32 = 3;
const GRADIENT_ENDPOINT_ISSUE_STOP_COUNT: u32 = 4;

/// Reports whether two gradient endpoints can be sampled together (TS
/// `explainMorphShapeGradientEndpoints`).
pub fn explain_morph_shape_gradient_endpoints(
    start: &MorphShapeGradientEndpoint,
    end: &MorphShapeGradientEndpoint,
) -> MorphShapeGradientEndpointExplanation {
    let issue = get_morph_shape_gradient_endpoint_issue(start, end);
    return MorphShapeGradientEndpointExplanation {
        end_stop_count: end.colors.len(),
        reason: get_reason(issue),
        start_stop_count: start.colors.len(),
        supported: issue == GRADIENT_ENDPOINT_ISSUE_NONE,
    };
}

/// The numeric issue code shared with the paint appenders (TS
/// `getMorphShapeGradientEndpointIssue`).
pub fn get_morph_shape_gradient_endpoint_issue(
    start: &MorphShapeGradientEndpoint,
    end: &MorphShapeGradientEndpoint,
) -> u32 {
    let start_count = start.colors.len();
    let end_count = end.colors.len();
    if start_count == 0 || end_count == 0 {
        return GRADIENT_ENDPOINT_ISSUE_EMPTY;
    }
    if start.alphas.len() != start_count || start.ratios.len() != start_count {
        return GRADIENT_ENDPOINT_ISSUE_START_COMPONENTS;
    }
    if end.alphas.len() != end_count || end.ratios.len() != end_count {
        return GRADIENT_ENDPOINT_ISSUE_END_COMPONENTS;
    }
    if start_count != end_count {
        return GRADIENT_ENDPOINT_ISSUE_STOP_COUNT;
    }
    return GRADIENT_ENDPOINT_ISSUE_NONE;
}

fn get_reason(issue: u32) -> MorphShapeGradientEndpointReason {
    return match issue {
        GRADIENT_ENDPOINT_ISSUE_EMPTY => MorphShapeGradientEndpointReason::EmptyGradient,
        GRADIENT_ENDPOINT_ISSUE_START_COMPONENTS => {
            MorphShapeGradientEndpointReason::StartStopComponentCountMismatch
        }
        GRADIENT_ENDPOINT_ISSUE_END_COMPONENTS => {
            MorphShapeGradientEndpointReason::EndStopComponentCountMismatch
        }
        GRADIENT_ENDPOINT_ISSUE_STOP_COUNT => MorphShapeGradientEndpointReason::StopCountMismatch,
        _ => MorphShapeGradientEndpointReason::Ok,
    };
}
