use super::*;
use flight_entity::{get_record_keys, get_record_value, has_record_key};

#[test]
fn preserves_original_number_validation_before_canonical_wire_scalar_narrowing() {
    let value: Value = serde_json::from_str(
        r#"{
        "asset":{"version":"2.0"},
        "accessors":[
            {"componentType":5126,"count":0.9999999999,"type":"VEC3"},
            {"componentType":5126,"count":16777217,"type":"VEC3"},
            {"componentType":5126,"count":1e400,"type":"VEC3"}
        ]
    }"#,
    )
    .unwrap();
    let decoded = decode_gltf_json(&value);
    let accessors = decoded
        .source
        .read()
        .unwrap()
        .accessors
        .as_ref()
        .unwrap()
        .clone();
    assert_eq!(accessors[0].read().unwrap().count, 1.0);
    let original = gltf_original_number(&decoded.metadata, &accessors[0], "count", 1.0);
    assert_eq!(original, 0.9999999999);
    assert_ne!(original.fract(), 0.0);
    assert_eq!(accessors[1].read().unwrap().count, 16777216.0);
    let original = gltf_original_number(&decoded.metadata, &accessors[1], "count", 16777216.0);
    assert_eq!(original as usize, 16777217);
    let current = accessors[2].read().unwrap().count;
    assert_eq!(current, f32::INFINITY);
    assert!(!gltf_original_number(&decoded.metadata, &accessors[2], "count", current).is_finite());
    accessors[0].write().unwrap().count = 2.5;
    assert_eq!(
        gltf_original_number(&decoded.metadata, &accessors[0], "count", 2.5),
        2.5
    );
    assert_eq!(
        gltf_original_number(&empty_gltf_json_metadata(), &accessors[0], "count", 2.5),
        2.5
    );
    assert!(gltf_json_field(&decoded.metadata, &accessors[0], "byteOffset").is_none());
}

#[test]
fn retains_named_wire_objects_and_original_normal_texture_info_allocation_through_structural_views()
{
    let value: Value = serde_json::from_str(r#"{
        "asset":{"version":"2.0"},
        "materials":[{
            "normalTexture":{"index":16777217,"scale":0.5,"extensions":{"KHR_texture_transform":{"texCoord":2,"offset":[0.25,0.5]}}},
            "extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":0.75,"clearcoatNormalTexture":{"index":1,"scale":0.25}}}
        }],
        "meshes":[{"primitives":[{"attributes":{"JOINTS_0":1,"POSITION":0,"TEXCOORD_0":2},"targets":[{"POSITION":3,"TANGENT":4}]}]}],
        "nodes":[{"mesh":0,"extensions":{"KHR_lights_punctual":{"light":0}}}],
        "extensions":{"KHR_lights_punctual":{"lights":[{"type":"spot","spot":{"innerConeAngle":0.25}}]}}
    }"#).unwrap();
    let decoded = decode_gltf_json(&value);
    let material = decoded.source.read().unwrap().materials.as_ref().unwrap()[0].clone();
    let normal = material
        .read()
        .unwrap()
        .normal_texture
        .as_ref()
        .unwrap()
        .clone();
    let view: GltfTextureInfoRef = normal.clone();
    let retained: GltfTextureInfoRef = normal.clone();
    assert!(Arc::ptr_eq(&view, &retained));
    let index = view.read().unwrap().gltf_texture_info().index;
    assert_eq!(index, 16777216.0);
    assert_eq!(
        gltf_original_number(&decoded.metadata, &view, "index", index) as usize,
        16777217
    );
    assert_eq!(normal.read().unwrap().scale, Some(0.5));
    let transform = normal
        .read()
        .unwrap()
        .fields
        .extensions
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .khr_texture_transform
        .as_ref()
        .unwrap()
        .clone();
    assert_eq!(transform.read().unwrap().tex_coord, Some(2.0));
    assert_eq!(
        transform.read().unwrap().offset.as_ref().unwrap(),
        &[0.25, 0.5]
    );
    let clearcoat = material
        .read()
        .unwrap()
        .extensions
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .khr_materials_clearcoat
        .as_ref()
        .unwrap()
        .clone();
    assert_eq!(clearcoat.read().unwrap().clearcoat_factor, Some(0.75));
    assert_eq!(
        clearcoat
            .read()
            .unwrap()
            .clearcoat_normal_texture
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .scale,
        Some(0.25)
    );
    let mesh = decoded.source.read().unwrap().meshes.as_ref().unwrap()[0].clone();
    let primitive = mesh.read().unwrap().primitives[0].clone();
    let primitive = primitive.read().unwrap();
    assert_eq!(primitive.attributes.read().unwrap().joints_0, Some(1.0));
    assert_eq!(primitive.attributes.read().unwrap().position, Some(0.0));
    assert_eq!(primitive.attributes.read().unwrap().texcoord_0, Some(2.0));
    assert_eq!(
        primitive.targets.as_ref().unwrap()[0]
            .read()
            .unwrap()
            .tangent,
        Some(4.0)
    );
    let lights = decoded
        .source
        .read()
        .unwrap()
        .extensions
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .khr_lights_punctual
        .as_ref()
        .unwrap()
        .clone();
    assert_eq!(
        lights.read().unwrap().lights[0].read().unwrap().r#type,
        "spot"
    );
    assert_eq!(
        lights.read().unwrap().lights[0]
            .read()
            .unwrap()
            .spot
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .inner_cone_angle,
        Some(0.25)
    );
}

#[test]
fn preserves_declared_vendor_objects_null_slots_and_javascript_record_key_order() {
    let value: Value = serde_json::from_str(
        r#"{
        "materials":[{"extensions":{
            "VENDOR_state":{"2":"two","0":"zero","enabled":true,"samples":[1,2],"empty":null},
            "KHR_materials_unlit":{},"VENDOR_null":null
        }}]
    }"#,
    )
    .unwrap();
    let decoded = decode_gltf_json(&value);
    let material = decoded.source.read().unwrap().materials.as_ref().unwrap()[0].clone();
    let extensions = material
        .read()
        .unwrap()
        .extensions
        .as_ref()
        .unwrap()
        .clone();
    let extensions = extensions.read().unwrap();
    assert!(extensions.khr_materials_unlit.is_some());
    assert!(!has_record_key(&extensions.vendor, "KHR_materials_unlit"));
    assert!(has_record_key(&extensions.vendor, "VENDOR_null"));
    assert!(
        get_record_value(&extensions.vendor, "VENDOR_null")
            .unwrap()
            .is_none()
    );
    let vendor = get_record_value(&extensions.vendor, "VENDOR_state")
        .unwrap()
        .as_ref()
        .unwrap();
    let vendor = vendor.downcast_ref::<Ref<Record<Unknown>>>().unwrap();
    let fields = vendor.read().unwrap();
    let mut keys = Vec::new();
    get_record_keys(&mut keys, &fields);
    assert_eq!(keys, ["0", "2", "enabled", "samples", "empty"]);
    assert_eq!(
        get_record_value(&fields, "enabled")
            .unwrap()
            .as_ref()
            .unwrap()
            .downcast_ref::<bool>(),
        Some(&true)
    );
    let samples = get_record_value(&fields, "samples")
        .unwrap()
        .as_ref()
        .unwrap()
        .downcast_ref::<Ref<Vec<Unknown>>>()
        .unwrap();
    let samples = samples.read().unwrap();
    assert_eq!(samples.len(), 2);
    assert_eq!(
        samples[0].as_ref().unwrap().downcast_ref::<f32>(),
        Some(&1.0)
    );
    assert_eq!(
        samples[1].as_ref().unwrap().downcast_ref::<f32>(),
        Some(&2.0)
    );
    assert!(get_record_value(&fields, "empty").unwrap().is_none());
}
