use flight_entity::Ref;
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

pub fn authored_translation_gltf() -> Ref<GltfDocument> {
    let times = [0.0_f32, 1.0];
    let values = [0.0_f32, 0.0, 0.0, 1.0, 2.0, 3.0];
    let bytes: Vec<_> = times
        .iter()
        .chain(values.iter())
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let source = minimal_gltf_document();
    {
        let mut source = source.write().unwrap();
        source.accessors = Some(vec![
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: Some(0.0),
                byte_offset: None,
                component_type: 5126.0,
                count: 2.0,
                normalized: None,
                r#type: "SCALAR".to_string(),
                sparse: None,
            })),
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: Some(1.0),
                byte_offset: None,
                component_type: 5126.0,
                count: 2.0,
                normalized: None,
                r#type: "VEC3".to_string(),
                sparse: None,
            })),
        ]);
        source.animations = Some(vec![Arc::new(RwLock::new(GltfAnimation {
            name: Some("move".to_string()),
            channels: vec![Arc::new(RwLock::new(GltfAnimationChannel {
                sampler: 0.0,
                target: Arc::new(RwLock::new(GltfAnimationTarget {
                    node: Some(0.0),
                    path: "translation".to_string(),
                })),
            }))],
            samplers: vec![Arc::new(RwLock::new(GltfAnimationSampler {
                input: 0.0,
                output: 1.0,
                interpolation: None,
            }))],
        }))]);
        source.buffers = Some(vec![Arc::new(RwLock::new(GltfBuffer {
            byte_length: bytes.len() as f32,
            uri: Some(gltf_data_uri(&bytes)),
        }))]);
        source.buffer_views = Some(vec![
            Arc::new(RwLock::new(GltfBufferView {
                buffer: 0.0,
                byte_offset: Some(0.0),
                byte_length: 8.0,
                byte_stride: None,
            })),
            Arc::new(RwLock::new(GltfBufferView {
                buffer: 0.0,
                byte_offset: Some(8.0),
                byte_length: 24.0,
                byte_stride: None,
            })),
        ]);
        source.nodes = Some(vec![Arc::new(RwLock::new(GltfNode {
            camera: None,
            name: None,
            children: None,
            mesh: None,
            skin: None,
            matrix: None,
            translation: None,
            rotation: None,
            scale: None,
            extensions: None,
        }))]);
        source.scene = Some(0.0);
        source.scenes = Some(vec![Arc::new(RwLock::new(GltfScene3D {
            name: None,
            nodes: Some(vec![0.0]),
        }))]);
    }
    return source;
}

pub fn gltf_data_uri(bytes: &[u8]) -> String {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = "data:application/octet-stream;base64,".to_string();
    for chunk in bytes.chunks(3) {
        let word = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        out.push(alphabet[((word >> 18) & 63) as usize] as char);
        out.push(alphabet[((word >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            alphabet[((word >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            alphabet[(word & 63) as usize] as char
        } else {
            '='
        });
    }
    return out;
}

pub fn build_json_glb(json: &str) -> Vec<u8> {
    let padded_length = (json.len() + 3) & !3;
    let total_length = 20 + padded_length;
    let mut bytes = Vec::with_capacity(total_length);
    bytes.extend_from_slice(&0x4654_6c67_u32.to_le_bytes());
    bytes.extend_from_slice(&2_u32.to_le_bytes());
    bytes.extend_from_slice(&(total_length as u32).to_le_bytes());
    bytes.extend_from_slice(&(padded_length as u32).to_le_bytes());
    bytes.extend_from_slice(&0x4e4f_534a_u32.to_le_bytes());
    bytes.extend_from_slice(json.as_bytes());
    bytes.resize(total_length, b' ');
    return bytes;
}

pub fn full_gltf_document() -> Ref<GltfDocument> {
    let document = minimal_gltf_document();
    {
        let mut source = document.write().unwrap();
        source.meshes = Some(vec![Arc::new(RwLock::new(GltfMesh {
            name: None,
            primitives: Vec::new(),
            weights: None,
        }))]);
        source.animations = Some(vec![Arc::new(RwLock::new(GltfAnimation {
            name: None,
            channels: Vec::new(),
            samplers: Vec::new(),
        }))]);
        source.cameras = Some(vec![Arc::new(RwLock::new(GltfCamera {
            name: None,
            orthographic: None,
            perspective: None,
            r#type: "perspective".to_string(),
        }))]);
        source.skins = Some(vec![Arc::new(RwLock::new(GltfSkin {
            name: None,
            inverse_bind_matrices: None,
            joints: Vec::new(),
            skeleton: None,
        }))]);
        source.extensions_used = Some(vec!["KHR_materials_unlit".to_string()]);
    }
    return document;
}

pub fn optional_gltf_features() -> Ref<GltfDocument> {
    let times = [0.0_f32, 1.0];
    let rotations = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.7071, 0.0, 0.7071];
    let bytes: Vec<_> = times
        .iter()
        .chain(rotations.iter())
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let source = minimal_gltf_document();
    {
        let mut source = source.write().unwrap();
        source.accessors = Some(vec![
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: Some(0.0),
                byte_offset: None,
                component_type: 5126.0,
                count: 2.0,
                normalized: None,
                r#type: "SCALAR".to_string(),
                sparse: None,
            })),
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: Some(1.0),
                byte_offset: None,
                component_type: 5126.0,
                count: 2.0,
                normalized: None,
                r#type: "VEC4".to_string(),
                sparse: None,
            })),
        ]);
        source.animations = Some(vec![Arc::new(RwLock::new(GltfAnimation {
            name: Some("spin".to_string()),
            channels: vec![Arc::new(RwLock::new(GltfAnimationChannel {
                sampler: 0.0,
                target: Arc::new(RwLock::new(GltfAnimationTarget {
                    node: Some(1.0),
                    path: "rotation".to_string(),
                })),
            }))],
            samplers: vec![Arc::new(RwLock::new(GltfAnimationSampler {
                input: 0.0,
                output: 1.0,
                interpolation: Some("LINEAR".to_string()),
            }))],
        }))]);
        source.buffer_views = Some(vec![
            Arc::new(RwLock::new(GltfBufferView {
                buffer: 0.0,
                byte_length: 8.0,
                byte_offset: Some(0.0),
                byte_stride: None,
            })),
            Arc::new(RwLock::new(GltfBufferView {
                buffer: 0.0,
                byte_length: 32.0,
                byte_offset: Some(8.0),
                byte_stride: None,
            })),
        ]);
        source.buffers = Some(vec![Arc::new(RwLock::new(GltfBuffer {
            byte_length: bytes.len() as f32,
            uri: Some(gltf_data_uri(&bytes)),
        }))]);
        source.cameras = Some(vec![Arc::new(RwLock::new(GltfCamera {
            name: None,
            orthographic: None,
            perspective: Some(Arc::new(RwLock::new(GltfPerspectiveCamera {
                aspect_ratio: None,
                yfov: 1.0,
                znear: 0.1,
                zfar: None,
            }))),
            r#type: "perspective".to_string(),
        }))]);
        source.nodes = Some(vec![
            Arc::new(RwLock::new(GltfNode {
                camera: Some(0.0),
                name: Some("a".to_string()),
                skin: Some(0.0),
                mesh: None,
                children: None,
                matrix: None,
                translation: None,
                rotation: None,
                scale: None,
                extensions: None,
            })),
            Arc::new(RwLock::new(GltfNode {
                camera: None,
                name: Some("b".to_string()),
                skin: None,
                mesh: None,
                children: None,
                matrix: None,
                translation: None,
                rotation: None,
                scale: None,
                extensions: None,
            })),
        ]);
        source.scene = Some(1.0);
        source.scenes = Some(vec![
            Arc::new(RwLock::new(GltfScene3D {
                name: Some("first".to_string()),
                nodes: Some(vec![0.0]),
            })),
            Arc::new(RwLock::new(GltfScene3D {
                name: Some("second".to_string()),
                nodes: Some(vec![1.0]),
            })),
        ]);
        source.skins = Some(vec![Arc::new(RwLock::new(GltfSkin {
            name: None,
            inverse_bind_matrices: None,
            joints: vec![1.0],
            skeleton: None,
        }))]);
    }
    return source;
}

pub fn optional_gltf_features_glb() -> flight_buffer::ArrayBufferView {
    let source = optional_gltf_features();
    let uri = source.read().unwrap().buffers.as_ref().unwrap()[0]
        .read()
        .unwrap()
        .uri
        .clone()
        .unwrap();
    let json=serde_json::json!({"accessors":[{"bufferView":0,"componentType":5126,"count":2,"type":"SCALAR"},{"bufferView":1,"componentType":5126,"count":2,"type":"VEC4"}],"animations":[{"channels":[{"sampler":0,"target":{"node":1,"path":"rotation"}}],"name":"spin","samplers":[{"input":0,"interpolation":"LINEAR","output":1}]}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":8,"byteOffset":0},{"buffer":0,"byteLength":32,"byteOffset":8}],"buffers":[{"byteLength":40,"uri":uri}],"cameras":[{"perspective":{"yfov":1,"znear":0.1},"type":"perspective"}],"nodes":[{"camera":0,"name":"a","skin":0},{"name":"b"}],"scene":1,"scenes":[{"name":"first","nodes":[0]},{"name":"second","nodes":[1]}],"skins":[{"joints":[1]}]}).to_string();
    let mut bytes = build_json_glb(&json);
    bytes.extend(0_u32.to_le_bytes());
    bytes.extend(0x004e4942_u32.to_le_bytes());
    let length = bytes.len();
    bytes[8..12].copy_from_slice(&(length as u32).to_le_bytes());
    let buffer = flight_buffer::create_array_buffer_from_bytes(bytes.into_boxed_slice());
    return flight_buffer::create_array_buffer_view(
        &buffer,
        0,
        length,
        flight_buffer::ArrayBufferViewKind::Uint8Array,
    )
    .unwrap();
}

pub fn minimal_gltf_document() -> Ref<GltfDocument> {
    return Arc::new(RwLock::new(GltfDocument {
        asset: Some(Arc::new(RwLock::new(GltfAsset {
            version: "2.0".to_string(),
        }))),
        cameras: None,
        scene: None,
        scenes: None,
        nodes: None,
        meshes: None,
        materials: None,
        textures: None,
        samplers: None,
        images: None,
        animations: None,
        accessors: None,
        buffer_views: None,
        buffers: None,
        skins: None,
        extensions_used: None,
        extensions_required: None,
        extensions: None,
    }));
}
