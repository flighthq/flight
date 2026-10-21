use std::collections::HashMap;

use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

use crate::lottie_counts::collect_lottie_counts;

pub const LOTTIE_REQUIREMENT_KEY_NAMESPACE: &str = "lottie";

pub fn is_readable_lottie(json: &str) -> bool {
    return collect_lottie_counts(&mut HashMap::new(), json);
}

// flight-lint: allow(hashmap-iteration) keys are sorted before requirement construction
pub fn parse_lottie_requirements(json: &str) -> RequirementSet {
    let mut counts = HashMap::new();
    collect_lottie_counts(&mut counts, json);
    let mut kinds = counts.into_keys().collect::<Vec<_>>();
    kinds.sort_unstable();
    let requirements = kinds
        .into_iter()
        .map(|kind| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{LOTTIE_REQUIREMENT_KEY_NAMESPACE}.{kind}"),
        })
        .collect::<Vec<_>>();
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}
