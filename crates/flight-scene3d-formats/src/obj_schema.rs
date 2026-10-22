pub struct ObjMaterial {
    pub ambient: [f32; 3],
    pub anisotropy: Option<f32>,
    pub anisotropy_rotation: Option<f32>,
    pub clearcoat: Option<f32>,
    pub clearcoat_roughness: Option<f32>,
    pub diffuse: [f32; 3],
    pub dissolve: f32,
    pub emissive: Option<[f32; 3]>,
    pub illumination: f32,
    pub map_ambient: Option<String>,
    pub map_bump: Option<String>,
    pub map_diffuse: Option<String>,
    pub map_dissolve: Option<String>,
    pub map_emissive: Option<String>,
    pub map_metallic: Option<String>,
    pub map_normal: Option<String>,
    pub map_roughness: Option<String>,
    pub map_specular: Option<String>,
    pub metallic: Option<f32>,
    pub name: String,
    pub roughness: Option<f32>,
    pub sheen: Option<f32>,
    pub specular: [f32; 3],
    pub specular_exponent: f32,
}

pub struct ObjMaterialEntry {
    pub key: String,
    pub value: ObjMaterial,
}

pub struct ObjMaterialLibrary {
    pub materials: Vec<ObjMaterialEntry>,
}
