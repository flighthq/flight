use std::sync::{Arc, RwLock};

use flight_entity::get_record_keys;

use super::*;

#[test]
fn animated_normal_modifier_new_matches_create() {
    let method = AnimatedNormalModifier::new();
    let free = create_animated_normal_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.scroll, free.scroll);
    assert_eq!(method.strength, free.strength);
}

#[test]
fn dissolve_modifier_new_matches_create() {
    let method = DissolveModifier::new();
    let free = create_dissolve_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.threshold, free.threshold);
    assert_eq!(method.edge_color, free.edge_color);
}

#[test]
fn emissive_modifier_new_matches_create() {
    let method = EmissiveModifier::new();
    let free = create_emissive_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.color, free.color);
    assert_eq!(method.facing, free.facing);
}

#[test]
fn env_reflect_modifier_new_matches_create() {
    let method = EnvReflectModifier::new();
    let free = create_env_reflect_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.intensity, free.intensity);
}

#[test]
fn fog_modifier_new_matches_create() {
    let method = FogModifier::new();
    let free = create_fog_modifier();
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
    let mut method_unregistered = vec!["stale".to_string()];
    method.get_unregistered_modifier_kinds(&mut method_unregistered, &[]);
    let mut free_unregistered = vec!["stale".to_string()];
    get_unregistered_modifier_kinds(&mut free_unregistered, &free, &[]);
    assert_eq!(method_unregistered, free_unregistered);
    assert_eq!(
        method.is_modifier_stack_valid(&[]),
        is_modifier_stack_valid(&free, &[])
    );
}

#[test]
fn rim_modifier_new_matches_create() {
    let method = RimModifier::new();
    let free = create_rim_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.color, free.color);
    assert_eq!(method.power, free.power);
}

#[test]
fn shaded_material_new_matches_create() {
    let method = ShadedMaterial::new();
    let free = create_shaded_material();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.alpha_cutoff, free.alpha_cutoff);
    assert_eq!(method.double_sided, free.double_sided);
    assert_eq!(method.diffuse, free.diffuse);
    assert_eq!(method.shininess, free.shininess);
}

#[test]
fn toon_modifier_new_matches_create() {
    let method = ToonModifier::new();
    let free = create_toon_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.steps, free.steps);
    assert_eq!(method.smoothness, free.smoothness);
}

#[test]
fn vertex_displace_modifier_new_matches_create() {
    let method = VertexDisplaceModifier::new();
    let free = create_vertex_displace_modifier();
    assert_eq!(method.kind, free.kind);
    assert_eq!(method.amplitude, free.amplitude);
    assert_eq!(method.axis, free.axis);
}
