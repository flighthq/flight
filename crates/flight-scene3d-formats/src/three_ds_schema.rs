use flight_entity::{Float32Array, Uint16Array, Uint32Array};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use std::collections::HashMap;

pub struct ThreeDsCamera {
    pub far: Option<f32>,
    pub focal_length: f32,
    pub name: String,
    pub near: Option<f32>,
    pub position: [f32; 3],
    pub roll: f32,
    pub target: [f32; 3],
}

pub struct ThreeDsDropTally {
    pub count: usize,
    pub detail: HashMap<String, ImportDiagnosticDetailValue>,
    pub kind: String,
    pub severity: ImportDiagnosticSeverity,
}

pub struct ThreeDsLight {
    pub color: [f32; 3],
    pub enabled: bool,
    pub falloff: f32,
    pub hotspot: f32,
    pub inner_range: Option<f32>,
    pub multiplier: f32,
    pub name: String,
    pub outer_range: Option<f32>,
    pub position: [f32; 3],
    pub target: Option<[f32; 3]>,
}

pub struct ThreeDsMaterial {
    pub ambient: [f32; 3],
    pub bump_filename: Option<String>,
    pub diffuse: [f32; 3],
    pub name: String,
    pub opacity: f32,
    pub opacity_filename: Option<String>,
    pub shininess: Option<f32>,
    pub specular: [f32; 3],
    pub texture_filename: Option<String>,
}

pub struct ThreeDsMaterialGroup {
    pub faces: Box<Uint16Array>,
    pub name: String,
}

pub struct ThreeDsMesh {
    pub faces: Box<Uint16Array>,
    pub local_matrix: Option<Box<Float32Array>>,
    pub material_groups: Vec<ThreeDsMaterialGroup>,
    pub name: String,
    pub smoothing_groups: Option<Box<Uint32Array>>,
    pub uvs: Option<Box<Float32Array>>,
    pub vertices: Box<Float32Array>,
}

pub const THREE_DS_MAIN: u16 = 0x4d4d;
pub const THREE_DS_EDITOR: u16 = 0x3d3d;
pub const THREE_DS_KEYFRAME: u16 = 0xb000;
pub const THREE_DS_KEYFRAME_OBJECT_NODE: u16 = 0xb002;
pub const THREE_DS_KEYFRAME_NODE_HEADER: u16 = 0xb010;
pub const THREE_DS_KEYFRAME_PIVOT: u16 = 0xb013;
pub const THREE_DS_OBJECT: u16 = 0x4000;
pub const THREE_DS_TRIMESH: u16 = 0x4100;
pub const THREE_DS_VERTICES: u16 = 0x4110;
pub const THREE_DS_FACES: u16 = 0x4120;
pub const THREE_DS_FACE_MATERIAL: u16 = 0x4130;
pub const THREE_DS_UV_COORDS: u16 = 0x4140;
pub const THREE_DS_SMOOTH_GROUP: u16 = 0x4150;
pub const THREE_DS_TRANSFORM_MATRIX: u16 = 0x4160;
pub const THREE_DS_LIGHT: u16 = 0x4600;
pub const THREE_DS_LIGHT_SPOT: u16 = 0x4610;
pub const THREE_DS_LIGHT_OFF: u16 = 0x4620;
pub const THREE_DS_LIGHT_INNER_RANGE: u16 = 0x4659;
pub const THREE_DS_LIGHT_OUTER_RANGE: u16 = 0x465a;
pub const THREE_DS_LIGHT_MULTIPLIER: u16 = 0x465b;
pub const THREE_DS_CAMERA: u16 = 0x4700;
pub const THREE_DS_CAMERA_RANGES: u16 = 0x4720;
pub const THREE_DS_CAMERA_APERTURE_MM: f32 = 36.0;
pub const THREE_DS_MATERIAL: u16 = 0xafff;
pub const THREE_DS_MATERIAL_NAME: u16 = 0xa000;
pub const THREE_DS_MATERIAL_AMBIENT: u16 = 0xa010;
pub const THREE_DS_MATERIAL_DIFFUSE: u16 = 0xa020;
pub const THREE_DS_MATERIAL_SPECULAR: u16 = 0xa030;
pub const THREE_DS_MATERIAL_SHININESS: u16 = 0xa040;
pub const THREE_DS_MATERIAL_TRANSPARENCY: u16 = 0xa050;
pub const THREE_DS_MATERIAL_TEXTURE_MAP: u16 = 0xa200;
pub const THREE_DS_MATERIAL_OPACITY_MAP: u16 = 0xa210;
pub const THREE_DS_MATERIAL_TEXTURE_FILENAME: u16 = 0xa300;
pub const THREE_DS_MATERIAL_BUMP_MAP: u16 = 0xa230;
pub const THREE_DS_COLOR_FLOAT: u16 = 0x0010;
pub const THREE_DS_COLOR_BYTE: u16 = 0x0011;
pub const THREE_DS_PERCENT_INT: u16 = 0x0030;
pub const THREE_DS_PERCENT_FLOAT: u16 = 0x0031;
pub const THREE_DS_CHUNK_HEADER_BYTES: usize = 6;
