use flight_requirement::contract::{
    Requirement, RequirementFacet, RequirementSet, create_requirement_set,
};

use crate::spine_json_section_counts::collect_spine_json_section_counts;

pub const SPINE_JSON_REQUIREMENT_KEY_NAMESPACE: &str = "spine-json";

pub fn is_readable_spine_json(json: &str) -> bool {
    return collect_spine_json_section_counts(json).is_some();
}

// flight-lint: allow(hashmap-iteration) keys are sorted before requirement construction
pub fn parse_spine_json_requirements(json: &str) -> RequirementSet {
    let mut kinds = collect_spine_json_section_counts(json)
        .into_iter()
        .flat_map(|counts| counts.into_keys())
        .collect::<Vec<_>>();
    kinds.sort_unstable();
    let requirements = kinds
        .into_iter()
        .map(|kind| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.{kind}"),
        })
        .collect::<Vec<_>>();
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}
