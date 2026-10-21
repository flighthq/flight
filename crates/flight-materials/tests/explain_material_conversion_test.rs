use flight_materials::classic_materials::create_phong_material;
use flight_materials::explain_material_conversion::*;
use flight_materials::pbr_materials::create_specular_glossiness_pbr_material;
use flight_materials::*;

mod explain_phong_conversion {
    use super::*;

    #[test]
    fn no_drop_when_no_specular_map() {
        let phong = create_phong_material(None);
        let explanation = explain_phong_conversion(&phong);
        assert!(explanation.dropped_maps.is_empty());
        assert!(explanation.reason.is_none());
    }

    #[test]
    fn drops_specular_map_with_unsupported_reason() {
        let mut phong = create_phong_material(None);
        phong.specular_map = Some(flight_entity::allocate_entity());
        let explanation = explain_phong_conversion(&phong);
        assert_eq!(explanation.dropped_maps, vec!["specular_map"]);
        assert_eq!(
            explanation.reason,
            Some(MaterialConversionDropReason::UnsupportedByTargetModel)
        );
    }
}

mod explain_specular_glossiness_conversion {
    use super::*;

    #[test]
    fn no_drop_when_no_map() {
        let mat = create_specular_glossiness_pbr_material(None);
        let explanation = explain_specular_glossiness_conversion(&mat);
        assert!(explanation.dropped_maps.is_empty());
        assert!(explanation.reason.is_none());
    }

    #[test]
    fn drops_specular_glossiness_map_with_channel_semantics_reason() {
        let mut mat = create_specular_glossiness_pbr_material(None);
        mat.specular_glossiness_map = Some(flight_entity::allocate_entity());
        let explanation = explain_specular_glossiness_conversion(&mat);
        assert_eq!(explanation.dropped_maps, vec!["specular_glossiness_map"]);
        assert_eq!(
            explanation.reason,
            Some(MaterialConversionDropReason::IncompatibleChannelSemantics)
        );
    }
}
