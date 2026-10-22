use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::create_vector2;
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

fn emissive(color: u32) -> Ref<dyn Modifier> {
    return crate::modifier_ref(create_emissive_modifier(&EmissiveModifierOptions {
        color,
        strength: None,
        mask: None,
        facing: None,
        facing_softness: None,
    }));
}

fn normal() -> Ref<dyn Modifier> {
    return crate::modifier_ref(create_animated_normal_modifier(
        &AnimatedNormalModifierOptions {
            map: None,
            scroll: create_vector2(0.0, 0.0),
            strength: None,
            secondary_map: None,
            secondary_scroll: None,
        },
    ));
}

fn rim(color: u32) -> Ref<dyn Modifier> {
    return crate::modifier_ref(create_rim_modifier(&RimModifierOptions {
        color,
        power: None,
        intensity: None,
        bias: None,
    }));
}

mod order_modifier_stack {
    use super::*;

    #[test]
    fn groups_modifiers_into_the_canonical_pipeline_order() {
        let normal = normal();
        let emissive = emissive(0xffff_ffff);
        let rim = rim(0xffff_ffff);
        let mut ordered = Vec::new();
        order_modifier_stack(&mut ordered, &[rim, emissive, normal]);
        let slots: Vec<String> = ordered
            .iter()
            .map(|item| item.read().unwrap().modifier_fields().slot.clone())
            .collect();
        assert_eq!(
            slots,
            vec![
                MODIFIER_SLOT_NORMAL,
                MODIFIER_SLOT_EMISSIVE,
                MODIFIER_SLOT_EFFECT
            ]
        );
    }

    #[test]
    fn is_independent_of_cross_slot_authoring_order() {
        let normal = normal();
        let emissive = emissive(0xffff_ffff);
        let rim = rim(0xffff_ffff);
        let mut first = Vec::new();
        order_modifier_stack(&mut first, &[normal.clone(), emissive.clone(), rim.clone()]);
        let mut second = Vec::new();
        order_modifier_stack(&mut second, &[rim, normal, emissive]);
        for (a, b) in first.iter().zip(&second) {
            assert!(Arc::ptr_eq(a, b));
        }
    }

    #[test]
    fn preserves_authoring_order_within_one_slot() {
        let first = rim(0x1111_11ff);
        let second = rim(0x2222_22ff);
        let mut ordered = Vec::new();
        order_modifier_stack(&mut ordered, &[second.clone(), first.clone()]);
        assert!(Arc::ptr_eq(&ordered[0], &second));
        assert!(Arc::ptr_eq(&ordered[1], &first));
    }

    #[test]
    fn preserves_input_identity_and_does_not_mutate_the_stack() {
        let rim = rim(0xffff_ffff);
        let normal = normal();
        let input = vec![rim.clone(), normal.clone()];
        let mut ordered = Vec::with_capacity(4);
        ordered.push(rim.clone());
        let capacity = ordered.capacity();
        order_modifier_stack(&mut ordered, &input);
        assert!(Arc::ptr_eq(&input[0], &rim));
        assert!(Arc::ptr_eq(&input[1], &normal));
        assert!(Arc::ptr_eq(&ordered[0], &normal));
        assert!(Arc::ptr_eq(&ordered[1], &rim));
        assert_eq!(ordered.capacity(), capacity);
    }

    #[test]
    fn returns_an_empty_vector_for_an_empty_stack() {
        let mut ordered = Vec::with_capacity(2);
        ordered.push(rim(0xffff_ffff));
        let capacity = ordered.capacity();
        order_modifier_stack(&mut ordered, &[]);
        assert!(ordered.is_empty());
        assert_eq!(ordered.capacity(), capacity);
    }

    #[test]
    fn sorts_unknown_slots_after_built_ins_stably() {
        let ambient = custom("acme.Ambient", "Ambient");
        let vendor = custom("acme.Custom", "acme.Weird");
        let rim = rim(0xffff_ffff);
        let normal = normal();
        let mut ordered = Vec::new();
        order_modifier_stack(
            &mut ordered,
            &[ambient.clone(), rim.clone(), vendor.clone(), normal.clone()],
        );
        assert!(Arc::ptr_eq(&ordered[0], &normal));
        assert!(Arc::ptr_eq(&ordered[1], &rim));
        assert!(Arc::ptr_eq(&ordered[2], &ambient));
        assert!(Arc::ptr_eq(&ordered[3], &vendor));
    }
}
