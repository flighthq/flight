use flight_scene3d_resources::contract::*;
use flight_shading::contract::create_shaded_material;

use crate::support::{create_shared_texture, same_textures};

mod register_shaded_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_the_diffuse_normal_and_specular_maps() {
        let registry = create_scene3d_material_texture_registry();
        register_shaded_scene3d_material_textures(&registry);
        let diffuse = create_shared_texture();
        let normal = create_shared_texture();
        let specular = create_shared_texture();
        let mut material = create_shaded_material();
        material.diffuse_map = Some(diffuse.clone());
        material.normal_map = Some(normal.clone());
        material.specular_map = Some(specular.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&diffuse, &normal, &specular]));
    }

    #[test]
    fn skips_the_empty_slots_of_a_map_less_material() {
        let registry = create_scene3d_material_texture_registry();
        register_shaded_scene3d_material_textures(&registry);
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &create_shaded_material(), &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn appends_without_clearing_so_one_mesh_accumulates_across_its_materials() {
        let registry = create_scene3d_material_texture_registry();
        register_shaded_scene3d_material_textures(&registry);
        let first = create_shared_texture();
        let second = create_shared_texture();
        let mut diffuse = create_shaded_material();
        diffuse.diffuse_map = Some(first.clone());
        let mut specular = create_shaded_material();
        specular.specular_map = Some(second.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &diffuse, &mut out);
        get_scene3d_material_textures(&registry, &specular, &mut out);
        assert!(same_textures(&out, &[&first, &second]));
    }

    #[test]
    fn appends_nothing_for_a_shaded_material_while_unregistered() {
        // The registry cannot tell this from a material with no maps, which is why callers ask
        // has_scene3d_material_texture_lister instead.
        let registry = create_scene3d_material_texture_registry();
        let mut material = create_shaded_material();
        material.diffuse_map = Some(create_shared_texture());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(out.is_empty());
    }
}
