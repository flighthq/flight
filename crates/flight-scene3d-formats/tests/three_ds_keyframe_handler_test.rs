use super::three_ds_test_helper::*;
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

fn object_node(name: &str, pivot: [f32; 3]) -> Box<[u8]> {
    let mut bytes = write_chunk(
        THREE_DS_KEYFRAME_NODE_HEADER,
        format!("{name}\0\0\0").as_bytes(),
    )
    .to_vec();
    let components: Vec<_> = pivot.iter().flat_map(|value| value.to_le_bytes()).collect();
    bytes.extend_from_slice(&write_chunk(THREE_DS_KEYFRAME_PIVOT, &components));
    return write_chunk(THREE_DS_KEYFRAME_OBJECT_NODE, &bytes);
}

mod collect_three_ds_pivots {
    use super::*;
    #[test]
    fn supports_main_keyframe_and_direct_object_entries_and_omits_zero_or_unnamed_pivots() {
        let node = object_node("Box", [1.0, 2.0, 3.0]);
        let keyframe = write_chunk(THREE_DS_KEYFRAME, &node);
        let main = write_chunk(THREE_DS_MAIN, &keyframe);
        for bytes in [&node, &keyframe, &main] {
            let pivots = {
                let mut output = Vec::new();
                collect_three_ds_pivots(&mut output, bytes, 0);
                output
            };
            assert_eq!(pivots.len(), 1);
            assert_eq!(pivots[0].key, "Box");
            assert_eq!(pivots[0].value, [1.0, 2.0, 3.0]);
        }
        for bytes in [
            build_minimal_three_ds(&[]),
            object_node("Box", [0.0; 3]),
            object_node("", [1.0; 3]),
        ] {
            assert!(
                {
                    let mut output = Vec::new();
                    collect_three_ds_pivots(&mut output, &bytes, 0);
                    output
                }
                .is_empty()
            );
        }
    }
    #[test]
    fn replaces_previous_pivots_and_clears_empty_results_without_replacing_the_callers_buffer() {
        let mut out = Vec::with_capacity(16);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_three_ds_pivots(&mut out, &object_node("Old", [1.0, 2.0, 3.0]), 0);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "Old");
        collect_three_ds_pivots(&mut out, &object_node("New", [4.0, 5.0, 6.0]), 0);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "New");
        assert_eq!(out[0].value, [4.0, 5.0, 6.0]);
        collect_three_ds_pivots(&mut out, &build_minimal_three_ds(&[]), 0);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod three_ds_keyframe_handler {
    use super::*;
    #[test]
    fn claims_the_object_node_and_collects_pivots_with_map_replacement_order() {
        assert_eq!(THREE_DS_KEYFRAME_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &THREE_DS_KEYFRAME_FAMILY[0],
            &THREE_DS_KEYFRAME_HANDLER
        ));
        assert_eq!(
            THREE_DS_KEYFRAME_HANDLER.read().unwrap().chunk_ids,
            [THREE_DS_KEYFRAME_OBJECT_NODE]
        );
        let inspect = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![0x8888],
            collect: Arc::new(|_, _, _, _, _| {}),
            build: Some(Arc::new(|state| {
                assert_eq!(
                    state
                        .pivots
                        .iter()
                        .map(|entry| entry.key.as_str())
                        .collect::<Vec<_>>(),
                    ["Box", "Second"]
                );
                assert_eq!(state.pivots[0].value, [4.0, 5.0, 6.0]);
            })),
        }));
        let bytes: Vec<_> = [
            object_node("Box", [1.0; 3]),
            object_node("Second", [2.0; 3]),
            object_node("Box", [4.0, 5.0, 6.0]),
        ]
        .iter()
        .flat_map(|bytes| bytes.iter().copied())
        .collect();
        let file = write_chunk(THREE_DS_MAIN, &write_chunk(THREE_DS_KEYFRAME, &bytes));
        parse_three_ds_document_with_dispatch(&file, None, &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(
                &mut output,
                &[THREE_DS_KEYFRAME_HANDLER.clone(), inspect],
            );
            output
        });
    }
}
