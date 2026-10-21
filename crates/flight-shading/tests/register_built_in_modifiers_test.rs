use std::sync::{Arc, RwLock};

use flight_geometry::{create_vector2, create_vector3};
use flight_shading::contract::*;

fn signature(registry: &ModifierRegistry, kind: &str, modifier: &dyn Modifier) -> Option<String> {
    let definition = resolve_modifier(registry, kind).unwrap();
    let definition = definition.read().unwrap();
    return definition
        .get_define_signature
        .as_ref()
        .map(|callback| callback(modifier));
}

mod register_built_in_modifiers {
    use super::*;

    #[test]
    fn gives_env_reflect_rim_and_toon_one_program_shape() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        for kind in [
            ENV_REFLECT_MODIFIER_KIND,
            RIM_MODIFIER_KIND,
            TOON_MODIFIER_KIND,
        ] {
            assert!(
                resolve_modifier(&registry, kind)
                    .unwrap()
                    .read()
                    .unwrap()
                    .get_define_signature
                    .is_none()
            );
        }
    }

    #[test]
    fn is_last_write_wins_reinstalling_built_ins_over_an_override() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        register_modifier(
            &mut registry,
            Arc::new(RwLock::new(ModifierDefinition {
                kind: RIM_MODIFIER_KIND.to_string(),
                slot: MODIFIER_SLOT_NORMAL.to_string(),
                get_define_signature: None,
            })),
        );
        register_built_in_modifiers(&mut registry);
        let resolved = resolve_modifier(&registry, RIM_MODIFIER_KIND).unwrap();
        assert!(Arc::ptr_eq(&resolved, &RIM_MODIFIER_DEFINITION));
        assert_eq!(resolved.read().unwrap().slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn registers_all_eight_kinds_against_their_slots() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        for (kind, slot) in [
            (ANIMATED_NORMAL_MODIFIER_KIND, MODIFIER_SLOT_NORMAL),
            (DISSOLVE_MODIFIER_KIND, MODIFIER_SLOT_EFFECT),
            (EMISSIVE_MODIFIER_KIND, MODIFIER_SLOT_EMISSIVE),
            (ENV_REFLECT_MODIFIER_KIND, MODIFIER_SLOT_EFFECT),
            (FOG_MODIFIER_KIND, MODIFIER_SLOT_EFFECT),
            (RIM_MODIFIER_KIND, MODIFIER_SLOT_EFFECT),
            (TOON_MODIFIER_KIND, MODIFIER_SLOT_EFFECT),
            (VERTEX_DISPLACE_MODIFIER_KIND, MODIFIER_SLOT_VERTEX),
        ] {
            assert_eq!(
                resolve_modifier(&registry, kind)
                    .unwrap()
                    .read()
                    .unwrap()
                    .slot,
                slot
            );
        }
    }

    #[test]
    fn signals_animated_normal_layer_count_structurally() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let disabled = create_animated_normal_modifier(&AnimatedNormalModifierOptions {
            map: None,
            scroll: create_vector2(0.0, 0.0),
            strength: None,
            secondary_map: None,
            secondary_scroll: None,
        });
        let single = create_animated_normal_modifier(&AnimatedNormalModifierOptions {
            map: Some(crate::texture_ref()),
            scroll: create_vector2(0.0, 0.0),
            strength: None,
            secondary_map: None,
            secondary_scroll: None,
        });
        let dual = create_animated_normal_modifier(&AnimatedNormalModifierOptions {
            map: Some(crate::texture_ref()),
            scroll: create_vector2(0.0, 0.0),
            strength: None,
            secondary_map: Some(crate::texture_ref()),
            secondary_scroll: None,
        });
        assert_eq!(
            signature(&registry, ANIMATED_NORMAL_MODIFIER_KIND, &disabled),
            Some("0".to_string())
        );
        assert_eq!(
            signature(&registry, ANIMATED_NORMAL_MODIFIER_KIND, &single),
            Some("1".to_string())
        );
        assert_eq!(
            signature(&registry, ANIMATED_NORMAL_MODIFIER_KIND, &dual),
            Some("2".to_string())
        );
    }

    #[test]
    fn signals_dissolve_mask_presence_structurally() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let procedural = create_dissolve_modifier(&DissolveModifierOptions {
            threshold: 0.5,
            edge_color: None,
            edge_width: None,
            map: None,
            scale: None,
        });
        let mapped = create_dissolve_modifier(&DissolveModifierOptions {
            threshold: 0.5,
            edge_color: None,
            edge_width: None,
            map: Some(crate::texture_ref()),
            scale: None,
        });
        assert_eq!(
            signature(&registry, DISSOLVE_MODIFIER_KIND, &procedural),
            Some(String::new())
        );
        assert_eq!(
            signature(&registry, DISSOLVE_MODIFIER_KIND, &mapped),
            Some("m".to_string())
        );
    }

    #[test]
    fn signals_emissive_mask_and_facing_structurally() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let plain = create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffff_ffff,
            strength: None,
            mask: None,
            facing: None,
            facing_softness: None,
        });
        let masked = create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffff_ffff,
            strength: None,
            mask: Some(crate::texture_ref()),
            facing: None,
            facing_softness: None,
        });
        let gated = create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffff_ffff,
            strength: None,
            mask: None,
            facing: Some(EmissiveModifierFacing::AwayFromLight),
            facing_softness: None,
        });
        assert_eq!(
            signature(&registry, EMISSIVE_MODIFIER_KIND, &plain),
            Some(String::new())
        );
        assert_eq!(
            signature(&registry, EMISSIVE_MODIFIER_KIND, &masked),
            Some("m".to_string())
        );
        assert_eq!(
            signature(&registry, EMISSIVE_MODIFIER_KIND, &gated),
            Some("g".to_string())
        );
    }

    #[test]
    fn signals_fog_mode_structurally() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        for (mode, expected) in [
            (FogModifierMode::Linear, "l"),
            (FogModifierMode::Exponential, "e"),
            (FogModifierMode::Exponential2, "x"),
        ] {
            let modifier = create_fog_modifier(&FogModifierOptions {
                color: 0xffff_ffff,
                mode: Some(mode),
                near: None,
                far: None,
                density: None,
            });
            assert_eq!(
                signature(&registry, FOG_MODIFIER_KIND, &modifier),
                Some(expected.to_string())
            );
        }
    }

    #[test]
    fn signals_vertex_source_and_fixed_axis_structurally() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        let sine = create_vertex_displace_modifier(&VertexDisplaceModifierOptions {
            source: VertexDisplaceModifierSource::Sine,
            amplitude: 1.0,
            axis: None,
            map: None,
            frequency: None,
            speed: None,
            direction: None,
        });
        let height = create_vertex_displace_modifier(&VertexDisplaceModifierOptions {
            source: VertexDisplaceModifierSource::HeightMap,
            amplitude: 1.0,
            axis: None,
            map: None,
            frequency: None,
            speed: None,
            direction: None,
        });
        let axis = create_vertex_displace_modifier(&VertexDisplaceModifierOptions {
            source: VertexDisplaceModifierSource::Sine,
            amplitude: 1.0,
            axis: Some(create_vector3(0.0, 1.0, 0.0)),
            map: None,
            frequency: None,
            speed: None,
            direction: None,
        });
        assert_eq!(
            signature(&registry, VERTEX_DISPLACE_MODIFIER_KIND, &sine),
            Some("s".to_string())
        );
        assert_eq!(
            signature(&registry, VERTEX_DISPLACE_MODIFIER_KIND, &height),
            Some("h".to_string())
        );
        assert_eq!(
            signature(&registry, VERTEX_DISPLACE_MODIFIER_KIND, &axis),
            Some("sa".to_string())
        );
    }

    #[test]
    fn stores_the_exported_definition_identities() {
        let mut registry = create_modifier_registry();
        register_built_in_modifiers(&mut registry);
        assert!(Arc::ptr_eq(
            &resolve_modifier(&registry, EMISSIVE_MODIFIER_KIND).unwrap(),
            &EMISSIVE_MODIFIER_DEFINITION
        ));
        assert!(Arc::ptr_eq(
            &resolve_modifier(&registry, VERTEX_DISPLACE_MODIFIER_KIND).unwrap(),
            &VERTEX_DISPLACE_MODIFIER_DEFINITION
        ));
    }
}
