//! flight-compiler: readonly-fields RequirementSet

use flight_entity::{EntityRuntimeSlot, allocate_entity};

use crate::types::{Requirement, RequirementFacet, get_requirement_facet_string};

/// A canonical set of producer facts and the facets for which missing facts prove absence.
#[derive(Clone, Debug, PartialEq)]
pub struct RequirementSet {
    pub covers: Vec<RequirementFacet>,
    pub requirements: Vec<Requirement>,
    runtime: EntityRuntimeSlot,
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
    let mut difference: Vec<Requirement> = Vec::new();
    for requirement in &requirements.requirements {
        if covers.contains(&requirement.facet)
            && find_requirement(&baseline.requirements, requirement).is_none()
        {
            difference.push(requirement.clone());
        }
    }
    return create_requirement_set(&covers, &difference);
}

fn distinct_sorted(values: &[RequirementFacet]) -> Vec<RequirementFacet> {
    let mut ordered: Vec<RequirementFacet> = Vec::new();
    for value in values {
        if !ordered.contains(value) {
            ordered.push(*value);
        }
    }
    ordered.sort_by(|a, b| {
        let left: &str = get_requirement_facet_string(*a);
        let right: &str = get_requirement_facet_string(*b);
        return left.cmp(right);
    });
    return ordered;
}

fn distinct_sorted_requirements(requirements: &[Requirement]) -> Vec<Requirement> {
    let mut ordered: Vec<Requirement> = Vec::new();
    for requirement in requirements {
        // A repeated identity replaces the earlier fact in place, keeping its first position.
        let mut replaced = false;
        let mut index: usize = 0;
        while index < ordered.len() {
            if ordered[index].facet == requirement.facet && ordered[index].key == requirement.key {
                ordered[index] = requirement.clone();
                replaced = true;
                break;
            }
            index += 1;
        }
        if !replaced {
            ordered.push(requirement.clone());
        }
    }
    ordered.sort_by(|a, b| {
        let left: &str = get_requirement_facet_string(a.facet);
        let right: &str = get_requirement_facet_string(b.facet);
        if left != right {
            return left.cmp(right);
        }
        let left_key: &str = &a.key;
        let right_key: &str = &b.key;
        return left_key.cmp(right_key);
    });
    return ordered;
}

// The index of the requirement with `probe`'s identity (facet and key), the identity the source keyed on.
fn find_requirement(requirements: &[Requirement], probe: &Requirement) -> Option<usize> {
    let mut index: usize = 0;
    while index < requirements.len() {
        if requirements[index].facet == probe.facet && requirements[index].key == probe.key {
            return Some(index);
        }
        index += 1;
    }
    return None;
}

fn intersect_sorted(
    first: &[RequirementFacet],
    second: &[RequirementFacet],
) -> Vec<RequirementFacet> {
    let mut intersection: Vec<RequirementFacet> = Vec::new();
    for value in first {
        if second.contains(value) {
            intersection.push(*value);
        }
    }
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
        for requirement in &requirement_set.requirements {
            requirements.push(requirement.clone());
        }
    }
    return create_requirement_set(&covers, &requirements);
}

impl Default for RequirementSet {
    fn default() -> Self {
        return RequirementSet {
            covers: Vec::new(),
            requirements: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(RequirementSet);
