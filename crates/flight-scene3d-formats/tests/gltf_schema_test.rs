use flight_entity::{Record, Ref, Unknown, get_record_value, set_record_value};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

#[test]
fn structural_texture_info_views_retain_the_original_normal_and_occlusion_allocations() {
    let normal = Arc::new(RwLock::new(GltfNormalTextureInfo {
        fields: GltfTextureInfo {
            index: 3.0,
            tex_coord: Some(1.0),
            extensions: None,
        },
        scale: Some(0.5),
    }));
    let first_view: GltfTextureInfoRef = normal.clone();
    let second_view: GltfTextureInfoRef = normal.clone();
    assert!(Arc::ptr_eq(&first_view, &second_view));
    normal.write().unwrap().fields.index = 7.0;
    assert_eq!(first_view.read().unwrap().gltf_texture_info().index, 7.0);
    assert_eq!(
        first_view.read().unwrap().gltf_texture_info().tex_coord,
        Some(1.0)
    );
    assert_eq!(normal.read().unwrap().scale, Some(0.5));
    let occlusion = Arc::new(RwLock::new(GltfOcclusionTextureInfo {
        fields: GltfTextureInfo {
            index: 4.0,
            tex_coord: None,
            extensions: None,
        },
        strength: Some(0.75),
    }));
    let view: GltfTextureInfoRef = occlusion.clone();
    let retained: GltfTextureInfoRef = occlusion.clone();
    assert!(Arc::ptr_eq(&view, &retained));
    occlusion.write().unwrap().fields.tex_coord = Some(2.0);
    assert_eq!(
        view.read().unwrap().gltf_texture_info().tex_coord,
        Some(2.0)
    );
    assert_eq!(occlusion.read().unwrap().strength, Some(0.75));
}

#[test]
fn declared_vendor_slots_retain_typed_unknown_objects_instead_of_erasing_named_records() {
    let vendor = Arc::new(RwLock::new(vec!["retained".to_string()]));
    let mut extensions = GltfMaterialExtensions {
        khr_materials_anisotropy: None,
        khr_materials_clearcoat: None,
        khr_materials_emissive_strength: None,
        khr_materials_ior: None,
        khr_materials_iridescence: None,
        khr_materials_pbr_specular_glossiness: None,
        khr_materials_sheen: None,
        khr_materials_unlit: Some(Arc::new(RwLock::new(GltfMaterialsUnlit {}))),
        khr_materials_specular: None,
        khr_materials_transmission: None,
        khr_materials_volume: None,
        vendor: {
            let empty_record: fn() -> Record<Unknown> = Default::default;
            empty_record()
        },
    };
    set_record_value(
        &mut extensions.vendor,
        "VENDOR_material".to_string(),
        Some(Arc::new(vendor.clone())),
    );
    let unknown = get_record_value(&extensions.vendor, "VENDOR_material")
        .unwrap()
        .as_ref()
        .unwrap();
    let retained = unknown.downcast_ref::<Ref<Vec<String>>>().unwrap();
    assert!(Arc::ptr_eq(retained, &vendor));
    vendor.write().unwrap().push("changed".to_string());
    assert_eq!(retained.read().unwrap().as_slice(), ["retained", "changed"]);
    assert!(extensions.khr_materials_unlit.is_some());
}
