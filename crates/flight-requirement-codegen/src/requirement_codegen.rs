use std::collections::HashSet;

use flight_entity::allocate_entity;
use flight_requirement::contract::{Requirement, RequirementSet, get_requirement_facet_string};
use flight_requirement_catalog::{RequirementCatalog, find_requirement_catalog_entries};

use crate::types::{RequirementCodegenPlan, RequirementDeclination};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_requirement::RequirementFacet;
    use flight_requirement_catalog::create_requirement_catalog;

    #[test]
    fn requirement_codegen_plan_new_matches_create_requirement_codegen_plan() {
        let catalog = create_requirement_catalog(&[], &[], &[]);
        let requirements = RequirementSet::new(&[RequirementFacet::SceneNodeKind], &[]);
        assert_eq!(
            RequirementCodegenPlan::new(&catalog, &requirements, "webgl"),
            create_requirement_codegen_plan(&catalog, &requirements, "webgl")
        );
    }
}

pub fn create_requirement_codegen_plan(
    catalog: &RequirementCatalog,
    requirements: &RequirementSet,
    backend: &str,
) -> RequirementCodegenPlan {
    let mut out: RequirementCodegenPlan = allocate_entity();
    initialize_requirement_codegen_plan(&mut out, catalog, requirements, backend);
    return out;
}

pub fn initialize_requirement_codegen_plan(
    out: &mut RequirementCodegenPlan,
    catalog: &RequirementCatalog,
    requirements: &RequirementSet,
    backend: &str,
) {
    let mut entries = Vec::new();
    let mut declined = Vec::new();
    let mut unresolved = Vec::new();
    let mut seen = HashSet::new();
    for requirement in expand_requirements(catalog, &requirements.requirements) {
        let identity = requirement_identity(&requirement);
        if !seen.insert(identity) {
            continue;
        }
        let matches =
            find_requirement_catalog_entries(catalog, backend, requirement.facet, &requirement.key);
        if !matches.is_empty() {
            entries.extend(matches);
            continue;
        }
        let disposition = catalog
            .dispositions
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .find(|candidate| {
                candidate.backend == backend
                    && candidate.facet == requirement.facet
                    && candidate.kind == requirement.key
            });
        if let Some(disposition) = disposition {
            declined.push(RequirementDeclination {
                reason: disposition.reason.clone(),
                requirement,
            });
        } else {
            unresolved.push(requirement);
        }
    }
    out.backend = backend.to_string();
    out.declined = declined;
    out.entries = entries;
    out.unresolved = unresolved;
}

fn expand_requirements(
    catalog: &RequirementCatalog,
    requirements: &[Requirement],
) -> Vec<Requirement> {
    let translations = catalog.translations.as_deref().unwrap_or(&[]);
    if translations.is_empty() {
        return requirements.to_vec();
    }
    let mut expanded = requirements.to_vec();
    for requirement in requirements {
        let namespace = requirement
            .key
            .find('.')
            .map(|separator| &requirement.key[..separator]);
        for translation in translations {
            if translation.from.facet != requirement.facet {
                continue;
            }
            let matches = translation.from.key == requirement.key
                || namespace == Some(translation.from.key.as_str());
            if matches {
                expanded.extend(translation.to.iter().cloned());
            }
        }
    }
    return expanded;
}

fn requirement_identity(requirement: &Requirement) -> String {
    return [
        get_requirement_facet_string(requirement.facet),
        requirement.key.as_str(),
    ]
    .join("\0");
}

impl RequirementCodegenPlan {
    pub fn new(catalog: &RequirementCatalog, requirements: &RequirementSet, backend: &str) -> Self {
        return create_requirement_codegen_plan(catalog, requirements, backend);
    }
}
