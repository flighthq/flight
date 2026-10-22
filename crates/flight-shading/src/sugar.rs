// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use flight_entity::Ref;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests;

impl AnimatedNormalModifier {
    pub fn new(options: &AnimatedNormalModifierOptions) -> Self {
        return create_animated_normal_modifier(options);
    }
}

impl DissolveModifier {
    pub fn new(options: &DissolveModifierOptions) -> Self {
        return create_dissolve_modifier(options);
    }
}

impl EmissiveModifier {
    pub fn new(options: &EmissiveModifierOptions) -> Self {
        return create_emissive_modifier(options);
    }
}

impl EnvReflectModifier {
    pub fn new(options: Option<&EnvReflectModifierOptions>) -> Self {
        return create_env_reflect_modifier(options);
    }
}

impl FogModifier {
    pub fn new(options: &FogModifierOptions) -> Self {
        return create_fog_modifier(options);
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
    pub fn new(options: &RimModifierOptions) -> Self {
        return create_rim_modifier(options);
    }
}

impl ShadedMaterial {
    pub fn new(options: Option<&ShadedMaterialOptions>) -> Self {
        return create_shaded_material(options);
    }
}

impl ToonModifier {
    pub fn new(options: &ToonModifierOptions) -> Self {
        return create_toon_modifier(options);
    }
}

impl VertexDisplaceModifier {
    pub fn new(options: &VertexDisplaceModifierOptions) -> Self {
        return create_vertex_displace_modifier(options);
    }
}
