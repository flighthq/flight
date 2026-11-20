use std::collections::{BTreeMap, BTreeSet};

const COMMITTED_BASELINE: &str = include_str!("ffi_reachability_baseline.tsv");
const GENERATED_BASELINE: &str =
    include_str!(concat!(env!("OUT_DIR"), "/ffi_reachability_baseline.tsv"));
const GENERATED_GRAPH: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_reachability_graph.tsv"));

fn gate_rows(report: &str) -> BTreeSet<String> {
    report
        .lines()
        .filter(|line| line.starts_with("unreachable|") || line.starts_with("exempt|"))
        .map(str::to_string)
        .collect()
}

fn baseline_drift(
    committed: &BTreeSet<String>,
    generated: &BTreeSet<String>,
) -> (Vec<String>, Vec<String>) {
    let newly_unreachable = generated.difference(committed).cloned().collect();
    let stale = committed.difference(generated).cloned().collect();
    (newly_unreachable, stale)
}

fn preview(rows: &[String]) -> String {
    rows.iter().take(12).cloned().collect::<Vec<_>>().join("\n")
}

#[test]
fn committed_reachability_baseline_is_exact_and_byte_identical() {
    if COMMITTED_BASELINE != GENERATED_BASELINE {
        let committed = gate_rows(COMMITTED_BASELINE);
        let generated = gate_rows(GENERATED_BASELINE);
        let (newly_unreachable, stale) = baseline_drift(&committed, &generated);
        panic!(
            "FFI reachability baseline drifted: {} new rows, {} stale rows\nnew:\n{}\nstale:\n{}",
            newly_unreachable.len(),
            stale.len(),
            preview(&newly_unreachable),
            preview(&stale)
        );
    }
}

#[test]
fn gate_rejects_both_new_unreachable_and_stale_baseline_rows() {
    let generated = gate_rows(GENERATED_BASELINE);
    let first = generated
        .iter()
        .find(|row| row.starts_with("unreachable|"))
        .expect("unreachable baseline row")
        .clone();

    let mut missing_current_row = generated.clone();
    assert!(missing_current_row.remove(&first));
    let (newly_unreachable, stale) = baseline_drift(&missing_current_row, &generated);
    assert_eq!(newly_unreachable, [first]);
    assert!(stale.is_empty());

    let stale_row = "unreachable|flight_removed_stale_fixture|*const RemovedCarrier".to_string();
    let mut stale_baseline = generated.clone();
    assert!(stale_baseline.insert(stale_row.clone()));
    let (newly_unreachable, stale) = baseline_drift(&stale_baseline, &generated);
    assert!(newly_unreachable.is_empty());
    assert_eq!(stale, [stale_row]);
}

#[derive(Debug)]
struct FunctionRow<'a> {
    kind: &'a str,
    classification: &'a str,
    blocker: &'a str,
}

fn function_rows() -> BTreeMap<&'static str, FunctionRow<'static>> {
    GENERATED_GRAPH
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('|');
            if fields.next()? != "function" {
                return None;
            }
            let name = fields.next()?;
            let kind = fields.next()?;
            let classification = fields.next()?;
            let blocker = fields.next()?;
            assert!(fields.next().is_none(), "malformed function row: {line}");
            Some((
                name,
                FunctionRow {
                    kind,
                    classification,
                    blocker,
                },
            ))
        })
        .collect()
}

fn edge_rows(edge: &str, function: &str) -> BTreeSet<&'static str> {
    GENERATED_GRAPH
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('|');
            (fields.next()? == edge && fields.next()? == function).then(|| fields.next().unwrap())
        })
        .collect()
}

#[test]
fn carrier_graph_preserves_thin_fat_raw_and_policy_distinctions() {
    let functions = function_rows();
    assert!(
        functions.len() > 7_000,
        "every emitted C function is classified"
    );

    assert_eq!(
        edge_rows("produce", "flight_create_sprite"),
        ["Box<FlightNode>"].into_iter().collect()
    );
    assert_eq!(
        edge_rows("consume", "flight_add_node_child"),
        ["Box<FlightNode>"].into_iter().collect()
    );
    assert_eq!(
        edge_rows("produce", "flight_add_node_child"),
        ["Box<FlightNode>"].into_iter().collect()
    );
    assert_eq!(
        functions["flight_add_node_child"].classification,
        "reachable"
    );
    assert_eq!(functions["flight_add_node_child"].blocker, "-");
    assert_eq!(
        edge_rows("consume", "flight_add_node_children"),
        ["Box<FlightNode>", "Box<FlightNodeArray>"]
            .into_iter()
            .collect(),
        "a node slice consumes only the shared node and node-array carriers"
    );
    // The slice is an `Option`, so its carrier is optional coverage rather than a blocker.
    assert_eq!(
        edge_rows("optional", "flight_resolve_color_adjustments_color_matrix"),
        ["Box<flight_sdk::Ref<dyn flight_sdk::Adjustment>>"]
            .into_iter()
            .collect(),
        "a c_void handle slice retains the exact dynamic trait carrier"
    );

    let node2d_accessors: Vec<_> = functions
        .iter()
        .filter(|(name, _)| {
            (name.starts_with("flight_get_node2d_")
                || name.starts_with("flight_set_node2d_")
                || **name == "flight_has_node2d_blend_mode")
                && **name != "flight_get_node2d_overlap_rectangle"
        })
        .collect();
    assert_eq!(node2d_accessors.len(), 31);
    assert!(node2d_accessors.iter().all(|(name, row)| {
        if matches!(
            **name,
            "flight_set_node2d_material" | "flight_set_node2d_material_data"
        ) {
            row.kind == "surface"
                && row.classification == "unreachable"
                && row
                    .blocker
                    .starts_with("Box<flight_sdk::Ref<dyn flight_sdk::Material")
        } else {
            row.kind == "surface" && row.classification == "reachable" && row.blocker == "-"
        }
    }));

    // Item C: the per-payload connect wrappers produce an owned SignalConnection, so its
    // operations left the unreachable census.
    let node3d_accessors: Vec<_> = functions
        .iter()
        .filter(|(name, _)| {
            name.starts_with("flight_get_node3d_") || name.starts_with("flight_set_node3d_")
        })
        .collect();
    assert_eq!(
        node3d_accessors.len(),
        25,
        "the canonical invalidating alpha setter and raw alpha field setter are distinct surfaces"
    );
    assert!(node3d_accessors.iter().all(|(_, row)| {
        row.kind == "surface" && row.classification == "reachable" && row.blocker == "-"
    }));

    assert_eq!(
        edge_rows("consume", "flight_get_clock_elapsed"),
        ["Box<flight_sdk::Ref<flight_sdk::Clock>>"]
            .into_iter()
            .collect()
    );
    assert_eq!(
        functions["flight_get_clock_elapsed"].classification,
        "reachable"
    );

    for function in [
        "flight_disconnect_signal_connection",
        "flight_pause_signal_connection",
        "flight_resume_signal_connection",
    ] {
        assert_eq!(functions[function].classification, "reachable");
        assert_eq!(functions[function].blocker, "-");
    }
    assert!(
        edge_rows("produce", "flight_connect_unit_signal")
            .contains("Box<flight_sdk::SignalConnection>")
    );

    // A nullable parameter never blocks: `set_interaction_connect_guard(NULL)` clears the guard,
    // so the call is reachable while the guard carrier is reported as optional coverage.
    assert_eq!(
        functions["flight_set_interaction_connect_guard"].classification,
        "reachable"
    );
    assert!(GENERATED_GRAPH.lines().any(|line| line
        == "optional|flight_set_interaction_connect_guard|*const flight_sdk::InteractionConnectGuard"));

    assert!(GENERATED_BASELINE.contains(
        "policy|host_capability|feature-gated native host crates supply borrowed Host*Capability carriers"
    ));
}

#[test]
fn provisional_wgpu_host_carriers_reach_the_declared_render_sequence() {
    let expected_seeds = [
        "*const flight_sdk::SurfaceRef",
        "*const flight_sdk::WgpuDevice",
        "*const flight_sdk::WgpuRenderTarget",
    ]
    .into_iter()
    .collect::<BTreeSet<_>>();
    for report in [GENERATED_GRAPH, GENERATED_BASELINE] {
        let seeds = report
            .lines()
            .filter_map(|line| line.strip_prefix("seed|provisional_wgpu_host|"))
            .collect::<BTreeSet<_>>();
        assert_eq!(seeds, expected_seeds);
        assert!(report.contains(
            "policy|provisional_wgpu_host|native hosts must supply the borrowed WGPU device, abstract render target and surface carriers"
        ));
    }

    let functions = function_rows();
    assert_eq!(
        functions["flight_create_wgpu_scene_2d_render_proxies"].classification,
        "reachable"
    );
    for function in [
        "flight_create_wgpu_render_state",
        "flight_register_wgpu_standard_material",
        "flight_register_standard_wgpu_texture_resolvers",
        "flight_register_wgpu_scene2d_render_preset",
        "flight_prepare_wgpu_scene_2d_render",
        "flight_begin_wgpu_render_pass",
        "flight_render_wgpu_scene2d",
        "flight_end_wgpu_render_pass",
        "flight_submit_wgpu_frame",
        "flight_create_wgpu_screen_render_target",
        "flight_end_wgpu_screen_render_target_frame",
        "flight_sync_wgpu_screen_render_target_extent",
        "flight_destroy_wgpu_render_state",
        "flight_create_wgpu_offscreen_render_state",
    ] {
        assert_eq!(
            functions[function].classification, "policy-exempt",
            "{function} must join the provisional host fixed point"
        );
        assert_eq!(functions[function].blocker, "provisional_wgpu_host");
    }

    assert!(
        edge_rows("consume", "flight_create_wgpu_render_state")
            .contains("*const flight_sdk::WgpuDevice")
    );
    assert!(
        edge_rows("consume", "flight_begin_wgpu_render_pass")
            .contains("*const flight_sdk::WgpuRenderTarget")
    );
    assert!(
        edge_rows("consume", "flight_create_wgpu_screen_render_target")
            .contains("*const flight_sdk::SurfaceRef")
    );
    assert!(
        edge_rows("produce", "flight_create_wgpu_screen_render_target")
            .contains("Box<flight_sdk::WgpuScreenRenderTarget>")
    );
}

#[test]
fn nested_alias_carriers_join_the_real_fixed_point() {
    let functions = function_rows();
    assert_eq!(
        edge_rows("produce", "flight_get_effect_kinds"),
        ["Box<Vec<String>>"].into_iter().collect()
    );
    assert_eq!(
        edge_rows(
            "consume",
            "flight_get_skeleton_2d_animation_target_binder_kinds"
        ),
        [
            "*const flight_sdk::Skeleton2DAnimationTargetBinderRegistry",
            "Box<Vec<String>>",
        ]
        .into_iter()
        .collect()
    );
    assert_eq!(
        functions["flight_get_skeleton_2d_animation_target_binder_kinds"].blocker,
        "*const flight_sdk::Skeleton2DAnimationTargetBinderRegistry"
    );
    assert!(!GENERATED_GRAPH.contains("Box<Vec<flight_sdk::Kind>>"));
}

#[test]
fn graph_and_baseline_have_one_stable_classification_per_surface_wrapper() {
    let functions = function_rows();
    let surface: BTreeSet<_> = functions
        .iter()
        .filter(|(_, row)| row.kind == "surface")
        .map(|(name, _)| *name)
        .collect();
    let unreachable: BTreeSet<_> = GENERATED_BASELINE
        .lines()
        .filter_map(|line| line.strip_prefix("unreachable|")?.split('|').next())
        .collect();
    let exempt: BTreeSet<_> = GENERATED_BASELINE
        .lines()
        .filter_map(|line| line.strip_prefix("exempt|")?.split('|').next())
        .collect();
    assert!(unreachable.is_subset(&surface));
    assert!(exempt.is_subset(&surface));
    assert!(unreachable.is_disjoint(&exempt));
    assert!(surface.iter().all(|name| {
        matches!(
            functions[name].classification,
            "reachable" | "policy-exempt" | "unreachable"
        )
    }));
}
