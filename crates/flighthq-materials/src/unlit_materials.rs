//! Constructors and kind ids for lighting-independent and pass-infrastructure
//! surface materials: [`DepthMaterial`], [`EmissiveMaterial`],
//! [`MatcapMaterial`], [`NormalMaterial`], [`ToonMaterial`],
//! [`UnlitMaterial`], [`VertexColorMaterial`], [`WireframeMaterial`].

use flighthq_types::{
    DepthMaterial, EmissiveMaterial, KindId, MatcapMaterial, NormalMaterial, Texture, ToonMaterial,
    UnlitMaterial, VertexColorMaterial, WireframeMaterial,
};

use crate::surface_material::create_surface_material;

// ---------------------------------------------------------------------------
// Kind constants
// ---------------------------------------------------------------------------

/// Stable `KindId` for [`DepthMaterial`].
pub fn depth_material_kind() -> KindId {
    KindId::of::<DepthMaterial>()
}

/// Stable `KindId` for [`EmissiveMaterial`].
pub fn emissive_material_kind() -> KindId {
    KindId::of::<EmissiveMaterial>()
}

/// Stable `KindId` for [`MatcapMaterial`].
pub fn matcap_material_kind() -> KindId {
    KindId::of::<MatcapMaterial>()
}

/// Stable `KindId` for [`NormalMaterial`].
pub fn normal_material_kind() -> KindId {
    KindId::of::<NormalMaterial>()
}

/// Stable `KindId` for [`ToonMaterial`].
pub fn toon_material_kind() -> KindId {
    KindId::of::<ToonMaterial>()
}

/// Stable `KindId` for [`UnlitMaterial`].
pub fn unlit_material_kind() -> KindId {
    KindId::of::<UnlitMaterial>()
}

/// Stable `KindId` for [`VertexColorMaterial`].
pub fn vertex_color_material_kind() -> KindId {
    KindId::of::<VertexColorMaterial>()
}

/// Stable `KindId` for [`WireframeMaterial`].
pub fn wireframe_material_kind() -> KindId {
    KindId::of::<WireframeMaterial>()
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`create_depth_material`]. `near`/`far` default to a unit
/// range; the depth pass overrides them with the camera's range when used as
/// pass infrastructure.
#[derive(Copy, Clone, Debug, Default)]
pub struct DepthMaterialOptions {
    pub far: Option<f32>,
    pub near: Option<f32>,
}

/// Options for [`create_emissive_material`]. `emissive` defaults to white,
/// `emissive_strength` to 1 (> 1 drives bloom on GPU backends), the map to
/// `None`.
#[derive(Clone, Debug, Default)]
pub struct EmissiveMaterialOptions {
    pub emissive: Option<u32>,
    pub emissive_map: Option<Texture>,
    pub emissive_strength: Option<f32>,
}

/// Options for [`create_matcap_material`]. `matcap` defaults to `None`,
/// `tint` to white.
#[derive(Clone, Debug, Default)]
pub struct MatcapMaterialOptions {
    pub matcap: Option<Texture>,
    pub tint: Option<u32>,
}

/// Options for [`create_normal_material`]. `normal_map` defaults to `None`,
/// `normal_scale` to 1.
#[derive(Clone, Debug, Default)]
pub struct NormalMaterialOptions {
    pub normal_map: Option<Texture>,
    pub normal_scale: Option<f32>,
}

/// Options for [`create_toon_material`]. `base_color` defaults to white,
/// maps to `None`, `steps` to 3 (the band count used when no ramp is bound).
#[derive(Clone, Debug, Default)]
pub struct ToonMaterialOptions {
    pub base_color: Option<u32>,
    pub base_color_map: Option<Texture>,
    pub ramp: Option<Texture>,
    pub steps: Option<u32>,
}

/// Options for [`create_unlit_material`]. `base_color` defaults to white,
/// `base_color_map` to `None`.
#[derive(Clone, Debug, Default)]
pub struct UnlitMaterialOptions {
    pub base_color: Option<u32>,
    pub base_color_map: Option<Texture>,
}

/// Options for [`create_vertex_color_material`]. `tint` defaults to white.
#[derive(Copy, Clone, Debug, Default)]
pub struct VertexColorMaterialOptions {
    pub tint: Option<u32>,
}

/// Options for [`create_wireframe_material`]. `color` defaults to white,
/// `thickness` to 1 pixel.
#[derive(Copy, Clone, Debug, Default)]
pub struct WireframeMaterialOptions {
    pub color: Option<u32>,
    pub thickness: Option<f32>,
}

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Depth-output pass material. `near`/`far` default to a unit range; the
/// depth pass overrides them with the camera's range when used as pass
/// infrastructure.
pub fn create_depth_material(options: &DepthMaterialOptions) -> DepthMaterial {
    let trailer = create_surface_material(depth_material_kind());
    DepthMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        far: options.far.unwrap_or(1.0),
        near: options.near.unwrap_or(0.0),
    }
}

/// Self-illuminating, lighting-independent material. `emissive` defaults to
/// white, `emissive_strength` to 1 (> 1 drives bloom on GPU backends), the
/// map to `None`.
pub fn create_emissive_material(options: &EmissiveMaterialOptions) -> EmissiveMaterial {
    let trailer = create_surface_material(emissive_material_kind());
    EmissiveMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        emissive: options.emissive.unwrap_or(0xffffffff),
        emissive_map: options.emissive_map.clone(),
        emissive_strength: options.emissive_strength.unwrap_or(1.0),
    }
}

/// Material-capture (matcap) material: a prebaked lit sphere sampled by the
/// view-space normal. `matcap` defaults to `None`, `tint` to white.
/// Lighting-independent.
pub fn create_matcap_material(options: &MatcapMaterialOptions) -> MatcapMaterial {
    let trailer = create_surface_material(matcap_material_kind());
    MatcapMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        matcap: options.matcap.clone(),
        tint: options.tint.unwrap_or(0xffffffff),
    }
}

/// Normal-output pass material. `normal_map` defaults to `None`,
/// `normal_scale` to 1.
pub fn create_normal_material(options: &NormalMaterialOptions) -> NormalMaterial {
    let trailer = create_surface_material(normal_material_kind());
    NormalMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        normal_map: options.normal_map.clone(),
        normal_scale: options.normal_scale.unwrap_or(1.0),
    }
}

/// Cel-shaded material: diffuse N·L quantized through a 1D ramp into stepped
/// bands. `base_color` defaults to white, maps to `None`, `steps` to 3 (the
/// band count used when no ramp is bound).
pub fn create_toon_material(options: &ToonMaterialOptions) -> ToonMaterial {
    let trailer = create_surface_material(toon_material_kind());
    ToonMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        base_color: options.base_color.unwrap_or(0xffffffff),
        base_color_map: options.base_color_map.clone(),
        ramp: options.ramp.clone(),
        steps: options.steps.unwrap_or(3),
    }
}

/// Lighting-independent flat-color material. `base_color` defaults to white,
/// `base_color_map` to `None`. Full fidelity on every backend including
/// Canvas2D.
pub fn create_unlit_material(options: &UnlitMaterialOptions) -> UnlitMaterial {
    let trailer = create_surface_material(unlit_material_kind());
    UnlitMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        base_color: options.base_color.unwrap_or(0xffffffff),
        base_color_map: options.base_color_map.clone(),
    }
}

/// Uses the mesh's `color0` vertex attribute as unlit surface color. `tint`
/// defaults to white.
pub fn create_vertex_color_material(options: &VertexColorMaterialOptions) -> VertexColorMaterial {
    let trailer = create_surface_material(vertex_color_material_kind());
    VertexColorMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        tint: options.tint.unwrap_or(0xffffffff),
    }
}

/// Edge-only debug material. `color` defaults to white, `thickness` to 1
/// pixel. No maps.
pub fn create_wireframe_material(options: &WireframeMaterialOptions) -> WireframeMaterial {
    let trailer = create_surface_material(wireframe_material_kind());
    WireframeMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        color: options.color.unwrap_or(0xffffffff),
        thickness: options.thickness.unwrap_or(1.0),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::Material;

    use super::*;

    // create_depth_material
    #[test]
    fn create_depth_material_applies_defaults() {
        let m = create_depth_material(&DepthMaterialOptions::default());
        assert_eq!(m.kind(), depth_material_kind());
        assert_eq!(m.near, 0.0);
        assert_eq!(m.far, 1.0);
    }

    // create_emissive_material
    #[test]
    fn create_emissive_material_applies_defaults() {
        let m = create_emissive_material(&EmissiveMaterialOptions::default());
        assert_eq!(m.kind(), emissive_material_kind());
        assert_eq!(m.emissive, 0xffffffff);
        assert_eq!(m.emissive_strength, 1.0);
        assert!(m.emissive_map.is_none());
    }

    // create_matcap_material
    #[test]
    fn create_matcap_material_applies_defaults() {
        let m = create_matcap_material(&MatcapMaterialOptions::default());
        assert_eq!(m.kind(), matcap_material_kind());
        assert_eq!(m.tint, 0xffffffff);
        assert!(m.matcap.is_none());
    }

    // create_normal_material
    #[test]
    fn create_normal_material_applies_defaults() {
        let m = create_normal_material(&NormalMaterialOptions::default());
        assert_eq!(m.kind(), normal_material_kind());
        assert_eq!(m.normal_scale, 1.0);
        assert!(m.normal_map.is_none());
    }

    // create_toon_material
    #[test]
    fn create_toon_material_applies_defaults() {
        let m = create_toon_material(&ToonMaterialOptions::default());
        assert_eq!(m.kind(), toon_material_kind());
        assert_eq!(m.base_color, 0xffffffff);
        assert_eq!(m.steps, 3);
        assert!(m.ramp.is_none());
    }

    // create_unlit_material
    #[test]
    fn create_unlit_material_applies_defaults() {
        let m = create_unlit_material(&UnlitMaterialOptions::default());
        assert_eq!(m.kind(), unlit_material_kind());
        assert_eq!(m.base_color, 0xffffffff);
        assert!(m.base_color_map.is_none());
    }

    #[test]
    fn create_unlit_material_carries_provided_values() {
        let m = create_unlit_material(&UnlitMaterialOptions {
            base_color: Some(0x123456ff),
            ..Default::default()
        });
        assert_eq!(m.base_color, 0x123456ff);
    }

    // create_vertex_color_material
    #[test]
    fn create_vertex_color_material_applies_defaults() {
        let m = create_vertex_color_material(&VertexColorMaterialOptions::default());
        assert_eq!(m.kind(), vertex_color_material_kind());
        assert_eq!(m.tint, 0xffffffff);
    }

    // create_wireframe_material
    #[test]
    fn create_wireframe_material_applies_defaults() {
        let m = create_wireframe_material(&WireframeMaterialOptions::default());
        assert_eq!(m.kind(), wireframe_material_kind());
        assert_eq!(m.color, 0xffffffff);
        assert_eq!(m.thickness, 1.0);
    }

    // kind stability / uniqueness
    #[test]
    fn depth_material_kind_is_stable() {
        assert_eq!(depth_material_kind(), depth_material_kind());
    }

    #[test]
    fn emissive_material_kind_is_stable() {
        assert_eq!(emissive_material_kind(), emissive_material_kind());
    }

    #[test]
    fn matcap_material_kind_is_stable() {
        assert_eq!(matcap_material_kind(), matcap_material_kind());
    }

    #[test]
    fn normal_material_kind_is_stable() {
        assert_eq!(normal_material_kind(), normal_material_kind());
    }

    #[test]
    fn toon_material_kind_is_stable() {
        assert_eq!(toon_material_kind(), toon_material_kind());
    }

    #[test]
    fn unlit_material_kind_is_stable() {
        assert_eq!(unlit_material_kind(), unlit_material_kind());
    }

    #[test]
    fn vertex_color_material_kind_is_stable() {
        assert_eq!(vertex_color_material_kind(), vertex_color_material_kind());
    }

    #[test]
    fn wireframe_material_kind_is_stable() {
        assert_eq!(wireframe_material_kind(), wireframe_material_kind());
    }

    #[test]
    fn unlit_family_kinds_are_distinct() {
        let kinds = [
            depth_material_kind(),
            emissive_material_kind(),
            matcap_material_kind(),
            normal_material_kind(),
            toon_material_kind(),
            unlit_material_kind(),
            vertex_color_material_kind(),
            wireframe_material_kind(),
        ];
        for (i, a) in kinds.iter().enumerate() {
            for (j, b) in kinds.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b);
                }
            }
        }
    }
}
