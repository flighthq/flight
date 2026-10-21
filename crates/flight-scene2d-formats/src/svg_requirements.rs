use std::collections::HashMap;

use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

use crate::svg_counts::collect_svg_counts;

pub const SVG_REQUIREMENT_KEY_NAMESPACE: &str = "svg";

pub fn is_readable_svg(source: &str) -> bool {
    return collect_svg_counts(&mut HashMap::new(), source);
}

// flight-lint: allow(hashmap-iteration) create_requirement_set sorts and deduplicates the copied requirements
pub fn parse_svg_requirements(source: &str) -> RequirementSet {
    let mut counts = HashMap::new();
    collect_svg_counts(&mut counts, source);
    let requirements: Vec<Requirement> = counts
        .keys()
        .map(|kind| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{SVG_REQUIREMENT_KEY_NAMESPACE}.{kind}"),
        })
        .collect();
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}
