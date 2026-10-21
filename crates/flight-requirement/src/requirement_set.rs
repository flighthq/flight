use std::collections::HashMap;

use flight_entity::allocate_entity;

use crate::types::{Requirement, RequirementFacet, RequirementSet, get_requirement_facet_string};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn requirement(facet: RequirementFacet, key: &str) -> Requirement {
        return Requirement {
            facet,
            key: key.to_string(),
        };
    }

    #[test]
    fn requirement_set_diff_matches_the_free_function() {
        let requirements = RequirementSet::new(
            &[RequirementFacet::SceneNodeKind],
            &[requirement(RequirementFacet::SceneNodeKind, "Shape")],
        );
        let baseline = RequirementSet::new(&[RequirementFacet::SceneNodeKind], &[]);
        assert_eq!(
            requirements.diff(&baseline),
            diff_requirement_sets(&requirements, &baseline)
        );
    }

    #[test]
    fn requirement_set_new_matches_create_requirement_set() {
        let covers = [RequirementFacet::SceneNodeKind];
        let requirements = [requirement(RequirementFacet::SceneNodeKind, "Shape")];
        assert_eq!(
            RequirementSet::new(&covers, &requirements),
            create_requirement_set(&covers, &requirements)
        );
    }
}

pub fn create_requirement_set(
    covers: &[RequirementFacet],
    requirements: &[Requirement],
) -> RequirementSet {
    let mut out: RequirementSet = allocate_entity();
    initialize_requirement_set(&mut out, covers, requirements);
    return out;
}

pub fn initialize_requirement_set(
    out: &mut RequirementSet,
    covers: &[RequirementFacet],
    requirements: &[Requirement],
) {
    out.covers = distinct_sorted(covers);
    out.requirements = distinct_sorted_requirements(requirements);
}

/// Subtracts facts only for facets that both operands inspected.
pub fn diff_requirement_sets(
    requirements: &RequirementSet,
    baseline: &RequirementSet,
) -> RequirementSet {
    let covers = intersect_sorted(&requirements.covers, &baseline.covers);
    let mut baseline_keys: HashMap<(RequirementFacet, &str), ()> = HashMap::new();
    for requirement in &baseline.requirements {
        baseline_keys.insert(requirement_identity(requirement), ());
    }
    let difference: Vec<Requirement> = requirements
        .requirements
        .iter()
        .filter(|requirement| {
            covers.contains(&requirement.facet)
                && !baseline_keys.contains_key(&requirement_identity(requirement))
        })
        .cloned()
        .collect();
    return create_requirement_set(&covers, &difference);
}

fn distinct_sorted(values: &[RequirementFacet]) -> Vec<RequirementFacet> {
    let mut seen: HashMap<RequirementFacet, ()> = HashMap::new();
    let mut ordered: Vec<RequirementFacet> = Vec::new();
    for value in values {
        if !seen.contains_key(value) {
            seen.insert(*value, ());
            ordered.push(*value);
        }
    }
    ordered.sort_by(|a, b| get_requirement_facet_string(*a).cmp(get_requirement_facet_string(*b)));
    return ordered;
}

fn distinct_sorted_requirements(requirements: &[Requirement]) -> Vec<Requirement> {
    let mut by_identity: HashMap<(RequirementFacet, &str), usize> = HashMap::new();
    let mut ordered: Vec<Requirement> = Vec::new();
    for requirement in requirements {
        let identity = requirement_identity(requirement);
        if let Some(index) = by_identity.get(&identity) {
            ordered[*index] = requirement.clone();
        } else {
            by_identity.insert(identity, ordered.len());
            ordered.push(requirement.clone());
        }
    }
    ordered.sort_by(|a, b| {
        get_requirement_facet_string(a.facet)
            .cmp(get_requirement_facet_string(b.facet))
            .then_with(|| a.key.cmp(&b.key))
    });
    return ordered;
}

fn intersect_sorted(
    first: &[RequirementFacet],
    second: &[RequirementFacet],
) -> Vec<RequirementFacet> {
    let mut second_values: HashMap<RequirementFacet, ()> = HashMap::new();
    for value in second {
        second_values.insert(*value, ());
    }
    let intersection: Vec<RequirementFacet> = first
        .iter()
        .filter(|value| second_values.contains_key(value))
        .copied()
        .collect();
    return distinct_sorted(&intersection);
}

/// Unions known facts while retaining completeness only for facets every input inspected.
pub fn merge_requirement_sets(requirement_sets: &[&RequirementSet]) -> RequirementSet {
    let Some(first) = requirement_sets.first() else {
        return create_requirement_set(&[], &[]);
    };
    let mut covers = distinct_sorted(&first.covers);
    let mut requirements: Vec<Requirement> = Vec::new();
    for requirement_set in requirement_sets {
        covers = intersect_sorted(&covers, &requirement_set.covers);
        requirements.extend(requirement_set.requirements.iter().cloned());
    }
    return create_requirement_set(&covers, &requirements);
}

fn requirement_identity(requirement: &Requirement) -> (RequirementFacet, &str) {
    return (requirement.facet, &requirement.key);
}

impl RequirementSet {
    pub fn new(covers: &[RequirementFacet], requirements: &[Requirement]) -> Self {
        return create_requirement_set(covers, requirements);
    }

    pub fn diff(&self, baseline: &RequirementSet) -> Self {
        return diff_requirement_sets(self, baseline);
    }
}
