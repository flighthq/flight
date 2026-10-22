use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_scene3d_formats::*;

const DECODE_XML_0: &str = r##"<COLLADA><library_controllers><controller id="c"><skin source="#g"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="j"><Name_array>root child</Name_array></source><source id="w"><float_array>1 3</float_array></source><joints><input semantic="JOINT" source="#j"/><input semantic="INV_BIND_MATRIX" source="#m"/></joints><source id="m"><float_array>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source><vertex_weights count="1"><input semantic="JOINT" source="#j" offset="0"/><input semantic="WEIGHT" source="#w" offset="1"/><vcount>2</vcount><v>0 0 1 1</v></vertex_weights></skin></controller></library_controllers></COLLADA>"##;

const DECODE_XML_1: &str = r##"<COLLADA><library_controllers><controller id="m"><morph source="#base" method="NORMALIZED"><source id="t"><IDREF_array>shapeA shapeB</IDREF_array></source><source id="w"><float_array>0.2 0.8</float_array></source><targets><input semantic="MORPH_TARGET" source="#t"/><input semantic="MORPH_WEIGHT" source="#w"/></targets></morph></controller></library_controllers></COLLADA>"##;

const SOURCE_XML_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_controllers><controller id="skin1"><skin source="#g"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="jn"><Name_array>Root Arm</Name_array></source><source id="wt"><float_array>1 0.5</float_array></source><source id="ibm"><float_array>1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1 1 0 0 2  0 1 0 0  0 0 1 0  0 0 0 1</float_array></source><joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints><vertex_weights count="1"><input semantic="JOINT" source="#jn" offset="0"/><input semantic="WEIGHT" source="#wt" offset="1"/><vcount>1</vcount><v>0 0</v></vertex_weights></skin></controller></library_controllers><library_visual_scenes><visual_scene id="vs"><node id="Root" name="Root"><node id="Arm" name="Arm"/></node><node id="MeshNode" name="MeshNode"><instance_controller url="#skin1"><skeleton>#Root</skeleton></instance_controller></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_1: &str = r##"<COLLADA><library_images><image id="tex"><init_from>tex.png</init_from></image></library_images><library_effects><effect id="fx"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="MatB"><instance_effect url="#fx"/></material></library_materials><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="SkinSymbol"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_controllers><controller id="skin1"><skin source="#g"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="jn"><Name_array>Bone</Name_array></source><source id="wt"><float_array>1</float_array></source><source id="ibm"><float_array>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source><joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints><vertex_weights count="1"><input semantic="JOINT" source="#jn" offset="0"/><input semantic="WEIGHT" source="#wt" offset="1"/><vcount>1</vcount><v>0 0</v></vertex_weights></skin></controller></library_controllers><library_visual_scenes><visual_scene id="vs"><node id="Bone" name="Bone"/><node id="MeshNode" name="MeshNode"><instance_controller url="#skin1"><skeleton>#Bone</skeleton><bind_material><technique_common><instance_material symbol="SkinSymbol" target="#MatB"/></technique_common></bind_material></instance_controller></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_2: &str = r##"<COLLADA><library_geometries><geometry id="base"><mesh><source id="bp"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="bv"><input semantic="POSITION" source="#bp"/></vertices><triangles count="1"><input semantic="VERTEX" source="#bv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry><geometry id="target1"><mesh><source id="tp"><float_array>0 1 0 1 1 0 0 2 0</float_array></source><vertices id="tv"><input semantic="POSITION" source="#tp"/></vertices><triangles count="1"><input semantic="VERTEX" source="#tv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_controllers><controller id="morph1"><morph source="#base" method="NORMALIZED"><source id="mt"><IDREF_array>target1</IDREF_array></source><source id="mw"><float_array>0.5</float_array></source><targets><input semantic="MORPH_TARGET" source="#mt"/><input semantic="MORPH_WEIGHT" source="#mw"/></targets></morph></controller></library_controllers><library_visual_scenes><visual_scene id="vs"><node id="n" name="MorphNode"><instance_controller url="#morph1"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_3: &str = r##"<COLLADA><library_geometries><geometry id="base"><mesh><source id="bp"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="bv"><input semantic="POSITION" source="#bp"/></vertices><triangles count="1"><input semantic="VERTEX" source="#bv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry><geometry id="tgt"><mesh><source id="tp"><float_array>0 0 1 1 0 1 0 1 1</float_array></source><vertices id="tv"><input semantic="POSITION" source="#tp"/></vertices><triangles count="1"><input semantic="VERTEX" source="#tv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_controllers><controller id="morph1"><morph source="#base" method="NORMALIZED"><source id="mt"><IDREF_array>tgt</IDREF_array></source><source id="mw"><float_array>1</float_array></source><targets><input semantic="MORPH_TARGET" source="#mt"/><input semantic="MORPH_WEIGHT" source="#mw"/></targets></morph></controller><controller id="skin1"><skin source="#morph1"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="jn"><Name_array>Bone</Name_array></source><source id="wt"><float_array>1</float_array></source><source id="ibm"><float_array>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source><joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints><vertex_weights count="1"><input semantic="JOINT" source="#jn" offset="0"/><input semantic="WEIGHT" source="#wt" offset="1"/><vcount>1</vcount><v>0 0</v></vertex_weights></skin></controller></library_controllers><library_visual_scenes><visual_scene id="vs"><node id="Bone" name="Bone"/><node id="n" name="Skinned"><instance_controller url="#skin1"><skeleton>#Bone</skeleton></instance_controller></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

fn parse_controllers(xml: &str) -> ColladaParseResult {
    return parse_collada(xml, None);
}

mod collada_controller_decoder {
    use super::*;

    #[test]
    fn resolves_instance_controller_to_a_skin_with_node_index_joints_and_column_major_inverse_binds()
     {
        let decoder = COLLADA_CONTROLLER_DECODER.read().unwrap();
        assert_eq!(decoder.build_phase, Some(30.0));
        assert!(decoder.build.is_some());
        assert_eq!(decoder.elements, ["controller"]);
        assert_eq!(
            decoder.features,
            ["Controller", "Controller.Morph", "Controller.Skin"]
        );
        drop(decoder);
        let result = parse_controllers(SOURCE_XML_0);
        assert!(
            !result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| matches!(
                    entry.severity,
                    ImportDiagnosticSeverity::Reject | ImportDiagnosticSeverity::Drop
                ))
        );
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes.len(), 3);
        assert_eq!(
            document
                .nodes
                .iter()
                .map(|node| node.name.as_deref())
                .collect::<Vec<_>>(),
            [Some("Root"), Some("Arm"), Some("MeshNode")]
        );
        assert_eq!(document.nodes[2].mesh, Some(0));
        assert_eq!(document.skins.len(), 1);
        let skin = &document.skins[0];
        assert_eq!(skin.joints, [0, 1]);
        assert_eq!(skin.inverse_bind.len(), 2);
        for index in [0, 5, 10, 15] {
            assert_eq!(skin.inverse_bind[0].m[index], 1.0);
        }
        assert_eq!(skin.inverse_bind[1].m[12], 2.0);
        assert_eq!(document.meshes[0].skin, Some(0));
    }

    #[test]
    fn applies_bind_material_overrides_on_instance_controller() {
        let result = parse_controllers(SOURCE_XML_1);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes[1].mesh, Some(0));
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.skins.len(), 1);
        assert_eq!(document.meshes[0].skin, Some(0));
    }

    #[test]
    fn resolves_morph_instance_controller_to_mesh_morph_with_position_deltas() {
        let result = parse_controllers(SOURCE_XML_2);
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes[0].mesh, Some(0));
        let morph = document.meshes[0].morph.as_ref().unwrap().read().unwrap();
        assert_eq!(morph.targets.len(), 1);
        assert_eq!(&*morph.weights, &[0.5]);
        let target = &morph.targets[0];
        assert_eq!(target.position_deltas.len(), 9);
        for (index, expected) in [0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0]
            .into_iter()
            .enumerate()
        {
            // D1 f32 bound (TS: 0.000005)
            assert!((target.position_deltas[index] - expected).abs() < 0.000005);
        }
        assert!(target.normal_deltas.is_none());
        assert!(target.tangent_deltas.is_none());
    }

    #[test]
    fn resolves_skin_wrapping_morph_controller_chain() {
        let result = parse_controllers(SOURCE_XML_3);
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes[1].mesh, Some(0));
        assert_eq!(document.skins.len(), 1);
        assert_eq!(document.meshes[0].skin, Some(0));
        let morph = document.meshes[0].morph.as_ref().unwrap().read().unwrap();
        assert_eq!(morph.targets.len(), 1);
        for index in [2, 5, 8] {
            // D1 f32 bound (TS: 0.000005)
            assert!((morph.targets[0].position_deltas[index] - 1.0).abs() < 0.000005);
        }
    }
}

mod decode_collada_controllers {
    use super::*;

    #[test]
    fn decodes_skin_joint_names_inverse_binds_and_normalized_vertex_weights() {
        let skins = decode_collada_controllers(DECODE_XML_0, None);
        let skin = skins[0].read().unwrap();
        assert_eq!(skin.controller_id, "c");
        assert_eq!(skin.joint_names, ["root", "child"]);
        assert_eq!(
            skin.influences[0]
                .iter()
                .map(|influence| influence.weight)
                .collect::<Vec<_>>(),
            [0.25, 0.75]
        );
        assert_eq!(skin.inverse_bind_matrices.len(), 1);
        assert_eq!(
            skin.inverse_bind_matrices[0],
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
        assert_eq!(skin.joint_sids, skin.joint_names);
        assert_eq!(skin.geometry_ref, "g");
    }

    #[test]
    fn keeps_fractional_source_indices_invalid_before_any_f32_projection_and_reports_cursor_mismatch()
     {
        let fractional = DECODE_XML_0.replace("<v>0 0 1 1</v>", "<v>0.9999999999 0 1 1</v>");
        let skins = decode_collada_controllers(&fractional, None);
        let skin = skins[0].read().unwrap();
        assert_eq!(skin.influences[0].len(), 1);
        assert_eq!(skin.influences[0][0].joint, "child");
        assert_eq!(skin.influences[0][0].weight, 1.0);
        let mismatch = DECODE_XML_0.replace("<vcount>2</vcount>", "<vcount>1</vcount>");
        let mut diagnostics = Vec::new();
        decode_collada_controllers(&mismatch, Some(&mut diagnostics));
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            ["collada.vertex-weight-count-mismatch"]
        );
        assert!(decode_collada_controllers("", None).is_empty());
    }
}

mod decode_collada_morphs {
    use super::*;

    #[test]
    fn decodes_morph_target_ids_weights_and_method() {
        let morphs = decode_collada_morphs(DECODE_XML_1, None);
        let morph = morphs[0].read().unwrap();
        assert_eq!(morph.controller_id, "m");
        assert_eq!(morph.base_geometry, "base");
        assert_eq!(morph.method, ColladaMorphMethod::Normalized);
        assert_eq!(morph.targets, ["shapeA", "shapeB"]);
        assert_eq!(morph.weights.len(), 2);
        for (index, expected) in [0.2_f64, 0.8].into_iter().enumerate() {
            // D1 f32 bound (TS: 0)
            assert!(
                (f64::from(morph.weights[index]) - expected).abs()
                    <= 4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0)
            );
        }
    }

    #[test]
    fn preserves_relative_fallback_for_unknown_methods_and_reports_missing_morph_sources() {
        let unknown = DECODE_XML_1.replace("NORMALIZED", "UNKNOWN");
        let mut diagnostics = Vec::new();
        let morphs = decode_collada_morphs(&unknown, Some(&mut diagnostics));
        assert_eq!(
            morphs[0].read().unwrap().method,
            ColladaMorphMethod::Relative
        );
        assert_eq!(diagnostics[0].kind, "collada.unsupported-morph-method");
        let missing = DECODE_XML_1.replace("source=\"#t\"", "source=\"#absent\"");
        let mut diagnostics = Vec::new();
        assert!(decode_collada_morphs(&missing, Some(&mut diagnostics)).is_empty());
        assert_eq!(diagnostics[0].kind, "collada.missing-reference");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert!(decode_collada_morphs("", None).is_empty());
    }
}
