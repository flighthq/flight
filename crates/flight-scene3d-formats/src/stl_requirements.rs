use crate::scene3d_format_requirements::STL_REQUIREMENT_KEY_NAMESPACE;
use crate::stl_features::{STL_MESH_FEATURE, StlFeatures, StlVariant, collect_stl_features};
use flight_entity::Uint8Array;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_stl_requirements(bytes: &Uint8Array) -> RequirementSet {
    let mut features = StlFeatures {
        triangle_count: 0,
        variant: StlVariant::Ascii,
    };
    let requirements = if collect_stl_features(&mut features, bytes) {
        vec![Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{}.{}", STL_REQUIREMENT_KEY_NAMESPACE, STL_MESH_FEATURE),
        }]
    } else {
        Vec::new()
    };
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}
