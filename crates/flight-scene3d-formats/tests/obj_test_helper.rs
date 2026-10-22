use flight_scene3d::{Scene3DDocument, Scene3DDocumentScene};
use flight_scene3d_formats::ObjMaterial;

pub fn empty_document() -> Scene3DDocument {
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
}

pub fn material_fixture(name: &str) -> ObjMaterial {
    return ObjMaterial {
        ambient: [0.0; 3],
        anisotropy: None,
        anisotropy_rotation: None,
        clearcoat: None,
        clearcoat_roughness: None,
        diffuse: [0.8, 0.2, 0.1],
        dissolve: 1.0,
        emissive: None,
        illumination: 2.0,
        map_ambient: None,
        map_bump: None,
        map_diffuse: None,
        map_dissolve: None,
        map_emissive: None,
        map_metallic: None,
        map_normal: None,
        map_roughness: None,
        map_specular: None,
        metallic: None,
        name: name.to_string(),
        roughness: None,
        sheen: None,
        specular: [1.0; 3],
        specular_exponent: 100.0,
    };
}
