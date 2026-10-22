use flight_entity::Ref;
use flight_materials::{Material, Material3D};
use flight_meshgeometry::{
    PrimitiveTopology, get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_scene3d_formats::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock, Weak};

mod parse_obj_with_material_handlers {
    use super::*;

    #[test]
    fn fan_triangulates_valid_prefixes_and_emits_line_then_point_then_face_siblings_without_hidden_material_defaults()
     {
        let source = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\ng Mixed\nf 1 2 3 4 99\nl 1 2 3\np 4\n";
        let mut diagnostics = Vec::new();
        let document = parse_obj_with_material_handlers(source, None, Some(&mut diagnostics), &[]);
        assert_eq!(document.meshes.len(), 3);
        assert_eq!(
            document
                .nodes
                .iter()
                .map(|node| node.name.as_deref())
                .collect::<Vec<_>>(),
            [Some("Mixed"); 3]
        );
        for (index, topology, indices, vertices) in [
            (0, PrimitiveTopology::LineList, 4, 3),
            (1, PrimitiveTopology::PointList, 1, 1),
            (2, PrimitiveTopology::TriangleList, 6, 4),
        ] {
            let geometry = document.meshes[index].geometry.read().unwrap();
            assert_eq!(geometry.topology, topology);
            assert_eq!(get_mesh_geometry_index_count(&geometry), indices);
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), vertices);
        }
        assert_eq!(document.scenes[0].root_nodes, [0, 1, 2]);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "obj.position-index-out-of-range");
        assert_eq!(diagnostics[0].origin, "parseObj");
    }

    #[test]
    fn uses_only_the_supplied_family_and_keeps_missing_library_guards_even_when_the_family_is_empty()
     {
        let library = parse_obj_material_library("newmtl Red\nKd 1 0 0\n", None);
        let source = "usemtl Red\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
        let empty = parse_obj_with_material_handlers(source, Some(&library), None, &[]);
        assert!(empty.materials.is_empty());
        assert_eq!(empty.meshes.len(), 1);
        assert_eq!(empty.meshes[0].materials, [-1]);
        let full = parse_obj_with_material_handlers(
            source,
            Some(&library),
            None,
            &OBJ_BLINN_PHONG_MATERIAL_FAMILY,
        );
        assert_eq!(full.materials.len(), 1);
        assert_eq!(full.meshes[0].materials, [0]);
        let mut diagnostics = Vec::new();
        parse_obj_with_material_handlers(
            &source.replace("Red", "Missing"),
            Some(&library),
            Some(&mut diagnostics),
            &[],
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "obj.material-missing");
    }

    #[test]
    fn releases_callback_locks_preserves_open_material_identity_and_caches_each_resolved_name_once()
    {
        let retained = Arc::new(RwLock::new(flight_materials::contract::create_material3d(
            "vendor-material".to_string(),
        )));
        let erased: Ref<dyn Material3D> = retained.clone();
        let resolve_count = Arc::new(AtomicUsize::new(0));
        let matches_count = Arc::new(AtomicUsize::new(0));
        let handler: Ref<ObjMaterialHandler> =
            Arc::new_cyclic(|weak: &Weak<RwLock<ObjMaterialHandler>>| {
                let matching_weak = weak.clone();
                let resolving_weak = weak.clone();
                let matches_count = matches_count.clone();
                let resolve_count = resolve_count.clone();
                let erased = erased.clone();
                RwLock::new(ObjMaterialHandler {
                    feature: "vendor-feature".to_string(),
                    matches: Arc::new(move |_| {
                        matches_count.fetch_add(1, Ordering::SeqCst);
                        let handler = matching_weak.upgrade().unwrap();
                        let mut handler = handler
                            .try_write()
                            .expect("matches runs outside the handler read lock");
                        handler.feature = "matched".to_string();
                        true
                    }),
                    resolve: Arc::new(move |_, _, _| {
                        resolve_count.fetch_add(1, Ordering::SeqCst);
                        let handler = resolving_weak.upgrade().unwrap();
                        let mut handler = handler
                            .try_write()
                            .expect("resolve runs outside the handler read lock");
                        assert_eq!(handler.feature, "matched");
                        handler.feature = "resolved".to_string();
                        Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
                            material: erased.clone(),
                        })
                    }),
                })
            });
        let library = parse_obj_material_library("newmtl M\n", None);
        let document = parse_obj_with_material_handlers(
            "v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl M\ng A\nf 1 2 3\ng B\nf 1 2 3",
            Some(&library),
            None,
            &[handler.clone()],
        );
        assert_eq!(matches_count.load(Ordering::SeqCst), 1);
        assert_eq!(resolve_count.load(Ordering::SeqCst), 1);
        assert_eq!(handler.read().unwrap().feature, "resolved");
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.meshes[1].materials, [0]);
        let Scene3DDocumentMaterial::Entity(result) = &document.materials[0] else {
            panic!("original entity");
        };
        assert!(Arc::ptr_eq(&result.material, &erased));
        assert_eq!(
            retained.read().unwrap().material_fields().name.as_deref(),
            Some("M")
        );
        assert_eq!(
            retained.read().unwrap().material_fields().kind,
            "vendor-material"
        );
        retained.write().unwrap().material_fields_mut().name =
            Some("changed-after-parse".to_string());
        assert_eq!(
            result
                .material
                .read()
                .unwrap()
                .material_fields()
                .name
                .as_deref(),
            Some("changed-after-parse")
        );
    }

    #[test]
    fn retains_number_prefix_validation_until_final_float32_writes_and_flips_uvs_before_narrowing()
    {
        let mut diagnostics = Vec::new();
        let source = "v 1.25tail 0 0\nv 1e300 0 0\nv 0 1 0\nvt 0 0.3333333333333333\nf 1suffix/1 2tail/1 -1end/1";
        let document = parse_obj_with_material_handlers(source, None, Some(&mut diagnostics), &[]);
        assert!(diagnostics.is_empty());
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(geometry.vertices[0], 1.25);
        assert_eq!(
            geometry.vertices[CANONICAL_FLOATS_PER_VERTEX],
            f32::INFINITY
        );
        assert_eq!(geometry.vertices[11].to_bits(), 0x3f2aaaab);
        assert_ne!(
            geometry.vertices[11].to_bits(),
            (1.0_f32 - 0.3333333333333333_f32).to_bits()
        );
        for invalid in ["Infinity", "NaN", "1e400"] {
            let mut diagnostics = Vec::new();
            let document = parse_obj_with_material_handlers(
                &format!("v {invalid} 0 0"),
                None,
                Some(&mut diagnostics),
                &[],
            );
            assert!(document.meshes.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "obj.vertex-malformed");
        }
        let mut diagnostics = Vec::new();
        parse_obj_with_material_handlers("v 0 0 0\nf 1e300 1 1", None, Some(&mut diagnostics), &[]);
        // Decimal parseInt reads the leading 1, so this is an in-range reference.
        assert!(diagnostics.is_empty());
        let mut diagnostics = Vec::new();
        parse_obj_with_material_handlers(
            "v 0 0 0\nf 999999999999999999999999999999999999999999999999999999999999999999999999999 1 1",
            None,
            Some(&mut diagnostics),
            &[],
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "obj.position-index-out-of-range");
    }

    #[test]
    fn keeps_literal_space_directives_ecmascript_whitespace_and_large_smoothing_ids_source_exact() {
        let triangle = "v 0 0 0\nv 1 0 0\nv 0 1 0\n";
        let mut diagnostics = Vec::new();
        let document = parse_obj_with_material_handlers(
            &format!("\u{feff}{triangle}\tf\t1 2 3\n"),
            None,
            Some(&mut diagnostics),
            &[],
        );
        assert!(document.meshes.is_empty());
        assert!(diagnostics.is_empty());
        let document = parse_obj_with_material_handlers(
            &format!("{triangle}\u{a0}f 1\t2\u{feff}3\u{a0}"),
            None,
            None,
            &[],
        );
        assert_eq!(
            get_mesh_geometry_index_count(&document.meshes[0].geometry.read().unwrap()),
            3
        );
        for (smoothing, count) in [
            (
                "s 9007199254740992\nf 1 2 3\ns 9007199254740993\nf 1 3 2",
                3,
            ),
            (
                "s 9007199254740992\nf 1 2 3\ns 9007199254740994\nf 1 3 2",
                6,
            ),
            (
                "s 10000000000000000000000000000000000000000000000000000000000000000000000\nf 1 2 3\nf 1 3 2",
                3,
            ),
            ("s nope\nf 1 2 3\nf 1 3 2", 6),
        ] {
            let document = parse_obj_with_material_handlers(
                &format!("{triangle}{smoothing}"),
                None,
                None,
                &[],
            );
            assert_eq!(
                get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
                count
            );
        }
    }
}
