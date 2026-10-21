use crate::support::*;
use flight_entity::{Ref, Unknown};
use flight_materials::{Material3D, create_standard_pbr_material};
use flight_meshgeometry::{MeshMorph, MeshMorphTarget, get_mesh_geometry_vertex_count};
use flight_node::contract::*;
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};

mod clone_mesh {
    use super::*;
    #[test]
    fn shares_rigid_geometry_and_material_entities_but_copies_the_array_and_transform() {
        let geometry = test_geometry();
        let material: Ref<dyn Material3D> =
            Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let materials = Arc::new(RwLock::new(vec![Some(material.clone())]));
        let source = create_mesh(
            geometry.clone(),
            materials.clone(),
            Some("Custom".to_string()),
            Some(&PartialNode {
                enabled: Some(false),
                name: Some("hero".to_string()),
            }),
        );
        {
            let mut s = source.write().unwrap();
            s.position.x = 5.0;
            s.position.y = -2.0;
            s.alpha = 0.25;
            s.visible = false;
        }
        add_node_child(&as_node_ref(&source), &as_node_ref(&test_mesh()));
        let clone = clone_mesh(&source.read().unwrap());
        let c = clone.read().unwrap();
        assert!(Arc::ptr_eq(&c.geometry, &geometry));
        assert!(!Arc::ptr_eq(&c.materials, &materials));
        assert!(Arc::ptr_eq(
            c.materials.read().unwrap()[0].as_ref().unwrap(),
            &material
        ));
        assert_eq!(c.alpha, 0.25);
        assert!(!c.enabled);
        assert_eq!(c.name.as_deref(), Some("hero"));
        assert_eq!(c.kind, "Custom");
        assert!(c.visible);
        assert!(!std::ptr::eq(&c.position, &source.read().unwrap().position));
        drop(c);
        let matrix = get_node_local_matrix4(&as_node_ref(&clone));
        assert_eq!(matrix.m[12], 5.0);
        assert_eq!(matrix.m[13], -2.0);
        assert_eq!(get_node_child_count(&as_node_ref(&clone)), 0);
    }
    #[test]
    fn retains_skin_pose_and_shares_targets_but_detaches_deformed_geometry_and_weights() {
        let source = test_mesh();
        let skin = test_skin();
        source.write().unwrap().skin = Some(skin.clone());
        let c = clone_mesh(&source.read().unwrap());
        assert!(Arc::ptr_eq(c.read().unwrap().skin.as_ref().unwrap(), &skin));
        assert!(!Arc::ptr_eq(
            &c.read().unwrap().geometry,
            &source.read().unwrap().geometry
        ));
        source.write().unwrap().skin = None;
        let morph = test_morph(vec![0.5]);
        source.write().unwrap().morph = Some(morph.clone());
        let c = clone_mesh(&source.read().unwrap());
        let cm = c.read().unwrap().morph.clone().unwrap();
        assert!(!Arc::ptr_eq(&cm, &morph));
        assert!(Arc::ptr_eq(
            &cm.read().unwrap().targets,
            &morph.read().unwrap().targets
        ));
        assert_ne!(
            cm.read().unwrap().weights.as_ptr(),
            morph.read().unwrap().weights.as_ptr()
        );
        assert_eq!(cm.read().unwrap().weights[0], 0.5);
        assert!(!Arc::ptr_eq(
            &c.read().unwrap().geometry,
            &source.read().unwrap().geometry
        ));
    }
    #[test]
    fn restores_base_geometry_when_cloning_an_already_morphed_mesh() {
        let source = test_mesh();
        let geometry = source.read().unwrap().geometry.clone();
        let count = get_mesh_geometry_vertex_count(&geometry.read().unwrap());
        let mut deltas = vec![0.0; count * 3].into_boxed_slice();
        deltas[0] = 5.0;
        source.write().unwrap().morph = Some(Arc::new(RwLock::new(MeshMorph {
            targets: Arc::new(vec![MeshMorphTarget {
                position_deltas: deltas,
                normal_deltas: None,
                tangent_deltas: None,
            }]),
            weights: vec![1.0].into_boxed_slice(),
        })));
        let base = geometry.read().unwrap().vertices[0];
        update_mesh_morph(&source.read().unwrap());
        assert_eq!(geometry.read().unwrap().vertices[0], base + 5.0);
        let clone = clone_mesh(&source.read().unwrap());
        let cg = clone.read().unwrap().geometry.clone();
        assert_eq!(cg.read().unwrap().vertices[0], base);
        let morph = clone.read().unwrap().morph.clone().unwrap();
        assert_eq!(morph.read().unwrap().weights[0], 1.0);
        morph.write().unwrap().weights[0] = 2.0;
        update_mesh_morph(&clone.read().unwrap());
        assert_eq!(cg.read().unwrap().vertices[0], base + 10.0);
        assert_eq!(geometry.read().unwrap().vertices[0], base + 5.0);
    }
}
mod create_mesh {
    use super::*;
    #[test]
    fn keeps_geometry_and_material_array_identity_defaults_and_null_slots() {
        let geometry = test_geometry();
        let materials = Arc::new(RwLock::new(vec![None]));
        let mesh = create_mesh(geometry.clone(), materials.clone(), None, None);
        let m = mesh.read().unwrap();
        assert_eq!(m.kind, MESH_KIND);
        assert!(Arc::ptr_eq(&m.geometry, &geometry));
        assert!(Arc::ptr_eq(&m.materials, &materials));
        assert!(m.materials.read().unwrap()[0].is_none());
        assert!(m.enabled);
        assert!(m.name.is_none());
        drop(m);
        let matrix = get_node_local_matrix4(&as_node_ref(&mesh));
        for i in [0, 5, 10, 15] {
            assert_eq!(matrix.m[i], 1.0);
        }
        let custom = create_mesh(
            test_geometry(),
            empty_materials(),
            Some("MyKind".to_string()),
            Some(&PartialNode {
                enabled: Some(false),
                name: Some("crate".to_string()),
            }),
        );
        assert_eq!(custom.read().unwrap().kind, "MyKind");
        assert!(!custom.read().unwrap().enabled);
        assert_eq!(custom.read().unwrap().name.as_deref(), Some("crate"));
    }
    #[test]
    fn participates_in_the_real_node_hierarchy_and_world_transform() {
        let a = test_mesh();
        let b = test_mesh();
        let ar = as_node_ref(&a);
        let br = as_node_ref(&b);
        add_node_child(&ar, &br);
        a.write().unwrap().position.x = 4.0;
        b.write().unwrap().position.x = 3.0;
        invalidate_node_local_transform(&ar);
        invalidate_node_local_transform(&br);
        assert_eq!(get_node_child_count(&ar), 1);
        close(
            get_node_world_matrix4(&br, &mut revision_state()).m[12],
            7.0,
        );
    }
}
mod enable_mesh_signals {
    use super::*;
    #[test]
    fn creates_complete_node_signals_and_retains_the_same_bag() {
        let m = test_mesh();
        let n = as_node_ref(&m);
        let s = enable_mesh_signals(&n);
        assert!(Arc::ptr_eq(&s, &enable_mesh_signals(&n)));
        assert!(
            s.read()
                .unwrap()
                .on_child_added
                .data
                .read()
                .unwrap()
                .is_none()
        );
        assert!(
            s.read()
                .unwrap()
                .on_parent_changed
                .data
                .read()
                .unwrap()
                .is_none()
        );
    }
}
mod get_mesh_deformer {
    use super::*;
    #[test]
    fn distinguishes_rigid_morph_skeletal_and_composed_outer_skin() {
        let m = test_mesh();
        assert_eq!(get_mesh_deformer(&m.read().unwrap()), MeshDeformer::None);
        m.write().unwrap().morph = Some(test_morph(Vec::new()));
        assert_eq!(get_mesh_deformer(&m.read().unwrap()), MeshDeformer::Morph);
        m.write().unwrap().skin = Some(test_skin());
        assert_eq!(
            get_mesh_deformer(&m.read().unwrap()),
            MeshDeformer::Skeletal
        );
        m.write().unwrap().morph = None;
        assert_eq!(
            get_mesh_deformer(&m.read().unwrap()),
            MeshDeformer::Skeletal
        );
    }
}
mod get_mesh_runtime {
    use super::*;
    #[test]
    fn exposes_actual_mesh_runtime_and_its_inherited_empty_node_tiers() {
        let m = test_mesh();
        let m = m.read().unwrap();
        assert!(get_mesh_runtime(&m).deformed_local_bounds.is_none());
        assert!(m.node_runtime().children.is_none());
        assert!(m.node_runtime().parent.is_none());
        assert!(get_node3d_runtime(&*m).transform3d.world_matrix4.is_none());
        assert!(std::ptr::eq(get_mesh_runtime(&m), get_mesh_runtime(&m)));
    }
}
mod get_mesh_signals {
    use super::*;
    #[test]
    fn returns_null_until_enabled_then_original_runtime_bag() {
        let m = test_mesh();
        assert!(get_mesh_signals(&m.read().unwrap()).is_none());
        let s = enable_mesh_signals(&as_node_ref(&m));
        assert!(Arc::ptr_eq(
            &s,
            &get_mesh_signals(&m.read().unwrap()).unwrap()
        ));
        assert!(Arc::ptr_eq(
            &s,
            m.read()
                .unwrap()
                .node_runtime()
                .node_signals
                .as_ref()
                .unwrap()
        ));
    }
}
mod is_mesh {
    use super::*;
    #[test]
    fn rejects_nullable_primitive_bare_and_missing_geometry_inputs_and_accepts_actual_custom_meshes()
     {
        for value in [
            None,
            Some(Arc::new(()) as flight_entity::UnknownValue),
            Some(Arc::new(42)),
            Some(Arc::new("mesh".to_string())),
            Some(Arc::new(as_node_ref(&node3d()))),
        ] {
            assert!(!is_mesh(&value));
        }
        struct NullableGeometry {
            geometry: Option<Ref<flight_meshgeometry::MeshGeometry>>,
        }
        let absent = NullableGeometry { geometry: None };
        assert!(absent.geometry.is_none());
        let value: Unknown = Some(Arc::new(absent));
        assert!(!is_mesh(&value));
        let value: Unknown = Some(Arc::new(as_node_ref(&test_mesh())));
        assert!(is_mesh(&value));
        let custom = create_mesh(
            test_geometry(),
            empty_materials(),
            Some("Custom".to_string()),
            None,
        );
        assert!(is_mesh(&Some(Arc::new(as_node_ref(&custom)))));
    }
}
