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
use flight_node::{NodeRef, NodeSignals};

pub trait Node3DMethods {
    fn clone_subtree(&self, material_override: Option<Scene3DMaterialOverride>) -> NodeRef;
    fn cull_by_frustum(&self, out: &mut Vec<NodeRef>, frustum: &Frustum);
    fn dispose_scene3d(&self);
    fn enable_billboard_signals(&self) -> Ref<NodeSignals>;
    fn enable_mesh_signals(&self) -> Ref<NodeSignals>;
    fn enable_scene3d_signals(&self) -> Ref<NodeSignals>;
    fn find_material_by_name(&self, name: &str) -> Option<Ref<dyn Material3D>>;
    fn materials(&self, out: &mut Vec<Ref<dyn Material3D>>);
    fn orient_billboards(&self, camera: &Camera3D, state: &Scene3DGuardStateRef) -> bool;
    fn orient_to_camera(&self, camera: &Camera3D, state: &Scene3DGuardStateRef) -> bool;
    fn prepare_morph(&self);
    fn set_alpha(&self, alpha: f32);
    fn set_look_at(&self, eye: &Vector3, target: &Vector3, up: &Vector3);
    fn world_alpha(&self, state: &mut Scene3DAppearanceState) -> f32;
    fn world_bounds(&self, out: &mut Aabb);
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
    fn is_instanced_mesh(&self) -> bool;
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
        let n: Node3DFields = create_node3d(None);
        return crate::publish_node3d(n);
    }
    fn guards() -> Scene3DGuardStateRef {
        return Arc::new(RwLock::new(Scene3DGuardState {
            enabled: false,
            billboard_camera_basis_guard: None,
        }));
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
        assert_eq!(a.world_alpha(&mut sa), get_node3d_world_alpha(&b, &mut sb));
        let ga = geometry();
        let ma = Mesh::new(ga.clone(), materials());
        let mb = create_mesh(ga, materials());
        let ma: NodeRef = ma;
        let mb: NodeRef = mb;
        flight_node::add_node_child(&a, &ma);
        flight_node::add_node_child(&b, &mb);
        let mut ba = bounds();
        let mut bb = bounds();
        a.world_bounds(&mut ba);
        get_node3d_world_bounds(&mut bb, &b);
        assert_eq!(ba, bb);
        let f = create_frustum();
        let mut oa = Vec::new();
        let mut ob = Vec::new();
        a.cull_by_frustum(&mut oa, &f);
        cull_node3d_by_frustum(&mut ob, &b, &f);
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
        let a = InstancedMesh::new(g.clone(), materials(), Some(1));
        let b = create_instanced_mesh(g, materials(), Some(1));
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
        let a = Mesh::new(geometry(), materials());
        let b = create_mesh(geometry(), materials());
        for mesh in [&a, &b] {
            let count = flight_meshgeometry::get_mesh_geometry_vertex_count(
                &mesh.read().unwrap().geometry.read().unwrap(),
            );
            mesh.write().unwrap().morph =
                Some(Arc::new(RwLock::new(flight_meshgeometry::MeshMorph {
                    targets: Arc::new(vec![flight_meshgeometry::MeshMorphTarget {
                        position_deltas: vec![1.0; count as usize * 3].into_boxed_slice(),
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
        let scene = {
            let out = Scene3D::new();
            {
                let mut fields = out.root.write().unwrap();
                fields.node3d_fields_mut().enabled = false;
                fields.node3d_fields_mut().name = Some("root".to_string());
            }
            out
        };
        let free = {
            let out = create_scene3d();
            {
                let mut fields = out.root.write().unwrap();
                fields.node3d_fields_mut().enabled = false;
                fields.node3d_fields_mut().name = Some("root".to_string());
            }
            out
        };
        assert_eq!(
            scene.root.read().unwrap().node_fields().name,
            free.root.read().unwrap().node_fields().name
        );
        assert_eq!(
            scene.root.read().unwrap().node_fields().enabled,
            free.root.read().unwrap().node_fields().enabled
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
        a.disable();
        disable_scene3d_guards(&b);
        assert_eq!(a.are_enabled(), are_scene3d_guards_enabled(&b));
    }
    #[test]
    fn enum_receivers_match_exact_serialized_tables_and_rejection() {
        for value in [
            BillboardMode::AxisY,
            BillboardMode::Full,
            BillboardMode::ScreenAligned,
        ] {
            assert_eq!(value.to_str(), get_billboard_mode_string(value));
            assert_eq!(
                BillboardMode::parse(value.to_str()),
                parse_billboard_mode(value.to_str())
            );
        }
        assert_eq!(BillboardMode::parse("AxisY"), parse_billboard_mode("AxisY"));
        for value in [
            MeshDeformer::Morph,
            MeshDeformer::None,
            MeshDeformer::Skeletal,
        ] {
            assert_eq!(value.to_str(), get_mesh_deformer_string(value));
            assert_eq!(
                MeshDeformer::parse(value.to_str()),
                parse_mesh_deformer(value.to_str())
            );
        }
        assert_eq!(
            MeshDeformer::parse("unknown"),
            parse_mesh_deformer("unknown")
        );
        for value in [
            Scene3DAnimationPath::Rotation,
            Scene3DAnimationPath::Scale,
            Scene3DAnimationPath::Translation,
            Scene3DAnimationPath::Weights,
        ] {
            assert_eq!(value.to_str(), get_scene3d_animation_path_string(value));
            assert_eq!(
                Scene3DAnimationPath::parse(value.to_str()),
                parse_scene3d_animation_path(value.to_str())
            );
        }
        assert_eq!(
            Scene3DAnimationPath::parse("rotation"),
            parse_scene3d_animation_path("rotation")
        );
    }
    #[test]
    fn node_and_billboard_receivers_retain_original_signal_bags_and_oriented_matrices() {
        let a = Node3DFields::new(Some("custom".to_string()));
        let b: Node3DFields = create_node3d(Some("custom".to_string()));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.position, b.position);
        assert_eq!(a.is_node3d(), is_node3d(&b));
        assert!(a.signals().is_none());
        assert!(get_node3d_signals(&b).is_none());
        let a = {
            let out = Billboard::new(geometry(), materials());
            {
                let mut fields = out.write().unwrap();
                fields.mode = BillboardMode::AxisY;
            }
            out
        };
        let b = {
            let out = create_billboard(geometry(), materials());
            {
                let mut fields = out.write().unwrap();
                fields.mode = BillboardMode::AxisY;
            }
            out
        };
        assert_eq!(a.read().unwrap().mode, b.read().unwrap().mode);
        assert_eq!(
            a.read().unwrap().is_billboard(),
            is_billboard(&*b.read().unwrap())
        );
        let an: NodeRef = a.clone();
        let bn: NodeRef = b.clone();
        let sa = an.enable_billboard_signals();
        let sb = enable_billboard_signals(&bn);
        assert!(Arc::ptr_eq(&sa, &a.read().unwrap().signals().unwrap()));
        assert!(Arc::ptr_eq(
            &sb,
            &get_billboard_signals(&b.read().unwrap()).unwrap()
        ));
        let camera = camera();
        assert_eq!(
            an.orient_to_camera(&camera, &guards()),
            orient_billboard_to_camera(&bn, &camera, &guards())
        );
        assert_eq!(get_node_local_matrix4(&an).m, get_node_local_matrix4(&bn).m);
        assert_eq!(
            an.orient_billboards(&camera, &guards()),
            orient_scene3d_billboards_to_camera(&bn, &camera, &guards())
        );
        assert_eq!(get_node_local_matrix4(&an).m, get_node_local_matrix4(&bn).m);
        let ma = Mesh::new(geometry(), materials());
        let mb = create_mesh(geometry(), materials());
        let man: NodeRef = ma.clone();
        let mbn: NodeRef = mb.clone();
        let sa = man.enable_mesh_signals();
        let sb = enable_mesh_signals(&mbn);
        assert!(Arc::ptr_eq(&sa, &ma.read().unwrap().signals().unwrap()));
        assert!(Arc::ptr_eq(
            &sb,
            &get_mesh_signals(&mb.read().unwrap()).unwrap()
        ));
        let bag = InstancedMeshSignals::new();
        let free = create_instanced_mesh_signals();
        assert!(!Arc::ptr_eq(&bag, &free));
        let seen = Arc::new(Mutex::new(Vec::new()));
        for signal in [
            bag.read().unwrap().on_cleared.clone(),
            free.read().unwrap().on_cleared.clone(),
        ] {
            let sink = seen.clone();
            flight_signals::connect_signal(
                &signal,
                Arc::new(move |_| sink.lock().unwrap().push(1)),
                None,
            );
            flight_signals::emit_signal(&signal, &());
        }
        assert_eq!(*seen.lock().unwrap(), vec![1, 1]);
    }
    fn camera() -> Camera3D {
        use flight_camera::contract::*;
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        let projection = create_perspective_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.aspect = 1.0;
            projection.fov_y = 1.0;
        }
        camera.projection = Projection::Perspective(projection);
        return camera;
    }
    #[test]
    fn animation_and_material_receivers_match_sampling_and_original_entity_identity() {
        let a: Node3DRef = Arc::new(RwLock::new(create_node3d::<Node3DFields>(None)));
        let b: Node3DRef = Arc::new(RwLock::new(create_node3d::<Node3DFields>(None)));
        let track = Arc::new(RwLock::new({
            let mut track = flight_animation::create_animation_track();
            track.components = 3;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 2.0, 4.0, 6.0];
            track
        }));
        let make_clip = |node: Node3DRef| {
            flight_animation::create_animation_clip(
                vec![flight_animation::create_animation_channel(
                    &track,
                    Some(Arc::new(Scene3DAnimationTarget {
                        node,
                        path: Scene3DAnimationPath::Translation,
                    })),
                )],
                None,
                &[],
            )
        };
        let ca = make_clip(a.clone());
        let cb = make_clip(b.clone());
        ca.apply_to_scene3d(0.5);
        apply_animation_clip_to_scene3d(&cb, 0.5);
        assert_eq!(
            a.read().unwrap().node3d_fields().position,
            b.read().unwrap().node3d_fields().position
        );
        let mut material = flight_materials::contract::create_standard_pbr_material();
        material.name = Some("shared".to_string());
        let material: Ref<dyn Material3D> = Arc::new(RwLock::new(material));
        let slots = Arc::new(RwLock::new(vec![
            Some(material.clone()),
            Some(material.clone()),
        ]));
        let mesh: NodeRef = Mesh::new(geometry(), slots);
        let mut first = Vec::new();
        let mut second = Vec::new();
        mesh.materials(&mut first);
        get_scene3d_materials(&mut second, &mesh);
        assert_eq!(first.len(), 1);
        assert!(Arc::ptr_eq(&first[0], &second[0]));
        assert!(Arc::ptr_eq(
            &mesh.find_material_by_name("shared").unwrap(),
            &find_scene3d_material_by_name(&mesh, "shared").unwrap()
        ));
        let batch = InstancedMesh::new(geometry(), materials(), None);
        assert_eq!(
            batch.is_instanced_mesh(),
            is_instanced_mesh(&Some(Arc::new(batch.clone() as NodeRef)))
        );
    }
}

impl Node3DMethods for NodeRef {
    fn clone_subtree(&self, material_override: Option<Scene3DMaterialOverride>) -> NodeRef {
        return clone_node3d_subtree(self, material_override);
    }
    fn cull_by_frustum(&self, out: &mut Vec<NodeRef>, frustum: &Frustum) {
        cull_node3d_by_frustum(out, self, frustum);
    }
    fn dispose_scene3d(&self) {
        dispose_node3d(self);
    }
    fn enable_billboard_signals(&self) -> Ref<NodeSignals> {
        return enable_billboard_signals(self);
    }
    fn enable_mesh_signals(&self) -> Ref<NodeSignals> {
        return enable_mesh_signals(self);
    }
    fn enable_scene3d_signals(&self) -> Ref<NodeSignals> {
        return enable_node3d_signals(self);
    }
    fn find_material_by_name(&self, name: &str) -> Option<Ref<dyn Material3D>> {
        return find_scene3d_material_by_name(self, name);
    }
    fn materials(&self, out: &mut Vec<Ref<dyn Material3D>>) {
        get_scene3d_materials(out, self);
    }
    fn orient_billboards(&self, camera: &Camera3D, state: &Scene3DGuardStateRef) -> bool {
        return orient_scene3d_billboards_to_camera(self, camera, state);
    }
    fn orient_to_camera(&self, camera: &Camera3D, state: &Scene3DGuardStateRef) -> bool {
        return orient_billboard_to_camera(self, camera, state);
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
    fn world_bounds(&self, out: &mut Aabb) {
        get_node3d_world_bounds(out, self);
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
    fn is_instanced_mesh(&self) -> bool {
        return is_instanced_mesh(&Some(std::sync::Arc::new(self.clone() as NodeRef)));
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
}
impl Scene3DAnimationMethods for AnimationClip {
    fn apply_to_scene3d(&self, time: f32) {
        apply_animation_clip_to_scene3d(self, time);
    }
}
impl Scene3D {
    pub fn new() -> Self {
        return create_scene3d();
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
    pub fn new(kind: Option<Kind>) -> Self {
        return create_node3d(kind);
    }
    pub fn is_node3d(&self) -> bool {
        return is_node3d(self);
    }
    pub fn signals(&self) -> Option<Ref<NodeSignals>> {
        return get_node3d_signals(self);
    }
}
impl Mesh {
    pub fn new(geometry: Ref<MeshGeometry>, materials: MeshMaterials) -> Ref<Self> {
        return create_mesh(geometry, materials);
    }
    pub fn clone_mesh(&self) -> Ref<Self> {
        return clone_mesh(self);
    }
    pub fn deformer(&self) -> MeshDeformer {
        return get_mesh_deformer(self);
    }
    pub fn signals(&self) -> Option<Ref<NodeSignals>> {
        return get_mesh_signals(self);
    }
    pub fn update_morph(&self) {
        update_mesh_morph(self);
    }
}
impl Billboard {
    pub fn new(geometry: Ref<MeshGeometry>, materials: MeshMaterials) -> Ref<Self> {
        return create_billboard(geometry, materials);
    }
    pub fn is_billboard(&self) -> bool {
        return is_billboard(self);
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
    ) -> Ref<Self> {
        return create_instanced_mesh(geometry, materials, capacity);
    }
}
impl InstancedMeshSignals {
    pub fn new() -> Ref<Self> {
        return create_instanced_mesh_signals();
    }
}

impl BillboardMode {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_billboard_mode(value);
    }
    pub fn to_str(self) -> &'static str {
        return get_billboard_mode_string(self);
    }
}
impl MeshDeformer {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_mesh_deformer(value);
    }
    pub fn to_str(self) -> &'static str {
        return get_mesh_deformer_string(self);
    }
}
impl Scene3DAnimationPath {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_scene3d_animation_path(value);
    }
    pub fn to_str(self) -> &'static str {
        return get_scene3d_animation_path_string(self);
    }
}
