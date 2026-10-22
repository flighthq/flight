// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use flight_entity::Ref;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests;

impl AnimatedNormalModifier {
    pub fn new() -> Self {
        return create_animated_normal_modifier();
    }
}

impl DissolveModifier {
    pub fn new() -> Self {
        return create_dissolve_modifier();
    }
}

impl EmissiveModifier {
    pub fn new() -> Self {
        return create_emissive_modifier();
    }
}

impl EnvReflectModifier {
    pub fn new() -> Self {
        return create_env_reflect_modifier();
    }
}

impl FogModifier {
    pub fn new() -> Self {
        return create_fog_modifier();
    }
}

impl ModifierRegistry {
    pub fn new() -> Self {
        return create_modifier_registry();
    }

    pub fn get_unregistered_modifier_kinds(
        &self,
        out: &mut Vec<ModifierKind>,
        stack: &[Ref<dyn Modifier>],
    ) {
        get_unregistered_modifier_kinds(out, self, stack);
    }

    pub fn is_modifier_stack_valid(&self, stack: &[Ref<dyn Modifier>]) -> bool {
        return is_modifier_stack_valid(self, stack);
    }

    pub fn register_built_in_modifiers(&mut self) {
        register_built_in_modifiers(self);
        return;
    }

    pub fn register_modifier(&mut self, definition: Ref<ModifierDefinition>) {
        register_modifier(self, definition);
        return;
    }

    pub fn resolve_modifier(&self, kind: &str) -> Option<Ref<ModifierDefinition>> {
        return resolve_modifier(self, kind);
    }
}

impl RimModifier {
    pub fn new() -> Self {
        return create_rim_modifier();
    }
}

impl ShadedMaterial {
    pub fn new() -> Self {
        return create_shaded_material();
    }
}

impl ToonModifier {
    pub fn new() -> Self {
        return create_toon_modifier();
    }
}

impl VertexDisplaceModifier {
    pub fn new() -> Self {
        return create_vertex_displace_modifier();
    }
}
