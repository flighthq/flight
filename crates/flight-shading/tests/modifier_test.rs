use flight_entity::allocate_entity;
use flight_shading::contract::*;

#[derive(Clone, Debug, Default)]
struct AcmeModifier {
    fields: ModifierFields,
    pub variant: String,
}

flight_shading::impl_modifier!(AcmeModifier, |value: &AcmeModifier| {
    return value.variant.clone();
});

fn create_acme_modifier(kind: &str, slot: &str, variant: &str) -> AcmeModifier {
    let mut out: AcmeModifier = allocate_entity();
    initialize_modifier(&mut out, kind.to_string(), slot.to_string());
    out.variant = variant.to_string();
    return out;
}

mod initialize_modifier {
    use super::*;

    #[test]
    fn initializes_a_foreign_kind_and_vendor_slot() {
        let modifier = create_acme_modifier("acme.Duotone", "acme.Weird", "soft");
        assert_eq!(modifier.kind, "acme.Duotone");
        assert_eq!(modifier.slot, "acme.Weird");
    }

    #[test]
    fn rewrites_only_the_open_base_fields() {
        let mut modifier = create_acme_modifier("acme.First", MODIFIER_SLOT_EFFECT, "soft");
        initialize_modifier(
            &mut modifier,
            "acme.Second".to_string(),
            MODIFIER_SLOT_NORMAL.to_string(),
        );
        assert_eq!(modifier.kind, "acme.Second");
        assert_eq!(modifier.slot, MODIFIER_SLOT_NORMAL);
        assert_eq!(modifier.variant, "soft");
    }
}

mod modifier_family {
    use super::*;

    #[test]
    fn accepts_any_string_kind_and_slot() {
        let modifier = create_acme_modifier("not-even-namespaced", "ambient", "x");
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().kind, "not-even-namespaced");
        assert_eq!(base.modifier_fields().slot, "ambient");
    }

    #[test]
    fn lets_custom_kinds_supply_structural_signatures_without_reflection() {
        let modifier = create_acme_modifier("acme.Custom", MODIFIER_SLOT_EFFECT, "dual");
        assert_eq!(modifier.modifier_define_signature(), "dual");
    }
}
