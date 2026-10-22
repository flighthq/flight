use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_meshgeometry::MeshGeometry;
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{Mesh, Scene3D, Scene3DDocument};
use flight_scene3d_formats::*;

pub struct Md2Fixture {
    pub vertices: Vec<[u8; 4]>,
    pub extra_frames: Vec<Vec<[u8; 4]>>,
    pub frame_names: Vec<String>,
    pub frame_scales: Vec<[f32; 3]>,
    pub frame_translates: Vec<[f32; 3]>,
    pub num_frames: usize,
    pub scale: [f32; 3],
    pub skins: Vec<String>,
    pub skin_height: i32,
    pub skin_width: i32,
    pub tex_coords: Vec<[i16; 2]>,
    pub translate: [f32; 3],
    pub triangles: Vec<([u16; 3], [u16; 3])>,
}

pub fn build_md2(fixture: &Md2Fixture) -> Box<Uint8Array> {
    let off_skins = MD2_HEADER_SIZE;
    let off_tex_coords = off_skins + fixture.skins.len() * MD2_SKIN_SIZE;
    let off_triangles = off_tex_coords + fixture.tex_coords.len() * MD2_TEXCOORD_SIZE;
    let frame_size = MD2_FRAME_HEADER_SIZE + fixture.vertices.len() * MD2_COMPRESSED_VERTEX_SIZE;
    let off_frames = off_triangles + fixture.triangles.len() * MD2_TRIANGLE_SIZE;
    let end = off_frames + fixture.num_frames * frame_size;
    let mut bytes = vec![0; end].into_boxed_slice();
    for (offset, value) in [
        (0, MD2_MAGIC),
        (4, MD2_VERSION),
        (8, fixture.skin_width),
        (12, fixture.skin_height),
        (16, frame_size as i32),
        (20, fixture.skins.len() as i32),
        (24, fixture.vertices.len() as i32),
        (28, fixture.tex_coords.len() as i32),
        (32, fixture.triangles.len() as i32),
        (40, fixture.num_frames as i32),
        (
            44,
            if fixture.skins.is_empty() {
                0
            } else {
                off_skins as i32
            },
        ),
        (48, off_tex_coords as i32),
        (52, off_triangles as i32),
        (56, off_frames as i32),
        (64, end as i32),
    ] {
        write_i32(&mut bytes, offset, value);
    }
    for (s, skin) in fixture.skins.iter().enumerate() {
        for (i, c) in skin.bytes().take(63).enumerate() {
            bytes[off_skins + s * MD2_SKIN_SIZE + i] = c;
        }
    }
    for (i, coords) in fixture.tex_coords.iter().enumerate() {
        for (c, value) in coords.iter().enumerate() {
            let b = off_tex_coords + i * MD2_TEXCOORD_SIZE + c * 2;
            bytes[b..b + 2].copy_from_slice(&value.to_le_bytes());
        }
    }
    for (i, (vertices, tex_coords)) in fixture.triangles.iter().enumerate() {
        for (c, value) in vertices.iter().chain(tex_coords.iter()).enumerate() {
            let b = off_triangles + i * MD2_TRIANGLE_SIZE + c * 2;
            bytes[b..b + 2].copy_from_slice(&value.to_le_bytes());
        }
    }
    for f in 0..fixture.num_frames {
        let b = off_frames + f * frame_size;
        let scale = fixture.frame_scales.get(f).unwrap_or(&fixture.scale);
        let translate = fixture
            .frame_translates
            .get(f)
            .unwrap_or(&fixture.translate);
        for c in 0..3 {
            bytes[b + c * 4..b + c * 4 + 4].copy_from_slice(&scale[c].to_le_bytes());
            bytes[b + 12 + c * 4..b + 16 + c * 4].copy_from_slice(&translate[c].to_le_bytes());
        }
        if let Some(name) = fixture.frame_names.get(f) {
            for (i, c) in name.bytes().take(15).enumerate() {
                bytes[b + 24 + i] = c;
            }
        }
        let vertices = if f == 0 {
            Some(&fixture.vertices)
        } else {
            fixture.extra_frames.get(f - 1)
        };
        if let Some(vertices) = vertices {
            for (i, vertex) in vertices.iter().enumerate() {
                bytes[b + 40 + i * 4..b + 44 + i * 4].copy_from_slice(vertex);
            }
        }
    }
    return bytes;
}

pub fn expect_crumb<'a>(
    diagnostics: &'a [ImportDiagnostic],
    kind: &str,
    severity: ImportDiagnosticSeverity,
    origin: &str,
    fields: &[(&str, f32)],
) -> &'a ImportDiagnostic {
    let matches: Vec<_> = diagnostics
        .iter()
        .filter(|entry| entry.kind == kind)
        .collect();
    assert_eq!(matches.len(), 1, "{diagnostics:?}");
    let crumb = matches[0];
    assert_eq!(crumb.severity, severity);
    assert_eq!(crumb.origin, origin);
    for (field, value) in fields {
        assert_eq!(
            crumb.detail.as_ref().unwrap().get(*field),
            Some(&ImportDiagnosticDetailValue::Number(*value))
        );
    }
    return crumb;
}

pub fn expect_empty_document(document: &Scene3DDocument) {
    assert!(document.animations.is_empty());
    assert!(document.cameras.is_empty());
    assert!(document.lights.is_empty());
    assert!(document.materials.is_empty());
    assert!(document.meshes.is_empty());
    assert!(document.metadata.is_none());
    assert!(document.nodes.is_empty());
    assert!(document.resources.is_empty());
    assert!(document.skins.is_empty());
    assert_eq!(document.scenes.len(), 1);
    assert!(document.scenes[0].root_nodes.is_empty());
}

pub fn geometry_indices(geometry: &MeshGeometry) -> Vec<u32> {
    return match &geometry.indices {
        flight_meshgeometry::IndexBuffer::None => Vec::new(),
        flight_meshgeometry::IndexBuffer::U16(indices) => indices
            .data
            .read()
            .unwrap()
            .iter()
            .map(|v| *v as u32)
            .collect(),
        flight_meshgeometry::IndexBuffer::U32(indices) => indices.data.read().unwrap().to_vec(),
    };
}

pub fn scene_geometry(scene: &Scene3D) -> Ref<MeshGeometry> {
    let root: NodeRef = scene.root.clone();
    let children = {
        let mut output = Vec::new();
        get_node_children(&mut output, &root);
        output
    };
    assert_eq!(children.len(), 1);
    let child = children[0].read().unwrap();
    let mesh = child.as_any().downcast_ref::<Mesh>().unwrap();
    return mesh.geometry.clone();
}

pub fn triangle_fixture() -> Md2Fixture {
    return Md2Fixture {
        vertices: vec![[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]],
        extra_frames: Vec::new(),
        frame_names: Vec::new(),
        frame_scales: Vec::new(),
        frame_translates: Vec::new(),
        num_frames: 1,
        scale: [1.0; 3],
        skins: Vec::new(),
        skin_height: 64,
        skin_width: 64,
        tex_coords: vec![[0, 0], [1, 0], [0, 1]],
        translate: [0.0; 3],
        triangles: vec![([0, 1, 2], [0, 1, 2])],
    };
}

pub fn write_i32(bytes: &mut Uint8Array, offset: usize, value: i32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
