//! The WebGPU 3D scene draw walk — the WGSL mirror of scene-gl's `draw_gl_scene`.
//!
//! Ports `@flighthq/scene-wgpu` `drawWgpuScene.ts`: the app runs
//! [`prepare_scene_render`] first (resolving world matrices, the camera
//! view-projection, frustum culling, and the packed light block into the
//! per-state [`SceneRenderList`]); `draw_wgpu_scene` retrieves that same cached
//! list and, for each visible `Mesh`, draws each geometry subset with the
//! subset's resolved material's registered mesh-material renderer.
//!
//! The draw is two-phased for correct alpha compositing (mirroring the GL
//! sibling):
//!   Pass 1 (opaque): every subset whose material is not alpha-blended, in
//!     scene-graph order. Depth-test + depth-write are baked on the material
//!     renderer's pipeline; no separate blend.
//!   Pass 2 (blended): every alpha-blended subset, sorted back-to-front by the
//!     mesh origin's world-space clip-W (a proxy for view depth).
//!
//! Subsets sharing the same resolved renderer + material are drawn under a single
//! bind (the seam's "contiguous run" contract): bind uploads the shared camera +
//! light + material state once, then each subset issues its own indexed draw. A
//! subset whose material resolves to no renderer is skipped. Depth/cull state is
//! owned by the material renderer's pipeline; the surrounding rgba16float scene
//! render pass + depth attachment is the effect pipeline's, not this walk's. Must
//! run inside an open render pass.
//!
//! TS↔Rust divergences (see the status log for the full rationale):
//!   - Two-pass structure. TS `drawWgpuScene` is single-pass (it binds and draws
//!     in scene order with no opaque/blended split); this Rust port instead
//!     mirrors the committed GL sibling's opaque + blended two-pass partition, so
//!     transparent routing later touches only [`is_blended_material`]. Because
//!     that predicate reports `false` until the material downcast seam lands, the
//!     blended list is always empty today and the observable order matches the TS
//!     single pass.
//!   - Arena signature. TS threads a single `scene` node; the Rust scene graph is
//!     the two-arena slotmap model, and `prepare_scene_render` caches its
//!     `SceneRenderList` in a `RenderStateRuntime` slot keyed by `RenderStateId`
//!     in a `RenderStateStore`. So the walk threads both: the `store` + `state_id`
//!     that own the prepared-scene scratch, and the `WgpuRenderState` +
//!     `WgpuSceneRuntime` the renderers draw through.
//!   - Alias-safe binding. A boxed renderer lives in `WgpuSceneRuntime`, and its
//!     `bind`/`draw` take `&mut WgpuSceneRuntime`; Rust forbids holding a `&dyn`
//!     borrowed from the same runtime the call mutates, so the walk lifts the box
//!     out by its resolved key, invokes, and reinserts it — the "contiguous run"
//!     is the span a single lifted box serves.
//!   - Alias-safe upload. Unlike scene-gl (whose `GlMeshUpload` handles are
//!     `Clone`, so it copies the upload out to release the runtime borrow), a
//!     `WgpuMeshUpload` owns non-`Clone` `wgpu::Buffer`s. So the walk ensures the
//!     upload into the cache, then lifts it out (remove) for the draw and
//!     reinserts it after — the same lift-and-reinsert idiom as the renderer box.
//!   - Material fields. The wgpu renderer `bind` seam already takes the promoted
//!     `Option<&dyn Material>` (not a widened `MeshMaterial`), so the walk passes
//!     the stored material straight through — no `widen_mesh_material` step is
//!     needed here (the GL sibling needs one because its `bind` wants
//!     `&dyn MeshMaterial`). The renderer's own concrete-field downcast is still
//!     pending a header `Any`/downcast seam, so it packs neutral defaults today;
//!     that is internal to the renderer, not this walk.
//!   - `set_matrix3_normal_from_matrix4` is not yet ported to `flighthq-geometry`,
//!     so it is ported locally here (matching the GL sibling) until the geometry
//!     crate promotes it.

use std::cmp::Ordering;
use std::sync::Arc;

use flighthq_geometry::{inverse_matrix3, set_matrix3_from_matrix4};
use flighthq_node::{HierarchyArena, NodeId};
use flighthq_render::{RenderStateId, RenderStateStore, prepare_scene_render};
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_scene::{SceneArena, get_scene_node_world_matrix};
use flighthq_types::camera::Camera;
use flighthq_types::geometry::{Matrix3, Matrix3Like, Matrix4, Matrix4Like};
use flighthq_types::kind::KindId;
use flighthq_types::material::Material;
use flighthq_types::mesh::{MeshGeometry, MeshSubset};
use flighthq_types::scene_render::{SceneLightBlock, SceneLights, SceneRenderProxy};

use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, resolve_wgpu_mesh_material_renderer_key,
};
use crate::wgpu_mesh_upload::ensure_wgpu_mesh_upload;
use crate::wgpu_scene_runtime::WgpuSceneRuntime;

/// Draws a prepared 3D scene on the wgpu backend, drawing each visible mesh
/// subset with its registered mesh-material renderer.
///
/// `store` + `state_id` own the per-state prepared-scene scratch consumed here;
/// `state` + `scene_runtime` are the wgpu render state and scene-wgpu runtime the
/// mesh-material renderers bind and draw through; `scene_arena` + `hierarchy` +
/// `scene_root` are the walkable scene; `camera` + `lights` are the draw-argument
/// view and lighting. Adapts the TS `drawWgpuScene(state, scene, camera, lights)`
/// to the Rust arena + store model (see the module-level divergence notes).
///
/// Records into the render-state's open render pass; the caller opens the scene
/// render target (the effect pipeline's) before this and presents after.
#[allow(clippy::too_many_arguments)]
pub fn draw_wgpu_scene(
    store: &mut RenderStateStore,
    state_id: RenderStateId,
    state: &mut WgpuRenderState,
    scene_runtime: &mut WgpuSceneRuntime,
    scene_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    scene_root: NodeId,
    camera: &Camera,
    lights: &SceneLights,
) {
    // Retrieve the prepared frame. Copy the fields the walk needs out of the
    // returned list so the `store` borrow it holds is released before the draw
    // (the light block and view-projection are read every subset).
    let (visible_meshes, view_projection, light_block) = {
        let list = prepare_scene_render(
            store,
            state_id,
            scene_arena,
            hierarchy,
            scene_root,
            camera,
            lights,
        );
        (
            list.visible_meshes.clone(),
            list.view_projection.m,
            list.lights.clone(),
        )
    };

    // Partition every visible mesh subset into the opaque and blended draw lists.
    // Each entry carries everything the draw step needs so the two passes iterate
    // independently of the arena.
    let mut opaque_draw_list: Vec<SceneDrawEntry> = Vec::new();
    let mut blended_draw_list: Vec<SceneDrawEntry> = Vec::new();

    for node in visible_meshes {
        // Read the mesh payload (geometry + material slots) under a short immutable
        // borrow, then release it before the world-matrix walk mutates the arena's
        // cached world transforms.
        let (geometry, materials) = {
            let mesh = scene_arena[node]
                .mesh
                .as_ref()
                .expect("a visible mesh node carries a mesh payload");
            (Arc::clone(&mesh.geometry), mesh.materials.clone())
        };
        let world_matrix = get_scene_node_world_matrix(scene_arena, hierarchy, node).clone();

        // The mesh origin's clip-space W is a proxy for view depth. Only the W row
        // of clip = viewProjection * worldOrigin is needed; the world translation
        // is the world matrix's column 3 (m[12..15]).
        let m = world_matrix.m;
        let vp = view_projection;
        let clip_w = vp[3] * m[12] + vp[7] * m[13] + vp[11] * m[14] + vp[15];

        // A stable per-geometry identity for the upload cache: the shared `Arc`'s
        // data address. Meshes that share one geometry `Arc` share one upload,
        // matching the TS `WeakMap`-by-geometry-identity cache.
        let geometry_id = Arc::as_ptr(&geometry) as *const () as usize as u64;

        for (subset_index, subset) in geometry.subsets.iter().enumerate() {
            let material = resolve_subset_material(&materials, subset_index);
            let material_kind = material.as_ref().map(|value| value.kind());
            let Some(renderer_key) =
                resolve_wgpu_mesh_material_renderer_key(scene_runtime, material_kind)
            else {
                continue;
            };

            let material_id = material
                .as_ref()
                .map(|value| Arc::as_ptr(value) as *const () as usize);
            let blended = is_blended_material(material.as_deref());
            let entry = SceneDrawEntry {
                clip_w,
                geometry: Arc::clone(&geometry),
                geometry_id,
                material,
                material_id,
                renderer_key,
                subset: *subset,
                world_matrix: world_matrix.clone(),
            };

            if blended {
                blended_draw_list.push(entry);
            } else {
                opaque_draw_list.push(entry);
            }
        }
    }

    // Pass 1: opaque subsets in scene-graph order.
    draw_wgpu_scene_pass(
        state,
        scene_runtime,
        &opaque_draw_list,
        &light_block,
        camera,
    );

    // Pass 2: blended subsets sorted back-to-front (descending clip-W so the
    // farthest layer draws first and nearer layers composite over it). wgpu blend
    // state lives on the material renderer's pipeline (there is no global blend
    // toggle to flip as GL does), so the pass needs no extra state changes here.
    if !blended_draw_list.is_empty() {
        blended_draw_list.sort_by(|a, b| compare_blended_entries_descending(a.clip_w, b.clip_w));
        draw_wgpu_scene_pass(
            state,
            scene_runtime,
            &blended_draw_list,
            &light_block,
            camera,
        );
    }
}

/// Descending clip-W order: the farthest entry (largest W) sorts first so it draws
/// first and nearer layers composite over it. Mirrors the TS
/// `compareBlendedEntriesDescending` comparator (`b.clipW - a.clipW`), with NaN
/// treated as equal to keep the sort total.
fn compare_blended_entries_descending(a_clip_w: f32, b_clip_w: f32) -> Ordering {
    b_clip_w.partial_cmp(&a_clip_w).unwrap_or(Ordering::Equal)
}

/// Draws one partitioned pass: for each entry, rebind only when the resolved
/// renderer key or material identity changes (the contiguous-run contract), then
/// issue the per-subset draw through a reused [`SceneRenderProxy`]. The boxed
/// renderer is lifted out of `scene_runtime`'s registry while it is invoked (its
/// `bind`/`draw` take `&mut WgpuSceneRuntime`) and reinserted when the run ends;
/// each subset's `WgpuMeshUpload` is likewise lifted out of the upload cache for
/// its draw (the buffers are not `Clone`) and reinserted after.
fn draw_wgpu_scene_pass(
    state: &mut WgpuRenderState,
    scene_runtime: &mut WgpuSceneRuntime,
    entries: &[SceneDrawEntry],
    lights: &SceneLightBlock,
    camera: &Camera,
) {
    // `bound_key`/`held` are the currently-lifted renderer; `bound_material_id`
    // wrapped in an outer `Option` so the unbound state (`None`) is distinct from a
    // bound-but-absent material (`Some(None)`), mirroring the TS `undefined` vs
    // `null` seed.
    let mut bound_key: Option<KindId> = None;
    let mut bound_material_id: Option<Option<usize>> = None;
    let mut held: Option<Box<dyn WgpuMeshMaterialRenderer>> = None;
    let mut scratch_normal = Matrix3Like::default();

    for entry in entries {
        let renderer_changed = bound_key != Some(entry.renderer_key);
        if renderer_changed {
            reinsert_renderer(scene_runtime, &mut bound_key, &mut held);
            held = scene_runtime.material_registry.remove(&entry.renderer_key);
            bound_key = Some(entry.renderer_key);
            bound_material_id = None;
        }

        let material_changed = bound_material_id != Some(entry.material_id);
        if renderer_changed || material_changed {
            if let Some(renderer) = held.as_ref() {
                renderer.bind(
                    state,
                    scene_runtime,
                    entry.material.as_deref(),
                    lights,
                    camera,
                );
            }
            bound_material_id = Some(entry.material_id);
        }

        set_matrix3_normal_from_matrix4(
            &mut scratch_normal,
            &Matrix4Like {
                m: entry.world_matrix.m,
            },
        );

        let proxy = SceneRenderProxy {
            normal_matrix: Matrix3 {
                m: scratch_normal.m,
            },
            subset: entry.subset,
            world_matrix: Matrix4 {
                m: entry.world_matrix.m,
            },
        };

        // Ensure the geometry upload exists in the cache, then lift it out so the
        // renderer's `draw` can reborrow `scene_runtime` mutably (the upload's
        // buffers are not `Clone`, so it is removed and reinserted rather than
        // copied out as scene-gl does). A geometry with no indices ensures nothing;
        // skip the subset.
        if ensure_wgpu_mesh_upload(state, scene_runtime, entry.geometry_id, &entry.geometry)
            .is_none()
        {
            continue;
        }
        let Some(upload) = scene_runtime.upload_cache.remove(&entry.geometry_id) else {
            continue;
        };

        if let Some(renderer) = held.as_ref() {
            renderer.draw(state, scene_runtime, &proxy, &upload);
        }

        scene_runtime.upload_cache.insert(entry.geometry_id, upload);
    }

    reinsert_renderer(scene_runtime, &mut bound_key, &mut held);
}

/// Returns true when a material is alpha-blended (routes through the blended
/// pass). All other materials — opaque, mask, and the absent/default material —
/// go through the opaque pass.
///
/// TS↔Rust divergence: TS reads `material.alphaMode === 'blend'` by structurally
/// duck-typing a `SurfaceMaterial`. The header `Material` trait carries no
/// `alpha_mode` accessor and no downcast seam to reach the concrete
/// `SurfaceMaterial` fields, so this cannot read the mode from a stored
/// `dyn Material` and reports `false` for every material — every subset routes
/// through the opaque pass until the header grows a downcast seam. The blended
/// pass stays wired so only this predicate changes when it lands.
fn is_blended_material(_material: Option<&dyn Material>) -> bool {
    false
}

/// Reinserts the currently-lifted renderer box back into the registry under its
/// key, clearing both trackers. A no-op when nothing is lifted.
fn reinsert_renderer(
    scene_runtime: &mut WgpuSceneRuntime,
    bound_key: &mut Option<KindId>,
    held: &mut Option<Box<dyn WgpuMeshMaterialRenderer>>,
) {
    if let (Some(key), Some(renderer)) = (bound_key.take(), held.take()) {
        scene_runtime.material_registry.insert(key, renderer);
    }
}

/// The positional material for a subset: `materials[i]`, or `None` when the slot
/// is absent or past the end of `materials` (the registry then falls back to the
/// default material renderer, or the subset is skipped). Mirrors the TS
/// `resolveSubsetMaterial`.
fn resolve_subset_material(
    materials: &[Option<Arc<dyn Material>>],
    subset_index: usize,
) -> Option<Arc<dyn Material>> {
    materials.get(subset_index).and_then(|slot| slot.clone())
}

/// Writes the normal matrix (inverse-transpose of the world matrix's upper-3×3)
/// into `out`. Normals transform by the inverse-transpose so they stay
/// perpendicular to surfaces under non-uniform scale.
///
/// Ports the TS `setMatrix3NormalFromMatrix4` (upper-3×3 → inverse → transpose).
/// TS↔Rust divergence: `flighthq-geometry` has not yet ported this (nor a
/// `transpose_matrix3`), so it is a local port here (matching the GL sibling)
/// until the geometry crate promotes it. Alias-safe: reads the inverse into a
/// local before writing `out`.
fn set_matrix3_normal_from_matrix4(out: &mut Matrix3Like, source: &Matrix4Like) {
    let mut upper = Matrix3Like::default();
    set_matrix3_from_matrix4(&mut upper, source);
    let mut inverse = Matrix3Like::default();
    inverse_matrix3(&mut inverse, &upper);
    let m = inverse.m;
    out.m = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/// One resolved (mesh subset × material) draw record for a pass. Owns everything
/// the draw step reads so a pass never re-borrows the scene arena: the shared
/// geometry, its upload-cache id, the subset range, the world transform, the
/// resolved renderer registry key, the mesh origin's clip-W (blended sort key),
/// and the material's identity (for the contiguous-run rebind decision; `None`
/// when the slot resolved to the default material).
struct SceneDrawEntry {
    clip_w: f32,
    geometry: Arc<MeshGeometry>,
    geometry_id: u64,
    material: Option<Arc<dyn Material>>,
    material_id: Option<usize>,
    renderer_key: KindId,
    subset: MeshSubset,
    world_matrix: Matrix4,
}

#[cfg(test)]
mod tests {
    use super::*;

    // compare_blended_entries_descending

    #[test]
    fn compare_blended_entries_descending_orders_farther_first() {
        // Larger clip-W (farther) sorts before smaller (nearer).
        assert_eq!(compare_blended_entries_descending(5.0, 1.0), Ordering::Less);
        assert_eq!(
            compare_blended_entries_descending(1.0, 5.0),
            Ordering::Greater
        );
        assert_eq!(
            compare_blended_entries_descending(2.0, 2.0),
            Ordering::Equal
        );
    }

    #[test]
    fn compare_blended_entries_descending_sorts_a_list_back_to_front() {
        let mut order = [1.0f32, 4.0, 2.0, 3.0];
        order.sort_by(|a, b| compare_blended_entries_descending(*a, *b));
        assert_eq!(order, [4.0, 3.0, 2.0, 1.0]);
    }

    #[test]
    fn compare_blended_entries_descending_treats_nan_as_equal() {
        assert_eq!(
            compare_blended_entries_descending(f32::NAN, 1.0),
            Ordering::Equal
        );
    }

    // is_blended_material

    #[test]
    fn is_blended_material_reports_false_until_the_material_downcast_seam_lands() {
        assert!(!is_blended_material(None));
    }

    // resolve_subset_material

    #[test]
    fn resolve_subset_material_returns_none_past_the_material_slots() {
        let materials: Vec<Option<Arc<dyn Material>>> = vec![None];
        assert!(resolve_subset_material(&materials, 0).is_none());
        assert!(resolve_subset_material(&materials, 5).is_none());
    }

    // set_matrix3_normal_from_matrix4

    #[test]
    fn set_matrix3_normal_from_matrix4_of_the_identity_is_the_identity() {
        let mut out = Matrix3Like { m: [0.0; 9] };
        set_matrix3_normal_from_matrix4(&mut out, &Matrix4Like::default());
        assert_eq!(out.m, Matrix3Like::default().m);
    }

    #[test]
    fn set_matrix3_normal_from_matrix4_of_a_pure_rotation_equals_its_upper_3x3() {
        // For an orthonormal (rotation) basis the inverse-transpose equals the
        // matrix itself, so the normal matrix is the upper-3×3 unchanged. Use a
        // 90° rotation about Z, row-major.
        #[rustfmt::skip]
        let rotation = Matrix4Like {
            m: [
                0.0, -1.0, 0.0, 0.0,
                1.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        };
        let mut expected = Matrix3Like::default();
        set_matrix3_from_matrix4(&mut expected, &rotation);
        let mut out = Matrix3Like { m: [0.0; 9] };
        set_matrix3_normal_from_matrix4(&mut out, &rotation);
        for (value, want) in out.m.iter().zip(expected.m.iter()) {
            assert!((value - want).abs() < 1e-5, "{value} not close to {want}");
        }
    }

    #[test]
    fn set_matrix3_normal_from_matrix4_of_a_nonuniform_scale_is_the_reciprocal_scale() {
        // A non-uniform scale (2, 4, 8) has normal matrix diag(1/2, 1/4, 1/8):
        // normals must not stretch with the surface.
        #[rustfmt::skip]
        let scale = Matrix4Like {
            m: [
                2.0, 0.0, 0.0, 0.0,
                0.0, 4.0, 0.0, 0.0,
                0.0, 0.0, 8.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        };
        let mut out = Matrix3Like { m: [0.0; 9] };
        set_matrix3_normal_from_matrix4(&mut out, &scale);
        assert!((out.m[0] - 0.5).abs() < 1e-5);
        assert!((out.m[4] - 0.25).abs() < 1e-5);
        assert!((out.m[8] - 0.125).abs() < 1e-5);
    }
}
