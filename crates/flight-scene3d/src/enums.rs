#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BillboardMode {
    AxisY,
    Full,
    ScreenAligned,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MeshDeformer {
    Morph,
    None,
    Skeletal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene3DAnimationPath {
    Rotation,
    Scale,
    Translation,
    Weights,
}

pub const BILLBOARD_KIND: &str = "Billboard";
pub const INSTANCED_MESH_KIND: &str = "InstancedMesh";
pub const MESH_DEFORMER_MORPH: MeshDeformer = MeshDeformer::Morph;
pub const MESH_DEFORMER_NONE: MeshDeformer = MeshDeformer::None;
pub const MESH_DEFORMER_SKELETAL: MeshDeformer = MeshDeformer::Skeletal;
pub const MESH_KIND: &str = "Mesh";
pub const NODE3D_KIND: &str = "Node3D";
pub const SCENE3D_ANIMATION_PATH_ROTATION: Scene3DAnimationPath = Scene3DAnimationPath::Rotation;
pub const SCENE3D_ANIMATION_PATH_SCALE: Scene3DAnimationPath = Scene3DAnimationPath::Scale;
pub const SCENE3D_ANIMATION_PATH_TRANSLATION: Scene3DAnimationPath =
    Scene3DAnimationPath::Translation;
pub const SCENE3D_ANIMATION_PATH_WEIGHTS: Scene3DAnimationPath = Scene3DAnimationPath::Weights;

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source BillboardMode union
pub fn get_billboard_mode_string(value: BillboardMode) -> &'static str {
    return match value {
        BillboardMode::AxisY => "axisY",
        BillboardMode::Full => "full",
        BillboardMode::ScreenAligned => "screenAligned",
    };
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source MeshDeformer union
pub fn get_mesh_deformer_string(value: MeshDeformer) -> &'static str {
    return match value {
        MeshDeformer::Morph => "morph",
        MeshDeformer::None => "none",
        MeshDeformer::Skeletal => "skeletal",
    };
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source Scene3DAnimationPath union
pub fn get_scene3d_animation_path_string(value: Scene3DAnimationPath) -> &'static str {
    return match value {
        Scene3DAnimationPath::Rotation => "Rotation",
        Scene3DAnimationPath::Scale => "Scale",
        Scene3DAnimationPath::Translation => "Translation",
        Scene3DAnimationPath::Weights => "Weights",
    };
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source BillboardMode union
pub fn parse_billboard_mode(value: &str) -> Option<BillboardMode> {
    return match value {
        "axisY" => Some(BillboardMode::AxisY),
        "full" => Some(BillboardMode::Full),
        "screenAligned" => Some(BillboardMode::ScreenAligned),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source MeshDeformer union
pub fn parse_mesh_deformer(value: &str) -> Option<MeshDeformer> {
    return match value {
        "morph" => Some(MeshDeformer::Morph),
        "none" => Some(MeshDeformer::None),
        "skeletal" => Some(MeshDeformer::Skeletal),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the source Scene3DAnimationPath union
pub fn parse_scene3d_animation_path(value: &str) -> Option<Scene3DAnimationPath> {
    return match value {
        "Rotation" => Some(Scene3DAnimationPath::Rotation),
        "Scale" => Some(Scene3DAnimationPath::Scale),
        "Translation" => Some(Scene3DAnimationPath::Translation),
        "Weights" => Some(Scene3DAnimationPath::Weights),
        _ => None,
    };
}
