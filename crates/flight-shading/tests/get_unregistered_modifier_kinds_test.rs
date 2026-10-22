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
    let mut modifier = create_emissive_modifier();
    modifier.color = 0xffff_ffff;
    return crate::modifier_ref(modifier);
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
        let mut unregistered = Vec::with_capacity(4);
        unregistered.push("stale.Kind".to_string());
        let capacity = unregistered.capacity();
        get_unregistered_modifier_kinds(&mut unregistered, &registry, &stack);
        assert_eq!(unregistered, vec!["acme.Missing", "acme.Other"]);
        assert_eq!(unregistered.capacity(), capacity);
    }

    #[test]
    fn reports_a_built_in_kind_until_built_ins_are_installed() {
        let mut unregistered = Vec::new();
        get_unregistered_modifier_kinds(
            &mut unregistered,
            &create_modifier_registry(),
            &[emissive()],
        );
        assert_eq!(unregistered, vec![EMISSIVE_MODIFIER_KIND]);
    }

    #[test]
    fn returns_empty_for_an_empty_stack() {
        let mut unregistered = Vec::with_capacity(2);
        unregistered.push("stale.Kind".to_string());
        let capacity = unregistered.capacity();
        get_unregistered_modifier_kinds(&mut unregistered, &create_modifier_registry(), &[]);
        assert!(unregistered.is_empty());
        assert_eq!(unregistered.capacity(), capacity);
    }

    #[test]
    fn returns_empty_when_every_kind_is_registered() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let mut unregistered = vec!["stale.Kind".to_string()];
        get_unregistered_modifier_kinds(&mut unregistered, &registry, &[emissive()]);
        assert!(unregistered.is_empty());
    }
}
