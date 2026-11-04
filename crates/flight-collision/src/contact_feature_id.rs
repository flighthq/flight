// flight-lint: allow(contract-vocabulary) D1 range declaration: packed feature ids use 25-bit fields (< 2^53), exact in TS numbers
pub const FEATURE_INDEX_LIMIT: i64 = 1 << 25;

// flight-lint: allow(contract-vocabulary) D1 range declaration: the packed id is below 2^53 (three 25-bit fields plus flags), exact in TS numbers
pub fn pack_contact_feature_id(
    reference_is_a: bool,
    reference_edge: i64,
    incident_edge: i64,
    second_point: bool,
) -> i64 {
    let ref_flag = if reference_is_a { 1_i64 } else { 0_i64 };
    let second = if second_point { 1_i64 } else { 0_i64 };
    return ref_flag * FEATURE_INDEX_LIMIT * FEATURE_INDEX_LIMIT * 2
        + reference_edge * FEATURE_INDEX_LIMIT * 2
        + incident_edge * 2
        + second;
}
