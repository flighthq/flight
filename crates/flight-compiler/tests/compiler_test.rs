use flight_compiler::{
    SourceMode, compile_typescript, compile_typescript_with_alias_sources, compile_vitest,
    compile_vitest_with_alias_sources, source_mode,
};

mod source_modes {
    use super::*;

    #[test]
    fn reads_source_local_generation_modes() {
        assert_eq!(
            source_mode("pub fn portable() {}\n").unwrap(),
            SourceMode::Generate
        );
        assert_eq!(
            source_mode("//! flight-compiler: target-native\npub fn native() {}\n").unwrap(),
            SourceMode::TargetNative
        );
        assert_eq!(
            source_mode("//! flight-compiler: rust-only — native threads\npub fn rust() {}\n")
                .unwrap(),
            SourceMode::RustOnly
        );
        assert_eq!(
            source_mode("//! flight-compiler: companion widget.ts\npub fn portable() {}\n")
                .unwrap(),
            SourceMode::Generate
        );
        assert_eq!(
            source_mode(
                "//! flight-compiler: callable-parameters EasingFunction t\npub type EasingFunction = fn(f32) -> f32;\n"
            )
            .unwrap(),
            SourceMode::Generate
        );
    }

    #[test]
    fn rejects_unknown_source_directives() {
        let error =
            source_mode("//! flight-compiler: targt-native\npub fn native() {}\n").unwrap_err();
        assert_eq!(
            error.to_string(),
            "unknown `flight-compiler` source directive `targt-native`"
        );
    }

    #[test]
    fn refuses_to_compile_an_explicit_target_native_source() {
        let error = compile_typescript(
            "//! flight-compiler: target-native\npub fn native() {}\n",
            None,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "source is marked `flight-compiler: target-native`; preserve its target-native TypeScript file"
        );
    }
}

mod compile_typescript {
    use super::*;

    #[test]
    fn emits_entity_raw_contracts_and_free_functions_without_like_types() {
        let source = r#"
use flight_entity::{EntityRuntimeSlot, allocate_entity};

pub struct Vector2 {
    runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
}

pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    let mut out: Vector2 = allocate_entity();
    initialize_vector2(&mut out, x, y);
    return out;
}

pub fn initialize_vector2(out: &mut Vector2, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}

pub fn add_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + bx;
    out.y = ay + by;
}

impl Vector2 {
    pub fn add(&mut self, other: &Self) {
        let source = self.clone();
        add_vector2(self, &source, other);
    }
}

flight_entity::impl_entity!(Vector2);
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert_eq!(
            output,
            r#"import { allocateEntity } from "@flighthq/entity/contract";
import type { EntityRaw } from "@flighthq/entity/contract";

export interface Vector2Raw extends EntityRaw {
  x: number;
  y: number;
}

export function createVector2(x: number, y: number): Vector2Raw {
  let out: Vector2Raw = allocateEntity<Vector2Raw>();
  initializeVector2(out, x, y);
  return out;
}

export function initializeVector2(out: Vector2Raw, x: number, y: number): void {
  out.x = x;
  out.y = y;
}

export function addVector2(out: Vector2Raw, a: Readonly<Vector2Raw>, b: Readonly<Vector2Raw>): void {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  out.x = ax + bx;
  out.y = ay + by;
}
"#
        );
        assert!(!output.contains("Like"));
        assert!(!output.contains("add(other"));
    }

    #[test]
    fn maps_trailing_options_to_optional_undefined_contracts() {
        let source = r#"
pub struct Vector2 {
    runtime: EntityRuntimeSlot,
    pub x: f32,
}

pub fn equals_vector2(a: Option<&Vector2>, b: Option<&Vector2>) -> bool {
    return a == b;
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "export function equalsVector2(a?: Readonly<Vector2Raw>, b?: Readonly<Vector2Raw>): boolean"
        ));
    }

    #[test]
    fn lowers_fully_qualified_entity_allocation_to_the_imported_hook() {
        let source = r#"
pub struct Vector2 {
    runtime: EntityRuntimeSlot,
    pub x: f32,
}

pub fn create_vector2() -> Vector2 {
    let out: Vector2 = flight_entity::allocate_entity();
    return out;
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains("import { allocateEntity } from \"@flighthq/entity/contract\";"));
        assert!(output.contains("const out: Vector2Raw = allocateEntity<Vector2Raw>();"));
        assert!(!output.contains("flightEntity.allocateEntity"));
    }

    #[test]
    fn emits_documented_native_signatures_aliases_and_throws() {
        let source = r#"
use std::sync::{Arc, Mutex, PoisonError};

/// A callable random source.
pub type RandomSource = Arc<dyn Fn() -> f32 + Send + Sync>;

/// Return a `random_sample`, or `None` when no mean is present.
///
/// Panics when the mean is invalid.
pub fn sample(random: &dyn Fn() -> f32, mean: Option<f32>) -> Option<f32> {
    if mean.is_none() {
        throw_range_error("sample: mean is required");
    }
    return Some(random() + mean.unwrap());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "/**\n * A callable random source.\n */\nexport type RandomSource = () => number;"
        ));
        assert!(output.contains(
            "/**\n * Return a `randomSample`, or `undefined` when no mean is present.\n *\n * Throws when the mean is invalid.\n */\nexport function sample(random: RandomSource, mean?: number): number | undefined"
        ));
        assert!(output.contains(
            "if (mean === undefined) {\n    throw new RangeError(\"sample: mean is required\");\n  }"
        ));
        assert!(!output.contains("(() =>"));
    }

    #[test]
    fn lowers_easing_contract_shapes_without_package_postprocessing() {
        let source = r#"
//! flight-compiler: callable-parameters EasingFunction t
//! flight-compiler: callable-parameters ScalarRemap x
//! flight-compiler: callable-parameters EasingStepsGuard count position
//! flight-compiler: readonly-fields EasingSegment
//! flight-compiler: string-union StepPosition

use std::sync::Arc;

pub type EasingFunction = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

pub type ScalarRemap = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

pub enum StepPosition {
    JumpStart,
    JumpEnd,
}

pub struct EasingSegment {
    pub ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
    pub weight: Option<f32>,
}

pub type EasingStepsGuard = Arc<dyn Fn(i32, StepPosition) + Send + Sync>;

pub fn run_easing_steps_guard() {
    if true {
        let guard = STEPS_GUARD.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some(guard) = guard {
            guard(2, StepPosition::JumpEnd);
        }
    }
}

pub fn ease_steps(count: i32, position: Option<StepPosition>) -> [f32; 2] {
    return [0.0_f32; 2];
}

pub fn set_easing_steps_guard(guard: Option<EasingStepsGuard>) {
    let mut slot = STEPS_GUARD.lock().unwrap_or_else(PoisonError::into_inner);
    *slot = guard;
}

static STEPS_GUARD: Mutex<Option<EasingStepsGuard>> = Mutex::new(None);
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type EasingFunction = (t: number) => number;"));
        assert!(output.contains("export type ScalarRemap = (x: number) => number;"));
        assert!(output.contains(
            "export type EasingStepsGuard = (count: number, position: StepPosition) => void;"
        ));
        assert!(output.contains("export type StepPosition = \"jumpStart\" | \"jumpEnd\";"));
        assert!(output.contains("  readonly ease: EasingFunction;"));
        assert!(output.contains("  readonly weight?: number;"));
        assert!(output.contains(
            "export function easeSteps(count: number, position?: StepPosition): Float32Array"
        ));
        assert!(output.contains("return new Float32Array(2).fill(0.0);"));
        assert!(
            output.contains(
                "export function setEasingStepsGuard(guard: EasingStepsGuard | null): void"
            )
        );
        assert!(output.contains("if (guard !== null) {"));
        assert!(!output.contains("if (guard !== undefined) {"));
        assert!(
            output.contains(
                "const STEPS_GUARD: { value: EasingStepsGuard | null } = { value: null };"
            )
        );
        assert!(output.contains("slot.value = guard;"));
        assert!(output.contains("guard(2, \"jumpEnd\");"));
        assert!(!output.contains("StepPosition.JumpEnd"));
    }

    #[test]
    fn preserves_default_callable_parameter_names_without_a_directive() {
        let source = r#"
use std::sync::Arc;

pub type ScalarRemap = Arc<dyn Fn(f32, f32) -> f32 + Send + Sync>;
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("export type ScalarRemap = (arg0: number, arg1: number) => number;")
        );
    }

    #[test]
    fn rejects_malformed_callable_parameter_directives() {
        let cases = [
            (
                "//! flight-compiler: callable-parameters\npub type Remap = fn(f32) -> f32;\n",
                "`flight-compiler: callable-parameters` requires an alias name",
            ),
            (
                "//! flight-compiler: callable-parameters Missing x\npub type Remap = fn(f32) -> f32;\n",
                "`flight-compiler: callable-parameters` alias `Missing` does not exist",
            ),
            (
                "//! flight-compiler: callable-parameters Scalar value\npub type Scalar = f32;\n",
                "`flight-compiler: callable-parameters` alias `Scalar` is not callable",
            ),
            (
                "//! flight-compiler: callable-parameters Remap x\npub type Remap = fn(f32, f32) -> f32;\n",
                "`flight-compiler: callable-parameters` alias `Remap` expects 2 parameter names, got 1",
            ),
            (
                "//! flight-compiler: callable-parameters Remap x\n//! flight-compiler: callable-parameters Remap value\npub type Remap = fn(f32) -> f32;\n",
                "duplicate `flight-compiler: callable-parameters` directive for alias `Remap`",
            ),
            (
                "//! flight-compiler: callable-parameters Remap x-y\npub type Remap = fn(f32) -> f32;\n",
                "`flight-compiler: callable-parameters Remap` parameter name `x-y` is not a valid identifier",
            ),
            (
                "//! flight-compiler: callable-parameters Remap x x\npub type Remap = fn(f32, f32) -> f32;\n",
                "`flight-compiler: callable-parameters Remap` repeats parameter name `x`",
            ),
        ];

        for (source, expected) in cases {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                expected
            );
        }
    }

    #[test]
    fn lowers_raw_identifiers_and_preserves_nullish_precedence() {
        let source = r#"
pub fn scaled(r#override: Option<f32>) -> f32 {
    return r#override.unwrap_or(12.0) * 0.185;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export function scaled(override?: number): number"));
        assert!(output.contains("return (override ?? 12.0) * 0.185;"));
        assert!(!output.contains("r#override"));
    }

    #[test]
    fn reuses_callable_aliases_declared_by_sibling_sources() {
        let aliases = r#"
use std::sync::Arc;

pub type EasingFunction = Arc<dyn Fn(f32) -> f32 + Send + Sync>;
"#;
        let source = r#"
pub fn get_easing_derivative(ease: &dyn Fn(f32) -> f32, t: f32) -> f32 {
    return ease(t);
}
"#;

        let output = compile_typescript_with_alias_sources(source, None, &[aliases]).unwrap();

        assert!(output.contains(
            "export function getEasingDerivative(ease: EasingFunction, t: number): number"
        ));
    }

    #[test]
    fn keeps_vec_containers_mutable_when_their_elements_are_readonly_tuples() {
        let source = r#"
use std::sync::Arc;

pub type EasingFunction = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

pub fn append_segment(
    segments: &mut Vec<(EasingFunction, f32, f32)>,
    segment: (EasingFunction, f32, f32),
) {
    segments.push(segment);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("segments: Array<readonly [EasingFunction, number, number]>"));
        assert!(output.contains("segment: readonly [EasingFunction, number, number]"));
        assert!(output.contains("segments.push(segment);"));
        assert!(!output.contains("readonly [EasingFunction, number, number][]"));
    }

    #[test]
    fn passes_null_to_nullable_contracts_declared_by_sibling_sources() {
        let aliases = r#"
use std::sync::Arc;

pub type EasingStepsGuard = Arc<dyn Fn(i32) + Send + Sync>;

pub fn set_easing_steps_guard(guard: Option<EasingStepsGuard>) {}
"#;
        let source = r#"
pub fn disable_easing_guards() {
    set_easing_steps_guard(None);
}
"#;

        let output = compile_typescript_with_alias_sources(source, None, &[aliases]).unwrap();

        assert!(output.contains("setEasingStepsGuard(null);"));
        assert!(!output.contains("setEasingStepsGuard(undefined);"));
    }

    #[test]
    fn refuses_unsupported_public_contract_items() {
        let source = r#"
pub enum Axis {
    Named { value: i32 },
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "unsupported enum variant `Axis::Named`; only unit variants without explicit discriminants are portable"
        );
    }
}

mod compile_vitest {
    use super::*;

    #[test]
    fn emits_free_function_contract_tests_and_helpers() {
        let source = r#"
use flight_geometry::*;

fn assert_positive(value: f32) {
    assert!(value > 0.0);
}

mod add_vector2 {
    use super::*;

    #[test]
    fn adds_two_coordinates() {
        let a = create_vector2(2.0, 10.0);
        let b = create_vector2(4.0, 20.0);
        let mut result = create_vector2(0.0, 0.0);
        add_vector2(&mut result, &a, &b);
        assert_eq!(result.x, 6.0);
        assert_positive(result.y);
    }
}

mod equals_vector2 {
    use super::*;

    #[test]
    fn accepts_optional_borrows() {
        let a = create_vector2(1.0, 2.0);
        assert!(equals_vector2(Some(&a), Some(&a)));
    }
}

mod create_vector2_tests {
    use super::*;

    #[test]
    fn creates_coordinates() {
        let value = create_vector2(1.0, 2.0);
        assert_eq!(value.x, 1.0);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/geometry/contract").unwrap();

        assert_eq!(
            output,
            r#"import { describe, expect, it } from 'vitest';

import {
  addVector2,
  createVector2,
  equalsVector2,
} from "@flighthq/geometry/contract";

function assertPositive(value: number): void {
  expect(value > 0.0).toBe(true);
}

describe("addVector2", () => {
  it("adds two coordinates", () => {
    const a = createVector2(2.0, 10.0);
    const b = createVector2(4.0, 20.0);
    let result = createVector2(0.0, 0.0);
    addVector2(result, a, b);
    expect(result.x).toEqual(6.0);
    assertPositive(result.y);
  });
});

describe("equalsVector2", () => {
  it("accepts optional borrows", () => {
    const a = createVector2(1.0, 2.0);
    expect(equalsVector2(a, a)).toBe(true);
  });
});

describe("createVector2", () => {
  it("creates coordinates", () => {
    const value = createVector2(1.0, 2.0);
    expect(value.x).toEqual(1.0);
  });
});
"#
        );
    }

    #[test]
    fn preserves_a_callable_name_that_genuinely_ends_in_tests() {
        let source = r#"
use flight_interaction::*;

mod register_default_hit_tests {
    use super::*;

    #[test]
    fn registers_defaults() {
        register_default_hit_tests();
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/interaction/contract").unwrap();

        assert!(output.contains("describe(\"registerDefaultHitTests\""));
    }

    #[test]
    fn emits_should_panic_as_to_throw() {
        let source = r#"
use flight_geometry::*;

mod normalize_vector2 {
    use super::*;

    #[test]
    #[should_panic]
    fn rejects_invalid_input() {
        normalize_vector2(None);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/geometry/contract").unwrap();

        assert!(
            output
                .contains("expect(() => {\n      normalizeVector2(undefined);\n    }).toThrow();")
        );
    }

    #[test]
    fn refuses_impl_sugar_tests() {
        let source = r#"
use flight_geometry::*;

impl Vector2 {
    fn test_add() {}
}
"#;

        let error = compile_vitest(source, "@flighthq/geometry/contract").unwrap_err();

        assert_eq!(
            error.to_string(),
            "Rust impl blocks are sugar and cannot be a portable test source"
        );
    }

    #[test]
    fn lowers_typed_arrays_float_constants_and_table_driven_loops() {
        let source = r#"
use flight_geometry::*;

mod write_vector2_to_float32_array {
    use super::*;

    #[test]
    fn writes_each_case() {
        let cases: &[([f32; 2], f32)] = &[
            ([1.0, 2.0], 3.0),
        ];
        for &(value, expected) in cases {
            let mut out = [0.0_f32; 2];
            write_vector2_to_float32_array(&mut out, 0, &create_vector2(value[0], value[1]));
            assert_eq!(out[0] + out[1], expected);
            assert_eq!(out, [1.0, 2.0]);
            assert!((out[0] - 3.0_f32.sqrt() / 2.0).abs() < 5e-13);
            assert!(f32::NAN.is_nan());
        }
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/geometry/contract").unwrap();

        assert!(output.contains(
            "const cases: Readonly<Array<readonly [Float32Array, number]>> = [[new Float32Array([1.0, 2.0]), 3.0]];"
        ));
        assert!(output.contains("for (const [value, expected] of cases) {"));
        assert!(output.contains("let out = new Float32Array(2).fill(0.0);"));
        assert!(output.contains("expect(Array.from(out)).toEqual([1.0, 2.0]);"));
        assert!(output.contains(
            "expect(Math.abs(out[0] - Math.fround(Math.sqrt(3.0) / 2.0)) < 5e-13).toBe(true);"
        ));
        assert!(output.contains("expect(Number.isNaN(Number.NaN)).toBe(true);"));
    }

    #[test]
    fn simplifies_inclusive_assertion_comparisons() {
        let source = r#"
use flight_math::*;

mod hash_uint32 {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let value = hash_uint32(42);
        assert!(value > 0 || value == 0);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/math/contract").unwrap();

        assert!(output.contains("expect(value >= 0).toBe(true);"));
        assert!(!output.contains("value > 0 || value === 0"));
    }

    #[test]
    fn imports_contract_enum_objects_used_by_portable_tests() {
        let source = r#"
use flight_entity::*;

mod explain {
    use super::*;

    #[test]
    fn names_the_slot() {
        assert_eq!(explain(EntityRuntimeWriteSlot::BindingSlot), "binding-slot");
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/entity/contract").unwrap();

        assert!(output.contains("  EntityRuntimeWriteSlot,"));
        assert!(output.contains("explain(EntityRuntimeWriteSlot.BindingSlot)"));
    }

    #[test]
    fn lowers_qualified_string_union_variants_without_runtime_imports() {
        let source = r#"
//! flight-compiler: string-union StepPosition

use flight_easing::*;

mod ease_steps {
    use super::*;

    #[test]
    fn accepts_a_qualified_position() {
        assert_eq!(ease_steps(4, Some(StepPosition::JumpEnd)), 1.0);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/easing/contract").unwrap();

        assert!(!output.contains("  StepPosition,"));
        assert!(output.contains("easeSteps(4, \"jumpEnd\")"));
        assert!(!output.contains("StepPosition.JumpEnd"));
    }

    #[test]
    fn inherits_string_union_directives_from_production_sources() {
        let production = r#"
//! flight-compiler: string-union StepPosition

pub enum StepPosition {
    JumpStart,
    JumpEnd,
}
"#;
        let source = r#"
use flight_easing::*;

mod ease_steps {
    use super::*;

    #[test]
    fn accepts_a_qualified_position() {
        assert_eq!(ease_steps(4, Some(StepPosition::JumpEnd)), 1.0);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/easing/contract", &[production])
                .unwrap();

        assert!(!output.contains("  StepPosition,"));
        assert!(output.contains("easeSteps(4, \"jumpEnd\")"));
        assert!(!output.contains("StepPosition.JumpEnd"));
    }

    #[test]
    fn infers_fixed_f32_buffers_and_assigned_callback_parameters() {
        let production = r#"
pub fn write_easing_samples(out: &mut Float32Array, ease: &dyn Fn(f32) -> f32) {}
pub fn read_easing_samples(samples: &[f32]) {}
"#;
        let source = r#"
use flight_easing::*;

mod write_easing_samples {
    use super::*;

    #[test]
    fn writes_samples() {
        let mut out = [0.0; 4];
        let ease = |t| t * t;
        write_easing_samples(&mut out, &ease);

        let samples = [0.0, 0.5, 1.0];
        read_easing_samples(&samples);
        assert_eq!(out[0], 0.0);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/easing/contract", &[production])
                .unwrap();

        assert!(output.contains("let out = new Float32Array(4).fill(0.0);"));
        assert!(output.contains("const ease = (t: number) => t * t;"));
        assert!(output.contains("writeEasingSamples(out, ease);"));
        assert!(output.contains("const samples = [0.0, 0.5, 1.0];"));
        assert!(output.contains("readEasingSamples(samples);"));
        assert!(!output.contains("const samples = new Float32Array"));
    }

    #[test]
    fn preserves_readonly_tuple_elements_inside_readonly_slice_parameters() {
        let source = r#"
use std::sync::Arc;
use flight_easing::*;

type Ease = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

fn assert_families(families: &[(&str, Ease)]) {
    assert_eq!(families.len(), 1);
}

mod easing_families {
    use super::*;

    #[test]
    fn accepts_a_family_table() {
        let families = [("Linear", Arc::new(|t: f32| t))];
        assert_families(&families);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/easing/contract").unwrap();

        assert!(output.contains(
            "function assertFamilies(families: Readonly<Array<readonly [string, Ease]>>): void"
        ));
        assert!(!output.contains("Readonly<readonly [string, Ease][]>"));
    }

    #[test]
    fn does_not_import_struct_names_for_plain_object_literals() {
        let source = r#"
use flight_easing::*;

mod ease_piecewise {
    use super::*;

    #[test]
    fn accepts_segments() {
        let segment = EasingSegment { ease: ease_linear, weight: Some(1.0) };
        assert_eq!(segment.weight, Some(1.0));
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/easing/contract").unwrap();

        assert!(!output.contains("  EasingSegment,"));
        assert!(output.contains("const segment = { ease: easeLinear, weight: 1.0 };"));
        assert!(output.contains("  easeLinear,"));
    }

    #[test]
    fn lowers_top_level_tests_nested_helpers_and_value_blocks() {
        let source = r#"
use flight_math::*;

#[test]
fn accepts_a_top_level_test() {
    assert_eq!({
        let value = 2;
        value * 2
    }, 4);
}

mod nested_helper {
    use super::*;

    fn doubled(value: i32) -> i32 {
        return value * 2;
    }

    #[test]
    fn calls_the_scoped_helper() {
        assert_eq!(doubled(3), 6);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/math/contract").unwrap();

        assert!(output.contains("describe(\"portableTests\""));
        assert!(output.contains("return value * 2;\n})()"));
        assert!(output.contains("  function doubled(value: number): number"));
        assert!(output.contains("expect(doubled(3)).toEqual(6);"));
        assert!(!output.contains("doubled,"));
    }

    #[test]
    fn lowers_top_level_portable_test_aliases_records_and_constants() {
        let source = r#"
use std::sync::Arc;
use flight_easing::*;

type Ease = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

struct Family {
    ease_in: Ease,
    name: &'static str,
}

const EPSILON: f32 = 1e-5;

fn family() -> Family {
    return Family { ease_in: Arc::new(ease_linear), name: "Linear" };
}

fn samples() -> Vec<f32> {
    let values: Vec<f32> = (0..=2).map(|index| index as f32).collect();
    return values.iter().map(|&value| value / 2.0).collect();
}

mod easing_family {
    use super::*;

    #[test]
    fn describes_the_family() {
        let value = family();
        assert_eq!(value.name, "Linear");
        assert!((value.ease_in)(0.0) < EPSILON);
        let positive = samples().into_iter().filter(|value| *value > 0.0).collect();
        assert_eq!(positive.iter().skip(1).collect(), vec![1.0]);
        assert!(positive.iter().all(|value| *value > 0.0));
        assert!(positive.iter().any(|value| *value == 1.0));
        assert_eq!(*positive.iter().find(|value| **value == 1.0).expect("sample"), 1.0);
        assert_eq!(positive.iter().fold(0.0, |sum, value| sum + value), 1.5);
        assert_eq!(samples().windows(2).len(), 2);
        let curves = vec![("Linear", value.ease_in.clone())];
        assert_eq!(curves[0].0, "Linear");
        let family = curves.iter().find(|family| family.0 == "Linear").expect("family");
        let minimum = samples().iter().fold(f32::INFINITY, f32::min);
        let maximum = samples().iter().fold(f32::NEG_INFINITY, f32::max);
        assert!(minimum <= maximum);
        assert!(samples().windows(2).any(|pair| pair[1] >= pair[0]));
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/easing/contract").unwrap();

        assert!(output.contains("type Ease = (arg0: number) => number;"));
        assert!(output.contains("interface Family {\n  easeIn: Ease;\n  name: string;\n}"));
        assert!(output.contains("const EPSILON: number = 1e-5;"));
        assert!(output.contains("function family(): Family"));
        assert!(output.contains(
            "const values: number[] = (Array.from({ length: 2 - 0 + 1 }, (_, index) => 0 + index)).map((index) => index);"
        ));
        assert!(output.contains("return values.map((value) => value / 2.0);"));
        assert!(output.contains("expect(value.name).toEqual(\"Linear\");"));
        assert!(output.contains("const positive = samples().filter((value) => value > 0.0);"));
        assert!(output.contains("expect(positive.slice(1)).toEqual([1.0]);"));
        assert!(output.contains("expect(curves[0][0]).toEqual(\"Linear\");"));
        assert!(output.contains("const family = (() => { const value = curves.find((family) => family[0] === \"Linear\");"));
        assert!(output.contains(
            "samples().reduce((left, right) => Math.min(left, right), Number.POSITIVE_INFINITY)"
        ));
        assert!(output.contains(
            "samples().reduce((left, right) => Math.max(left, right), Number.NEGATIVE_INFINITY)"
        ));
        assert!(!output.contains("  pair,"));
        assert!(!output.contains("  EPSILON,"));
        assert!(!output.contains("  Family,"));
    }
}
