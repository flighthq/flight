use flight_shading::contract::*;

mod is_built_in_modifier_slot {
    use super::*;

    #[test]
    fn accepts_every_built_in_slot() {
        for slot in [
            MODIFIER_SLOT_DIFFUSE,
            MODIFIER_SLOT_EFFECT,
            MODIFIER_SLOT_EMISSIVE,
            MODIFIER_SLOT_NORMAL,
            MODIFIER_SLOT_SPECULAR,
            MODIFIER_SLOT_VERTEX,
        ] {
            assert!(is_built_in_modifier_slot(slot));
        }
    }

    #[test]
    fn rejects_arbitrary_strings() {
        assert!(!is_built_in_modifier_slot(""));
        assert!(!is_built_in_modifier_slot("diffuse"));
    }

    #[test]
    fn rejects_reserved_and_vendor_prefixed_slots() {
        assert!(!is_built_in_modifier_slot("Ambient"));
        assert!(!is_built_in_modifier_slot("Shadow"));
        assert!(!is_built_in_modifier_slot("acme.Weird"));
    }
}
