//! The 3D mesh-material renderer registry.
//!
//! Ports `@flighthq/scene-gl` `glMeshMaterialRegistry.ts`. The 3D scene analog of
//! `flighthq-render-gl`'s 2D material registry; reads scene-gl's own per-state
//! registry (`GlSceneRuntime::material_registry`), distinct from the 2D
//! `material_renderers` map.
//!
//! TS↔Rust divergence: the TS functions take `(state: GlRenderState, …)` and
//! fetch the scene runtime off the state. The Rust port threads the
//! `GlSceneRuntime` explicitly (see `gl_scene_runtime` for why). Otherwise the
//! resolve semantics are 1:1 — by material kind, else the `DefaultMaterialKind`
//! renderer, else `None`.
//!
//! TS↔Rust divergence: the TS `resolve` takes the resolved `Material` and reads
//! `material.kind`; the Rust port takes the kind directly (`Option<KindId>`) since
//! `draw_gl_scene` already has the resolved material's kind in hand. The `bind`
//! seam threads the bound material as `Option<&dyn MeshMaterial>` — the promoted
//! `flighthq_types::Material` widened with the local `as_standard_pbr` downcast so
//! the StandardPbr renderer reads the concrete `StandardPbrMaterial` fields.

use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::classic_material::{BlinnPhongMaterial, LambertMaterial, PhongMaterial};
use flighthq_types::kind::KindId;
use flighthq_types::material::{DefaultMaterialKind, Material};
use flighthq_types::pbr_extension_material::{
    AnisotropyPbrMaterial, ClearcoatPbrMaterial, IridescencePbrMaterial, SheenPbrMaterial,
    SpecularGlossinessPbrMaterial, SpecularPbrMaterial, SubsurfacePbrMaterial,
    TransmissionVolumePbrMaterial,
};
use flighthq_types::pbr_material::StandardPbrMaterial;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::{
    DepthMaterial, EmissiveMaterial, MatcapMaterial, NormalMaterial, ToonMaterial, UnlitMaterial,
    VertexColorMaterial, WireframeMaterial,
};

use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// A 3D mesh-material renderer: it binds the shared per-run GPU state for a
/// material (program, camera, lights, material uniforms/textures) and then draws
/// individual mesh subsets under that bind.
///
/// Ports the TS `GlMeshMaterialRenderer` header interface (not yet promoted to the
/// Rust `flighthq-types` header — // TODO(align): promote this trait to
/// `flighthq-types` once the 3D render contract's renderer seam lands there,
/// alongside the 2D `GlMaterialRenderer` analog).
pub trait GlMeshMaterialRenderer: Send + Sync {
    /// Selects the program variant for `material`, uploads the shared camera +
    /// light + material state, and fixes depth/cull state for the run that
    /// follows. `material` is `None` when the subset resolved to the default-kind
    /// fallback with no concrete material.
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    );

    /// Uploads the geometry (lazily, cached by version) and issues the indexed
    /// draw over `proxy.subset`. `upload` is the resolved/created cache slot for
    /// the geometry's GPU buffers.
    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    );
}

/// A material a mesh-material renderer can read. Extends the promoted
/// [`flighthq_types::material::Material`] with a downcast to the concrete
/// [`StandardPbrMaterial`] so the StandardPbr renderer can read its
/// baseColor/metallic/roughness/maps without an `Any` round-trip through the
/// header trait (the header `Material` carries no `Any`). The default returns
/// `None`; only materials whose concrete type the StandardPbr block understands
/// override it.
///
/// TS↔Rust divergence: TS structurally casts `material as StandardPbrMaterial`;
/// Rust uses this explicit narrowing trait (a local trait over the foreign
/// `StandardPbrMaterial`, permitted by the orphan rule).
pub trait MeshMaterial: Material {
    /// The concrete StandardPbr material, or `None` if this material is not a
    /// StandardPbr (or PBR-properties-backed) material.
    fn as_standard_pbr(&self) -> Option<&StandardPbrMaterial> {
        None
    }
    /// The concrete Anisotropy (KHR_materials_anisotropy) material, or `None`.
    fn as_anisotropy_pbr(&self) -> Option<&AnisotropyPbrMaterial> {
        None
    }
    /// The concrete Clearcoat (KHR_materials_clearcoat) material, or `None`.
    fn as_clearcoat_pbr(&self) -> Option<&ClearcoatPbrMaterial> {
        None
    }
    /// The concrete Iridescence (KHR_materials_iridescence) material, or `None`.
    fn as_iridescence_pbr(&self) -> Option<&IridescencePbrMaterial> {
        None
    }
    /// The concrete Sheen (KHR_materials_sheen) material, or `None`.
    fn as_sheen_pbr(&self) -> Option<&SheenPbrMaterial> {
        None
    }
    /// The concrete SpecularGlossiness (legacy pbrSpecularGlossiness) material, or
    /// `None`.
    fn as_specular_glossiness_pbr(&self) -> Option<&SpecularGlossinessPbrMaterial> {
        None
    }
    /// The concrete Specular (KHR_materials_specular) material, or `None`.
    fn as_specular_pbr(&self) -> Option<&SpecularPbrMaterial> {
        None
    }
    /// The concrete Subsurface (Flight extension) material, or `None`.
    fn as_subsurface_pbr(&self) -> Option<&SubsurfacePbrMaterial> {
        None
    }
    /// The concrete TransmissionVolume (KHR_materials_transmission + _volume)
    /// material, or `None`.
    fn as_transmission_volume_pbr(&self) -> Option<&TransmissionVolumePbrMaterial> {
        None
    }
    /// The concrete classic BlinnPhong material, or `None`.
    fn as_blinn_phong(&self) -> Option<&BlinnPhongMaterial> {
        None
    }
    /// The concrete pass-infrastructure Depth material, or `None`.
    fn as_depth(&self) -> Option<&DepthMaterial> {
        None
    }
    /// The concrete Emissive material, or `None`.
    fn as_emissive(&self) -> Option<&EmissiveMaterial> {
        None
    }
    /// The concrete classic Lambert material, or `None`.
    fn as_lambert(&self) -> Option<&LambertMaterial> {
        None
    }
    /// The concrete Matcap (material-capture) material, or `None`.
    fn as_matcap(&self) -> Option<&MatcapMaterial> {
        None
    }
    /// The concrete pass-infrastructure Normal material, or `None`.
    fn as_normal(&self) -> Option<&NormalMaterial> {
        None
    }
    /// The concrete classic Phong material, or `None`.
    fn as_phong(&self) -> Option<&PhongMaterial> {
        None
    }
    /// The concrete Toon (cel-shading) material, or `None`.
    fn as_toon(&self) -> Option<&ToonMaterial> {
        None
    }
    /// The concrete Unlit flat-color material, or `None`.
    fn as_unlit(&self) -> Option<&UnlitMaterial> {
        None
    }
    /// The concrete VertexColor material, or `None`.
    fn as_vertex_color(&self) -> Option<&VertexColorMaterial> {
        None
    }
    /// The concrete Wireframe material, or `None`.
    fn as_wireframe(&self) -> Option<&WireframeMaterial> {
        None
    }
}

impl MeshMaterial for StandardPbrMaterial {
    fn as_standard_pbr(&self) -> Option<&StandardPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for AnisotropyPbrMaterial {
    fn as_anisotropy_pbr(&self) -> Option<&AnisotropyPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for ClearcoatPbrMaterial {
    fn as_clearcoat_pbr(&self) -> Option<&ClearcoatPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for IridescencePbrMaterial {
    fn as_iridescence_pbr(&self) -> Option<&IridescencePbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for SheenPbrMaterial {
    fn as_sheen_pbr(&self) -> Option<&SheenPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for SpecularGlossinessPbrMaterial {
    fn as_specular_glossiness_pbr(&self) -> Option<&SpecularGlossinessPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for SpecularPbrMaterial {
    fn as_specular_pbr(&self) -> Option<&SpecularPbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for SubsurfacePbrMaterial {
    fn as_subsurface_pbr(&self) -> Option<&SubsurfacePbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for TransmissionVolumePbrMaterial {
    fn as_transmission_volume_pbr(&self) -> Option<&TransmissionVolumePbrMaterial> {
        Some(self)
    }
}

impl MeshMaterial for BlinnPhongMaterial {
    fn as_blinn_phong(&self) -> Option<&BlinnPhongMaterial> {
        Some(self)
    }
}

impl MeshMaterial for DepthMaterial {
    fn as_depth(&self) -> Option<&DepthMaterial> {
        Some(self)
    }
}

impl MeshMaterial for EmissiveMaterial {
    fn as_emissive(&self) -> Option<&EmissiveMaterial> {
        Some(self)
    }
}

impl MeshMaterial for LambertMaterial {
    fn as_lambert(&self) -> Option<&LambertMaterial> {
        Some(self)
    }
}

impl MeshMaterial for MatcapMaterial {
    fn as_matcap(&self) -> Option<&MatcapMaterial> {
        Some(self)
    }
}

impl MeshMaterial for NormalMaterial {
    fn as_normal(&self) -> Option<&NormalMaterial> {
        Some(self)
    }
}

impl MeshMaterial for PhongMaterial {
    fn as_phong(&self) -> Option<&PhongMaterial> {
        Some(self)
    }
}

impl MeshMaterial for ToonMaterial {
    fn as_toon(&self) -> Option<&ToonMaterial> {
        Some(self)
    }
}

impl MeshMaterial for UnlitMaterial {
    fn as_unlit(&self) -> Option<&UnlitMaterial> {
        Some(self)
    }
}

impl MeshMaterial for VertexColorMaterial {
    fn as_vertex_color(&self) -> Option<&VertexColorMaterial> {
        Some(self)
    }
}

impl MeshMaterial for WireframeMaterial {
    fn as_wireframe(&self) -> Option<&WireframeMaterial> {
        Some(self)
    }
}

/// Returns the 3D mesh-material renderer registered for a kind on this scene
/// runtime, or `None`.
pub fn get_gl_mesh_material_renderer(
    scene: &GlSceneRuntime,
    kind: KindId,
) -> Option<&dyn GlMeshMaterialRenderer> {
    scene.material_registry.get(&kind).map(|r| r.as_ref())
}

/// Registers a 3D mesh-material renderer against a material kind on this scene
/// runtime. Opt-in: `draw_gl_scene` only draws subsets whose material kind (or
/// `DefaultMaterialKind`) has a renderer here. Insert replaces.
pub fn register_gl_mesh_material_renderer(
    scene: &mut GlSceneRuntime,
    kind: KindId,
    renderer: Box<dyn GlMeshMaterialRenderer>,
) {
    scene.material_registry.insert(kind, renderer);
}

/// Resolves a mesh subset's material to its registered 3D renderer: by the
/// material's kind, else the renderer registered for `DefaultMaterialKind`, else
/// `None`. `draw_gl_scene` skips a subset whose material resolves to `None` (no
/// built-in fallback — every material, including the default, enters only through
/// registration). Mirrors `resolveGlMeshMaterialRenderer` over the 3D registry;
/// takes the resolved material's kind (`None` for an absent material) rather than
/// the material value.
pub fn resolve_gl_mesh_material_renderer(
    scene: &GlSceneRuntime,
    material_kind: Option<KindId>,
) -> Option<&dyn GlMeshMaterialRenderer> {
    if let Some(kind) = material_kind
        && let Some(renderer) = scene.material_registry.get(&kind)
    {
        return Some(renderer.as_ref());
    }
    scene
        .material_registry
        .get(&KindId::of::<DefaultMaterialKind>())
        .map(|r| r.as_ref())
}

/// Resolves a mesh subset's material to the registry KEY that
/// [`resolve_gl_mesh_material_renderer`] would resolve against: the material's own
/// kind when registered, else `DefaultMaterialKind` when registered, else `None`.
///
/// `draw_gl_scene` needs the key (not just the `&dyn` renderer) so it can lift the
/// boxed renderer out of the registry to invoke its `&mut GlSceneRuntime` `bind`/
/// `draw` (the borrow checker forbids holding a `&dyn` borrowed from the same
/// runtime the call mutates — see the take-and-reinsert idiom in the draw walk).
/// The key doubles as the contiguous-run identity: two subsets share one bind iff
/// they resolve to the same key.
pub fn resolve_gl_mesh_material_renderer_key(
    scene: &GlSceneRuntime,
    material_kind: Option<KindId>,
) -> Option<KindId> {
    if let Some(kind) = material_kind
        && scene.material_registry.contains_key(&kind)
    {
        return Some(kind);
    }
    let default = KindId::of::<DefaultMaterialKind>();
    scene
        .material_registry
        .contains_key(&default)
        .then_some(default)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_scene_runtime::create_gl_scene_runtime;
    use flighthq_types::pbr_material::standard_pbr_material_kind;

    // A no-op renderer used to assert registry identity by kind.
    struct TestRenderer;
    impl GlMeshMaterialRenderer for TestRenderer {
        fn bind(
            &self,
            _state: &mut GlRenderState,
            _scene: &mut GlSceneRuntime,
            _material: Option<&dyn MeshMaterial>,
            _lights: &SceneLightBlock,
            _camera: &Camera,
        ) {
        }
        fn draw(
            &self,
            _state: &mut GlRenderState,
            _scene: &mut GlSceneRuntime,
            _proxy: &SceneRenderProxy,
            _upload: &GlMeshUpload,
        ) {
        }
    }

    struct TestKind;

    fn test_kind() -> KindId {
        KindId::of::<TestKind>()
    }

    // MeshMaterial

    #[test]
    fn mesh_material_downcasts_a_standard_pbr_material() {
        let material = StandardPbrMaterial::default();
        let dynamic: &dyn MeshMaterial = &material;
        assert!(dynamic.as_standard_pbr().is_some());
        assert_eq!(dynamic.kind(), standard_pbr_material_kind());
    }

    #[test]
    fn mesh_material_downcasts_a_base_lambert_material() {
        // A base (non-PBR) material resolves through its own accessor and reports
        // `None` for the PBR accessors, so a base renderer reads only its concrete
        // fields.
        let material =
            flighthq_materials::classic_materials::create_lambert_material(&Default::default());
        let dynamic: &dyn MeshMaterial = &material;
        assert!(dynamic.as_lambert().is_some());
        assert!(dynamic.as_standard_pbr().is_none());
    }

    // get_gl_mesh_material_renderer

    #[test]
    fn get_gl_mesh_material_renderer_returns_none_when_nothing_registered() {
        let scene = create_gl_scene_runtime();
        assert!(get_gl_mesh_material_renderer(&scene, test_kind()).is_none());
    }

    // register_gl_mesh_material_renderer

    #[test]
    fn register_gl_mesh_material_renderer_registers_a_renderer_retrievable_by_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(&mut scene, test_kind(), Box::new(TestRenderer));
        assert!(get_gl_mesh_material_renderer(&scene, test_kind()).is_some());
    }

    // resolve_gl_mesh_material_renderer

    #[test]
    fn resolve_gl_mesh_material_renderer_returns_none_without_a_registration() {
        let scene = create_gl_scene_runtime();
        assert!(resolve_gl_mesh_material_renderer(&scene, None).is_none());
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(test_kind())).is_none());
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_resolves_by_the_material_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(&mut scene, test_kind(), Box::new(TestRenderer));
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(test_kind())).is_some());
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_falls_back_to_the_default_material_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(
            &mut scene,
            KindId::of::<DefaultMaterialKind>(),
            Box::new(TestRenderer),
        );
        struct Other;
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(KindId::of::<Other>())).is_some());
        assert!(resolve_gl_mesh_material_renderer(&scene, None).is_some());
    }

    // resolve_gl_mesh_material_renderer_key

    #[test]
    fn resolve_gl_mesh_material_renderer_key_returns_none_without_a_registration() {
        let scene = create_gl_scene_runtime();
        assert!(resolve_gl_mesh_material_renderer_key(&scene, None).is_none());
        assert!(resolve_gl_mesh_material_renderer_key(&scene, Some(test_kind())).is_none());
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_key_returns_the_material_kind_when_registered() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(&mut scene, test_kind(), Box::new(TestRenderer));
        assert_eq!(
            resolve_gl_mesh_material_renderer_key(&scene, Some(test_kind())),
            Some(test_kind())
        );
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_key_falls_back_to_the_default_material_kind() {
        let mut scene = create_gl_scene_runtime();
        let default = KindId::of::<DefaultMaterialKind>();
        register_gl_mesh_material_renderer(&mut scene, default, Box::new(TestRenderer));
        struct Other;
        assert_eq!(
            resolve_gl_mesh_material_renderer_key(&scene, Some(KindId::of::<Other>())),
            Some(default)
        );
        assert_eq!(
            resolve_gl_mesh_material_renderer_key(&scene, None),
            Some(default)
        );
    }
}
