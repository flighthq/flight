use crate::contract::{CustomShaderUniformValue, initialize_effect};
use flight_entity::{Ref, allocate_entity};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct CustomShaderEffect {
    fields: crate::contract::EffectFields,
    pub shader_key: String,
    pub uniforms: Option<HashMap<String, CustomShaderUniformValue>>,
}

crate::impl_effect!(CustomShaderEffect, "shaderKey" => shader_key, "uniforms" => uniforms);

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn create_custom_shader_effect() -> Ref<CustomShaderEffect> {
    let mut out = allocate_entity();
    initialize_custom_shader_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn initialize_custom_shader_effect(out: &mut CustomShaderEffect) {
    initialize_effect(out, "CustomShaderEffect");
}
