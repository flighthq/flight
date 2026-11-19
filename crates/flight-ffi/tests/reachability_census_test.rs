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
        ["Box<flight_sdk::Ref<flight_sdk::Sprite>>"]
            .into_iter()
            .collect()
    );
    assert_eq!(
        edge_rows("consume", "flight_add_node_child"),
        ["Box<flight_sdk::Ref<dyn flight_sdk::Node>>"]
            .into_iter()
            .collect()
    );
    assert_eq!(
        functions["flight_add_node_child"].classification,
        "unreachable"
    );
    assert_eq!(
        functions["flight_add_node_child"].blocker,
        "Box<flight_sdk::Ref<dyn flight_sdk::Node>>"
    );
    assert_eq!(
        edge_rows("consume", "flight_add_node_children"),
        ["Box<flight_sdk::Ref<dyn flight_sdk::Node>>"]
            .into_iter()
            .collect(),
        "an opaque handle slice consumes its element carrier"
    );
    assert_eq!(
        edge_rows("consume", "flight_resolve_color_adjustments_color_matrix"),
        ["Box<flight_sdk::Ref<dyn flight_sdk::Adjustment>>"]
            .into_iter()
            .collect(),
        "a c_void handle slice retains the exact dynamic trait carrier"
    );

    let node2d_accessors: Vec<_> = functions
        .iter()
        .filter(|(name, _)| {
            name.starts_with("flight_get_node2_dfields_")
                || name.starts_with("flight_set_node2_dfields_")
        })
        .collect();
    assert_eq!(node2d_accessors.len(), 22);
    assert!(node2d_accessors.iter().all(|(_, row)| {
        row.kind == "surface"
            && row.classification == "unreachable"
            && (row.blocker == "*const flight_sdk::Node2DFields"
                || row.blocker == "*mut flight_sdk::Node2DFields")
    }));

    // Item C: the per-payload connect wrappers produce an owned SignalConnection, so its
    // operations left the unreachable census.
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

    assert!(GENERATED_BASELINE.contains(
        "policy|host_capability|feature-gated native host crates supply borrowed Host*Capability carriers"
    ));
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
