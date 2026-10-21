//! Native receiver conveniences; the free-function contract remains authoritative.
// flight-lint: allow-file(contract-vocabulary) D16 receiver plumbing retains the original open Node and Material EntityRefs
use crate::contract::*;
use flight_animation::AnimationClip;
use flight_camera::Camera3D;
use flight_entity::{Kind, Ref};
use flight_geometry::{Aabb, Frustum, Matrix4, Vector3};
use flight_log::LogStateRef;
use flight_materials::Material3D;
use flight_meshgeometry::MeshGeometry;
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, NodeSignals, PartialNode};

pub trait Node3DMethods {
    fn clone_subtree(&self, material_override: Option<Scene3DMaterialOverride>) -> NodeRef;
    fn cull_by_frustum(
        &self,
        out: &mut Vec<NodeRef>,
        frustum: &Frustum,
        revisions: &mut NodeRevisionState,
    );
    fn dispose_scene3d(&self);
    fn enable_scene3d_signals(&self) -> Ref<NodeSignals>;
    fn ensure_world_alpha(&self, state: &mut Scene3DAppearanceState);
    fn find_material_by_name(&self, name: &str) -> Option<Ref<dyn Material3D>>;
    fn materials(&self, out: &mut Vec<Ref<dyn Material3D>>);
    fn orient_billboards(
        &self,
        camera: &Camera3D,
        state: &Scene3DGuardStateRef,
        revisions: &mut NodeRevisionState,
    ) -> bool;
    fn orient_to_camera(
        &self,
        camera: &Camera3D,
        state: &Scene3DGuardStateRef,
        revisions: &mut NodeRevisionState,
    ) -> bool;
    fn prepare_morph(&self);
    fn set_alpha(&self, alpha: f32);
    fn set_look_at(&self, eye: &Vector3, target: &Vector3, up: &Vector3);
    fn world_alpha(&self, state: &mut Scene3DAppearanceState) -> f32;
    fn world_bounds(&self, out: &mut Aabb, revisions: &mut NodeRevisionState);
}
pub trait InstancedMeshMethods {
    fn append_instance(&self, matrix: &Matrix4) -> i32;
    fn capacity(&self) -> usize;
    fn clear_instances(&self);
    fn clone_instances(&self) -> Ref<InstancedMesh>;
    fn enable_instance_signals(&self) -> Ref<InstancedMeshSignals>;
    fn instance_color(&self, index: i32) -> f64;
    fn instance_matrix(&self, out: &mut Matrix4, index: i32) -> bool;
    fn instance_signals(&self) -> Option<Ref<InstancedMeshSignals>>;
    fn invalidate_instances(&self);
    fn iterate_instances(&self, visitor: InstancedMeshVisitor);
    fn local_bounds(&self, out: &mut Aabb);
    fn remove_instance(&self, index: i32);
    fn reserve_instances(&self, capacity: i32);
    fn set_instance_color(&self, index: i32, color: u32);
    fn set_instance_count(&self, count: i32);
    fn set_instance_matrix(&self, index: i32, matrix: &Matrix4);
    fn set_instance_matrix_range(
        &self,
        start_index: i32,
        count: i32,
        source: &flight_entity::Float32Array,
    );
}
pub trait Scene3DGuardMethods {
    fn are_enabled(&self) -> bool;
    fn disable(&self);
    fn enable(&self, log: &LogStateRef, clock: Scene3DGuardClock);
    fn set_camera_basis_guard(&self, guard: Option<BillboardCameraBasisGuard>);
}
pub trait Scene3DAnimationMethods {
    fn apply_to_scene3d(&self, time: f32);
}

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_geometry::{create_aabb, create_frustum, create_matrix4, create_vector3};
    use flight_meshgeometry::create_box_mesh_geometry;
    use flight_node::contract::{get_node_child_count, get_node_local_matrix4, get_node_runtime};
    use std::sync::{Arc, Mutex, RwLock};

    fn geometry() -> Ref<MeshGeometry> {
        return Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None)));
    }
    fn materials() -> MeshMaterials {
        return Arc::new(RwLock::new(Vec::new()));
    }
    fn node() -> NodeRef {
        let n: Node3DFields = create_node3d(None, None);
        return Arc::new(RwLock::new(n));
    }
    fn guards() -> Scene3DGuardStateRef {
        return Arc::new(RwLock::new(Scene3DGuardState {
            enabled: false,
            billboard_camera_basis_guard: None,
        }));
    }
    fn revisions() -> NodeRevisionState {
        return NodeRevisionState {
            world_transform_revision: 0,
        };
    }
    fn bounds() -> Aabb {
        return create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    }
    fn equal_instances(a: &Ref<InstancedMesh>, b: &Ref<InstancedMesh>) {
        let a = a.read().unwrap();
        let b = b.read().unwrap();
        assert_eq!(a.instance_count, b.instance_count);
        assert_eq!(a.version, b.version);
        assert_eq!(a.instance_colors, b.instance_colors);
        assert_eq!(a.instance_matrices.len(), b.instance_matrices.len());
        for (a, b) in a.instance_matrices.iter().zip(&b.instance_matrices) {
            assert_eq!(a.read().unwrap().m, b.read().unwrap().m);
        }
    }
    #[test]
    fn node_receivers_match_free_matrix_appearance_bounds_culling_and_disposal_operations() {
        let a = node();
        let b = node();
        let eye = create_vector3(3.0, 4.0, 5.0);
        let target = create_vector3(0.0, 0.0, 0.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        a.set_look_at(&eye, &target, &up);
        set_node3d_look_at(&b, &eye, &target, &up);
        assert_eq!(get_node_local_matrix4(&a).m, get_node_local_matrix4(&b).m);
        let mut sa = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        let mut sb = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        a.set_alpha(0.4);
        set_node3d_alpha(&b, 0.4);
        a.ensure_world_alpha(&mut sa);
        ensure_node3d_world_alpha(&b, &mut sb);
        assert_eq!(a.world_alpha(&mut sa), get_node3d_world_alpha(&b, &mut sb));
        let ga = geometry();
        let ma = Mesh::new(ga.clone(), materials(), None, None);
        let mb = create_mesh(ga, materials(), None, None);
        let ma: NodeRef = ma;
        let mb: NodeRef = mb;
        flight_node::add_node_child(&a, &ma);
        flight_node::add_node_child(&b, &mb);
        let mut ba = bounds();
        let mut bb = bounds();
        let mut ra = revisions();
        let mut rb = revisions();
        a.world_bounds(&mut ba, &mut ra);
        get_node3d_world_bounds(&mut bb, &b, &mut rb);
        assert_eq!(ba, bb);
        let f = create_frustum();
        let mut oa = Vec::new();
        let mut ob = Vec::new();
        a.cull_by_frustum(&mut oa, &f, &mut ra);
        cull_node3d_by_frustum(&mut ob, &b, &f, &mut rb);
        assert_eq!(oa.len(), ob.len());
        a.prepare_morph();
        prepare_scene3d_morph(&b);
        let signals = a.enable_scene3d_signals();
        let free = enable_node3d_signals(&a);
        assert!(Arc::ptr_eq(&signals, &free));
        let cloned = a.clone_subtree(None);
        let free = clone_node3d_subtree(&a, None);
        assert_eq!(get_node_child_count(&cloned), get_node_child_count(&free));
        a.dispose_scene3d();
        dispose_node3d(&b);
        assert_eq!(get_node_child_count(&a), get_node_child_count(&b));
        assert!(get_node_runtime(&*a.read().unwrap()).node_signals.is_none());
    }
    #[test]
    fn instancing_receivers_match_free_payload_versions_bounds_and_callbacks() {
        let g = geometry();
        let a = InstancedMesh::new(g.clone(), materials(), Some(1), None);
        let b = create_instanced_mesh(g, materials(), Some(1), None);
        let mut m = create_matrix4();
        m.m[12] = 3.0;
        assert_eq!(
            a.append_instance(&m),
            append_instanced_mesh_instance(&b, &m)
        );
        equal_instances(&a, &b);
        a.reserve_instances(5);
        reserve_instanced_mesh(&b, 5);
        a.set_instance_count(3);
        set_instanced_mesh_instance_count(&b, 3);
        a.set_instance_color(0, 0x11223344);
        set_instanced_mesh_instance_color(&b, 0, 0x11223344);
        a.set_instance_matrix(1, &m);
        set_instanced_mesh_instance_matrix(&b, 1, &m);
        a.set_instance_matrix_range(2, 1, &m.m);
        set_instanced_mesh_instance_matrix_range(&b, 2, 1, &m.m);
        a.invalidate_instances();
        invalidate_instanced_mesh(&b);
        equal_instances(&a, &b);
        assert_eq!(
            a.capacity(),
            get_instanced_mesh_capacity(&b.read().unwrap())
        );
        assert_eq!(
            a.instance_color(0),
            get_instanced_mesh_instance_color(&b.read().unwrap(), 0)
        );
        let mut outa = create_matrix4();
        let mut outb = create_matrix4();
        assert_eq!(
            a.instance_matrix(&mut outa, 1),
            get_instanced_mesh_instance_matrix(&mut outb, &b.read().unwrap(), 1)
        );
        assert_eq!(outa.m, outb.m);
        let sa = a.enable_instance_signals();
        let sb = enable_instanced_mesh_signals(&b);
        assert!(Arc::ptr_eq(&sa, &a.instance_signals().unwrap()));
        assert!(Arc::ptr_eq(
            &sb,
            &get_instanced_mesh_signals(&b.read().unwrap()).unwrap()
        ));
        let va = Arc::new(Mutex::new(Vec::new()));
        let vb = Arc::new(Mutex::new(Vec::new()));
        let sink = va.clone();
        a.iterate_instances(Arc::new(move |i, m| {
            sink.lock().unwrap().push((i, m.read().unwrap().m))
        }));
        let sink = vb.clone();
        iterate_instanced_mesh_instances(
            &b,
            Arc::new(move |i, m| sink.lock().unwrap().push((i, m.read().unwrap().m))),
        );
        assert_eq!(*va.lock().unwrap(), *vb.lock().unwrap());
        let mut ba = bounds();
        let mut bb = bounds();
        a.local_bounds(&mut ba);
        compute_instanced_mesh_local_bounds_aabb(&mut bb, &b.read().unwrap());
        assert_eq!(ba, bb);
        equal_instances(
            &a.clone_instances(),
            &clone_instanced_mesh(&b.read().unwrap()),
        );
        a.remove_instance(0);
        remove_instanced_mesh_instance(&b, 0);
        equal_instances(&a, &b);
        a.clear_instances();
        clear_instanced_mesh(&b);
        equal_instances(&a, &b);
    }
    #[test]
    fn mesh_morph_receiver_and_clone_match_actual_deformation_and_independent_weights() {
        let a = Mesh::new(geometry(), materials(), None, None);
        let b = create_mesh(geometry(), materials(), None, None);
        for mesh in [&a, &b] {
            let count = flight_meshgeometry::get_mesh_geometry_vertex_count(
                &mesh.read().unwrap().geometry.read().unwrap(),
            );
            mesh.write().unwrap().morph =
                Some(Arc::new(RwLock::new(flight_meshgeometry::MeshMorph {
                    targets: Arc::new(vec![flight_meshgeometry::MeshMorphTarget {
                        position_deltas: vec![1.0; count * 3].into_boxed_slice(),
                        normal_deltas: None,
                        tangent_deltas: None,
                    }]),
                    weights: vec![0.5].into_boxed_slice(),
                })));
        }
        a.read().unwrap().update_morph();
        update_mesh_morph(&b.read().unwrap());
        assert_eq!(
            a.read().unwrap().geometry.read().unwrap().vertices,
            b.read().unwrap().geometry.read().unwrap().vertices
        );
        assert_eq!(
            a.read().unwrap().deformer(),
            get_mesh_deformer(&b.read().unwrap())
        );
        assert_eq!(
            a.read().unwrap().runtime().deformed_local_bounds,
            b.read().unwrap().runtime().deformed_local_bounds
        );
        let c = a.read().unwrap().clone_mesh();
        let d = clone_mesh(&b.read().unwrap());
        assert_eq!(
            c.read().unwrap().geometry.read().unwrap().vertices,
            d.read().unwrap().geometry.read().unwrap().vertices
        );
        assert!(!Arc::ptr_eq(
            &a.read().unwrap().geometry,
            &c.read().unwrap().geometry
        ));
    }
    #[test]
    fn scene_document_and_kind_usage_receivers_match_free_assembly_and_reset() {
        let mut scene = Scene3D::new(Some(&PartialNode {
            enabled: Some(false),
            name: Some("root".to_string()),
        }));
        let free = create_scene3d(Some(&PartialNode {
            enabled: Some(false),
            name: Some("root".to_string()),
        }));
        assert_eq!(
            scene.root.read().unwrap().name,
            free.root.read().unwrap().name
        );
        assert_eq!(
            scene.root.read().unwrap().enabled,
            free.root.read().unwrap().enabled
        );
        scene.initialize(None);
        assert_eq!(
            scene.root.read().unwrap().enabled,
            create_scene3d(None).root.read().unwrap().enabled
        );
        let doc = Scene3DDocument {
            animations: Vec::new(),
            cameras: Vec::new(),
            lights: Vec::new(),
            materials: Vec::new(),
            meshes: Vec::new(),
            metadata: None,
            nodes: Vec::new(),
            resources: Vec::new(),
            scenes: Vec::new(),
            skins: Vec::new(),
        };
        let a = doc.build(None);
        let b = create_scene3d_from_document(&doc, None);
        assert_eq!(
            get_node_child_count(&(a.root.clone() as NodeRef)),
            get_node_child_count(&(b.root.clone() as NodeRef))
        );
        assert_eq!(
            doc.build_all().len(),
            create_scene3ds_from_document(&doc).len()
        );
        assert_eq!(
            doc.light_snapshot().point.len(),
            create_scene3d_lights_from_document(&doc).point.len()
        );
        let mut a = Scene3DKindUsage::new();
        let mut b = create_scene3d_kind_usage();
        a.populate(&scene);
        get_scene3d_kind_usage(&mut b, &scene);
        assert_eq!(a.node_kinds, b.node_kinds);
        assert_eq!(a.material_kinds, b.material_kinds);
        assert_eq!(a.modifier_kinds, b.modifier_kinds);
        assert_eq!(a.resource_mime_types, b.resource_mime_types);
        assert_eq!(a.texture_source_kinds, b.texture_source_kinds);
    }
    #[test]
    fn guard_receivers_match_free_enabled_flags_and_callback_hooks() {
        let a = guards();
        let b = guards();
        let log = Arc::new(RwLock::new(flight_log::create_log_state()));
        a.enable(&log, Arc::new(|| 0.0));
        enable_scene3d_guards(&b, &log, Arc::new(|| 0.0));
        assert_eq!(a.are_enabled(), are_scene3d_guards_enabled(&b));
        a.set_camera_basis_guard(None);
        set_billboard_camera_basis_guard(&b, None);
        assert!(a.read().unwrap().billboard_camera_basis_guard.is_none());
        assert!(b.read().unwrap().billboard_camera_basis_guard.is_none());
        a.disable();
        disable_scene3d_guards(&b);
        assert_eq!(a.are_enabled(), are_scene3d_guards_enabled(&b));
    }
}

impl Node3DMethods for NodeRef {
    fn clone_subtree(&self, material_override: Option<Scene3DMaterialOverride>) -> NodeRef {
        return clone_node3d_subtree(self, material_override);
    }
    fn cull_by_frustum(
        &self,
        out: &mut Vec<NodeRef>,
        frustum: &Frustum,
        revisions: &mut NodeRevisionState,
    ) {
        cull_node3d_by_frustum(out, self, frustum, revisions);
    }
    fn dispose_scene3d(&self) {
        dispose_node3d(self);
    }
    fn enable_scene3d_signals(&self) -> Ref<NodeSignals> {
        return enable_node3d_signals(self);
    }
    fn ensure_world_alpha(&self, state: &mut Scene3DAppearanceState) {
        ensure_node3d_world_alpha(self, state);
    }
    fn find_material_by_name(&self, name: &str) -> Option<Ref<dyn Material3D>> {
        return find_scene3d_material_by_name(self, name);
    }
    fn materials(&self, out: &mut Vec<Ref<dyn Material3D>>) {
        get_scene3d_materials(out, self);
    }
    fn orient_billboards(
        &self,
        camera: &Camera3D,
        state: &Scene3DGuardStateRef,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return orient_scene3d_billboards_to_camera(self, camera, state, revisions);
    }
    fn orient_to_camera(
        &self,
        camera: &Camera3D,
        state: &Scene3DGuardStateRef,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return orient_billboard_to_camera(self, camera, state, revisions);
    }
    fn prepare_morph(&self) {
        prepare_scene3d_morph(self);
    }
    fn set_alpha(&self, alpha: f32) {
        set_node3d_alpha(self, alpha);
    }
    fn set_look_at(&self, eye: &Vector3, target: &Vector3, up: &Vector3) {
        set_node3d_look_at(self, eye, target, up);
    }
    fn world_alpha(&self, state: &mut Scene3DAppearanceState) -> f32 {
        return get_node3d_world_alpha(self, state);
    }
    fn world_bounds(&self, out: &mut Aabb, revisions: &mut NodeRevisionState) {
        get_node3d_world_bounds(out, self, revisions);
    }
}
impl InstancedMeshMethods for Ref<InstancedMesh> {
    fn append_instance(&self, matrix: &Matrix4) -> i32 {
        return append_instanced_mesh_instance(self, matrix);
    }
    fn capacity(&self) -> usize {
        return get_instanced_mesh_capacity(&self.read().unwrap());
    }
    fn clear_instances(&self) {
        clear_instanced_mesh(self);
    }
    fn clone_instances(&self) -> Ref<InstancedMesh> {
        return clone_instanced_mesh(&self.read().unwrap());
    }
    fn enable_instance_signals(&self) -> Ref<InstancedMeshSignals> {
        return enable_instanced_mesh_signals(self);
    }
    // flight-lint: allow(f64) D1 exact packed 32-bit colors and the distinct negative sentinel use the free contract number representation
    fn instance_color(&self, index: i32) -> f64 {
        return get_instanced_mesh_instance_color(&self.read().unwrap(), index);
    }
    fn instance_matrix(&self, out: &mut Matrix4, index: i32) -> bool {
        return get_instanced_mesh_instance_matrix(out, &self.read().unwrap(), index);
    }
    fn instance_signals(&self) -> Option<Ref<InstancedMeshSignals>> {
        return get_instanced_mesh_signals(&self.read().unwrap());
    }
    fn invalidate_instances(&self) {
        invalidate_instanced_mesh(self);
    }
    fn iterate_instances(&self, visitor: InstancedMeshVisitor) {
        iterate_instanced_mesh_instances(self, visitor);
    }
    fn local_bounds(&self, out: &mut Aabb) {
        compute_instanced_mesh_local_bounds_aabb(out, &self.read().unwrap());
    }
    fn remove_instance(&self, index: i32) {
        remove_instanced_mesh_instance(self, index);
    }
    fn reserve_instances(&self, capacity: i32) {
        reserve_instanced_mesh(self, capacity);
    }
    fn set_instance_color(&self, index: i32, color: u32) {
        set_instanced_mesh_instance_color(self, index, color);
    }
    fn set_instance_count(&self, count: i32) {
        set_instanced_mesh_instance_count(self, count);
    }
    fn set_instance_matrix(&self, index: i32, matrix: &Matrix4) {
        set_instanced_mesh_instance_matrix(self, index, matrix);
    }
    fn set_instance_matrix_range(
        &self,
        start_index: i32,
        count: i32,
        source: &flight_entity::Float32Array,
    ) {
        set_instanced_mesh_instance_matrix_range(self, start_index, count, source);
    }
}
impl Scene3DGuardMethods for Scene3DGuardStateRef {
    fn are_enabled(&self) -> bool {
        return are_scene3d_guards_enabled(self);
    }
    fn disable(&self) {
        disable_scene3d_guards(self);
    }
    fn enable(&self, log: &LogStateRef, clock: Scene3DGuardClock) {
        enable_scene3d_guards(self, log, clock);
    }
    fn set_camera_basis_guard(&self, guard: Option<BillboardCameraBasisGuard>) {
        set_billboard_camera_basis_guard(self, guard);
    }
}
impl Scene3DAnimationMethods for AnimationClip {
    fn apply_to_scene3d(&self, time: f32) {
        apply_animation_clip_to_scene3d(self, time);
    }
}
impl Scene3D {
    pub fn new(obj: Option<&PartialNode>) -> Self {
        return create_scene3d(obj);
    }
    pub fn initialize(&mut self, obj: Option<&PartialNode>) {
        initialize_scene3d(self, obj);
    }
}
impl Scene3DDocument {
    pub fn build(&self, scene_index: Option<i32>) -> Scene3D {
        return create_scene3d_from_document(self, scene_index);
    }
    pub fn build_all(&self) -> Vec<Scene3D> {
        return create_scene3ds_from_document(self);
    }
    pub fn light_snapshot(&self) -> flight_lighting::Scene3DLights {
        return create_scene3d_lights_from_document(self);
    }
}
impl Scene3DKindUsage {
    pub fn populate(&mut self, scene: &Scene3D) {
        get_scene3d_kind_usage(self, scene);
    }
}
impl Node3DFields {
    pub fn new(kind: Option<Kind>, obj: Option<&PartialNode3D>) -> Self {
        return create_node3d(kind, obj);
    }
    pub fn is_node3d(&self) -> bool {
        return is_node3d(self);
    }
    pub fn runtime(&self) -> &Node3DRuntime {
        return get_node3d_runtime(self);
    }
    pub fn signals(&self) -> Option<Ref<NodeSignals>> {
        return get_node3d_signals(self);
    }
}
impl Mesh {
    pub fn new(
        geometry: Ref<MeshGeometry>,
        materials: MeshMaterials,
        kind: Option<Kind>,
        obj: Option<&PartialNode>,
    ) -> Ref<Self> {
        return create_mesh(geometry, materials, kind, obj);
    }
    pub fn clone_mesh(&self) -> Ref<Self> {
        return clone_mesh(self);
    }
    pub fn deformer(&self) -> MeshDeformer {
        return get_mesh_deformer(self);
    }
    pub fn runtime(&self) -> &MeshRuntime {
        return get_mesh_runtime(self);
    }
    pub fn signals(&self) -> Option<Ref<NodeSignals>> {
        return get_mesh_signals(self);
    }
    pub fn update_morph(&self) {
        update_mesh_morph(self);
    }
}
impl Billboard {
    pub fn new(
        geometry: Ref<MeshGeometry>,
        materials: MeshMaterials,
        mode: Option<BillboardMode>,
        kind: Option<Kind>,
        obj: Option<&PartialNode>,
    ) -> Ref<Self> {
        return create_billboard(geometry, materials, mode, kind, obj);
    }
    pub fn is_billboard(&self) -> bool {
        return is_billboard(self);
    }
    pub fn runtime(&self) -> &BillboardRuntime {
        return get_billboard_runtime(self);
    }
    pub fn signals(&self) -> Option<Ref<NodeSignals>> {
        return get_billboard_signals(self);
    }
}
impl InstancedMesh {
    pub fn new(
        geometry: Ref<MeshGeometry>,
        materials: MeshMaterials,
        capacity: Option<usize>,
        kind: Option<Kind>,
    ) -> Ref<Self> {
        return create_instanced_mesh(geometry, materials, capacity, kind);
    }
}
impl InstancedMeshSignals {
    pub fn new() -> Ref<Self> {
        return create_instanced_mesh_signals();
    }
    pub fn initialize(&mut self) {
        initialize_instanced_mesh_signals(self);
    }
}
