use flight_entity::Uint8Array;
use flight_scene3d_formats::*;

pub fn build_minimal_three_ds(children: &[Box<Uint8Array>]) -> Box<Uint8Array> {
    let body: Vec<u8> = children
        .iter()
        .flat_map(|child| child.iter().copied())
        .collect();
    return write_chunk(THREE_DS_MAIN, &write_chunk(THREE_DS_EDITOR, &body));
}

pub fn write_chunk(id: u16, body: &Uint8Array) -> Box<Uint8Array> {
    let mut chunk = vec![0; THREE_DS_CHUNK_HEADER_BYTES + body.len()].into_boxed_slice();
    let length = chunk.len() as u32;
    chunk[..2].copy_from_slice(&id.to_le_bytes());
    chunk[2..6].copy_from_slice(&length.to_le_bytes());
    chunk[6..].copy_from_slice(body);
    return chunk;
}

pub fn write_object_chunk(name: &str, id: u16, body: &Uint8Array) -> Box<Uint8Array> {
    let mut payload = name.as_bytes().to_vec();
    payload.push(0);
    payload.extend_from_slice(&write_chunk(id, body));
    return write_chunk(THREE_DS_OBJECT, &payload);
}

pub struct ThreeDsTestMaterial {
    pub bump_filename: Option<&'static str>,
    pub diffuse: [f32; 3],
    pub diffuse_float: bool,
    pub name: &'static str,
    pub opacity_filename: Option<&'static str>,
    pub shininess_percent: Option<u16>,
    pub texture_filename: Option<&'static str>,
    pub transparency_percent: Option<u16>,
}

pub const TRIANGLE_POSITIONS: [f32; 9] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
pub const CUBE_POSITIONS: [f32; 24] = [
    0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
    1.0, 1.0, 0.0, 1.0, 1.0,
];
pub const CUBE_INDICES_CCW_OUT: [u16; 36] = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
];
pub const IDENTITY_LOCAL: [f32; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

pub fn float_bytes(values: &[f32]) -> Vec<u8> {
    return values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
}

pub fn material_fixture(name: &'static str, diffuse: [f32; 3]) -> ThreeDsTestMaterial {
    return ThreeDsTestMaterial {
        bump_filename: None,
        diffuse,
        diffuse_float: false,
        name,
        opacity_filename: None,
        shininess_percent: None,
        texture_filename: None,
        transparency_percent: None,
    };
}

pub fn write_material(fixture: &ThreeDsTestMaterial) -> Box<[u8]> {
    let mut bytes = write_chunk(
        THREE_DS_MATERIAL_NAME,
        format!("{}\0", fixture.name).as_bytes(),
    )
    .to_vec();
    let color = if fixture.diffuse_float {
        write_chunk(THREE_DS_COLOR_FLOAT, &float_bytes(&fixture.diffuse))
    } else {
        write_chunk(
            THREE_DS_COLOR_BYTE,
            &fixture.diffuse.map(|value| value as u8),
        )
    };
    bytes.extend_from_slice(&write_chunk(THREE_DS_MATERIAL_DIFFUSE, &color));
    for (id, value) in [
        (THREE_DS_MATERIAL_SHININESS, fixture.shininess_percent),
        (THREE_DS_MATERIAL_TRANSPARENCY, fixture.transparency_percent),
    ] {
        if let Some(value) = value {
            bytes.extend_from_slice(&write_chunk(
                id,
                &write_chunk(THREE_DS_PERCENT_INT, &value.to_le_bytes()),
            ));
        }
    }
    for (id, value) in [
        (THREE_DS_MATERIAL_TEXTURE_MAP, fixture.texture_filename),
        (THREE_DS_MATERIAL_BUMP_MAP, fixture.bump_filename),
        (THREE_DS_MATERIAL_OPACITY_MAP, fixture.opacity_filename),
    ] {
        if let Some(value) = value {
            bytes.extend_from_slice(&write_chunk(
                id,
                &write_chunk(
                    THREE_DS_MATERIAL_TEXTURE_FILENAME,
                    format!("{value}\0").as_bytes(),
                ),
            ));
        }
    }
    return write_chunk(THREE_DS_MATERIAL, &bytes);
}

pub fn write_vertices(positions: &[f32]) -> Box<[u8]> {
    let mut bytes = ((positions.len() / 3) as u16).to_le_bytes().to_vec();
    bytes.extend_from_slice(&float_bytes(positions));
    return write_chunk(THREE_DS_VERTICES, &bytes);
}

pub fn write_faces(indices: &[u16], trailing: &[Box<[u8]>]) -> Box<[u8]> {
    let mut bytes = ((indices.len() / 3) as u16).to_le_bytes().to_vec();
    for face in indices.chunks_exact(3) {
        for value in face {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&0u16.to_le_bytes());
    }
    for chunk in trailing {
        bytes.extend_from_slice(chunk);
    }
    return write_chunk(THREE_DS_FACES, &bytes);
}

pub fn write_face_group(name: &str, faces: &[u16]) -> Box<[u8]> {
    let mut bytes = format!("{name}\0").as_bytes().to_vec();
    bytes.extend_from_slice(&(faces.len() as u16).to_le_bytes());
    for face in faces {
        bytes.extend_from_slice(&face.to_le_bytes());
    }
    return write_chunk(THREE_DS_FACE_MATERIAL, &bytes);
}

pub fn write_smoothing(groups: &[u32]) -> Box<[u8]> {
    return write_chunk(
        THREE_DS_SMOOTH_GROUP,
        &groups
            .iter()
            .flat_map(|group| group.to_le_bytes())
            .collect::<Vec<_>>(),
    );
}

pub fn write_mesh_object(
    name: &str,
    positions: &[f32],
    faces: &[u8],
    uv: Option<&[f32]>,
    local: Option<&[f32; 12]>,
) -> Box<[u8]> {
    let mut bytes = write_vertices(positions).to_vec();
    bytes.extend_from_slice(faces);
    if let Some(uv) = uv {
        let mut payload = ((uv.len() / 2) as u16).to_le_bytes().to_vec();
        payload.extend_from_slice(&float_bytes(uv));
        bytes.extend_from_slice(&write_chunk(THREE_DS_UV_COORDS, &payload));
    }
    if let Some(local) = local {
        bytes.extend_from_slice(&write_chunk(THREE_DS_TRANSFORM_MATRIX, &float_bytes(local)));
    }
    return write_object_chunk(name, THREE_DS_TRIMESH, &bytes);
}

pub fn pivot_chunk(name: &str, pivot: [f32; 3]) -> Box<[u8]> {
    let mut bytes = write_chunk(
        THREE_DS_KEYFRAME_NODE_HEADER,
        format!("{name}\0").as_bytes(),
    )
    .to_vec();
    bytes.extend_from_slice(&write_chunk(THREE_DS_KEYFRAME_PIVOT, &float_bytes(&pivot)));
    return write_chunk(
        THREE_DS_KEYFRAME,
        &write_chunk(THREE_DS_KEYFRAME_OBJECT_NODE, &bytes),
    );
}

pub fn full_three_ds_file() -> Box<[u8]> {
    let mut local = IDENTITY_LOCAL;
    local[9..12].copy_from_slice(&[2.0, 3.0, 4.0]);
    let editor = write_chunk(
        THREE_DS_EDITOR,
        &[
            write_material(&material_fixture("mat", [255.0; 3])),
            write_mesh_object(
                "box",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[write_face_group("mat", &[0])]),
                None,
                Some(&local),
            ),
            write_object_chunk(
                "cam",
                THREE_DS_CAMERA,
                &float_bytes(&[0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 0.0, 35.0]),
            ),
            write_object_chunk("lit", THREE_DS_LIGHT, &float_bytes(&[1.0, 2.0, 3.0])),
        ]
        .iter()
        .flat_map(|part| part.iter().copied())
        .collect::<Vec<_>>(),
    );
    let mut payload = editor.to_vec();
    payload.extend_from_slice(&pivot_chunk("box", [5.0, 6.0, 7.0]));
    return write_chunk(THREE_DS_MAIN, &payload);
}

pub fn geometry_indices(geometry: &flight_meshgeometry::MeshGeometry) -> Vec<u32> {
    return match &geometry.indices {
        flight_meshgeometry::IndexBuffer::None => Vec::new(),
        flight_meshgeometry::IndexBuffer::U16(value) => value
            .data
            .read()
            .unwrap()
            .iter()
            .map(|value| *value as u32)
            .collect(),
        flight_meshgeometry::IndexBuffer::U32(value) => value.data.read().unwrap().to_vec(),
    };
}

pub fn signed_volume_of_closed_geometry(
    geometry: &flight_meshgeometry::MeshGeometry,
) -> Option<f32> {
    let indices = geometry_indices(geometry);
    let mut edges = std::collections::BTreeMap::new();
    for triangle in indices.chunks_exact(3) {
        for edge in 0..3 {
            *edges
                .entry((triangle[edge], triangle[(edge + 1) % 3]))
                .or_insert(0) += 1;
        }
    }
    for ((a, b), count) in &edges {
        if *count != 1 || !edges.contains_key(&(*b, *a)) {
            return None;
        }
    }
    let stride = geometry.layout.read().unwrap().stride as usize / 4;
    let mut volume = 0.0;
    for triangle in indices.chunks_exact(3) {
        let a = &geometry.vertices[triangle[0] as usize * stride..];
        let b = &geometry.vertices[triangle[1] as usize * stride..];
        let c = &geometry.vertices[triangle[2] as usize * stride..];
        volume += (a[0] * (b[1] * c[2] - b[2] * c[1])
            + a[1] * (b[2] * c[0] - b[0] * c[2])
            + a[2] * (b[0] * c[1] - b[1] * c[0]))
            / 6.0;
    }
    return Some(volume);
}
