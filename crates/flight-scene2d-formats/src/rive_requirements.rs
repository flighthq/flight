use std::collections::{HashMap, HashSet};

use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;
use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

use crate::rive_core_type_census::collect_rive_core_type_counts;
use crate::rive_core_types::{get_rive_core_type_name, get_rive_core_type_parent};
use crate::rive_handlers::register_all_rive_handlers;
use crate::rive_import_registry::create_rive_import_registry;

pub const RIVE_REQUIREMENT_KEY_NAMESPACE: &str = "riv";

// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
// flight-lint: allow(hashmap-iteration) family names are deduplicated and sorted before becoming observable
pub fn parse_rive_requirements(
    source: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> RequirementSet {
    let mut counts = HashMap::new();
    let mut requirements = Vec::new();
    if collect_rive_core_type_counts(&mut counts, source, diagnostics) {
        let roots = rive_family_root_keys();
        let mut families = counts
            .into_keys()
            .map(|type_key| resolve_rive_family_name(type_key, &roots))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        families.sort_unstable();
        requirements.extend(families.into_iter().map(|family| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{RIVE_REQUIREMENT_KEY_NAMESPACE}.{family}"),
        }));
    }
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}

fn resolve_rive_family_name(type_key: u64, roots: &HashSet<i32>) -> String {
    let Ok(type_key) = i32::try_from(type_key) else {
        return unknown_rive_type_name(type_key);
    };
    let mut current = Some(type_key);
    while let Some(key) = current {
        if key == RIVE_NO_PARENT {
            break;
        }
        if roots.contains(&key) {
            return get_rive_core_type_name(key)
                .map(str::to_string)
                .unwrap_or_else(|| unknown_rive_type_name(key as u64));
        }
        current = get_rive_core_type_parent(key);
    }
    return get_rive_core_type_name(type_key)
        .map(str::to_string)
        .unwrap_or_else(|| unknown_rive_type_name(type_key as u64));
}

fn rive_family_root_keys() -> HashSet<i32> {
    let mut registry = create_rive_import_registry();
    register_all_rive_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
    return registry
        .handlers
        .into_iter()
        .map(|entry| entry.type_key)
        .collect();
}

// flight-lint: allow(contract-vocabulary) Rive type keys are source-format varuints
fn unknown_rive_type_name(type_key: u64) -> String {
    return format!("Unknown({type_key})");
}

const RIVE_NO_PARENT: i32 = -1;
