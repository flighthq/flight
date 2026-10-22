use super::*;

#[test]
fn retains_first_detail_handle_and_severity_then_flushes_aggregates_in_first_occurrence_order() {
    let tallies = Arc::new(RwLock::new(Vec::new()));
    let first = gltf_diagnostic_numbers(&[("firstAccessor", 1.0)]);
    let fault = Arc::new(RwLock::new(GltfAccessorFault {
        detail: first.clone(),
        kind: "gltf.accessor-not-found".to_string(),
    }));
    report_gltf_accessor_fault(Some(&tallies), ImportDiagnosticSeverity::Recover, &fault);
    tally_gltf_numbers(
        Some(&tallies),
        ImportDiagnosticSeverity::Drop,
        "gltf.primitive-no-position",
        &[],
    );
    fault.write().unwrap().detail = gltf_diagnostic_numbers(&[("firstAccessor", 99.0)]);
    report_gltf_accessor_fault(Some(&tallies), ImportDiagnosticSeverity::Drop, &fault);
    set_record_value(
        &mut first.write().unwrap(),
        "firstAccessor".to_string(),
        2.0,
    );
    set_record_value(&mut first.write().unwrap(), "count".to_string(), 99.0);
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), Some(&tallies));
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics.len(), 2);
    assert_eq!(diagnostics[0].kind, "gltf.accessor-not-found");
    assert_eq!(diagnostics[0].origin, "buildGltfDocument");
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["firstAccessor"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(diagnostics[1].kind, "gltf.primitive-no-position");
}

#[test]
fn keeps_source_string_key_collisions_and_original_custom_detail_allocation() {
    let tallies = Arc::new(RwLock::new(Vec::new()));
    let detail = gltf_diagnostic_values(&[]);
    set_record_value(
        &mut detail.write().unwrap(),
        "firstUri".to_string(),
        ImportDiagnosticDetailValue::String("first.bin".to_string()),
    );
    tally_gltf_drop(
        Some(&tallies),
        ImportDiagnosticSeverity::Skip,
        "vendor|kind",
        "reason",
        GltfDiagnosticDetail::Values(GltfDiagnosticValues {
            value: detail.clone(),
        }),
    );
    tally_gltf_drop(
        Some(&tallies),
        ImportDiagnosticSeverity::Drop,
        "vendor",
        "kind|reason",
        GltfDiagnosticDetail::Numbers(GltfDiagnosticNumbers {
            value: gltf_diagnostic_numbers(&[]),
        }),
    );
    set_record_value(
        &mut detail.write().unwrap(),
        "firstUri".to_string(),
        ImportDiagnosticDetailValue::String("changed.bin".to_string()),
    );
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), Some(&tallies));
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].kind, "vendor|kind");
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["firstUri"],
        ImportDiagnosticDetailValue::String("changed.bin".to_string())
    );
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
}

#[test]
fn absent_collector_is_a_no_op_and_flushing_never_clears_existing_diagnostics() {
    tally_gltf_numbers(None, ImportDiagnosticSeverity::Drop, "not-emitted", &[]);
    let diagnostics = Arc::new(RwLock::new(vec![ImportDiagnostic {
        kind: "earlier".to_string(),
        origin: "parseGltfSource".to_string(),
        severity: ImportDiagnosticSeverity::Reject,
        detail: None,
    }]));
    flush_gltf_drops(Some(&diagnostics), None);
    flush_gltf_drops(None, None);
    assert_eq!(diagnostics.read().unwrap().len(), 1);
    let tallies = Arc::new(RwLock::new(Vec::new()));
    tally_gltf_numbers(
        Some(&tallies),
        ImportDiagnosticSeverity::Recover,
        "later",
        &[],
    );
    flush_gltf_drops(Some(&diagnostics), Some(&tallies));
    assert_eq!(diagnostics.read().unwrap()[0].kind, "earlier");
    assert_eq!(diagnostics.read().unwrap()[1].kind, "later");
}
