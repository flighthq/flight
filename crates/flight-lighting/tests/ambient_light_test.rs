use flight_entity::{get_entity_uid, set_entity_uid};
use flight_lighting::contract::*;

mod clone_ambient_light {
    use super::*;

    #[test]
    fn copies_fields_into_a_fresh_entity_identity() {
        let mut source = create_ambient_light();
        source.color = 0x1122_33ff;
        source.enabled = false;
        source.intensity = 0.5;
        source.intensity_unit = LUX_LIGHT_UNIT;
        set_entity_uid(&mut source, "source".to_string());
        let mut copy = clone_ambient_light(&source);
        assert_eq!(copy.color, 0x1122_33ff);
        assert!(!copy.enabled);
        assert_eq!(copy.intensity, 0.5);
        assert_eq!(copy.intensity_unit, LUX_LIGHT_UNIT);
        assert_eq!(copy.kind, AMBIENT_LIGHT_KIND);
        assert_ne!(get_entity_uid(&mut copy), "source");
    }
}

mod create_ambient_light {
    use super::*;

    #[test]
    fn applies_source_defaults() {
        let light = create_ambient_light();
        assert_eq!(light.color, 0xffff_ffff);
        assert!(light.enabled);
        assert_eq!(light.intensity, 1.0);
        assert_eq!(light.intensity_unit, UNITLESS_LIGHT_UNIT);
        assert_eq!(light.kind, AMBIENT_LIGHT_KIND);
    }
}

mod initialize_ambient_light {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_ambient_light();
        out.color = 0x00ff_00ff;
        out.enabled = false;
        out.intensity = 2.0;
        out.intensity_unit = LUX_LIGHT_UNIT;
        set_entity_uid(&mut out, "ambient".to_string());
        initialize_ambient_light(&mut out);
        assert_eq!(
            (out.color, out.enabled, out.intensity, out.intensity_unit),
            (0xffff_ffff, true, 1.0, UNITLESS_LIGHT_UNIT)
        );
        assert_eq!(get_entity_uid(&mut out), "ambient");
    }
}
