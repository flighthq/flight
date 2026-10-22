use std::sync::{Arc, RwLock};

use flight_materials::contract::{
    ANISOTROPY_PBR_EXTENSION_KIND, EXTENDED_PBR_MATERIAL_KIND, PbrExtension,
    STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND, create_anisotropy_pbr_extension,
    create_extended_pbr_material, create_material3d, create_standard_pbr_material,
    create_unlit_material,
};
use flight_scene3d_resources::contract::*;

use crate::support::{create_shared_texture, same_textures};

fn built_in_registry() -> Scene3DMaterialTextureRegistry {
    let registry = create_scene3d_material_texture_registry();
    register_standard_pbr_scene3d_material_textures(&registry);
    register_unlit_scene3d_material_textures(&registry);
    register_extended_pbr_scene3d_material_textures(&registry);
    return registry;
}

mod create_scene3d_material_texture_registry {
    use super::*;

    #[test]
    fn creates_an_empty_registry() {
        // No entity runtime assertion: this registry is dispatch infrastructure, plain data.
        let registry = create_scene3d_material_texture_registry();
        assert_eq!(registry.extension_listers.read().unwrap().len(), 0);
        assert_eq!(registry.listers.read().unwrap().len(), 0);
    }
}

mod get_scene3d_material_textures {
    use super::*;

    #[test]
    fn appends_nothing_for_an_unregistered_kind() {
        let registry = create_scene3d_material_texture_registry();
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &create_unlit_material(), &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn accumulates_across_calls_without_clearing_out() {
        let registry = built_in_registry();
        let a = create_shared_texture();
        let b = create_shared_texture();
        let mut first = create_unlit_material();
        first.base_color_map = Some(a.clone());
        let mut second = create_unlit_material();
        second.base_color_map = Some(b.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &first, &mut out);
        get_scene3d_material_textures(&registry, &second, &mut out);
        assert!(same_textures(&out, &[&a, &b]));
    }
}

mod has_scene3d_material_texture_lister {
    use super::*;

    #[test]
    fn separates_an_unregistered_kind_from_a_material_that_genuinely_has_no_maps() {
        let registry = create_scene3d_material_texture_registry();
        register_unlit_scene3d_material_textures(&registry);
        assert!(has_scene3d_material_texture_lister(
            &registry,
            UNLIT_MATERIAL_KIND
        ));
        assert!(!has_scene3d_material_texture_lister(
            &registry,
            STANDARD_PBR_MATERIAL_KIND
        ));
    }
}

mod register_extended_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn lists_standard_maps_and_dispatches_extensions_through_the_nested_kind_registry() {
        let registry = create_scene3d_material_texture_registry();
        register_extended_pbr_scene3d_material_textures(&registry);
        let base_color_map = create_shared_texture();
        let anisotropy_map = create_shared_texture();
        register_scene3d_pbr_extension_textures(
            &registry,
            ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
            Arc::new(|extension, out| {
                if let PbrExtension::Anisotropy(anisotropy) = extension
                    && let Some(map) = &anisotropy.anisotropy_map
                {
                    out.push(map.clone());
                }
            }),
        );
        let mut extension = create_anisotropy_pbr_extension();
        extension.anisotropy_map = Some(anisotropy_map.clone());
        let mut material = create_extended_pbr_material();
        material.extensions = vec![Arc::new(RwLock::new(PbrExtension::Anisotropy(extension)))];
        material.standard.base_color_map = Some(base_color_map.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&base_color_map, &anisotropy_map]));
    }
}

mod register_scene3d_material_textures {
    use super::*;

    #[test]
    fn binds_a_lister_for_a_custom_kind() {
        let registry = create_scene3d_material_texture_registry();
        let custom = create_shared_texture();
        let listed = custom.clone();
        register_scene3d_material_textures(
            &registry,
            "acme.Custom".to_string(),
            Arc::new(move |_material, out| out.push(listed.clone())),
        );
        let mut out = Vec::new();
        get_scene3d_material_textures(
            &registry,
            &create_material3d("acme.Custom".to_string()),
            &mut out,
        );
        assert!(same_textures(&out, &[&custom]));
    }

    #[test]
    fn is_last_write_wins_with_no_guard() {
        let registry = create_scene3d_material_texture_registry();
        let first = create_shared_texture();
        let second = create_shared_texture();
        let listed_first = first.clone();
        let listed_second = second.clone();
        register_scene3d_material_textures(
            &registry,
            UNLIT_MATERIAL_KIND.to_string(),
            Arc::new(move |_material, out| out.push(listed_first.clone())),
        );
        register_scene3d_material_textures(
            &registry,
            UNLIT_MATERIAL_KIND.to_string(),
            Arc::new(move |_material, out| out.push(listed_second.clone())),
        );
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &create_unlit_material(), &mut out);
        assert!(same_textures(&out, &[&second]));
    }
}

mod register_scene3d_pbr_extension_textures {
    use super::*;

    #[test]
    fn is_last_write_wins_for_vendor_extension_listers() {
        let registry = create_scene3d_material_texture_registry();
        let first = create_shared_texture();
        let second = create_shared_texture();
        let listed_first = first.clone();
        let listed_second = second.clone();
        register_scene3d_pbr_extension_textures(
            &registry,
            ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
            Arc::new(move |_extension, out| out.push(listed_first.clone())),
        );
        register_scene3d_pbr_extension_textures(
            &registry,
            ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
            Arc::new(move |_extension, out| out.push(listed_second.clone())),
        );
        let mut out = Vec::new();
        let lister = registry
            .extension_listers
            .read()
            .unwrap()
            .get(ANISOTROPY_PBR_EXTENSION_KIND)
            .cloned()
            .unwrap();
        lister(
            &PbrExtension::Anisotropy(create_anisotropy_pbr_extension()),
            &mut out,
        );
        assert!(same_textures(&out, &[&second]));
    }
}

mod register_standard_pbr_scene3d_material_textures {
    use super::*;

    #[test]
    fn composes_with_the_sibling_doors_to_cover_the_three_surface_families() {
        let registry = built_in_registry();
        let listers = registry.listers.read().unwrap();
        assert!(listers.contains_key(EXTENDED_PBR_MATERIAL_KIND));
        assert!(listers.contains_key(STANDARD_PBR_MATERIAL_KIND));
        assert!(listers.contains_key(UNLIT_MATERIAL_KIND));
    }

    #[test]
    fn lists_every_non_null_standard_pbr_texture_slot_and_skips_null_ones() {
        let registry = built_in_registry();
        let base_color_map = create_shared_texture();
        let normal_map = create_shared_texture();
        let mut material = create_standard_pbr_material();
        material.base_color_map = Some(base_color_map.clone());
        material.normal_map = Some(normal_map.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(
            out.iter()
                .any(|texture| Arc::ptr_eq(texture, &base_color_map))
        );
        assert!(out.iter().any(|texture| Arc::ptr_eq(texture, &normal_map)));
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn lists_the_unlit_base_color_slot() {
        let registry = built_in_registry();
        let base_color_map = create_shared_texture();
        let mut material = create_unlit_material();
        material.base_color_map = Some(base_color_map.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &material, &mut out);
        assert!(same_textures(&out, &[&base_color_map]));
    }
}

mod register_unlit_scene3d_material_textures {
    use super::*;

    #[test]
    fn registers_only_the_unlit_lister_leaving_other_kinds_unlisted() {
        let registry = create_scene3d_material_texture_registry();
        register_unlit_scene3d_material_textures(&registry);
        let base_color_map = create_shared_texture();
        let mut unlit = create_unlit_material();
        unlit.base_color_map = Some(base_color_map.clone());
        let mut out = Vec::new();
        get_scene3d_material_textures(&registry, &unlit, &mut out);
        assert!(same_textures(&out, &[&base_color_map]));

        out.clear();
        let mut standard = create_standard_pbr_material();
        standard.base_color_map = Some(base_color_map.clone());
        get_scene3d_material_textures(&registry, &standard, &mut out);
        assert!(out.is_empty());
    }
}
