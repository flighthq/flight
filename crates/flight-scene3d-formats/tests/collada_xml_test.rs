use flight_entity::Ref;
use flight_scene3d_formats::contract::*;
use flight_xml::{XmlElement, parse_xml_document};
use std::sync::{Arc, RwLock};

fn namespaced() -> Ref<XmlElement> {
    return parse(
        "<c:COLLADA xmlns:c=\"http://www.collada.org/2005/11/COLLADASchema\"><c:asset><c:up_axis>  Z_UP  </c:up_axis></c:asset><c:library_geometries><c:geometry id=\"g1\"><c:mesh/></c:geometry><c:geometry id=\"g2\"/></c:library_geometries></c:COLLADA>",
    );
}

fn parse(xml: &str) -> Ref<XmlElement> {
    return Arc::new(RwLock::new(parse_xml_document(xml).unwrap()));
}

fn plain() -> Ref<XmlElement> {
    return parse(
        "<COLLADA><asset><up_axis>Y_UP</up_axis></asset><node id=\"n\"/><node/></COLLADA>",
    );
}

mod collada_child {
    use super::*;

    #[test]
    fn matches_plain_and_namespace_prefixed_children_and_returns_the_original_handle() {
        for root in [plain(), namespaced()] {
            let found = collada_child(Some(&root), "asset").unwrap();
            assert!(Arc::ptr_eq(&found, &root.read().unwrap().children[0]));
        }
    }

    #[test]
    fn returns_none_for_missing_children_and_absent_elements() {
        assert!(collada_child(Some(&plain()), "library_geometries").is_none());
        assert!(collada_child(None, "asset").is_none());
    }

    #[test]
    fn requires_the_namespace_colon_rather_than_an_arbitrary_matching_suffix() {
        assert!(collada_child(Some(&parse("<COLLADA><subasset/></COLLADA>")), "asset").is_none());
    }
}

mod collada_children {
    use super::*;

    #[test]
    fn fills_all_matches_in_document_order_and_clears_empty_queries_without_losing_capacity() {
        let root = plain();
        let mut out = Vec::with_capacity(8);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collada_children(&mut out, Some(&root), "node");
        assert_eq!(out.len(), 2);
        assert!(Arc::ptr_eq(&out[0], &root.read().unwrap().children[1]));
        assert!(Arc::ptr_eq(&out[1], &root.read().unwrap().children[2]));
        let namespaced = namespaced();
        let library = collada_child(Some(&namespaced), "library_geometries").unwrap();
        collada_children(&mut out, Some(&library), "geometry");
        assert_eq!(out.len(), 2);
        assert_eq!(collada_id_of(&out[0]).as_deref(), Some("g1"));
        assert_eq!(collada_id_of(&out[1]).as_deref(), Some("g2"));
        collada_children(&mut out, Some(&root), "geometry");
        assert!(out.is_empty());
        collada_children(&mut out, Some(&root), "node");
        collada_children(&mut out, None, "node");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod collada_descendants {
    use super::*;

    #[test]
    fn finds_original_elements_at_any_depth_and_reuses_the_output_for_each_query() {
        let root = namespaced();
        let mut out = Vec::with_capacity(8);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collada_descendants(&mut out, &root, "geometry");
        assert_eq!(out.len(), 2);
        let library = collada_child(Some(&root), "library_geometries").unwrap();
        assert!(Arc::ptr_eq(&out[0], &library.read().unwrap().children[0]));
        collada_children(&mut out, Some(&root), "geometry");
        assert!(out.is_empty());
        collada_descendants(&mut out, &root, "mesh");
        assert_eq!(out.len(), 1);
        collada_descendants(&mut out, &root, "absent");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        collada_descendants(&mut out, &root, "COLLADA");
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0], &root));
    }
}

mod collada_id_of {
    use super::*;

    #[test]
    fn reads_ids_and_returns_none_for_absent_attributes() {
        let mut geometries = Vec::new();
        collada_descendants(&mut geometries, &namespaced(), "geometry");
        assert_eq!(collada_id_of(&geometries[0]).as_deref(), Some("g1"));
        assert!(collada_id_of(&collada_child(Some(&plain()), "asset").unwrap()).is_none());
        assert_eq!(
            collada_id_of(&parse("<node id=\"\"/>")),
            Some(String::new())
        );
    }
}

mod collada_local_name {
    use super::*;

    #[test]
    fn strips_only_the_first_namespace_prefix_and_preserves_unprefixed_names() {
        assert_eq!(collada_local_name(&namespaced()), "COLLADA");
        assert_eq!(collada_local_name(&plain()), "COLLADA");
        assert_eq!(collada_local_name(&parse("<a:b:c/>")), "b:c");
    }
}

mod collada_numbers {
    use super::*;

    #[test]
    fn decodes_whitespace_separated_finite_numbers_and_returns_an_empty_list_for_absence_or_empty_text()
     {
        let root = parse("<root><float_array>1 2.5  -3\n4</float_array></root>");
        assert_eq!(
            collada_numbers(collada_child(Some(&root), "float_array").as_ref()),
            [1.0, 2.5, -3.0, 4.0]
        );
        assert!(collada_numbers(None).is_empty());
        assert!(collada_numbers(Some(&parse("<empty>   </empty>"))).is_empty());
    }
}

mod collada_text {
    use super::*;

    #[test]
    fn trims_child_text_and_returns_none_for_absent_children_and_elements() {
        assert_eq!(
            collada_text(
                collada_child(Some(&namespaced()), "asset").as_ref(),
                "up_axis"
            )
            .as_deref(),
            Some("Z_UP")
        );
        assert_eq!(
            collada_text(collada_child(Some(&plain()), "asset").as_ref(), "up_axis").as_deref(),
            Some("Y_UP")
        );
        assert!(
            collada_text(collada_child(Some(&plain()), "asset").as_ref(), "copyright").is_none()
        );
        assert!(collada_text(None, "up_axis").is_none());
    }

    #[test]
    fn returns_none_for_whitespace_only_child_text() {
        assert!(
            collada_text(
                Some(&parse("<asset><copyright>   </copyright></asset>")),
                "copyright"
            )
            .is_none()
        );
    }
}

mod parse_collada_floats {
    use super::*;

    #[test]
    fn decodes_signs_fractions_exponents_and_ecmascript_whitespace() {
        assert_eq!(parse_collada_floats(" 1  -2.5\t3e2\n"), [1.0, -2.5, 300.0]);
        assert_eq!(
            parse_collada_floats("\u{feff}1\u{a0}2\u{2028}3\u{feff}"),
            [1.0, 2.0, 3.0]
        );
    }

    #[test]
    fn drops_nonnumeric_and_nonfinite_tokens_with_strict_number_instead_of_prefix_grammar() {
        assert_eq!(parse_collada_floats("1 x 2"), [1.0, 2.0]);
        assert_eq!(
            parse_collada_floats("1junk 0x10 0b10 0o10 NaN Infinity 1e400 2"),
            [16.0, 2.0, 8.0, 2.0]
        );
    }

    #[test]
    fn preserves_the_source_single_zero_for_whitespace_only_input_and_returns_fresh_decoded_content()
     {
        assert_eq!(parse_collada_floats("   "), [0.0]);
        assert_eq!(parse_collada_floats(""), [0.0]);
        let a = parse_collada_floats("1 2");
        let b = parse_collada_floats("1 2");
        assert_ne!(a.as_ptr(), b.as_ptr());
    }
}

mod walk_collada_element {
    use super::*;

    #[test]
    fn visits_the_original_root_and_descendants_parents_before_children() {
        let root = plain();
        let mut seen = Vec::new();
        walk_collada_element(&root, &mut |entry| seen.push(collada_local_name(entry)));
        assert_eq!(seen[0], "COLLADA");
        assert!(seen.iter().any(|name| name == "up_axis"));
        assert!(
            seen.iter().position(|name| name == "asset").unwrap()
                < seen.iter().position(|name| name == "up_axis").unwrap()
        );
    }

    #[test]
    fn releases_tree_locks_before_callbacks_and_visits_children_added_by_the_original_visitor() {
        let root = parse("<root><first/></root>");
        let extra = parse("<second/>");
        let mut seen = Vec::new();
        walk_collada_element(&root, &mut |entry| {
            let mut entry_guard = entry
                .try_write()
                .expect("visitor can mutate the original element");
            seen.push(entry_guard.name.clone());
            entry_guard
                .attributes
                .insert("visited".to_string(), "true".to_string());
            if Arc::ptr_eq(entry, &root) {
                entry_guard.children.push(extra.clone());
            }
        });
        assert_eq!(seen, ["root", "first", "second"]);
        assert_eq!(
            extra
                .read()
                .unwrap()
                .attributes
                .get("visited")
                .map(String::as_str),
            Some("true")
        );
    }
}
