use std::sync::{Arc, RwLock};

use flight_materials::contract::{PbrExtension, create_clearcoat_pbr_extension, create_extended_pbr_material};
use flight_scene3d_resources::contract::*;

use crate::support::{create_shared_texture, same_textures};

mod register_clearcoat_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_all_clearcoat_maps_in_descriptor_order() {
        let registry = create_scene3d_material_texture_registry();
        register_extended_pbr_scene3d_material_textures(&registry);
        register_clearcoat_pbr_scene3d_material_textures(&registry);
        let factor = create_shared_texture();
        let normal = create_shared_texture();
        let roughness = create_shared_texture();
        let mut extension = create_clearcoat_pbr_extension();
        extension.clearcoat_map = Some(factor.clone());
        extension.clearcoat_normal_map = Some(normal.clone());
        extension.clearcoat_roughness_map = Some(roughness.clone());
        let mut material = create_extended_pbr_material();
        material.extensions = vec![Arc::new(RwLock::new(PbrExtension::Clearcoat(extension)))];
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&factor, &normal, &roughness]));
    }
}
