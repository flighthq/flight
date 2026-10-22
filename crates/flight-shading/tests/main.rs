use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_shading::contract::*;
use flight_texture::{Texture, create_texture};

pub(crate) fn modifier_ref<T: Modifier + 'static>(modifier: T) -> Ref<dyn Modifier> {
    return Arc::new(RwLock::new(modifier));
}

pub(crate) fn texture_ref() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}

#[path = "animated_normal_modifier_test.rs"]
mod flight_shading_animated_normal_modifier_test;
#[path = "dissolve_modifier_test.rs"]
mod flight_shading_dissolve_modifier_test;
#[path = "emissive_modifier_test.rs"]
mod flight_shading_emissive_modifier_test;
#[path = "enums_test.rs"]
mod flight_shading_enums_test;
#[path = "env_reflect_modifier_test.rs"]
mod flight_shading_env_reflect_modifier_test;
#[path = "fog_modifier_test.rs"]
mod flight_shading_fog_modifier_test;
#[path = "get_modifier_define_key_test.rs"]
mod flight_shading_get_modifier_define_key_test;
#[path = "get_unregistered_modifier_kinds_test.rs"]
mod flight_shading_get_unregistered_modifier_kinds_test;
#[path = "is_built_in_modifier_slot_test.rs"]
mod flight_shading_is_built_in_modifier_slot_test;
#[path = "is_modifier_stack_valid_test.rs"]
mod flight_shading_is_modifier_stack_valid_test;
#[path = "modifier_registry_test.rs"]
mod flight_shading_modifier_registry_test;
#[path = "modifier_test.rs"]
mod flight_shading_modifier_test;
#[path = "order_modifier_stack_test.rs"]
mod flight_shading_order_modifier_stack_test;
#[path = "register_built_in_modifiers_test.rs"]
mod flight_shading_register_built_in_modifiers_test;
#[path = "rim_modifier_test.rs"]
mod flight_shading_rim_modifier_test;
#[path = "shaded_material_test.rs"]
mod flight_shading_shaded_material_test;
#[path = "toon_modifier_test.rs"]
mod flight_shading_toon_modifier_test;
#[path = "vertex_displace_modifier_test.rs"]
mod flight_shading_vertex_displace_modifier_test;
