use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{IndexBuffer, PrimitiveTopology, get_mesh_geometry_vertex_count};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

fn geometry_xml(primitive: &str, extra: &str) -> String {
    return format!(
        "<COLLADA><library_geometries><geometry id=\"g\" name=\"Geo\"><mesh><source id=\"p\"><float_array>0 0 0 1 0 0 0 1 0 1 1 0</float_array></source><vertices id=\"v\"><input semantic=\"POSITION\" source=\"#p\"/></vertices>{extra}{primitive}</mesh></geometry></library_geometries></COLLADA>"
    );
}

fn parse(xml: &str) -> (ColladaParseResult, Ref<ColladaParseContext>) {
    let saved = Arc::new(RwLock::new(None::<Ref<ColladaParseContext>>));
    let observed = saved.clone();
    let observer = Arc::new(RwLock::new(ColladaElementDecoder {
        elements: vec![],
        features: vec![],
        build: None,
        build_phase: None,
        decode: Arc::new(move |context| {
            *observed.write().unwrap() = Some(context.clone());
        }),
    }));
    let result =
        parse_collada_with_decoders(xml, &[COLLADA_GEOMETRY_DECODER.clone(), observer], None);
    let context = saved.read().unwrap().as_ref().unwrap().clone();
    return (result, context);
}

mod collada_geometry_decoder {
    use super::*;

    #[test]
    fn claims_only_geometry_and_decodes_a_real_indexed_canonical_mesh_into_the_original_document_and_maps()
     {
        let decoder = COLLADA_GEOMETRY_DECODER.read().unwrap();
        assert_eq!(decoder.elements, ["geometry"]);
        assert_eq!(decoder.features, ["Geometry"]);
        assert!(decoder.build.is_none());
        assert!(decoder.build_phase.is_none());
        drop(decoder);
        let (result, context) = parse(&geometry_xml(
            "<triangles material=\"mat\"><input semantic=\"VERTEX\" source=\"#v\" offset=\"0\"/><p>0 1 2</p></triangles>",
            "",
        ));
        assert!(result.diagnostics.read().unwrap().is_empty());
        let context = context.read().unwrap();
        assert!(Arc::ptr_eq(&context.document, &result.document));
        assert!(context.document.try_write().is_ok());
        assert!(context.geometry_id_to_mesh_index.try_write().is_ok());
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        let mesh = &document.meshes[0];
        assert_eq!(mesh.name.as_deref(), Some("Geo"));
        assert!(mesh.materials.is_empty());
        let geometry = mesh.geometry.read().unwrap();
        assert!(Arc::ptr_eq(&geometry.layout, &CANONICAL_LAYOUT));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
        let IndexBuffer::U32(indices) = &geometry.indices else {
            panic!("source Uint32Array");
        };
        assert_eq!(&**indices.data.read().unwrap(), &[0, 1, 2]);
        assert_eq!(geometry.subsets[0].index_offset, 0);
        assert_eq!(geometry.subsets[0].index_count, 3);
        for (vertex, position) in geometry.vertices.chunks_exact(12).zip([
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ]) {
            assert_eq!(&vertex[..3], &position);
            assert_eq!(
                &vertex[3..12],
                &[0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0]
            );
        }
        assert_eq!(
            context.geometry_id_to_mesh_index.read().unwrap()[0].key,
            "g"
        );
        assert_eq!(
            context.geometry_id_to_mesh_index.read().unwrap()[0].value,
            0
        );
        assert_eq!(
            *context.geometry_primitive_symbols.read().unwrap()[0]
                .value
                .read()
                .unwrap(),
            ["mat"]
        );
        assert_eq!(
            context.geometry_positions.read().unwrap()[0]
                .value
                .read()
                .unwrap()
                .len(),
            12
        );
    }

    #[test]
    fn fans_polylists_keeps_authored_normal_and_uv_offsets_and_switches_the_full_geometry_to_line_topology_when_lines_are_present()
     {
        let extra = "<source id=\"n\"><float_array>0 0 1</float_array></source><source id=\"u\"><float_array>0.25 0.75</float_array></source>";
        let primitive = "<polylist material=\"face\"><input semantic=\"VERTEX\" source=\"#v\" offset=\"0\"/><input semantic=\"NORMAL\" source=\"#n\" offset=\"1\"/><input semantic=\"TEXCOORD\" source=\"#u\" offset=\"2\"/><vcount>4</vcount><p>0 0 0 1 0 0 3 0 0 2 0 0</p></polylist><lines material=\"edge\"><input semantic=\"VERTEX\" source=\"#v\"/><p>0 1</p></lines>";
        let (result, context) = parse(&geometry_xml(primitive, extra));
        assert!(result.diagnostics.read().unwrap().is_empty());
        let document = result.document.read().unwrap();
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::LineList);
        assert_eq!(geometry.subsets.len(), 2);
        assert_eq!(geometry.subsets[0].index_count, 6);
        assert_eq!(geometry.subsets[1].index_count, 2);
        assert_eq!(geometry.subsets[1].index_offset, 6);
        assert_eq!(&geometry.vertices[3..6], &[0.0, 0.0, 1.0]);
        assert_eq!(&geometry.vertices[10..12], &[0.25, 0.75]);
        assert_eq!(
            *context
                .read()
                .unwrap()
                .geometry_primitive_symbols
                .read()
                .unwrap()[0]
                .value
                .read()
                .unwrap(),
            ["face", "edge"]
        );
    }

    #[test]
    fn preserves_exact_large_authored_index_keys_negative_zero_equivalence_and_the_original_number_grammar_without_large_allocations()
     {
        for (raw, count, expected) in [
            ("16777216 16777217 2", 3, vec![0, 1, 2]),
            ("0 -0 1", 2, vec![0, 0, 1]),
            ("0x0 0b1 0o2", 3, vec![0, 1, 2]),
        ] {
            let (result, _) = parse(&geometry_xml(
                &format!(
                    "<triangles><input semantic=\"VERTEX\" source=\"#v\"/><p>{raw}</p></triangles>"
                ),
                "",
            ));
            assert!(result.diagnostics.read().unwrap().is_empty());
            let document = result.document.read().unwrap();
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), count);
            let IndexBuffer::U32(indices) = &geometry.indices else {
                panic!("Uint32");
            };
            assert_eq!(&**indices.data.read().unwrap(), expected.as_slice());
        }
    }

    #[test]
    fn preserves_the_exact_missing_position_diagnostic_and_source_empty_mesh_behavior() {
        let (result, _) = parse(
            "<COLLADA><library_geometries><geometry id=\"missing\"><mesh><triangles><input semantic=\"VERTEX\" source=\"#absent\"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries></COLLADA>",
        );
        assert!(result.document.read().unwrap().meshes.is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "collada.missing-reference");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(diagnostics[0].origin, "parseCollada");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("element"),
            Some(&ImportDiagnosticDetailValue::String("POSITION".to_string()))
        );
    }
}
