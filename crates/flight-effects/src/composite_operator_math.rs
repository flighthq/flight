use crate::contract::*;

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_composite_operator_factors(
    out: &mut [f32],
    operator: &str,
    source_alpha: f32,
    backdrop_alpha: f32,
) {
    let source = source_alpha;
    let backdrop = backdrop_alpha;
    let (fa, fb) = match operator {
        COMPOSITE_OPERATOR_CLEAR => (0.0, 0.0),
        COMPOSITE_OPERATOR_COPY => (1.0, 0.0),
        COMPOSITE_OPERATOR_DESTINATION_ATOP => (1.0 - backdrop, source),
        COMPOSITE_OPERATOR_DESTINATION_IN => (0.0, source),
        COMPOSITE_OPERATOR_DESTINATION_OUT => (0.0, 1.0 - source),
        COMPOSITE_OPERATOR_DESTINATION_OVER => (1.0 - backdrop, 1.0),
        COMPOSITE_OPERATOR_SOURCE_ATOP => (backdrop, 1.0 - source),
        COMPOSITE_OPERATOR_SOURCE_IN => (backdrop, 0.0),
        COMPOSITE_OPERATOR_SOURCE_OUT => (1.0 - backdrop, 0.0),
        COMPOSITE_OPERATOR_XOR => (1.0 - backdrop, 1.0 - source),
        _ => (1.0, 1.0 - source),
    };
    out[0] = fa;
    out[1] = fb;
}
