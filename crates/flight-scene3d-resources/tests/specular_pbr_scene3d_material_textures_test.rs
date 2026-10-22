use std::sync::{Arc, RwLock};

use flight_materials::contract::{
    PbrExtension, create_extended_pbr_material, create_specular_pbr_extension,
};
use flight_scene3d_resources::contract::*;

use crate::support::{create_shared_texture, same_textures};

mod register_specular_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_the_specular_factor_and_color_maps() {
        let registry = create_scene3d_material_texture_registry();
        register_extended_pbr_scene3d_material_textures(&registry);
        register_specular_pbr_scene3d_material_textures(&registry);
        let factor = create_shared_texture();
        let color = create_shared_texture();
        let mut extension = create_specular_pbr_extension();
        extension.specular_map = Some(factor.clone());
        extension.specular_color_map = Some(color.clone());
        let mut material = create_extended_pbr_material();
        material.extensions = vec![Arc::new(RwLock::new(PbrExtension::Specular(extension)))];
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&factor, &color]));
    }
}
