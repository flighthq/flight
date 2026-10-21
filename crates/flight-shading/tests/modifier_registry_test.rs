use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_record_keys};
use flight_shading::contract::*;

fn definition(kind: &str, slot: &str) -> Ref<ModifierDefinition> {
    return Arc::new(RwLock::new(ModifierDefinition {
        kind: kind.to_string(),
        slot: slot.to_string(),
        get_define_signature: None,
    }));
}

mod create_modifier_registry {
    use super::*;

    #[test]
    fn allocates_an_empty_registry() {
        assert!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &create_modifier_registry().definitions);
                collected
            }
            .is_empty()
        );
    }

    #[test]
    fn allocates_fresh_caller_owned_state() {
        let mut first = create_modifier_registry();
        let second = create_modifier_registry();
        register_modifier(&mut first, definition("acme.Foo", MODIFIER_SLOT_EFFECT));
        assert!(resolve_modifier(&second, "acme.Foo").is_none());
    }
}

mod register_modifier {
    use super::*;

    #[test]
    fn is_last_write_wins_without_duplicating_the_key() {
        let mut registry = create_modifier_registry();
        register_modifier(
            &mut registry,
            definition("acme.Foo", MODIFIER_SLOT_EMISSIVE),
        );
        register_modifier(&mut registry, definition("acme.Foo", MODIFIER_SLOT_NORMAL));
        assert_eq!(
            resolve_modifier(&registry, "acme.Foo")
                .unwrap()
                .read()
                .unwrap()
                .slot,
            MODIFIER_SLOT_NORMAL
        );
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &registry.definitions);
                collected
            },
            vec!["acme.Foo"]
        );
    }

    #[test]
    fn retains_definition_and_callback_identity() {
        let callback: ModifierDefineSignature = Arc::new(|modifier| {
            return modifier.modifier_define_signature();
        });
        let source = Arc::new(RwLock::new(ModifierDefinition {
            kind: "acme.Foo".to_string(),
            slot: MODIFIER_SLOT_EFFECT.to_string(),
            get_define_signature: Some(callback.clone()),
        }));
        let mut registry = create_modifier_registry();
        register_modifier(&mut registry, source.clone());
        let resolved = resolve_modifier(&registry, "acme.Foo").unwrap();
        assert!(Arc::ptr_eq(&resolved, &source));
        assert!(Arc::ptr_eq(
            resolved
                .read()
                .unwrap()
                .get_define_signature
                .as_ref()
                .unwrap(),
            &callback
        ));
    }

    #[test]
    fn stores_a_definition_retrievable_by_kind() {
        let mut registry = create_modifier_registry();
        register_modifier(
            &mut registry,
            definition("acme.Foo", MODIFIER_SLOT_EMISSIVE),
        );
        assert_eq!(
            resolve_modifier(&registry, "acme.Foo")
                .unwrap()
                .read()
                .unwrap()
                .slot,
            MODIFIER_SLOT_EMISSIVE
        );
    }
}

mod resolve_modifier {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_kind() {
        assert!(resolve_modifier(&create_modifier_registry(), "acme.Missing").is_none());
    }

    #[test]
    fn returns_the_registered_definition_identity() {
        let source = definition("acme.Foo", MODIFIER_SLOT_NORMAL);
        let mut registry = create_modifier_registry();
        register_modifier(&mut registry, source.clone());
        let resolved = resolve_modifier(&registry, "acme.Foo").unwrap();
        assert!(Arc::ptr_eq(&resolved, &source));
    }
}
