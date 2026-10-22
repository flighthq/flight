use std::sync::{Arc, RwLock};

use flight_materials::contract::{
    PbrExtension, create_extended_pbr_material, create_wrapped_diffuse_pbr_extension,
};
use flight_scene3d_resources::contract::*;

use crate::support::{create_shared_texture, same_textures};

mod register_wrapped_diffuse_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_the_wrapped_diffuse_color_and_thickness_maps() {
        let registry = create_scene3d_material_texture_registry();
        register_extended_pbr_scene3d_material_textures(&registry);
        register_wrapped_diffuse_pbr_scene3d_material_textures(&registry);
        let color = create_shared_texture();
        let thickness = create_shared_texture();
        let mut extension = create_wrapped_diffuse_pbr_extension();
        extension.wrapped_diffuse_map = Some(color.clone());
        extension.thickness_map = Some(thickness.clone());
        let mut material = create_extended_pbr_material();
        material.extensions = vec![Arc::new(RwLock::new(PbrExtension::WrappedDiffuse(
            extension,
        )))];
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&color, &thickness]));
    }
}
