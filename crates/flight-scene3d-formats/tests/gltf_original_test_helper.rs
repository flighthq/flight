use crate::gltf_test_helper::gltf_data_uri;
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_meshgeometry::MeshGeometry;
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{Mesh, Scene3D};
use flight_scene3d_formats::contract::*;
use serde_json::{Value, json};

// These bytes come from the pinned pure TS fixture bodies; see the fixture provenance in refs/.
pub fn original_gltf_fixture(name: &str) -> Value {
    let fixtures: Value =
        serde_json::from_str(include_str!("fixtures/gltf_original.json")).unwrap();
    return fixtures[name].clone();
}

pub fn original_scene(source: &Value, diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>) -> Scene3D {
    let json = source.to_string();
    return create_scene3d_from_gltf(
        &GltfSource::Json(GltfJsonSource { source: &json }),
        diagnostics,
        None,
    );
}

pub fn original_children(scene: &Scene3D) -> Vec<NodeRef> {
    let mut children = Vec::new();
    let root: NodeRef = scene.root.clone();
    get_node_children(&mut children, &root);
    return children;
}

pub fn original_first_geometry(scene: &Scene3D) -> Ref<MeshGeometry> {
    let children = original_children(scene);
    let mesh = children[0].read().unwrap();
    return mesh
        .as_any()
        .downcast_ref::<Mesh>()
        .unwrap()
        .geometry
        .clone();
}

pub fn original_byte_view(bytes: Vec<u8>) -> ArrayBufferView {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes.into_boxed_slice());
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}

pub fn original_glb_bytes(source: &Value, binary: &[u8]) -> Vec<u8> {
    let mut json = source.to_string().into_bytes();
    while json.len() % 4 != 0 {
        json.push(0x20);
    }
    let mut binary = binary.to_vec();
    while binary.len() % 4 != 0 {
        binary.push(0);
    }
    let length = 12 + 8 + json.len() + 8 + binary.len();
    let mut bytes = Vec::new();
    for word in [
        0x46546c67_u32,
        2,
        length as u32,
        json.len() as u32,
        0x4e4f534a,
    ] {
        bytes.extend(word.to_le_bytes());
    }
    bytes.extend(json);
    bytes.extend((binary.len() as u32).to_le_bytes());
    bytes.extend(0x004e4942_u32.to_le_bytes());
    bytes.extend(binary);
    return bytes;
}

pub fn original_channel_gltf(
    interpolation: &str,
    output: &[f32],
    output_count: usize,
    output_type: &str,
    path: &str,
    times: &[f32],
) -> Value {
    let positions = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
    let bytes: Vec<_> = positions
        .iter()
        .chain(times)
        .chain(output)
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let pos_len = positions.len() * 4;
    let times_len = times.len() * 4;
    return json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5126,"count":times.len(),"type":"SCALAR"},{"bufferView":2,"componentType":5126,"count":output_count,"type":output_type}],"animations":[{"channels":[{"sampler":0,"target":{"node":0,"path":path}}],"samplers":[{"input":1,"interpolation":interpolation,"output":2}]}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":pos_len,"byteOffset":0},{"buffer":0,"byteLength":times_len,"byteOffset":pos_len},{"buffer":0,"byteLength":output.len()*4,"byteOffset":pos_len+times_len}],"buffers":[{"byteLength":bytes.len(),"uri":gltf_data_uri(&bytes)}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
}

pub fn assert_original_diagnostic(
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
    kind: &str,
    severity: ImportDiagnosticSeverity,
    origin: &str,
    fields: &[(&str, ImportDiagnosticDetailValue)],
) -> ImportDiagnostic {
    let diagnostic = diagnostics
        .read()
        .unwrap()
        .iter()
        .find(|entry| entry.kind == kind)
        .cloned()
        .unwrap_or_else(|| panic!("missing {kind}"));
    assert_eq!(diagnostic.severity, severity);
    assert_eq!(diagnostic.origin, origin);
    for (key, value) in fields {
        assert_eq!(
            diagnostic.detail.as_ref().unwrap().get(*key),
            Some(value),
            "{kind}.{key}"
        );
    }
    return diagnostic;
}

pub fn original_scene_with_options(
    source: &Value,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: &GltfImportOptions,
) -> Scene3D {
    let json = source.to_string();
    return create_scene3d_from_gltf(
        &GltfSource::Json(GltfJsonSource { source: &json }),
        diagnostics,
        Some(options),
    );
}

pub fn with_original_standard_material(
    scene: &Scene3D,
    check: impl FnOnce(&flight_materials::StandardPbrMaterial),
) {
    let children = original_children(scene);
    let mesh = children[0].read().unwrap();
    let mesh = mesh.as_any().downcast_ref::<Mesh>().unwrap();
    let materials = mesh.materials.read().unwrap();
    let material = materials[0].as_ref().unwrap().read().unwrap();
    check(
        material
            .as_any()
            .downcast_ref::<flight_materials::StandardPbrMaterial>()
            .unwrap(),
    );
}

pub fn original_image_uri(mime: &str, bytes: &[u8]) -> String {
    let uri = gltf_data_uri(bytes);
    return format!("data:{mime};base64,{}", uri.split_once(',').unwrap().1);
}

pub fn original_geometry_gltf(
    accessors: Value,
    views: Value,
    bytes: &[u8],
    primitives: Value,
) -> Value {
    return json!({"accessors":accessors,"asset":{"version":"2.0"},"bufferViews":views,"buffers":[{"byteLength":bytes.len(),"uri":gltf_data_uri(bytes)}],"meshes":[{"primitives":primitives}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
}

pub fn assert_original_close5(actual: f32, expected: f64) {
    // D1 f32 bound (TS: 0.000005)
    let bound = 0.000005_f64.max(4.0 * f32::EPSILON as f64 * expected.abs().max(1.0));
    assert!(
        (actual as f64 - expected).abs() <= bound,
        "{actual} != {expected}, bound {bound}"
    );
}

pub fn original_geometry_indices(geometry: &MeshGeometry) -> Vec<u32> {
    return match &geometry.indices {
        flight_meshgeometry::IndexBuffer::None => Vec::new(),
        flight_meshgeometry::IndexBuffer::U16(indices) => indices
            .data
            .read()
            .unwrap()
            .iter()
            .map(|value| *value as u32)
            .collect(),
        flight_meshgeometry::IndexBuffer::U32(indices) => indices.data.read().unwrap().to_vec(),
    };
}

pub fn with_original_mesh(scene: &Scene3D, check: impl FnOnce(&Mesh)) {
    let children = original_children(scene);
    let mesh = children[0].read().unwrap();
    check(mesh.as_any().downcast_ref::<Mesh>().unwrap());
}

pub fn assert_original_close2(actual: f32, expected: f64) {
    // D1 f32 bound (TS: 0.005)
    let bound = 0.005_f64.max(4.0 * f32::EPSILON as f64 * expected.abs().max(1.0));
    assert!(
        (actual as f64 - expected).abs() <= bound,
        "{actual} != {expected}, bound {bound}"
    );
}

pub fn original_document(
    source: &Value,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Ref<flight_scene3d::Scene3DDocument> {
    let json = source.to_string();
    return parse_gltf(
        &GltfSource::Json(GltfJsonSource { source: &json }),
        diagnostics,
        None,
    );
}

pub fn original_basisu_gltf(with_fallback: bool) -> Value {
    let mut texture = json!({"extensions":{"KHR_texture_basisu":{"source":1}},"sampler":0});
    if with_fallback {
        texture["source"] = json!(0);
    }
    return json!({"asset":{"version":"2.0"},"images":[{"uri":"fallback.png"},{"mimeType":"image/ktx2","uri":"compressed.ktx2"}],"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}],"samplers":[{}],"scenes":[{"nodes":[]}],"textures":[texture]});
}

pub fn original_quantized_gltf(required: bool) -> Value {
    let mut bytes: Vec<_> = [0_i16, 0, 0, 32767, 0, 0, 0, 32767, 0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    bytes.extend([0_u16, 1, 2].iter().flat_map(|value| value.to_le_bytes()));
    let mut source = original_geometry_gltf(
        json!([{"bufferView":0,"componentType":5122,"count":3,"normalized":true,"type":"VEC3"},{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}]),
        json!([{"buffer":0,"byteLength":18,"byteOffset":0},{"buffer":0,"byteLength":6,"byteOffset":18}]),
        &bytes,
        json!([{"attributes":{"POSITION":0},"indices":1}]),
    );
    source.as_object_mut().unwrap().remove("scene");
    source["extensionsUsed"] = json!(["KHR_mesh_quantization"]);
    if required {
        source["extensionsRequired"] = json!(["KHR_mesh_quantization"]);
    }
    return source;
}

pub fn original_textured_gltf(info: Value) -> Value {
    let mut source = original_gltf_fixture("triangle");
    source["images"] = json!([{"mimeType":"image/png","uri":"data:image/png;base64,iVBORw0KGgo="}]);
    source["textures"] = json!([{"source":0}]);
    source["materials"] = json!([{"pbrMetallicRoughness":{"baseColorTexture":info}}]);
    source["meshes"][0]["primitives"][0]["material"] = json!(0);
    return source;
}

pub fn original_optional_core_gltf() -> Value {
    let mut source = original_gltf_fixture("triangle");
    source["animations"] = json!([{"channels":[],"samplers":[]}]);
    source["cameras"] = json!([{"perspective":{"yfov":1,"znear":0.1},"type":"perspective"}]);
    source["materials"] = json!([{}]);
    source["meshes"][0]["primitives"][0]["material"] = json!(0);
    source["nodes"][0]["camera"] = json!(0);
    source["nodes"][0]["skin"] = json!(0);
    source["skins"] = json!([{"joints":[0]}]);
    return source;
}
