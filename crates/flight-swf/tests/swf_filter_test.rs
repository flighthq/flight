use std::sync::{Arc, Mutex, RwLock};

use flight_effects::contract::{
    BevelEffect, BevelType, BlurEffect, ConvolutionEffect, DropShadowEffect, EffectRef,
    GradientGlowEffect, InnerGlowEffect, InnerShadowEffect, OuterGlowEffect,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_swf::contract::*;

use crate::support::{join_bytes, reader};

mod read_swf_filter_list {
    use super::*;

    #[test]
    fn normalizes_only_the_color_matrix_bias_column() {
        let mut cells = Vec::new();
        for index in 0..20 {
            cells.push(float32(if index % 5 == 4 { 255.0 } else { 1.0 }));
        }
        let mut parts: Vec<&[u8]> = vec![&[1, 6]];
        for cell in &cells {
            parts.push(cell);
        }
        let result = read(join_bytes(&parts), None);
        assert!(result.effects.is_empty());
        assert_eq!(
            result.adjustments[0]
                .read()
                .unwrap()
                .adjustment_fields()
                .kind,
            "ColorMatrixAdjustment",
        );
        let matrix = result.adjustments[0]
            .read()
            .unwrap()
            .adjustment_fields()
            .color_matrix
            .unwrap();
        assert_eq!(matrix[0], 1.0);
        assert_eq!(matrix[4], 1.0);
        assert_eq!(matrix[9], 1.0);
    }

    #[test]
    fn reads_a_bevel_and_resolves_placement_flags() {
        let effect = read_bevel(0x10);
        let effect = typed_effect::<BevelEffect>(&effect);
        assert_eq!(effect.bevel_type, Some(BevelType::Full));
        assert_eq!(effect.shadow_color, Some(0x101010));
        assert_eq!(effect.highlight_color, Some(0xf0f0f0));
        assert_close(
            effect.highlight_alpha.unwrap(),
            0x40 as f32 / 0xff as f32,
            0.0,
        );
        let effect = read_bevel(0x80);
        assert_eq!(
            typed_effect::<BevelEffect>(&effect).bevel_type,
            Some(BevelType::Inner)
        );
        let effect = read_bevel(0);
        assert_eq!(
            typed_effect::<BevelEffect>(&effect).bevel_type,
            Some(BevelType::Outer)
        );
    }

    #[test]
    fn reads_a_blur() {
        let result = read(
            join_bytes(&[&[1, 1], &fixed(12.0), &fixed(3.0), &[0x60]]),
            None,
        );
        let effect = typed_effect::<BlurEffect>(&result.effects[0]);
        assert_eq!(effect.blur_x, Some(12.0));
        assert_eq!(effect.blur_y, Some(3.0));
    }

    #[test]
    fn reads_a_convolution_kernel_with_flags() {
        let result = read(
            join_bytes(&[
                &[1, 5, 2, 1],
                &float32(4.0),
                &float32(2.0),
                &float32(1.0),
                &float32(3.0),
                &rgba(0, 0, 0, 0xff),
                &[0x03],
            ]),
            None,
        );
        let effect = typed_effect::<ConvolutionEffect>(&result.effects[0]);
        assert_eq!(effect.bias, Some(2.0));
        assert_eq!(effect.clamp, Some(true));
        assert_eq!(effect.divisor, Some(4.0));
        assert_eq!(effect.matrix, vec![1.0, 3.0]);
        assert_eq!(effect.matrix_x, 2.0);
        assert_eq!(effect.matrix_y, 1.0);
        assert_eq!(effect.preserve_alpha, Some(true));
    }

    #[test]
    fn reads_a_drop_shadow_with_degrees_color_and_alpha() {
        let result = read(
            join_bytes(&[
                &[1, 0],
                &rgba(0x11, 0x22, 0x33, 0x80),
                &fixed(4.0),
                &fixed(6.0),
                &fixed(std::f32::consts::PI / 2.0),
                &fixed(10.0),
                &fixed8(1.5),
                &[3],
            ]),
            None,
        );
        let effect = typed_effect::<DropShadowEffect>(&result.effects[0]);
        assert_eq!(effect.color, Some(0x112233));
        assert_close(effect.alpha.unwrap(), 0x80 as f32 / 0xff as f32, 0.0);
        assert_close(effect.angle.unwrap(), 90.0, 0.0005);
        assert_eq!(effect.blur_x, Some(4.0));
        assert_eq!(effect.blur_y, Some(6.0));
        assert_eq!(effect.distance, Some(10.0));
        assert_eq!(effect.quality, Some(3.0));
        assert_eq!(effect.strength, Some(1.5));
    }

    #[test]
    fn reads_a_gradient_glow_ramp_after_the_whole_color_table() {
        let result = read(
            join_bytes(&[
                &[1, 4, 2],
                &rgba(0xff, 0, 0, 0),
                &rgba(0, 0, 0xff, 0xff),
                &[0, 255],
                &fixed(6.0),
                &fixed(6.0),
                &fixed(0.0),
                &fixed(0.0),
                &fixed8(1.0),
                &[0],
            ]),
            None,
        );
        let effect = typed_effect::<GradientGlowEffect>(&result.effects[0]);
        assert_eq!(effect.colors, vec![0xff0000, 0x0000ff]);
        assert_eq!(effect.alphas, vec![0.0, 1.0]);
        assert_eq!(effect.ratios, vec![0.0, 255.0]);
    }

    #[test]
    fn reads_an_empty_list() {
        let result = read(vec![0], None);
        assert!(result.complete);
        assert!(result.adjustments.is_empty());
        assert!(result.effects.is_empty());
    }

    #[test]
    fn reports_only_unrepresentable_blur_pass_counts() {
        let mut diagnostics = Vec::new();
        let result = read(
            join_bytes(&[&[1, 1], &fixed(4.0), &fixed(4.0), &[3]]),
            Some(&mut diagnostics),
        );
        assert!(result.complete);
        assert_filter_diagnostic(&diagnostics, "passes", 1);

        diagnostics.clear();
        let _ = read(
            join_bytes(&[&[1, 1], &fixed(4.0), &fixed(4.0), &[1]]),
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_only_unrepresentable_gradient_glow_placement() {
        let mut diagnostics = Vec::new();
        let _ = read(
            read_glow_bytes(fixed(45.0), fixed(4.0)),
            Some(&mut diagnostics),
        );
        assert_filter_diagnostic(&diagnostics, "placement", 4);

        diagnostics.clear();
        let _ = read(
            read_glow_bytes(fixed(0.0), fixed(0.0)),
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn splits_glows_by_the_inner_flag() {
        let outer = read_glow(1);
        let inner = read_glow(0x81);
        let outer = typed_effect::<OuterGlowEffect>(&outer);
        assert_eq!(outer.alpha, Some(1.0));
        assert_eq!(outer.color, Some(0xff0000));
        assert_eq!(outer.strength, Some(2.0));
        assert!(typed_effect::<InnerGlowEffect>(&inner).alpha.is_some());
    }

    #[test]
    fn stops_at_an_unknown_filter_without_reading_later_bytes() {
        let result = read(
            join_bytes(&[
                &[2, 1],
                &fixed(1.0),
                &fixed(1.0),
                &[0],
                &[9],
                &fixed(1.0),
                &fixed(1.0),
            ]),
            None,
        );
        assert!(!result.complete);
        assert_eq!(result.effects.len(), 1);
        typed_effect::<BlurEffect>(&result.effects[0]);
    }

    #[test]
    fn stops_on_a_truncated_filter_body_without_inventing_an_effect() {
        let result = read(join_bytes(&[&[1, 0], &rgba(1, 2, 3, 4), &fixed(1.0)]), None);
        assert!(!result.complete);
        assert!(result.effects.is_empty());
    }

    #[test]
    fn keeps_an_inner_drop_shadow_directional() {
        let result = read(
            join_bytes(&[
                &[1, 0],
                &rgba(0, 0, 0, 0xff),
                &fixed(2.0),
                &fixed(2.0),
                &fixed(std::f32::consts::PI / 2.0),
                &fixed(8.0),
                &fixed8(1.0),
                &[0x82],
            ]),
            None,
        );
        let effect = typed_effect::<InnerShadowEffect>(&result.effects[0]);
        assert_close(effect.angle.unwrap(), 90.0, 0.0005);
        assert_eq!(effect.blur_x, Some(2.0));
        assert_eq!(effect.blur_y, Some(2.0));
        assert_eq!(effect.distance, Some(8.0));
        assert_eq!(effect.quality, Some(2.0));
    }
}

mod set_swf_filter_list_guard {
    use super::*;

    #[test]
    fn routes_unknown_filters_only_while_installed() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let callback_seen = seen.clone();
        let guard_state = guard_state();
        set_swf_filter_list_guard(
            &guard_state,
            Some(Arc::new(move |filter_id, filter_index| {
                callback_seen
                    .lock()
                    .unwrap()
                    .extend([filter_id, filter_index]);
            })),
        );
        let bytes = join_bytes(&[&[2, 1], &fixed(4.0), &fixed(2.0), &[0], &[0xfe, 13]]);
        let result = read_with_guards(&guard_state, bytes.clone(), None);
        assert!(!result.complete);
        assert_eq!(result.effects.len(), 1);
        typed_effect::<BlurEffect>(&result.effects[0]);
        assert_eq!(*seen.lock().unwrap(), vec![0xfe, 1]);

        set_swf_filter_list_guard(&guard_state, None);
        seen.lock().unwrap().clear();
        assert!(!read_with_guards(&guard_state, bytes, None).complete);
        assert!(seen.lock().unwrap().is_empty());
    }
}

struct ReadResult {
    adjustments: Vec<SwfAdjustmentRef>,
    complete: bool,
    effects: Vec<EffectRef>,
}

fn assert_close(actual: f32, expected: f32, source_bound: f32) {
    let roundoff = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    let bound = source_bound.max(roundoff);
    assert!(
        (actual - expected).abs() <= bound,
        "actual={actual}, expected={expected}, bound={bound}"
    );
}

fn assert_filter_diagnostic(diagnostics: &[ImportDiagnostic], field: &str, filter_id: u8) {
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].kind, "swf.filter-field-unrepresentable");
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
    let detail = diagnostics[0].detail.as_ref().unwrap();
    assert_eq!(detail.len(), 3);
    assert_eq!(
        detail.get("capability"),
        Some(&ImportDiagnosticDetailValue::String(
            "swf.placement.filter-list".to_string()
        ))
    );
    assert_eq!(
        detail.get("field"),
        Some(&ImportDiagnosticDetailValue::String(field.to_string()))
    );
    assert_eq!(
        detail.get("filterId"),
        Some(&ImportDiagnosticDetailValue::Number(f32::from(filter_id)))
    );
}

fn fixed(value: f32) -> [u8; 4] {
    return ((value * 0x10000 as f32).round() as i32).to_le_bytes();
}

fn fixed8(value: f32) -> [u8; 2] {
    return ((value * 0x100 as f32).round() as i16).to_le_bytes();
}

fn float32(value: f32) -> [u8; 4] {
    return value.to_le_bytes();
}

fn read(bytes: Vec<u8>, diagnostics: Option<&mut Vec<ImportDiagnostic>>) -> ReadResult {
    return read_with_guards(&guard_state(), bytes, diagnostics);
}

fn read_with_guards(
    guard_state: &SwfGuardStateRef,
    bytes: Vec<u8>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> ReadResult {
    let mut source = reader(bytes);
    let mut adjustments = Vec::new();
    let mut effects = Vec::new();
    let complete = read_swf_filter_list(
        guard_state,
        &mut source,
        &mut effects,
        &mut adjustments,
        diagnostics,
    );
    return ReadResult {
        adjustments,
        complete,
        effects,
    };
}

fn guard_state() -> SwfGuardStateRef {
    return Arc::new(RwLock::new(SwfGuardState {
        enabled: false,
        filter_list_guard: None,
    }));
}

fn read_bevel(flags: u8) -> EffectRef {
    return read(
        join_bytes(&[
            &[1, 3],
            &rgba(0x10, 0x10, 0x10, 0xff),
            &rgba(0xf0, 0xf0, 0xf0, 0x40),
            &fixed(3.0),
            &fixed(3.0),
            &fixed(0.0),
            &fixed(4.0),
            &fixed8(1.0),
            &[flags],
        ]),
        None,
    )
    .effects
    .remove(0);
}

fn read_glow(flags: u8) -> EffectRef {
    return read(
        join_bytes(&[
            &[1, 2],
            &rgba(0xff, 0, 0, 0xff),
            &fixed(5.0),
            &fixed(5.0),
            &fixed8(2.0),
            &[flags],
        ]),
        None,
    )
    .effects
    .remove(0);
}

fn read_glow_bytes(angle: [u8; 4], distance: [u8; 4]) -> Vec<u8> {
    return join_bytes(&[
        &[1, 4, 2],
        &rgba(0xff, 0, 0, 0),
        &rgba(0, 0, 0xff, 0xff),
        &[0, 255],
        &fixed(6.0),
        &fixed(6.0),
        &angle,
        &distance,
        &fixed8(1.0),
        &[0],
    ]);
}

fn rgba(red: u8, green: u8, blue: u8, alpha: u8) -> [u8; 4] {
    return [red, green, blue, alpha];
}

fn typed_effect<T: Clone + 'static>(effect: &EffectRef) -> T {
    let guard = effect.read().unwrap();
    return guard.as_any().downcast_ref::<T>().unwrap().clone();
}
