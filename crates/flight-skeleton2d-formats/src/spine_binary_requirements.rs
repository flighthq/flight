use flight_entity::Uint8Array;
use flight_requirement::contract::{
    Requirement, RequirementFacet, RequirementSet, create_requirement_set,
};

use crate::spine_binary_section_counts::collect_spine_binary_section_counts;

pub const SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE: &str = "spine-binary";

pub fn is_readable_spine_binary(source: &Uint8Array) -> bool {
    return collect_spine_binary_section_counts(source).is_some();
}

// flight-lint: allow(hashmap-iteration) keys are sorted before requirement construction
pub fn parse_spine_binary_requirements(source: &Uint8Array) -> RequirementSet {
    let mut kinds = collect_spine_binary_section_counts(source)
        .into_iter()
        .flat_map(|counts| counts.into_keys())
        .collect::<Vec<_>>();
    kinds.sort_unstable();
    let requirements = kinds
        .into_iter()
        .map(|kind| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.{kind}"),
        })
        .collect::<Vec<_>>();
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}
