use flight_entity::{Ref, allocate_entity};
use flight_shading::contract::*;

#[derive(Clone, Debug, Default)]
struct CustomModifier {
    fields: ModifierFields,
}

flight_shading::impl_modifier!(CustomModifier);

fn custom(kind: &str, slot: &str) -> Ref<dyn Modifier> {
    let mut out: CustomModifier = allocate_entity();
    initialize_modifier(&mut out, kind.to_string(), slot.to_string());
    return crate::modifier_ref(out);
}

fn emissive() -> Ref<dyn Modifier> {
    return crate::modifier_ref(create_emissive_modifier(&EmissiveModifierOptions {
        color: 0xffff_ffff,
        strength: None,
        mask: None,
        facing: None,
        facing_softness: None,
    }));
}

mod get_unregistered_modifier_kinds {
    use super::*;

    #[test]
    fn names_each_unknown_kind_once_in_first_seen_order() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let stack = vec![
            custom("acme.Missing", MODIFIER_SLOT_EFFECT),
            emissive(),
            custom("acme.Other", MODIFIER_SLOT_NORMAL),
            custom("acme.Missing", MODIFIER_SLOT_EFFECT),
        ];
        assert_eq!(
            get_unregistered_modifier_kinds(&registry, &stack),
            vec!["acme.Missing", "acme.Other"]
        );
    }

    #[test]
    fn reports_a_built_in_kind_until_built_ins_are_installed() {
        assert_eq!(
            get_unregistered_modifier_kinds(&create_modifier_registry(), &[emissive()]),
            vec![EMISSIVE_MODIFIER_KIND]
        );
    }

    #[test]
    fn returns_empty_for_an_empty_stack() {
        assert!(get_unregistered_modifier_kinds(&create_modifier_registry(), &[]).is_empty());
    }

    #[test]
    fn returns_empty_when_every_kind_is_registered() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        assert!(get_unregistered_modifier_kinds(&registry, &[emissive()]).is_empty());
    }
}
