use std::sync::{Arc, LazyLock, RwLock};

use flight_entity::Ref;

use crate::contract::{
    ANIMATED_NORMAL_MODIFIER_KIND, DISSOLVE_MODIFIER_KIND, EMISSIVE_MODIFIER_KIND,
    ENV_REFLECT_MODIFIER_KIND, FOG_MODIFIER_KIND, MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE,
    MODIFIER_SLOT_NORMAL, MODIFIER_SLOT_VERTEX, ModifierDefinition, ModifierRegistry,
    RIM_MODIFIER_KIND, TOON_MODIFIER_KIND, VERTEX_DISPLACE_MODIFIER_KIND, register_modifier,
};

pub static ANIMATED_NORMAL_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(ModifierDefinition {
            kind: ANIMATED_NORMAL_MODIFIER_KIND.to_string(),
            slot: MODIFIER_SLOT_NORMAL.to_string(),
            get_define_signature: Some(Arc::new(|modifier| {
                return modifier.modifier_define_signature();
            })),
        }))
    });

pub static DISSOLVE_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ModifierDefinition {
        kind: DISSOLVE_MODIFIER_KIND.to_string(),
        slot: MODIFIER_SLOT_EFFECT.to_string(),
        get_define_signature: Some(Arc::new(|modifier| {
            return modifier.modifier_define_signature();
        })),
    }))
});

pub static EMISSIVE_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ModifierDefinition {
        kind: EMISSIVE_MODIFIER_KIND.to_string(),
        slot: MODIFIER_SLOT_EMISSIVE.to_string(),
        get_define_signature: Some(Arc::new(|modifier| {
            return modifier.modifier_define_signature();
        })),
    }))
});

pub static ENV_REFLECT_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(ModifierDefinition {
            kind: ENV_REFLECT_MODIFIER_KIND.to_string(),
            slot: MODIFIER_SLOT_EFFECT.to_string(),
            get_define_signature: None,
        }))
    });

pub static FOG_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ModifierDefinition {
        kind: FOG_MODIFIER_KIND.to_string(),
        slot: MODIFIER_SLOT_EFFECT.to_string(),
        get_define_signature: Some(Arc::new(|modifier| {
            return modifier.modifier_define_signature();
        })),
    }))
});

pub static RIM_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ModifierDefinition {
        kind: RIM_MODIFIER_KIND.to_string(),
        slot: MODIFIER_SLOT_EFFECT.to_string(),
        get_define_signature: None,
    }))
});

pub static TOON_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ModifierDefinition {
        kind: TOON_MODIFIER_KIND.to_string(),
        slot: MODIFIER_SLOT_EFFECT.to_string(),
        get_define_signature: None,
    }))
});

pub static VERTEX_DISPLACE_MODIFIER_DEFINITION: LazyLock<Ref<ModifierDefinition>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(ModifierDefinition {
            kind: VERTEX_DISPLACE_MODIFIER_KIND.to_string(),
            slot: MODIFIER_SLOT_VERTEX.to_string(),
            get_define_signature: Some(Arc::new(|modifier| {
                return modifier.modifier_define_signature();
            })),
        }))
    });

pub fn register_built_in_modifiers(registry: &mut ModifierRegistry) {
    register_modifier(registry, ANIMATED_NORMAL_MODIFIER_DEFINITION.clone());
    register_modifier(registry, DISSOLVE_MODIFIER_DEFINITION.clone());
    register_modifier(registry, EMISSIVE_MODIFIER_DEFINITION.clone());
    register_modifier(registry, ENV_REFLECT_MODIFIER_DEFINITION.clone());
    register_modifier(registry, FOG_MODIFIER_DEFINITION.clone());
    register_modifier(registry, RIM_MODIFIER_DEFINITION.clone());
    register_modifier(registry, TOON_MODIFIER_DEFINITION.clone());
    register_modifier(registry, VERTEX_DISPLACE_MODIFIER_DEFINITION.clone());
    return;
}
