use std::sync::{Arc, RwLock};

use flight_materials::contract::{
    PbrExtension, create_anisotropy_pbr_extension, create_extended_pbr_material,
};
use flight_scene3d_resources::contract::*;

use crate::support::{create_shared_texture, same_textures};

mod register_anisotropy_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_the_anisotropy_map_through_the_generic_extended_pbr_material_lister() {
        let registry = create_scene3d_material_texture_registry();
        register_extended_pbr_scene3d_material_textures(&registry);
        register_anisotropy_pbr_scene3d_material_textures(&registry);
        let map = create_shared_texture();
        let mut extension = create_anisotropy_pbr_extension();
        extension.anisotropy_map = Some(map.clone());
        let mut material = create_extended_pbr_material();
        material.extensions = vec![Arc::new(RwLock::new(PbrExtension::Anisotropy(extension)))];
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&map]));
    }
}
