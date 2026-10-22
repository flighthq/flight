use flight_entity::{Ref, allocate_entity};
use flight_shading::contract::*;

#[derive(Clone, Debug, Default)]
struct CustomModifier {
    fields: ModifierFields,
}

flight_shading::impl_modifier!(CustomModifier);

fn custom() -> Ref<dyn Modifier> {
    let mut out: CustomModifier = allocate_entity();
    initialize_modifier(
        &mut out,
        "acme.Missing".to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    return crate::modifier_ref(out);
}

fn emissive() -> Ref<dyn Modifier> {
    let mut modifier = create_emissive_modifier();
    modifier.color = 0xffff_ffff;
    return crate::modifier_ref(modifier);
}

mod is_modifier_stack_valid {
    use super::*;

    #[test]
    fn is_false_when_any_kind_is_unregistered() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        assert!(!is_modifier_stack_valid(&registry, &[emissive(), custom()]));
    }

    #[test]
    fn is_true_for_an_empty_stack() {
        assert!(is_modifier_stack_valid(&create_modifier_registry(), &[]));
    }

    #[test]
    fn is_true_when_every_kind_is_registered() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        assert!(is_modifier_stack_valid(&registry, &[emissive()]));
    }
}
