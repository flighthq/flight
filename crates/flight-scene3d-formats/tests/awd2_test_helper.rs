pub fn block(block_type: u8, namespace: u8, id: u32, body: &[u8]) -> Vec<u8> {
    let mut out = vec![0; 11];
    out[..4].copy_from_slice(&id.to_le_bytes());
    out[4] = namespace;
    out[5] = block_type;
    out[7..11].copy_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(body);
    return out;
}

pub fn file(blocks: &[Vec<u8>]) -> Vec<u8> {
    let mut out = vec![0x41, 0x57, 0x44, 2, 1, 0, 0, 0, 0, 0, 0, 0];
    let length: usize = blocks.iter().map(Vec::len).sum();
    out[8..12].copy_from_slice(&(length as u32).to_le_bytes());
    for block in blocks {
        out.extend_from_slice(block);
    }
    return out;
}

pub fn empty_document() -> flight_entity::Ref<flight_scene3d::Scene3DDocument> {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_scene3d::Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![flight_scene3d::Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    }));
}

pub fn handler(
    block_types: Vec<u8>,
) -> flight_entity::Ref<flight_scene3d_formats::Awd2BlockHandler> {
    return std::sync::Arc::new(std::sync::RwLock::new(
        flight_scene3d_formats::Awd2BlockHandler {
            block_types,
            build_phase: None,
            deferred: None,
            parse: std::sync::Arc::new(|_, _| {}),
            build: None,
        },
    ));
}

pub fn awd_string(value: &str) -> Vec<u8> {
    let mut bytes = (value.len() as u16).to_le_bytes().to_vec();
    bytes.extend_from_slice(value.as_bytes());
    return bytes;
}

pub fn property_list(properties: &[(u16, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = vec![0; 4];
    for (key, payload) in properties {
        bytes.extend_from_slice(&key.to_le_bytes());
        bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(payload);
    }
    let length = (bytes.len() - 4) as u32;
    bytes[..4].copy_from_slice(&length.to_le_bytes());
    return bytes;
}

pub fn scene_header(name: &str, parent_id: u32, transform: &[f64; 12], wide: bool) -> Vec<u8> {
    let mut bytes = parent_id.to_le_bytes().to_vec();
    for value in transform {
        if wide {
            bytes.extend_from_slice(&value.to_le_bytes());
        } else {
            bytes.extend_from_slice(&(*value as f32).to_le_bytes());
        }
    }
    bytes.extend_from_slice(&awd_string(name));
    return bytes;
}

pub const IDENTITY_TRANSFORM: [f64; 12] =
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

pub fn animation_body(name: &str, poses: &[(u16, u32)]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(poses.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    for (duration, pose_id) in poses {
        bytes.extend_from_slice(&pose_id.to_le_bytes());
        bytes.extend_from_slice(&duration.to_le_bytes());
    }
    return bytes;
}

pub fn geometry_body(name: &str, sub_meshes: &[Vec<Vec<u8>>]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(sub_meshes.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    for streams in sub_meshes {
        bytes.extend_from_slice(
            &((8 + streams.iter().map(Vec::len).sum::<usize>()) as u32).to_le_bytes(),
        );
        bytes.extend_from_slice(&[0; 4]);
        for stream in streams {
            bytes.extend_from_slice(stream);
        }
        bytes.extend_from_slice(&[0; 4]);
    }
    return bytes;
}

pub fn geometry_stream(kind: u8, data_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![kind, data_type];
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    return bytes;
}

pub fn mesh_body(name: &str, geometry_id: u32) -> Vec<u8> {
    let mut bytes = scene_header(name, 0, &IDENTITY_TRANSFORM, false);
    bytes.extend_from_slice(&geometry_id.to_le_bytes());
    bytes.extend_from_slice(&[0; 10]);
    return bytes;
}

pub fn pose_body(name: &str, transforms: &[Option<[f64; 12]>], wide: bool) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(transforms.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    for transform in transforms {
        bytes.push(transform.is_some() as u8);
        if let Some(transform) = transform {
            for value in transform {
                if wide {
                    bytes.extend_from_slice(&value.to_le_bytes());
                } else {
                    bytes.extend_from_slice(&(*value as f32).to_le_bytes());
                }
            }
        }
    }
    return bytes;
}

pub fn skeleton_body(name: &str, joints: &[(&str, u16, [f64; 12])], wide: bool) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(joints.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    for (index, (name, parent, transform)) in joints.iter().enumerate() {
        bytes.extend_from_slice(&(index as u16).to_le_bytes());
        bytes.extend_from_slice(&parent.to_le_bytes());
        bytes.extend_from_slice(&awd_string(name));
        for value in transform {
            if wide {
                bytes.extend_from_slice(&value.to_le_bytes());
            } else {
                bytes.extend_from_slice(&(*value as f32).to_le_bytes());
            }
        }
        bytes.extend_from_slice(&[0; 8]);
    }
    return bytes;
}

pub fn skinned_triangle() -> Vec<u8> {
    use flight_scene3d_formats::*;
    let positions = [0.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let indices = [0u16, 1, 2]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let joints = [0u16, 1, 0, 1, 1, 0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let weights = [0.75f32, 0.25, 0.5, 0.5, 1.0, 0.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let geometry = geometry_body(
        "Skinned",
        &[vec![
            geometry_stream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, &positions),
            geometry_stream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, &indices),
            geometry_stream(AWD2_STREAM_JOINT_INDICES, AWD2_DATA_FLOAT32, &joints),
            geometry_stream(AWD2_STREAM_JOINT_WEIGHTS, AWD2_DATA_FLOAT32, &weights),
        ]],
    );
    let mut child = IDENTITY_TRANSFORM;
    child[9] = 5.0;
    let skeleton = skeleton_body(
        "Rig",
        &[("Root", 0, IDENTITY_TRANSFORM), ("Child", 1, child)],
        false,
    );
    let pose0 = pose_body("P0", &[Some(IDENTITY_TRANSFORM); 2], false);
    let mut root_pose = IDENTITY_TRANSFORM;
    root_pose[9] = 10.0;
    let mut child_pose = IDENTITY_TRANSFORM;
    child_pose[10] = 10.0;
    let pose1 = pose_body("P1", &[Some(root_pose), Some(child_pose)], false);
    return file(&[
        block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &geometry),
        block(AWD2_BLOCK_SKELETON, 0, 2, &skeleton),
        block(AWD2_BLOCK_MESH_INSTANCE, 0, 3, &mesh_body("SkinnedMesh", 1)),
        block(AWD2_BLOCK_SKELETON_POSE, 0, 5, &pose0),
        block(AWD2_BLOCK_SKELETON_POSE, 0, 6, &pose1),
        block(
            AWD2_BLOCK_SKELETON_ANIMATION,
            0,
            7,
            &animation_body("Walk", &[(500, 5), (500, 6)]),
        ),
    ]);
}

// Exact precompressed fixture from the pinned awd2Parse.test.ts; decoded once from its base64 literal.
pub const COMPRESSED_SKINNED_BODY: &[u8] = &[
    120, 156, 99, 100, 0, 2, 70, 134, 70, 32, 201, 206, 16, 156, 157, 153, 151, 151, 154, 194, 8,
    18, 99, 200, 99, 128, 0, 70, 118, 21, 6, 116, 208, 96, 143, 141, 207, 196, 202, 6, 209, 193,
    192, 196, 192, 198, 206, 3, 101, 131, 48, 136, 100, 103, 151, 0, 139, 56, 0, 213, 54, 216, 1,
    25, 246, 16, 140, 48, 139, 9, 68, 164, 50, 76, 0, 146, 204, 12, 65, 153, 233, 76, 112, 243, 89,
    24, 130, 242, 243, 75, 112, 217, 139, 155, 15, 245, 1, 16, 178, 50, 56, 103, 100, 230, 164, 16,
    103, 196, 2, 7, 116, 35, 152, 65, 132, 56, 131, 63, 209, 54, 163, 242, 185, 97, 65, 235, 155,
    90, 156, 193, 136, 162, 144, 21, 68, 164, 49, 228, 48, 128, 252, 31, 96, 192, 4, 117, 49, 137,
    22, 144, 172, 129, 13, 197, 90, 67, 146, 172, 85, 112, 36, 195, 90, 136, 38, 118, 16, 145, 206,
    0, 74, 9, 44, 12, 225, 137, 57, 217, 16, 139, 65, 129, 240, 133, 145, 13, 76, 2, 0, 243, 236,
    42, 212,
];
