use crate::{
    MaterialConversionDropReason, MaterialConversionExplanation,
    PhongMaterial, SpecularGlossinessPbrMaterial,
};

pub fn explain_phong_conversion(source: &PhongMaterial) -> MaterialConversionExplanation {
    if source.specular_map.is_none() {
        return MaterialConversionExplanation {
            dropped_maps: vec![],
            reason: None,
        };
    }
    return MaterialConversionExplanation {
        dropped_maps: vec!["specular_map".to_string()],
        reason: Some(MaterialConversionDropReason::UnsupportedByTargetModel),
    };
}

pub fn explain_specular_glossiness_conversion(
    source: &SpecularGlossinessPbrMaterial,
) -> MaterialConversionExplanation {
    if source.specular_glossiness_map.is_none() {
        return MaterialConversionExplanation {
            dropped_maps: vec![],
            reason: None,
        };
    }
    return MaterialConversionExplanation {
        dropped_maps: vec!["specular_glossiness_map".to_string()],
        reason: Some(MaterialConversionDropReason::IncompatibleChannelSemantics),
    };
}
