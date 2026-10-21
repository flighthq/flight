use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_shading::contract::*;
use flight_texture::{Texture, create_texture};

mod animated_normal_modifier_test;
mod dissolve_modifier_test;
mod emissive_modifier_test;
mod enums_test;
mod env_reflect_modifier_test;
mod fog_modifier_test;
mod get_modifier_define_key_test;
mod get_unregistered_modifier_kinds_test;
mod is_built_in_modifier_slot_test;
mod is_modifier_stack_valid_test;
mod modifier_registry_test;
mod modifier_test;
mod order_modifier_stack_test;
mod register_built_in_modifiers_test;
mod rim_modifier_test;
mod shaded_material_test;
mod toon_modifier_test;
mod vertex_displace_modifier_test;

pub(crate) fn modifier_ref<T: Modifier + 'static>(modifier: T) -> Ref<dyn Modifier> {
    return Arc::new(RwLock::new(modifier));
}

pub(crate) fn texture_ref() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}
