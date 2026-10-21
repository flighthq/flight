use std::sync::{Arc, RwLock};

use flight_entity::get_record_keys;
use flight_geometry::{create_vector2, create_vector3};

use super::*;

#[test]
fn animated_normal_modifier_new_matches_create() {
    let options = AnimatedNormalModifierOptions {
        map: None,
        scroll: create_vector2(0.1, 0.2),
        strength: Some(0.5),
        secondary_map: None,
        secondary_scroll: None,
    };
    let method = AnimatedNormalModifier::new(&options);
    let free = create_animated_normal_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.scroll, free.scroll);
    assert_eq!(method.strength, free.strength);
}

#[test]
fn dissolve_modifier_new_matches_create() {
    let options = DissolveModifierOptions {
        threshold: 0.4,
        edge_color: None,
        edge_width: None,
        map: None,
        scale: None,
    };
    let method = DissolveModifier::new(&options);
    let free = create_dissolve_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.threshold, free.threshold);
    assert_eq!(method.edge_color, free.edge_color);
}

#[test]
fn emissive_modifier_new_matches_create() {
    let options = EmissiveModifierOptions {
        color: 0xffaa_00ff,
        strength: Some(2.0),
        mask: None,
        facing: Some(EmissiveModifierFacing::AwayFromLight),
        facing_softness: None,
    };
    let method = EmissiveModifier::new(&options);
    let free = create_emissive_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.color, free.color);
    assert_eq!(method.facing, free.facing);
}

#[test]
fn env_reflect_modifier_new_matches_create() {
    let options = EnvReflectModifierOptions {
        tint: None,
        intensity: Some(0.5),
        fresnel_bias: None,
        roughness: None,
    };
    let method = EnvReflectModifier::new(Some(&options));
    let free = create_env_reflect_modifier(Some(&options));
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.intensity, free.intensity);
}

#[test]
fn fog_modifier_new_matches_create() {
    let options = FogModifierOptions {
        color: 0xaabb_ccff,
        mode: Some(FogModifierMode::Exponential2),
        near: None,
        far: None,
        density: Some(0.1),
    };
    let method = FogModifier::new(&options);
    let free = create_fog_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.mode, free.mode);
    assert_eq!(method.density, free.density);
}

#[test]
fn modifier_registry_methods_match_free_functions() {
    let mut method = ModifierRegistry::new();
    method.register_built_in_modifiers();
    let custom = Arc::new(RwLock::new(ModifierDefinition {
        kind: "acme.Custom".to_string(),
        slot: MODIFIER_SLOT_EFFECT.to_string(),
        get_define_signature: None,
    }));
    method.register_modifier(custom.clone());

    let mut free = create_modifier_registry();
    register_built_in_modifiers(&mut free);
    register_modifier(&mut free, custom);
    assert_eq!(
        {
            let mut collected = Vec::new();
            get_record_keys(&mut collected, &method.definitions);
            collected
        },
        {
            let mut collected = Vec::new();
            get_record_keys(&mut collected, &free.definitions);
            collected
        }
    );
    assert_eq!(
        method
            .resolve_modifier("acme.Custom")
            .unwrap()
            .read()
            .unwrap()
            .slot,
        resolve_modifier(&free, "acme.Custom")
            .unwrap()
            .read()
            .unwrap()
            .slot
    );
    assert_eq!(
        method.get_unregistered_modifier_kinds(&[]),
        get_unregistered_modifier_kinds(&free, &[])
    );
    assert_eq!(
        method.is_modifier_stack_valid(&[]),
        is_modifier_stack_valid(&free, &[])
    );
}

#[test]
fn rim_modifier_new_matches_create() {
    let options = RimModifierOptions {
        color: 0x88cc_ffff,
        power: Some(4.0),
        intensity: None,
        bias: None,
    };
    let method = RimModifier::new(&options);
    let free = create_rim_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.color, free.color);
    assert_eq!(method.power, free.power);
}

#[test]
fn shaded_material_new_matches_create() {
    let options = ShadedMaterialOptions {
        alpha_cutoff: Some(0.25),
        alpha_mode: None,
        blend_mode: None,
        double_sided: Some(true),
        diffuse: Some(0x1020_30ff),
        diffuse_map: None,
        modifiers: None,
        normal_map: None,
        normal_scale: None,
        shininess: Some(8.0),
        specular: None,
        specular_map: None,
    };
    let method = ShadedMaterial::new(Some(&options));
    let free = create_shaded_material(Some(&options));
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.alpha_cutoff, free.alpha_cutoff);
    assert_eq!(method.double_sided, free.double_sided);
    assert_eq!(method.diffuse, free.diffuse);
    assert_eq!(method.shininess, free.shininess);
}

#[test]
fn toon_modifier_new_matches_create() {
    let options = ToonModifierOptions {
        steps: 4.0,
        smoothness: Some(0.2),
    };
    let method = ToonModifier::new(&options);
    let free = create_toon_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.steps, free.steps);
    assert_eq!(method.smoothness, free.smoothness);
}

#[test]
fn vertex_displace_modifier_new_matches_create() {
    let options = VertexDisplaceModifierOptions {
        source: VertexDisplaceModifierSource::Sine,
        amplitude: 0.5,
        axis: Some(create_vector3(0.0, 1.0, 0.0)),
        map: None,
        frequency: None,
        speed: None,
        direction: None,
    };
    let method = VertexDisplaceModifier::new(&options);
    let free = create_vertex_displace_modifier(&options);
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.amplitude, free.amplitude);
    assert_eq!(method.axis, free.axis);
}
