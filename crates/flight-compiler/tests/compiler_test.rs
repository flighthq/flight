use flight_compiler::{
    ExternalAliasSource, SourceMode, compile_typescript, compile_typescript_with_alias_sources,
    compile_typescript_with_external_alias_sources, compile_vitest,
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
        assert_eq!(
            source_mode(
                "//! flight-compiler: data-union RectangleId\npub enum RectangleId { Number(i32), Text(String) }\n"
            )
            .unwrap(),
            SourceMode::Generate
        );
        assert_eq!(
            source_mode(
                "//! flight-compiler: target-native\n//! flight-compiler: identity-alias Marker descriptor\npub type Marker<T> = T;\n"
            )
            .unwrap(),
            SourceMode::TargetNative
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
  let out: Vector2Raw = Object.assign(allocateEntity<Vector2Raw>(), { x: 0, y: 0 });
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

pub fn allocate_vector2() -> Vector2 {
    return flight_entity::allocate_entity();
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains("import { allocateEntity } from \"@flighthq/entity/contract\";"));
        assert!(output.contains(
            "const out: Vector2Raw = Object.assign(allocateEntity<Vector2Raw>(), { x: 0 });"
        ));
        assert!(output.contains("return Object.assign(allocateEntity<Vector2Raw>(), { x: 0 });"));
        assert!(!output.contains("flightEntity.allocateEntity"));
    }

    #[test]
    fn lowers_direct_entity_allocation_with_a_sibling_raw_owner() {
        let linear_color = r#"
use flight_entity::EntityRuntimeSlot;

pub struct LinearColor {
    runtime: EntityRuntimeSlot,
    pub red: f32,
    pub green: f32,
    pub blue: f32,
    pub alpha: f32,
}

flight_entity::impl_entity!(LinearColor);
"#;
        let factory = r#"
pub fn allocate_linear_color() -> LinearColor {
    return flight_entity::allocate_entity();
}
"#;

        let output = compile_typescript_with_alias_sources(
            factory,
            Some("@flighthq/entity/contract"),
            &[linear_color],
        )
        .unwrap();

        assert!(output.contains("import { allocateEntity } from \"@flighthq/entity/contract\";"));
        assert!(output.contains("export function allocateLinearColor(): LinearColorRaw"));
        assert!(
            output.contains(
                "return Object.assign(allocateEntity<LinearColorRaw>(), { alpha: 0, blue: 0, green: 0, red: 0 });"
            )
        );
        assert!(!output.contains("flightEntity.allocateEntity"));
    }

    #[test]
    fn initializes_entity_allocations_with_portable_rust_defaults() {
        let source = r#"
pub struct Defaults {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
    pub label: String,
    pub values: Vec<u32>,
    pub current: Option<u32>,
    pub pair: (u32, bool),
}

pub fn allocate_defaults() -> Defaults {
    return flight_entity::allocate_entity();
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "return Object.assign(allocateEntity<DefaultsRaw>(), { current: undefined, enabled: false, label: \"\", pair: [0, false], values: [] });"
        ));
    }

    #[test]
    fn rejects_unsupported_entity_default_shapes_at_direct_allocation() {
        let cases = [
            (
                "array",
                r#"
pub struct Unsupported {
    runtime: EntityRuntimeSlot,
    pub samples: [u32; 4],
}

pub fn allocate_unsupported() -> Unsupported {
    let value: Unsupported = flight_entity::allocate_entity();
    return value;
}
"#,
                "cannot lower `allocate_entity` default for `UnsupportedRaw.samples`: unsupported Rust field type `[u32; 4]`",
            ),
            (
                "enum",
                r#"
pub enum Mode {
    Disabled,
    Enabled,
}

pub struct Unsupported {
    runtime: EntityRuntimeSlot,
    pub mode: Mode,
}

pub fn allocate_unsupported() -> Unsupported {
    return flight_entity::allocate_entity();
}
"#,
                "cannot lower `allocate_entity` default for `UnsupportedRaw.mode`: unsupported Rust field type `Mode`",
            ),
            (
                "nested record",
                r#"
pub struct Settings {
    pub scale: f32,
}

pub struct Unsupported {
    runtime: EntityRuntimeSlot,
    pub settings: Settings,
}

pub fn allocate_unsupported() -> Unsupported {
    return flight_entity::allocate_entity();
}
"#,
                "cannot lower `allocate_entity` default for `UnsupportedRaw.settings`: unsupported Rust field type `Settings`",
            ),
        ];

        for (shape, source, expected) in cases {
            let error = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap_err();
            assert_eq!(error.to_string(), expected, "{shape}");
        }
    }

    #[test]
    fn permits_unsupported_entity_default_shapes_until_direct_allocation() {
        let source = r#"
pub struct Buffered {
    runtime: EntityRuntimeSlot,
    pub samples: [u32; 4],
}

pub fn first_sample(value: &Buffered) -> u32 {
    return value.samples[0];
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains("samples: Uint32Array;"));
        assert!(
            output.contains("export function firstSample(value: Readonly<BufferedRaw>): number")
        );
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
    fn preserves_numeric_literal_spelling_without_rust_suffixes() {
        let source = r#"
pub fn numeric_literals() -> (u32, u32, f64, f64) {
    let hex: u32 = 0xAB_CD_u32;
    let grouped: u32 = 1_000_u32;
    let decimal: f64 = 1.250_0_f64;
    let scientific: f64 = 5e-13_f64;
    return (hex, grouped, decimal, scientific);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("const hex: number = 0xAB_CD;"));
        assert!(output.contains("const grouped: number = 1_000;"));
        assert!(output.contains("const decimal: number = 1.250_0;"));
        assert!(output.contains("const scientific: number = 5e-13;"));
    }

    #[test]
    fn types_fixed_array_constants_and_lowers_vec_repeats() {
        let source = r#"
pub const TABLE: [i32; 3] = [1, 2, 3];
pub const ZEROES: [u8; 4] = [0u8; 4];

pub fn repeated_values(count: usize) -> Vec<i32> {
    let leading = vec![1i32, 2i32];
    let repeated = vec![-1i32; count];
    return repeated;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export const TABLE: Int32Array = new Int32Array([1, 2, 3]);"));
        assert!(output.contains("export const ZEROES: Uint8Array = new Uint8Array(4).fill(0);"));
        assert!(output.contains("const leading = [1, 2];"));
        assert!(output.contains("const repeated = new Array(count).fill(-1);"));
    }

    #[test]
    fn keeps_string_literal_to_string_bare_without_changing_numeric_conversion() {
        let source = r#"
pub fn string_values(value: u32) -> (String, String) {
    return ("ready".to_string(), value.to_string());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return [\"ready\", String(value)];"));
        assert!(!output.contains("String(\"ready\")"));
    }

    #[test]
    fn preserves_record_clone_and_shared_readonly_collection_semantics() {
        let source = r#"
use std::sync::Arc;

pub struct Variation {
    pub value: f32,
}

pub struct Format {
    pub name: Option<String>,
    pub tab_stops: Option<Vec<f32>>,
    pub variations: Option<Arc<Vec<Variation>>>,
}

pub fn clone_format(base: &Format, override_stops: &Format) -> Format {
    let mut result = base.clone();
    result.name = Some("copy".to_string());
    if override_stops.tab_stops.is_some() {
        result.tab_stops = override_stops.tab_stops.clone();
    }
    return result;
}

pub fn clone_shared(base: Arc<Format>) -> Arc<Format> {
    return base.clone();
}

pub fn clone_typed_locals() -> (Format, Vec<f32>) {
    let format: Format = Format {
        name: None,
        tab_stops: Some(vec![1.0]),
        variations: None,
    };
    let stops: Vec<f32> = vec![2.0];
    return (format.clone(), stops.clone());
}

pub fn has_empty_name(value: Option<String>) -> bool {
    return value.as_deref() == Some("");
}

pub fn maximum_color() -> u32 {
    return u32::MAX;
}

pub fn high_byte(color: u32) -> u32 {
    return color >> 24;
}

pub fn local_high_byte() -> u32 {
    let color: u32 = 0xf00000ff;
    return color >> 24;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("variations?: Readonly<Variation[]>;"));
        assert!(
            output.contains("let result = { ...base, tabStops: base.tabStops?.slice() };"),
            "{output}"
        );
        assert!(output.contains("result.tabStops = overrideStops.tabStops?.slice();"));
        assert!(output.contains("return base;"));
        assert!(!output.contains("return { ...base };"));
        assert!(output.contains(
            "return [{ ...format, tabStops: format.tabStops?.slice() }, stops.slice()];"
        ));
        assert!(output.contains("return value === \"\";"));
        assert!(output.contains("return (0xffffffff) >>> 0;"));
        assert!(output.contains("return (color >>> 24) >>> 0;"));
        assert!(output.contains("const color: number = 0xf00000ff;"));
        assert!(output.contains("result.name = \"copy\";"));
        assert!(!output.contains("String(\"copy\")"));
    }

    #[test]
    fn preserves_string_constant_literal_types() {
        let source = r#"
pub const Axis: &str = "ital";
pub const Count: u32 = 3;
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export const Axis = \"ital\" as const;"));
        assert!(output.contains("export const Count: number = 3;"));
    }

    #[test]
    fn lowers_statement_match_arms_without_requiring_values() {
        let source = r#"
pub fn hsv(out: &mut [f32; 4], i: i32, value: f32) {
    match i {
        0 => {
            out[0] = value;
        }
        _ => {
            out[0] = 0.0;
        }
    }
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("switch (i) {"));
        assert!(output.contains("case 0:"));
        assert!(output.contains("out[0] = value;"));
        assert!(output.contains("default:"));
        assert!(output.contains("out[0] = 0.0;"));
    }

    #[test]
    fn preserves_conditional_bitwise_cast_and_unsigned_return_semantics() {
        let source = r##"
pub fn hue(g: f32, b: f32, d: f32) -> f32 {
    return ((g - b) / d + if g < b { 6.0 } else { 0.0 }) / 6.0;
}

pub fn packed(ri: u32, gi: u32, bi: u32, ai: u32) -> u32 {
    return (ri << 24) | (gi << 16) | (bi << 8) | ai;
}

pub fn masked_equals(value: u32) -> bool {
    return (value & 0xff) == 0;
}

pub fn scaled_cast(value: i32) -> u32 {
    return (value as u32) * 3;
}

pub fn hex(color: u32) -> String {
    return format!("#{:06x}", color & 0xffffff);
}

pub fn is_rgba(value: &str) -> bool {
    return value.starts_with("rgba(");
}
"##;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("((g - b) / d + (g < b ? 6.0 : 0.0)) / 6.0"));
        assert!(
            output.contains("return ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;"),
            "{output}"
        );
        assert!(output.contains("return (value & 0xff) === 0;"));
        assert!(output.contains("return (((value) >>> 0) * 3) >>> 0;"));
        assert!(
            output.contains("return `#${(color & 0xffffff).toString(16).padStart(6, \"0\")}`;")
        );
        assert!(output.contains("return value.startsWith(\"rgba(\");"));
    }

    #[test]
    fn rejects_non_string_prefix_receivers() {
        let source = r#"
pub fn has_prefix(value: &[u8], prefix: &[u8]) -> bool {
    return value.starts_with(prefix);
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.starts_with()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn lowers_value_match_block_tails_and_reference_closures() {
        let source = r#"
pub fn select_channel(index: i32) -> f32 {
    return match index {
        0 => {
            let value = 1.0;
            value
        }
        _ => 0.0,
    };
}

pub fn packed_block(red: u32, alpha: u32) -> u32 {
    let value: u32 = {
        let high = red << 24;
        high | alpha
    };
    return value;
}

pub fn has_zero(values: &[u32]) -> bool {
    return values.iter().any(|&value| value == 0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("const matchValue = index;"));
        assert!(output.contains("const value = 1.0;\n  return value;"));
        assert!(output.contains("const high = red << 24;\n  return high | alpha;"));
        assert!(output.contains("return (value) >>> 0;"));
        assert!(output.contains("return values.some((value) => value === 0);"));
    }

    #[test]
    fn lowers_utf16_code_unit_iteration() {
        let source = r#"
pub fn utf16_units(value: &str) -> Vec<u16> {
    return value.encode_utf16().collect();
}

pub fn slice_units(value: &Vec<u16>, start: usize, end: usize) -> Vec<u16> {
    return value[start..end].to_vec();
}

pub fn empty_string() -> String {
    return String::new();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));"
        ));
        assert!(output.contains("return [...value.slice(start, end)];"));
        assert!(output.contains("return '';"));
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
    fn preserves_external_identity_aliases_and_erases_lifetimes() {
        let external = r#"
//! flight-compiler: target-native
//! flight-compiler: identity-alias Marker descriptor

pub type Marker<T> = T;
"#;
        let source = r#"
pub struct Widget {
    runtime: EntityRuntimeSlot,
}

pub fn create_reader<'a>(reader: Reader<'a>) -> Option<Marker<Reader<'_>>> {
    return Some(reader);
}

pub fn borrow_value<'a, T>(value: Borrowed<'a, T>) -> Borrowed<'a, T> {
    return value;
}
"#;

        let output = compile_typescript_with_external_alias_sources(
            source,
            Some("@flighthq/entity/contract"),
            &[],
            &[ExternalAliasSource {
                source: external,
                module: "@flighthq/entity/contract",
            }],
        )
        .unwrap();

        assert!(
            output
                .contains("import type { EntityRaw, Marker } from \"@flighthq/entity/contract\";")
        );
        assert!(output.contains(
            "export function createReader(reader: Reader): Marker<Reader, \"descriptor\"> | undefined"
        ));
        assert!(output.contains("export function borrowValue<T>(value: Borrowed<T>): Borrowed<T>"));
        assert_eq!(output.matches("import type").count(), 1);
        assert!(!output.contains("Reader<>"));
        assert!(!output.contains("import { Marker"));

        let unused = compile_typescript_with_external_alias_sources(
            "pub fn value() -> u32 { return 1; }\n",
            None,
            &[],
            &[ExternalAliasSource {
                source: external,
                module: "@flighthq/entity/contract",
            }],
        )
        .unwrap();
        assert!(!unused.contains("Marker"));
    }

    #[test]
    fn validates_external_identity_alias_directives() {
        let cases = [
            (
                "//! flight-compiler: identity-alias Missing descriptor\n",
                "`flight-compiler: identity-alias` alias `Missing` does not exist",
            ),
            (
                "//! flight-compiler: identity-alias Marker descriptor\n//! flight-compiler: identity-alias Marker descriptor\npub type Marker<T> = T;\n",
                "duplicate `flight-compiler: identity-alias` directive for alias `Marker`",
            ),
            (
                "//! flight-compiler: identity-alias Marker descriptor\npub type Marker<T> = Vec<T>;\n",
                "`flight-compiler: identity-alias` alias `Marker` must resolve directly to its type parameter `T`",
            ),
            (
                "//! flight-compiler: identity-alias Marker descriptor\npub type Marker<'a, T> = T;\n",
                "`flight-compiler: identity-alias` alias `Marker` must declare exactly one type parameter",
            ),
            (
                "//! flight-compiler: identity-alias Marker Descriptor\npub type Marker<T> = T;\n",
                "`flight-compiler: identity-alias Marker` reason tag `Descriptor` must contain only lowercase ASCII letters, digits, or hyphens",
            ),
        ];

        for (external, expected) in cases {
            let error = compile_typescript_with_external_alias_sources(
                "pub fn portable() {}\n",
                None,
                &[],
                &[ExternalAliasSource {
                    source: external,
                    module: "@flighthq/entity/contract",
                }],
            )
            .unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
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
    fn preserves_numeric_enum_values_comparisons_and_ordering() {
        let source = r#"
#[repr(u8)]
pub enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Verbose = 5,
}

pub enum Priority {
    Before = -1,
    Normal,
    After = 4,
}

pub fn passes_level_gate(level: LogLevel, gate: LogLevel) -> bool {
    return level <= gate && level != LogLevel::None;
}

pub fn order_levels(levels: &mut Vec<LogLevel>) {
    levels.sort();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export enum LogLevel {\n  None = 0,\n  Error = 1,\n  Warn = 2,\n  Info = 3,\n  Debug = 4,\n  Verbose = 5,\n}"
        ));
        assert!(
            output.contains("export enum Priority {\n  Before = -1,\n  Normal,\n  After = 4,\n}")
        );
        assert!(output.contains("return level <= gate && level !== LogLevel.None;"));
        assert!(output.contains("levels.sort((a, b) => a - b);"));
        assert!(!output.contains("None = \"none\""));
    }

    #[test]
    fn rejects_nonliteral_numeric_enum_discriminants() {
        let source = r#"
pub enum Level {
    Error = 1 + 1,
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "unsupported enum discriminant `Level::Error`; explicit discriminants must be integer literals"
        );
    }

    #[test]
    fn emits_transparent_and_discriminated_data_unions() {
        let source = r#"
//! flight-compiler: data-union RectangleId LogValue LogDataOrProvider PathSegment

use std::sync::Arc;

pub enum RectangleId {
    Number(i32),
    Text(String),
}

pub enum LogValue {
    Null,
    Int(i64),
    Float(f64),
    Object(UnknownValue),
}

pub type LogData = String;
pub type LogDataProvider = Arc<dyn Fn() -> LogData + Send + Sync>;

pub enum LogDataOrProvider {
    Data(LogData),
    Provider(LogDataProvider),
}

pub enum PathSegment {
    MoveTo { x: f64, y: f64 },
    QuadraticCurveTo { control_x: f64, control_y: f64, x: f64, y: f64 },
    Close,
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type RectangleId = number | string;"));
        assert!(output.contains("export type LogValue = unknown;"));
        assert!(output.contains("export type LogDataOrProvider = LogData | LogDataProvider;"));
        assert!(output.contains(
            "export type PathSegment = { readonly kind: \"moveTo\"; readonly x: number; readonly y: number } | { readonly kind: \"quadraticCurveTo\"; readonly controlX: number; readonly controlY: number; readonly x: number; readonly y: number } | { readonly kind: \"close\" };"
        ));
        assert!(!output.contains("number | number"));
    }

    #[test]
    fn rejects_ambiguous_data_union_shapes() {
        let cases = [
            (
                "//! flight-compiler: data-union\npub enum Value { Number(i32) }\n",
                "`flight-compiler: data-union` requires at least one enum name",
            ),
            (
                "//! flight-compiler: data-union Value\n//! flight-compiler: data-union Value\npub enum Value { Number(i32) }\n",
                "duplicate `flight-compiler: data-union` directive for enum `Value`",
            ),
            (
                "//! flight-compiler: data-union Value-name\npub enum Value { Number(i32) }\n",
                "`flight-compiler: data-union` enum name `Value-name` is not a valid identifier",
            ),
            (
                "//! flight-compiler: data-union Missing\npub enum Present { Value }\n",
                "`flight-compiler: data-union` enum `Missing` does not exist",
            ),
            (
                "//! flight-compiler: data-union Value\n//! flight-compiler: string-union Value\npub enum Value { Number(i32) }\n",
                "enum `Value` cannot use both `flight-compiler: data-union` and `flight-compiler: string-union`",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { First, Second, Number(i32) }\n",
                "untagged data union `Value` can contain at most one unit variant because every unit variant lowers to `null`",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Only }\n",
                "data union `Value` has no payload variants; use `flight-compiler: string-union` instead",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Pair(i32, i32) }\n",
                "untagged data union variant `Value::Pair` must contain exactly one field",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Tuple(i32), Named { value: i32 } }\n",
                "data union `Value` cannot mix named and unnamed variant fields",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Named { kind: i32 } }\n",
                "data union variant `Value::Named` cannot declare the reserved discriminator field `kind`",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Named { value: i32 }, named }\n",
                "data union `Value` has more than one variant with discriminator `named`",
            ),
            (
                "//! flight-compiler: data-union Value\npub enum Value { Number(i32) = 1 }\n",
                "data union `Value::Number` cannot declare an explicit discriminant",
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
    fn refuses_unsupported_public_contract_items() {
        let source = r#"
pub enum Axis {
    Named { value: i32 },
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "unsupported enum variant `Axis::Named`; only unit variants are portable"
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
    fn reconstructs_test_name_decimals_only_with_matching_body_literals() {
        let source = r#"
use flight_math::*;

mod sample {
    use super::*;

    #[test]
    fn returns_0_5_at_the_midpoint() {
        assert_eq!(sample(0.5), 0.5);
    }

    #[test]
    fn stays_in_the_0_1_range() {
        assert!(sample(0.0) <= 1.0);
    }

    #[test]
    fn returns_axis_0_0_1() {
        assert_eq!(axis(), [0.0, 0.0, 1.0]);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/math/contract").unwrap();

        assert!(output.contains("it(\"returns 0.5 at the midpoint\""));
        assert!(output.contains("it(\"stays in the 0 1 range\""));
        assert!(output.contains("it(\"returns axis 0 0 1\""));
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
    fn lowers_padded_hex_and_string_prefix_assertions() {
        let production = r#"
pub fn rgba_to_string(color: u32) -> String {
    return format!("rgba({})", color);
}
"#;
        let source = r#"
use flight_color::*;

mod color_format {
    use super::*;

    #[test]
    fn formats_diagnostics() {
        let r = 0xbc_u32;
        assert!((r as i32 - 0xbc_i32).abs() < 5, "expected red near 0xbc, got 0x{:02x}", r);
        let s = rgba_to_string(r);
        assert!(s.starts_with("rgba("), "got {}", s);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/color/contract", &[production])
                .unwrap();

        assert!(
            output
                .contains("`expected red near 0xbc, got 0x${(r).toString(16).padStart(2, \"0\")}`")
        );
        assert!(output.contains("expect(s.startsWith(\"rgba(\"), `got ${s}`).toBe(true);"));
    }

    #[test]
    fn lowers_shared_ref_reads_writes_and_identity_checks() {
        let source = r#"
use std::sync::{Arc, RwLock};

struct Value {
    count: i32,
}

mod shared_ref {
    use super::*;

    #[test]
    fn preserves_one_object() {
        let value = Arc::new(RwLock::new(Value { count: 1 }));
        let alias = value.clone();
        value.write().unwrap().count = 2;
        assert_eq!(value.read().unwrap().count, 2);
        assert!(Arc::ptr_eq(&value, &alias));
        let uid = flight_entity::get_entity_uid(&mut value);
        assert_eq!(flight_entity::get_entity_uid(&mut value), uid);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/example/contract").unwrap();

        assert!(output.contains("const value = { count: 1 };"));
        assert!(output.contains("value!.count = 2;"));
        assert!(output.contains("expect(value!.count).toEqual(2);"));
        assert!(output.contains("expect(value === alias).toBe(true);"));
        assert!(output.contains("import * as flightEntity from \"@flighthq/entity/contract\";"));
        assert!(output.contains("const uid = flightEntity.getEntityUid(value);"));
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
