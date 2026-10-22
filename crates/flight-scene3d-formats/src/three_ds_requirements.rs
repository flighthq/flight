use crate::scene3d_format_requirements::THREE_DS_REQUIREMENT_KEY_NAMESPACE;
use crate::three_ds_chunk_census::{collect_three_ds_chunk_counts, get_three_ds_chunk_name};
use crate::three_ds_chunk_requirements::THREE_DS_CHUNK_SCENE_REQUIREMENTS;
use flight_entity::Uint8Array;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_three_ds_requirements(source: &Uint8Array) -> RequirementSet {
    let mut requirements = Vec::new();
    let mut counts = Vec::new();
    if collect_three_ds_chunk_counts(&mut counts, source) {
        for row in counts {
            let chunk_name = get_three_ds_chunk_name(row.chunk_id);
            requirements.push(Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: format!("{THREE_DS_REQUIREMENT_KEY_NAMESPACE}.{chunk_name}"),
            });
            if let Some(entry) = THREE_DS_CHUNK_SCENE_REQUIREMENTS
                .iter()
                .find(|entry| entry.feature == chunk_name)
            {
                requirements.extend(entry.requirements.iter().cloned());
            }
        }
    }
    return create_requirement_set(
        &[
            RequirementFacet::DocumentFormat,
            RequirementFacet::SceneMaterialKind,
        ],
        &requirements,
    );
}
