use flight_compiler::{
    ExternalAliasSource, ModuleSource, SourceMode, VitestAliasSource, compile_typescript,
    compile_typescript_with_alias_sources, compile_typescript_with_external_alias_sources,
    compile_typescript_with_module_sources, compile_vitest, compile_vitest_with_alias_sources,
    compile_vitest_with_contract_alias_sources, compile_vitest_with_external_alias_sources,
    compile_vitest_with_module_alias_sources, source_mode,
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
                "//! flight-compiler: callable-field-parameters Hooks run value\npub struct Hooks { pub run: fn(f32) }\n"
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
                "//! flight-compiler: frozen-object SPRING_PRESET_BOUNCY SpringPresetBouncy\npub const SPRING_PRESET_BOUNCY: SpringConfig = SpringConfig { frequency: 2.0 };\n"
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
        assert_eq!(
            source_mode(
                "//! flight-compiler: nullable-options\npub fn nullable(value: Option<i32>) {}\n"
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
    fn emits_used_cross_crate_contract_imports_by_runtime_role() {
        let source = r#"
use flight_entity::{Float32Array, Ref, throw_error};
use flight_geometry::{Matrix, copy_matrix, create_matrix as make_matrix, unused_value};
use flight_host::HiddenHost;
use flight_node::contract::{NodeRef, NodeRevisionState, ensure_node_world_matrix as ensure_world};
use flight_platform::HostMode;

pub struct Sample {
    pub matrix: Matrix,
}

pub fn update_sample(
    sample: &mut Sample,
    node: &NodeRef,
    revisions: &mut NodeRevisionState,
    values: &Float32Array,
    mode: HostMode,
) -> Ref<Matrix> {
    if values.len() == 0 {
        throw_error("values are required");
    }
    if mode == HostMode::Web {
        ensure_world(node, revisions);
    }
    let next = make_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    copy_matrix(&mut sample.matrix, &next);
    return sample.matrix.clone();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.starts_with(
            r#"import { copyMatrix, createMatrix as makeMatrix } from "@flighthq/geometry/contract";
import { ensureNodeWorldMatrix as ensureWorld } from "@flighthq/node/contract";
import { HostMode } from "@flighthq/platform/contract";
import type { Matrix } from "@flighthq/geometry/contract";
import type { NodeRef, NodeRevisionState } from "@flighthq/node/contract";

"#
        ));
        assert!(!output.contains("HiddenHost"));
        assert!(!output.contains("unusedValue"));
        assert!(!output.contains("import type { Float32Array"));
        assert!(!output.contains("import type { Ref"));
        assert!(!output.contains("import { throwError"));
        assert!(output.contains("throw new Error(\"values are required\");"));
        assert!(output.contains("if (mode === HostMode.Web)"));
    }

    // `v.is_empty()` lowers to `v.length === 0`; prefixing `!` without precedence produced
    // `!v.length === 0`, which JavaScript parses as `(!v.length) === 0` and is always false.
    #[test]
    fn negates_lowered_is_empty_as_a_length_comparison() {
        let source = r#"
pub fn has_items(values: &Vec<i32>) -> bool {
    return !values.is_empty();
}

pub fn is_blank(values: &Vec<i32>) -> bool {
    return values.is_empty();
}

pub fn first_or_zero(values: &Vec<i32>) -> i32 {
    let value = if !values.is_empty() { values[0] } else { 0 };
    return value;
}

pub fn both(a: &Vec<i32>, b: &Vec<i32>) -> bool {
    return !a.is_empty() && !b.is_empty();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return values.length !== 0;"));
        assert!(output.contains("return values.length === 0;"));
        assert!(output.contains("const value = values.length !== 0 ? values[0] : 0;"));
        assert!(output.contains("return a.length !== 0 && b.length !== 0;"));
        assert!(!output.contains("!values.length"));
        assert!(!output.contains("!a.length"));
    }

    // Any method call whose lowering is an operator expression is parenthesized as an operand, so the
    // Rust precedence of the call (a primary) cannot leak into the emitted JavaScript.
    #[test]
    fn parenthesizes_operator_lowerings_used_as_operands() {
        let source = r#"
pub fn lacks(value: Option<i32>) -> bool {
    return !value.is_some();
}

pub fn has(value: Option<i32>) -> bool {
    return !value.is_none();
}

pub fn present(value: Option<i32>) -> bool {
    return value.is_some();
}

pub fn absent(value: Option<i32>) -> bool {
    return value.is_none();
}

pub fn same_emptiness(a: &Vec<i32>, b: &Vec<i32>) -> bool {
    return a.is_empty() == b.is_empty();
}

pub fn negated_flag(flag: bool) -> bool {
    return !flag;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return !(value !== undefined);"));
        assert!(output.contains("return !(value === undefined);"));
        assert!(output.contains("return value !== undefined;"));
        assert!(output.contains("return value === undefined;"));
        assert!(!output.contains("!value !=="));
        assert!(!output.contains("!value ==="));
        assert!(output.contains("return (a.length === 0) === (b.length === 0);"));
        assert!(output.contains("return !flag;"));
    }

    // Ordinary calls lower to operator expressions too (`Arc::ptr_eq(a, b)` emits `a === b`), so the
    // operand guard classifies emitted text rather than enumerating method calls.
    #[test]
    fn parenthesizes_operator_lowered_calls_used_as_operands() {
        let source = r#"
use std::sync::Arc;

pub fn different(a: &Arc<i32>, b: &Arc<i32>) -> bool {
    return !Arc::ptr_eq(a, b);
}

pub fn equality_matches(a: &Arc<i32>, b: &Arc<i32>, expected: bool) -> bool {
    return Arc::ptr_eq(a, b) == expected;
}

pub fn same(a: &Arc<i32>, b: &Arc<i32>) -> bool {
    return Arc::ptr_eq(a, b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return !(a === b);"));
        assert!(output.contains("return (a === b) === expected;"));
        assert!(output.contains("return a === b;"));
        assert!(!output.contains("!a === b"));
        assert!(!output.contains("a === b === expected"));
    }

    // `matches!` over data union variants lowers to the same runtime predicate a `match` uses; a
    // scrutinee that is not a reusable place is bound once.
    #[test]
    fn lowers_matches_over_data_union_variants() {
        let source = r#"
//! flight-compiler: data-union Id Segment

pub enum Id {
    Number(i32),
    Text(String),
}

pub enum Segment {
    Move { x: f64 },
    Line { x: f64 },
    Close,
}

pub fn pick(id: &Id) -> Id {
    return id.clone();
}

pub fn is_number(id: &Id) -> bool {
    return matches!(id, Id::Number(_));
}

pub fn is_not_text(id: &Id) -> bool {
    return !matches!(id, Id::Text(_));
}

pub fn is_any(id: &Id, flag: bool) -> bool {
    return flag && matches!(id, Id::Number(_) | Id::Text(_));
}

pub fn picks_number(id: &Id) -> bool {
    return matches!(pick(id), Id::Number(_));
}

pub fn is_drawn(segment: &Segment) -> bool {
    return matches!(segment, Segment::Move { .. } | Segment::Line { .. });
}

pub fn is_closed(segment: &Segment) -> bool {
    return matches!(segment, Segment::Close);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return typeof id === \"number\";"));
        assert!(output.contains("return !(typeof id === \"string\");"));
        assert!(output.contains(
            "return flag && ((typeof id === \"number\") || (typeof id === \"string\"));"
        ));
        assert!(output.contains("return ((value) => typeof value === \"number\")(pick(id));"));
        assert!(
            output.contains("return (segment.kind === \"move\" || segment.kind === \"line\");")
        );
        assert!(output.contains("return segment.kind === \"close\";"));

        for (body, expected) in [
            (
                "matches!(id, Id::Number(n) if n > 0)",
                "portable `matches!` cannot use a guard",
            ),
            (
                "matches!(value, Some(_))",
                "portable `matches!` supports only data union variant patterns",
            ),
        ] {
            let source = format!(
                "//! flight-compiler: data-union Id\npub enum Id {{ Number(i32), Text(String) }}\npub fn check(id: &Id, value: Option<i32>) -> bool {{ return {body}; }}\n"
            );
            let error = compile_typescript(&source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    // Option `.and_then()` and `.map()` lower only over receivers declared as Rust `Option`: a field
    // projection becomes optional chaining, any other body tests the once-evaluated receiver against
    // the absent value, and `.unwrap_or()` stays `??` so falsy payloads survive.
    #[test]
    fn lowers_option_and_then_and_map_over_declared_options() {
        let source = r#"
//! flight-compiler: string-union Heuristic
pub enum Heuristic {
    BestShortSideFit,
    BestAreaFit,
}

pub struct Options {
    pub padding: Option<f32>,
    pub growable: Option<bool>,
    pub heuristic: Option<Heuristic>,
    pub max_width: Option<f32>,
}

pub fn padding_of(options: Option<&Options>) -> f32 {
    return options.and_then(|o| o.padding).unwrap_or(0.0);
}

pub fn growable_of(options: Option<&Options>) -> bool {
    return options.and_then(|o| o.growable).unwrap_or(true);
}

pub fn inner_width(options: Option<&Options>, border: f32) -> f32 {
    return options.and_then(|o| o.max_width).unwrap_or(100.0) - 2.0 * border;
}

pub fn heuristic_of(options: Option<&Options>) -> Heuristic {
    return options
        .and_then(|o| o.heuristic)
        .unwrap_or(Heuristic::BestShortSideFit);
}

pub fn shrunk_width(options: Option<&Options>) -> f32 {
    return options
        .and_then(|o| o.max_width.map(|w| w - 2.0))
        .unwrap_or(0.0);
}

pub fn pick(options: Option<&Options>, counter: &mut Vec<i32>) -> Option<&Options> {
    counter.push(1);
    return options;
}

pub fn picked_padding(options: Option<&Options>, counter: &mut Vec<i32>) -> f32 {
    return pick(options, counter).and_then(|o| o.padding).unwrap_or(0.0);
}

pub fn shadowed(border: Option<&Options>, extra: f32) -> f32 {
    return border.and_then(|border| border.padding.map(|p| p + extra)).unwrap_or(0.0);
}

pub fn conditional_padding(options: Option<&Options>, enabled: bool) -> f32 {
    return options
        .and_then(|o| if enabled { o.padding } else { None })
        .unwrap_or(7.0);
}

pub fn doubled(value: Option<f32>) -> f32 {
    let scaled: Option<f32> = value.map(|w| w * 2.0);
    return scaled.unwrap_or(0.0);
}

pub fn doubled_all(values: &Vec<f32>) -> Vec<f32> {
    return values.iter().map(|w| w * 2.0).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return (options?.padding ?? 0.0);"));
        assert!(output.contains("return (options?.growable ?? true);"));
        assert!(output.contains("return (options?.maxWidth ?? 100.0) - 2.0 * border;"));
        assert!(output.contains("return (options?.heuristic ?? \"bestShortSideFit\");"));
        assert!(output.contains(
            "return (((o) => o === undefined ? undefined : ((w) => w === undefined ? undefined : w - 2.0)(o.maxWidth))(options) ?? 0.0);"
        ));
        assert!(output.contains("return (pick(options, counter)?.padding ?? 0.0);"));
        assert!(output.contains(
            "return (((border) => border === undefined ? undefined : ((p) => p === undefined ? undefined : p + extra)(border.padding))(border) ?? 0.0);"
        ));
        assert!(output.contains(
            "return (((o) => o === undefined ? undefined : enabled ? o.padding : undefined)(options) ?? 7.0);"
        ));
        assert!(output.contains(
            "const scaled: number | undefined = ((w) => w === undefined ? undefined : w * 2.0)(value);"
        ));
        assert!(output.contains("return values.map((w) => w * 2.0);"));
        assert!(!output.contains("||"));

        let source = r#"
//! flight-compiler: nullable-options
pub struct Options {
    pub padding: Option<f32>,
}

pub fn padding_of(options: Option<&Options>) -> f32 {
    return options.and_then(|o| o.padding).unwrap_or(0.0);
}

pub fn widened(value: Option<f32>) -> f32 {
    return value.map(|w| w + 1.0).unwrap_or(0.0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("return (((o) => o === null ? null : o.padding)(options) ?? 0.0);")
        );
        assert!(output.contains("return (((w) => w === null ? null : w + 1.0)(value) ?? 0.0);"));

        for (source, expected) in [
            (
                "pub fn first(values: &Vec<f32>) -> Option<f32> { return values.iter().and_then(|v| Some(*v)); }\n",
                "portable `.and_then()` requires a receiver declared as Rust `Option`",
            ),
            (
                "pub fn inferred(value: f32) -> f32 { let local = Some(value); return local.and_then(|v| Some(v)).unwrap_or(0.0); }\n",
                "portable `.and_then()` requires a receiver declared as Rust `Option`",
            ),
            (
                "pub fn sum(value: Option<(f32, f32)>) -> f32 { return value.map(|(a, b)| a + b).unwrap_or(0.0); }\n",
                "portable Option `.map()` closure parameter must be an identifier",
            ),
            (
                "pub fn apply(value: Option<f32>, f: fn(f32) -> Option<f32>) -> Option<f32> { return value.and_then(f); }\n",
                "portable Option `.and_then()` needs a single-parameter closure",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    // `.cmp()` on integers and strings is a normalized three-way comparison, `Ordering` lowers to a
    // signed number, and `==` against its variants compares signs, which keeps `.partial_cmp()`
    // differences correct; a `match` on its variants is rejected rather than lowered unsoundly.
    #[test]
    fn lowers_ord_cmp_and_ordering_variants_as_signed_numbers() {
        let source = r#"
//! flight-compiler: data-union Id
use std::cmp::Ordering;

pub enum Id {
    Number(i32),
    Text(String),
}

pub fn compare_counts(a: i32, b: i32) -> Ordering {
    return a.cmp(&b);
}

pub fn compare_names(a: &str, b: &String) -> Ordering {
    return a.cmp(b);
}

pub fn compare_numbers(a: &Id, b: &Id) -> Ordering {
    if let (Id::Number(an), Id::Number(bn)) = (a, b) {
        return an.cmp(bn);
    }
    return Ordering::Equal;
}

pub fn order_first(first: bool) -> Ordering {
    return if first { Ordering::Less } else { Ordering::Greater };
}

pub fn is_before(a: f32, b: f32) -> bool {
    return a.partial_cmp(&b).unwrap_or(Ordering::Equal) == Ordering::Less;
}

pub fn is_not_after(a: f32, b: f32) -> bool {
    return a.partial_cmp(&b).unwrap_or(Ordering::Equal) != Ordering::Greater;
}

pub fn compare_offset(a: i32, b: i32) -> Ordering {
    return (a + 1).cmp(&b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export function compareCounts(a: number, b: number): number {"));
        assert!(output.contains("return a < b ? -1 : a > b ? 1 : 0;"));
        assert!(output.contains("return an < bn ? -1 : an > bn ? 1 : 0;"));
        assert!(output.contains("return 0;"));
        assert!(output.contains("return first ? -1 : 1;"));
        assert!(output.contains("return Math.sign(a - b) === -1;"));
        assert!(output.contains("return Math.sign(a - b) !== 1;"));
        assert!(output.contains(
            "return ((left, right) => (left < right ? -1 : left > right ? 1 : 0))((a + 1), b);"
        ));
        assert!(!output.contains("Ordering"));

        for (source, expected) in [
            (
                "pub struct Point { pub x: i32 }\npub fn compare_points(a: &Point, b: &Point) -> std::cmp::Ordering { return a.cmp(b); }\n",
                "portable `.cmp()` requires operands declared as Rust integers or strings",
            ),
            (
                "use std::cmp::Ordering;\npub fn rank(a: i32, b: i32) -> i32 { return match a.cmp(&b) { Ordering::Less => 1, Ordering::Equal => 2, Ordering::Greater => 3 }; }\n",
                "portable `match` cannot match `Ordering` variants; compare with `==` instead",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    // A tuple `if let` over data union variants tests every element's runtime category together
    // and binds each payload inside the branch.
    #[test]
    fn lowers_tuple_if_let_over_data_union_variants() {
        let source = r#"
//! flight-compiler: data-union Id Segment

pub enum Id {
    Number(i32),
    Text(String),
}

pub enum Segment {
    Move { x: f64 },
    Close,
}

pub fn sum_numbers(a: &Id, b: &Id) -> i32 {
    if let (Id::Number(an), Id::Number(bn)) = (a, b) {
        return an + bn;
    } else {
        return 0;
    }
}

pub fn first_text(a: &Id, b: &Id) -> bool {
    if let (Id::Text(_), _) = (a, b) {
        return true;
    }
    return false;
}

pub fn move_distance(a: &Segment, b: &Segment) -> f64 {
    if let (Segment::Move { x: ax }, Segment::Move { x: bx }) = (a, b) {
        return bx - ax;
    }
    return 0.0;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "  if (typeof a === \"number\" && typeof b === \"number\") {\n    const an = a;\n    const bn = b;\n    return an + bn;\n  } else {\n    return 0;\n  }\n"
        ));
        assert!(output.contains("  if (typeof a === \"string\") {\n    return true;\n  }\n"));
        assert!(output.contains(
            "  if (a.kind === \"move\" && b.kind === \"move\") {\n    const ax = a.x;\n    const bx = b.x;\n"
        ));

        for (condition, expected) in [
            (
                "let (Id::Number(n), _) = (pick(a), b)",
                "portable tuple `if let` elements must be locals, fields, or literals",
            ),
            (
                "let (Some(n), _) = (value, b)",
                "portable tuple `if let` supports only data union variant patterns, bindings, and `_`",
            ),
            (
                "let (x, _) = (a, b)",
                "portable tuple `if let` needs at least one data union variant pattern",
            ),
        ] {
            let source = format!(
                "//! flight-compiler: data-union Id\npub enum Id {{ Number(i32), Text(String) }}\npub fn pick(id: &Id) -> Id {{ return id.clone(); }}\npub fn check(a: &Id, b: &Id, value: Option<i32>) -> bool {{ if {condition} {{ return true; }} return false; }}\n"
            );
            let error = compile_typescript(&source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    // Statement `.extend()` and `.extend_from_slice()` over a receiver declared as a Rust `Vec` and an
    // argument declared as a `Vec`, slice or array lower to an index loop over the argument's initial
    // length: no argument count ceiling, and a TypeScript caller aliasing the operands still
    // terminates. A non-reusable receiver, then argument, are each bound once. Construction and range
    // forms whose emission is not yet valid typed TypeScript fail closed.
    #[test]
    fn lowers_vec_retain_in_place_and_rejects_std_mem_moves() {
        let retain = "(<T>(items: T[], keep: (item: T) => boolean): void => { let kept = 0; let index = 0; try { for (; index < items.length; index += 1) { const item = items[index]; if (keep(item)) { items[kept] = item; kept += 1; } } } finally { const length = items.length; for (let rest = index; rest < length; rest += 1) { items[kept + rest - index] = items[rest]; } items.length = kept + length - index; } })";
        let source = r#"
pub struct Range {
    pub start: u32,
    pub end: u32,
}

pub fn drop_empty(ranges: &mut Vec<Range>) {
    ranges.retain(|range| range.start < range.end);
}

pub fn keep_even(values: &mut Vec<u32>) {
    values.retain(|value| *value % 2 == 0);
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            format!(
                "export interface Range {{\n  start: number;\n  end: number;\n}}\n\nexport function dropEmpty(ranges: Range[]): void {{\n  {retain}(ranges, (range) => range.start < range.end);\n}}\n\nexport function keepEven(values: number[]): void {{\n  {retain}(values, (value) => value % 2 === 0);\n}}\n"
            )
        );

        let tests = r#"
fn kept(values: &[u32]) -> Vec<u32> {
    let mut out: Vec<u32> = values.to_vec();
    out.retain(|value| *value % 2 == 0);
    return out;
}

mod retain {
    use super::*;

    #[test]
    fn keeps_order_for_all_kept_all_removed_and_alternating_inputs() {
        let all_kept: Vec<u32> = vec![2, 4, 6];
        let all_removed: Vec<u32> = vec![1, 3, 5];
        let alternating: Vec<u32> = vec![1, 2, 3, 4, 5, 6];
        let expected_kept: Vec<u32> = vec![2, 4, 6];
        let expected_removed: Vec<u32> = vec![];
        assert_eq!(kept(&all_kept), expected_kept);
        assert_eq!(kept(&all_removed), expected_removed);
        assert_eq!(kept(&alternating), expected_kept);
    }
}
"#;
        let output = compile_vitest(tests, "@flighthq/example/contract").unwrap();
        assert!(
            output.contains(&format!(
                "  let out: number[] = [...values];\n  {retain}(out, (value) => value % 2 === 0);\n  return out;\n"
            )),
            "{output}"
        );
        assert!(
            output.contains("    expect(kept(alternating)).toEqual(expectedKept);\n"),
            "{output}"
        );

        for (source, expected) in [
            (
                "pub fn f(text: &mut String) { text.retain(|c| c != 'a'); }\n",
                "portable `.retain()` requires a receiver declared as Rust `Vec` and one predicate",
            ),
            (
                "pub struct R { pub start: u32, pub end: u32 }\npub fn f(values: &mut Vec<R>) {\n    let previous: Vec<R> = std::mem::take(values);\n    for value in previous {\n        if value.start < value.end {\n            values.push(value);\n        }\n    }\n}\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return mem::take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "pub fn f(values: &mut Vec<u32>, other: Vec<u32>) -> Vec<u32> { return std::mem::replace(values, other); }\n",
                "portable `std::mem::replace` has no portable lowering",
            ),
            (
                "pub fn f(a: &mut u32, b: &mut u32) { core::mem::swap(a, b); }\n",
                "portable `std::mem::swap` has no portable lowering",
            ),
            (
                "use std::mem::take;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem::take as grab;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return grab(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem::{replace, swap};\npub fn f(a: &mut u32, b: &mut u32) { swap(a, b); }\n",
                "portable `std::mem::swap` has no portable lowering",
            ),
            (
                "use std::{mem::{self as m}, vec::Vec};\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return m::take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem as m;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return m::take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem::*;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use core::mem::replace;\npub fn f(value: &mut u32) -> u32 { return replace(value, 1); }\n",
                "portable `std::mem::replace` has no portable lowering",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
    }

    #[test]
    fn lowers_vec_extend_over_declared_sequences() {
        let source = r#"
//! flight-compiler: data-union Id
pub enum Id {
    Number(i32),
    Text(String),
}

struct Attempt {
    unpacked: Vec<Id>,
}

fn make(extra: Vec<Id>) -> Attempt {
    return Attempt { unpacked: extra };
}

fn pair() -> Vec<i32> {
    return vec![1, 2];
}

pub fn joined(mut a: Vec<i32>, b: Vec<i32>) -> Vec<i32> {
    a.extend(b);
    return a;
}

pub fn appended(a: &mut Vec<i32>, b: &[i32]) {
    a.extend_from_slice(b);
}

pub fn literal(values: &mut Vec<i32>) {
    values.extend_from_slice(&[1, 2]);
}

pub fn fixed(values: &mut Vec<i32>) {
    let pair: [i32; 2] = [7, 8];
    values.extend_from_slice(&pair);
}

pub fn combined(degenerate: Vec<Id>, extra: Vec<Id>) -> Vec<Id> {
    let mut combined_unpacked = degenerate;
    let attempt = make(extra);
    combined_unpacked.extend(attempt.unpacked);
    return combined_unpacked;
}

pub fn doubled(mut a: Vec<i32>) -> Vec<i32> {
    a.extend(a.clone());
    return a;
}

pub fn constructed(source: &Vec<i32>, head: usize) -> usize {
    let mut values = vec![0];
    values.extend_from_slice(&source[head..]);
    return values.len();
}

pub fn temporary(extra: Vec<i32>) {
    pair().extend(extra.clone());
}

pub fn renamed(index: &mut Vec<i32>, count: &Vec<i32>) {
    index.extend(count);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export function joined(a: number[], b: number[]): number[] {\n  for (let index = 0, count = b.length; index < count; index++) {\n    a.push(b[index]);\n  }\n  return a;\n}"
        ));
        assert!(output.contains(
            "  for (let index = 0, count = b.length; index < count; index++) {\n    a.push(b[index]);\n  }\n}"
        ));
        assert!(output.contains(
            "  {\n    const source = [1, 2];\n    for (let index = 0, count = source.length; index < count; index++) {\n      values.push(source[index]);\n    }\n  }\n"
        ));
        assert!(output.contains(
            "  for (let index = 0, count = pair.length; index < count; index++) {\n    values.push(pair[index]);\n  }\n"
        ));
        assert!(output.contains(
            "  let combinedUnpacked = degenerate;\n  const attempt = make(extra);\n  for (let index = 0, count = attempt.unpacked.length; index < count; index++) {\n    combinedUnpacked.push(attempt.unpacked[index]);\n  }\n"
        ));
        assert!(output.contains(
            "  {\n    const source = a.slice();\n    for (let index = 0, count = source.length; index < count; index++) {\n      a.push(source[index]);\n    }\n  }\n"
        ));
        assert!(output.contains(
            "  {\n    const source1 = source.slice(head);\n    for (let index = 0, count = source1.length; index < count; index++) {\n      values.push(source1[index]);\n    }\n  }\n"
        ));
        assert!(output.contains(
            "  {\n    const target = pair();\n    const source = extra.slice();\n    for (let index = 0, count = source.length; index < count; index++) {\n      target.push(source[index]);\n    }\n  }\n"
        ));
        assert!(output.contains(
            "  for (let index1 = 0, count1 = count.length; index1 < count1; index1++) {\n    index.push(count[index1]);\n  }\n"
        ));
        assert!(!output.contains("push(..."));

        let argument_error = "portable `.extend()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported";
        let receiver_error = "portable `.extend()` requires a receiver declared as Rust `Vec`";
        for (source, expected) in [
            (
                "pub fn f(a: &mut Vec<i32>, b: &Vec<i32>) { a.extend(b.iter().map(|x| x * 2)); }\n",
                argument_error,
            ),
            (
                "pub fn f(a: &mut Vec<i32>, x: Option<i32>) { a.extend(x); }\n",
                argument_error,
            ),
            (
                "pub fn f(b: Vec<i32>) -> Vec<i32> { let mut v = other(); v.extend(b); return v; }\n",
                receiver_error,
            ),
            (
                "pub fn f(s: &mut String, t: &str) { s.extend(t.chars()); }\n",
                receiver_error,
            ),
            (
                "pub fn f(a: &mut i32, b: &[i32]) { a.extend_from_slice(b); }\n",
                "portable `.extend_from_slice()` requires a receiver declared as Rust `Vec`",
            ),
            (
                "const PAIR: [i32; 2] = [5, 6];\npub fn f(a: &mut Vec<i32>) { a.extend_from_slice(&PAIR); }\n",
                "portable `.extend_from_slice()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported",
            ),
            (
                "pub fn f(extra: Vec<i32>) -> Vec<i32> { let mut values = Vec::new(); values.extend(extra); return values; }\n",
                receiver_error,
            ),
            (
                "pub fn f(extra: Vec<i32>) -> Vec<i32> { let mut values = Vec::with_capacity(extra.len()); values.extend(extra); return values; }\n",
                "portable `Vec::with_capacity` is not supported; declare the `Vec` with `Vec::new()`",
            ),
            (
                "pub fn f(extra: Vec<i32>) -> Vec<i32> { let mut values = vec![]; values.extend(extra); return values; }\n",
                receiver_error,
            ),
            (
                "pub fn f(values: &mut Vec<i32>, source: &Vec<i32>, head: usize) { values.extend_from_slice(&source[..head]); }\n",
                "portable `.extend_from_slice()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported",
            ),
            (
                "pub fn f(values: &mut Vec<i32>, source: &Vec<i32>, end: usize) { values.extend_from_slice(&source[1..=end]); }\n",
                "portable `.extend_from_slice()` requires an argument declared as Rust `Vec` or slice; iterator and Option arguments are not supported",
            ),
            (
                "pub fn f(a: &mut Vec<i32>, b: Vec<i32>) -> usize { let n = { a.extend(b) }; return a.len(); }\n",
                "portable `.extend()` is supported only as a statement",
            ),
            (
                "pub fn f(a: &mut Vec<i32>, b: &[i32]) -> usize { let n = { a.extend_from_slice(b) }; return a.len(); }\n",
                "portable `.extend_from_slice()` is supported only as a statement",
            ),
            (
                "pub fn f(a: &mut Vec<i32>, b: Vec<i32>) { let g = |a: i32| { a.extend(b); a }; }\n",
                receiver_error,
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    // Value bindings resolve lexically: a binding takes effect after its declaration, shadows within its
    // scope only, and the outer binding (or a same-named function's facts) applies again once the scope
    // ends. A local value of a function's name always shadows that function, so its return facts never
    // apply to the local.
    #[test]
    fn lowers_vec_extend_through_lexical_bindings() {
        let lowered = |output: &str, name: &str| {
            output.contains("for (let index = 0, count = extra.length; index < count; index++) {")
                && output.contains(&format!("{name}.push(extra[index]);"))
        };
        let rejected = "portable `.extend()` requires a receiver declared as Rust `Vec`";
        let bag = "pub struct Bag { pub items: Vec<i32> }\nimpl Extend<i32> for Bag {\n    fn extend<T: IntoIterator<Item = i32>>(&mut self, iter: T) {\n        self.items.extend(iter);\n    }\n}\n";
        let make = "fn make_values() -> Vec<i32> {\n    return vec![1];\n}\n";
        let shadowed = [
            format!(
                "{make}{bag}pub fn append(bag: Bag, extra: Vec<i32>) -> Vec<i32> {{\n    let make_values = move || bag;\n    let mut values = make_values();\n    values.extend(extra);\n    return values.items;\n}}\n"
            ),
            format!(
                "{make}pub fn inner(extra: Vec<i32>, other: fn() -> Vec<i32>, flag: bool) {{\n    if flag {{\n        let make_values = other;\n        let mut values = make_values();\n        values.extend(extra);\n    }}\n}}\n"
            ),
            format!(
                "{make}pub fn parameter(make_values: fn() -> Vec<i32>, extra: Vec<i32>) -> usize {{\n    let mut values = make_values();\n    values.extend(extra);\n    return values.len();\n}}\n"
            ),
            "pub fn relet(items: Vec<i32>, extra: Vec<i32>) -> usize {\n    let mut items = items.len();\n    items.extend(extra);\n    return items;\n}\n".to_string(),
            "pub fn closure(items: Vec<i32>, extra: Vec<i32>) -> usize {\n    let f = |items: usize| {\n        items.extend(extra);\n        items\n    };\n    return f(items.len());\n}\n".to_string(),
            "pub fn looped(items: Vec<i32>, extra: Vec<i32>, all: &Vec<Vec<i32>>) {\n    for items in all {\n        items.extend(extra);\n    }\n}\n".to_string(),
            "//! flight-compiler: data-union Id\npub enum Id {\n    Number(i32),\n    Text(String),\n}\npub fn matched(items: Vec<i32>, extra: Vec<i32>, id: Id) {\n    match id {\n        Id::Number(items) => {\n            items.extend(extra);\n        }\n        Id::Text(_) => {}\n    }\n}\n".to_string(),
            "pub fn guarded(items: Vec<i32>, extra: Vec<i32>, maybe: Option<usize>) {\n    if let Some(items) = maybe {\n        items.extend(extra);\n    }\n}\n".to_string(),
            "pub fn tupled(items: Vec<i32>, extra: Vec<i32>, pair: (usize, usize)) {\n    let (items, other) = pair;\n    items.extend(extra);\n}\n".to_string(),
            "pub fn let_else(items: Vec<i32>, extra: Vec<i32>, maybe: Option<usize>) {\n    let Some(items) = maybe else {\n        return;\n    };\n    items.extend(extra);\n}\n".to_string(),
        ];
        for source in &shadowed {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), rejected, "{source}");
        }
        let restored = [
            (
                format!(
                    "{make}pub fn before(extra: Vec<i32>) -> usize {{\n    let mut first = make_values();\n    first.extend(extra);\n    let make_values = 3;\n    return first.len() + make_values;\n}}\n"
                ),
                "first",
            ),
            (
                format!(
                    "{make}pub fn sibling(extra: Vec<i32>, flag: bool) -> usize {{\n    if flag {{\n        let make_values = 1;\n    }}\n    let mut values = make_values();\n    values.extend(extra);\n    return values.len();\n}}\n"
                ),
                "values",
            ),
            (
                "pub fn closure(mut items: Vec<i32>, extra: Vec<i32>) -> usize {\n    let f = |items: usize| items + 1;\n    items.extend(extra);\n    return f(items.len());\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn looped(mut items: Vec<i32>, extra: Vec<i32>, all: &Vec<usize>) {\n    for items in all {\n        let unused = items;\n    }\n    items.extend(extra);\n}\n".to_string(),
                "items",
            ),
            (
                "//! flight-compiler: data-union Id\npub enum Id {\n    Number(i32),\n    Text(String),\n}\npub fn matched(mut items: Vec<i32>, extra: Vec<i32>, id: Id) {\n    match id {\n        Id::Number(items) => {\n            let unused = items;\n        }\n        Id::Text(_) => {}\n    }\n    items.extend(extra);\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn guarded(mut items: Vec<i32>, extra: Vec<i32>, maybe: Option<usize>) {\n    if let Some(items) = maybe {\n        let unused = items;\n    }\n    items.extend(extra);\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn inner(mut items: Vec<i32>, extra: Vec<i32>, flag: bool) {\n    if flag {\n        let items = 3;\n        let unused = items;\n    }\n    items.extend(extra);\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn let_else(mut items: Vec<i32>, extra: Vec<i32>, maybe: Option<usize>) {\n    let Some(count) = maybe else {\n        items.extend(extra);\n        return;\n    };\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn moved(items: Vec<i32>, extra: Vec<i32>) -> usize {\n    let mut items = items;\n    items.extend(extra);\n    return items.len();\n}\n".to_string(),
                "items",
            ),
            (
                "pub fn captured(mut items: Vec<i32>, extra: Vec<i32>) {\n    let mut push = || {\n        items.extend(extra);\n    };\n    push();\n}\n".to_string(),
                "items",
            ),
        ];
        for (source, name) in &restored {
            let output = compile_typescript(source, None).unwrap();
            assert!(lowered(&output, name), "{output}");
        }
    }

    // Qualified value and type paths and public re-exports resolve through the same canonical
    // ModuleSource model as `use` bindings: `crate::` / `self::` / `super::` paths name the declaring
    // module directly, and a public `use` re-export forwards to its declaration. Private, cyclic,
    // ambiguous or missing chains fail closed.
    #[test]
    fn lowers_vec_extend_with_qualified_and_reexported_owners() {
        let module = |path, source| ModuleSource { path, source };
        let compile = |source: ModuleSource<'_>, aliases: &[ModuleSource<'_>]| {
            compile_typescript_with_module_sources(source, None, aliases, &[])
        };
        let rejected = "portable `.extend()` requires a receiver declared as Rust `Vec`";
        let bucket = "pub struct Bucket { pub items: Vec<i32> }\npub fn make_values() -> Vec<i32> { return vec![1]; }\n";
        let text_bucket = "pub struct Bucket { pub items: String }\npub fn make_values() -> String { return String::new(); }\n";
        let prelude = "pub use crate::bucket::Bucket;\n";
        let private_prelude = "use crate::bucket::Bucket;\n";
        let cycle_a = "pub use crate::cycle_b::Bucket;\n";
        let cycle_b = "pub use crate::cycle_a::Bucket;\n";
        let ambiguous = "pub use crate::bucket::*;\npub use crate::other::*;\n";
        let qualified_function = "pub fn append(extra: Vec<i32>) -> Vec<i32> {\n    let mut values = crate::bucket::make_values();\n    values.extend(extra);\n    return values;\n}\n";
        let qualified_type = "pub fn append(mut bucket: crate::bucket::Bucket, extra: Vec<i32>) -> crate::bucket::Bucket {\n    bucket.items.extend(extra);\n    return bucket;\n}\n";
        let through = |path: &str| {
            format!(
                "use crate::{path}::Bucket;\npub fn append(mut bucket: Bucket, extra: Vec<i32>) -> Bucket {{\n    bucket.items.extend(extra);\n    return bucket;\n}}\n"
            )
        };
        let reexport = through("prelude");
        let private_reexport = through("private_prelude");
        let cyclic = through("cycle_a");
        let ambiguous_consumer = through("ambiguous");
        let current = "crates/flight-demo/src/current.rs";
        let bucket_path = "crates/flight-demo/src/bucket.rs";
        let other_path = "crates/flight-demo/src/other.rs";

        for (source, aliases, name) in [
            (
                qualified_function,
                vec![module(bucket_path, bucket)],
                "values",
            ),
            (
                qualified_type,
                vec![module(bucket_path, bucket)],
                "bucket.items",
            ),
            (
                &reexport,
                vec![
                    module(bucket_path, bucket),
                    module("crates/flight-demo/src/prelude.rs", prelude),
                ],
                "bucket.items",
            ),
        ] {
            let output = compile(module(current, source), &aliases).unwrap();
            assert!(
                output.contains(&format!(
                    "  for (let index = 0, count = extra.length; index < count; index++) {{\n    {name}.push(extra[index]);\n  }}\n"
                )),
                "{output}"
            );
        }
        for (source, aliases) in [
            (qualified_function, vec![module(other_path, bucket)]),
            (qualified_type, vec![module(bucket_path, text_bucket)]),
            (
                &private_reexport,
                vec![
                    module(bucket_path, bucket),
                    module("crates/flight-demo/src/private_prelude.rs", private_prelude),
                ],
            ),
            (
                &cyclic,
                vec![
                    module("crates/flight-demo/src/cycle_a.rs", cycle_a),
                    module("crates/flight-demo/src/cycle_b.rs", cycle_b),
                ],
            ),
            (
                &ambiguous_consumer,
                vec![
                    module(bucket_path, bucket),
                    module(other_path, bucket),
                    module("crates/flight-demo/src/ambiguous.rs", ambiguous),
                ],
            ),
        ] {
            let error = compile(module(current, source), &aliases).unwrap_err();
            assert_eq!(error.to_string(), rejected, "{source}");
        }
    }

    // Struct and function facts resolve from the selected source's full module identity: its own
    // declarations, then its explicit, grouped or renamed `use` bindings, then its globs, each reaching
    // a public declaration in the source with exactly that identity. A same-named declaration in any
    // other source is never consulted; private, absent, ambiguous or identity-less sources fail closed.
    #[test]
    fn lowers_vec_extend_with_source_owned_sequence_facts() {
        let module = |path, source| ModuleSource { path, source };
        let compile = |source: ModuleSource<'_>, aliases: &[ModuleSource<'_>]| {
            compile_typescript_with_module_sources(source, None, aliases, &[])
        };
        let lowered = |field: &str| {
            format!(
                "  for (let index = 0, count = extra.length; index < count; index++) {{\n    {field}.items.push(extra[index]);\n  }}\n"
            )
        };
        let rejected = "portable `.extend()` requires a receiver declared as Rust `Vec`";

        let string_source = "struct SharedCollision { items: String }\nfn make_collision(items: String) -> SharedCollision { SharedCollision { items } }\npub fn extend_string(items: String, extra: Vec<&'static str>) -> String {\n    let mut shared = make_collision(items);\n    shared.items.extend(extra);\n    shared.items\n}\n";
        let private_vec_alias = "struct SharedCollision { items: Vec<&'static str> }\nfn make_collision(items: Vec<&'static str>) -> SharedCollision { SharedCollision { items } }\n";
        let vec_source = "struct SharedCollision { items: Vec<i32> }\nfn make_collision(items: Vec<i32>) -> SharedCollision { return SharedCollision { items: items }; }\npub fn extend_vec(items: Vec<i32>, extra: Vec<i32>) -> Vec<i32> {\n    let mut shared = make_collision(items);\n    shared.items.extend(extra);\n    return shared.items;\n}\n";
        let public_string_alias = "pub struct SharedCollision { pub items: String }\npub fn make_collision(items: String) -> SharedCollision { return SharedCollision { items: items }; }\n";
        let held_vec = "pub struct Held { pub items: Vec<i32> }\npub fn make_held(items: Vec<i32>) -> Held { return Held { items: items }; }\n";
        let held_string = "pub struct Held { pub items: String }\npub fn make_held(items: String) -> Held { return Held { items: items }; }\n";
        let held_private = "struct Held { items: Vec<i32> }\nfn make_held(items: Vec<i32>) -> Held { return Held { items: items }; }\n";
        let extend_body = "pub fn append(mut held: Held, extra: Vec<i32>) -> Held {\n    held.items.extend(extra);\n    return held;\n}\n";
        let call_body = "pub fn extend_imported(items: Vec<i32>, extra: Vec<i32>) -> Vec<i32> {\n    let mut held = make_held(items);\n    held.items.extend(extra);\n    return held.items;\n}\n";
        let with_use = |use_line: &str, body: &str| format!("{use_line}\n{body}");
        let explicit = with_use("use crate::held::{Held, make_held};", call_body);
        let grouped_type = with_use(
            "use crate::{held::Held, spare::make_held as make_spare};",
            extend_body,
        );
        let renamed = "use crate::held::Held as RenamedHeld;\npub fn append(mut held: RenamedHeld, extra: Vec<i32>) -> RenamedHeld {\n    held.items.extend(extra);\n    return held;\n}\n";
        let glob = with_use("use crate::held::*;", call_body);
        let two_globs = with_use("use crate::held::*;\nuse crate::spare::*;", extend_body);
        let from_spare = with_use("use crate::spare::Held;", extend_body);
        let unimported = call_body.to_string();
        let super_import = with_use("use super::held::Held;", extend_body);
        let local_string_held = "use crate::held::make_held;\nstruct Held { items: String }\npub fn extend_returned(items: Vec<i32>, extra: Vec<i32>, label: String) -> usize {\n    let local = Held { items: label };\n    let mut held = make_held(items);\n    held.items.extend(extra);\n    return held.items.len() + local.items.len();\n}\n";
        let local_vec_held = "use crate::held::make_held;\nstruct Held { items: Vec<i32> }\npub fn extend_returned(items: String, extra: Vec<&'static str>) -> String {\n    let mut held = make_held(items);\n    held.items.extend(extra);\n    return held.items;\n}\n";

        let current = "crates/flight-demo/src/current.rs";
        let held = "crates/flight-demo/src/held.rs";
        let spare = "crates/flight-demo/src/spare.rs";
        let other_crate_held = "crates/flight-other/src/held.rs";
        for (source, aliases) in [
            (module(current, string_source), vec![]),
            (
                module(current, string_source),
                vec![module(spare, private_vec_alias)],
            ),
            (module(current, &explicit), vec![module(held, held_private)]),
            (
                module(current, &explicit),
                vec![module(other_crate_held, held_vec)],
            ),
            (module(current, &explicit), vec![module(spare, held_vec)]),
            (module(current, &unimported), vec![module(held, held_vec)]),
            (
                module(current, &two_globs),
                vec![module(held, held_vec), module(spare, held_vec)],
            ),
            (
                module(current, &from_spare),
                vec![module(held, held_vec), module(spare, held_string)],
            ),
            (
                module(current, local_vec_held),
                vec![module(held, held_string)],
            ),
            (
                module("current.rs", &explicit),
                vec![module(held, held_vec)],
            ),
            (
                module(current, &explicit),
                vec![module(held, held_vec), module(held, held_vec)],
            ),
        ] {
            let error = compile(source, &aliases).unwrap_err();
            assert_eq!(error.to_string(), rejected, "{}", source.source);
        }
        for (source, aliases, field) in [
            (
                module(current, vec_source),
                vec![module(spare, public_string_alias)],
                "shared",
            ),
            (
                module(current, vec_source),
                vec![module(spare, private_vec_alias)],
                "shared",
            ),
            (
                module(current, &explicit),
                vec![module(held, held_vec)],
                "held",
            ),
            (
                module(current, &grouped_type),
                vec![module(held, held_vec), module(spare, held_string)],
                "held",
            ),
            (
                module(current, renamed),
                vec![module(held, held_vec)],
                "held",
            ),
            (module(current, &glob), vec![module(held, held_vec)], "held"),
            (
                module(current, &explicit),
                vec![module(held, held_vec), module(spare, held_string)],
                "held",
            ),
            (
                module("crates/flight-demo/src/nested/current.rs", &super_import),
                vec![module("crates/flight-demo/src/nested/held.rs", held_vec)],
                "held",
            ),
            (
                module(current, local_string_held),
                vec![module(held, held_vec)],
                "held",
            ),
        ] {
            let output = compile(source, &aliases).unwrap();
            assert!(output.contains(&lowered(field)), "{output}");
        }
        let error =
            compile_typescript_with_alias_sources(&explicit, None, &[held_vec]).unwrap_err();
        assert_eq!(error.to_string(), rejected);

        let option_source = "use crate::shape::Shape;\npub fn width_of(options: Option<&Shape>) -> f32 {\n    return options.and_then(|o| o.width.map(|w| w * 2.0)).unwrap_or(0.0);\n}\n";
        let shape = "pub struct Shape { pub width: Option<f32> }\n";
        let output = compile(
            module(current, option_source),
            &[module("crates/flight-demo/src/shape.rs", shape)],
        )
        .unwrap();
        assert!(output.contains(
            "return (((o) => o === undefined ? undefined : ((w) => w === undefined ? undefined : w * 2.0)(o.width))(options) ?? 0.0);"
        ));
        let error = compile(
            module(current, option_source),
            &[module("crates/flight-demo/src/other.rs", shape)],
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "portable `.map()` on a field requires the field to be declared as Rust `Option`"
        );
    }

    #[test]
    fn resolves_qualified_paths_and_public_reexports_through_module_sources() {
        let bucket = r#"
pub struct Bucket {
    pub previous: Option<i32>,
}

pub fn make_values() -> Option<i32> {
    return None;
}
"#;
        let prelude = "pub use crate::bucket::Bucket;\n";
        let source = r#"
pub fn doubled(bucket: crate::prelude::Bucket) -> i32 {
    return bucket.previous.map(|value| value * 2).unwrap_or(0);
}

pub fn values_are_missing() -> bool {
    return crate::bucket::make_values().is_none();
}
"#;
        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-demo/src/current.rs",
                source,
            },
            None,
            &[
                ModuleSource {
                    path: "crates/flight-demo/src/bucket.rs",
                    source: bucket,
                },
                ModuleSource {
                    path: "crates/flight-demo/src/prelude.rs",
                    source: prelude,
                },
            ],
            &[],
        )
        .unwrap();

        assert!(output.contains(
            "((value) => value === undefined ? undefined : value * 2)(bucket.previous) ?? 0"
        ));
        assert!(output.contains("crate.bucket.makeValues() === undefined"));

        let private_prelude = "use crate::bucket::Bucket;\n";
        let error = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-demo/src/current.rs",
                source,
            },
            None,
            &[
                ModuleSource {
                    path: "crates/flight-demo/src/bucket.rs",
                    source: bucket,
                },
                ModuleSource {
                    path: "crates/flight-demo/src/prelude.rs",
                    source: private_prelude,
                },
            ],
            &[],
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "portable `.map()` on a field requires the field to be declared as Rust `Option`"
        );
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
    fn maps_opted_in_options_to_explicit_nullable_values() {
        let source = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<Matrix>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}

pub fn has_previous(sample: &Sample) -> bool {
    return sample.previous.is_some();
}

pub fn keep_sample(sample: Option<&Sample>) -> Option<&Sample> {
    if let Some(value) = sample {
        return Some(value);
    }
    return None;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("previous: Matrix | null;"));
        assert!(!output.contains("previous?: Matrix;"));
        assert!(output.contains("return { previous: null };"));
        assert!(output.contains("sample.previous !== null"));
        assert!(output.contains(
            "export function keepSample(sample: Readonly<Sample> | null): Readonly<Sample> | null"
        ));
        assert!(output.contains("if (sample !== null)"));
        assert!(output.contains("return null;"));
    }

    #[test]
    fn rejects_malformed_nullable_option_directives() {
        for (source, expected) in [
            (
                "//! flight-compiler: nullable-options extra\n",
                "`flight-compiler: nullable-options` does not accept arguments",
            ),
            (
                "//! flight-compiler: nullable-options\n//! flight-compiler: nullable-options\n",
                "duplicate `flight-compiler: nullable-options` directive",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    #[test]
    fn keeps_undefined_options_local_to_sources_without_nullable_opt_in() {
        let aliases = r#"
//! flight-compiler: nullable-options

pub fn accept_value(value: Option<i32>) {}
"#;
        let source = r#"
pub struct Settings {
    pub value: Option<i32>,
}

pub static DEFAULT_VALUE: Option<i32> = None;

pub fn call_nullable_contract() {
    accept_value(None);
}
"#;

        let output = compile_typescript_with_alias_sources(source, None, &[aliases]).unwrap();

        assert!(output.contains("value?: number;"));
        assert!(output.contains("DEFAULT_VALUE: number | undefined = undefined;"));
        assert!(output.contains("acceptValue(null);"));
        assert!(!output.contains("value: number | null;"));
    }

    #[test]
    fn lowers_real_velocity_sources_with_nullable_option_semantics() {
        let sample_source = include_str!("../../flight-velocity/src/velocity_sample.rs");
        let sample_output = compile_typescript(sample_source, None).unwrap();
        assert!(
            sample_output
                .starts_with("import type { Matrix } from \"@flighthq/geometry/contract\";\n\n")
        );
        assert!(sample_output.contains("previousWorldTransform: Matrix | null;"));
        assert!(sample_output.contains("sample: Readonly<VelocitySample> | null, frameId: number"));
        assert!(sample_output.contains("if (sample !== null)"));
        assert!(sample_output.contains("previousWorldTransform: null"));

        let transform_source = include_str!("../../flight-velocity/src/transform_velocity.rs")
            .replacen("//! flight-compiler: target-native\n", "", 1);
        let transform_output = compile_typescript(&transform_source, None).unwrap();
        assert!(transform_output.starts_with(
            r#"import { copyMatrix, createMatrix } from "@flighthq/geometry/contract";
import { ensureNodeWorldMatrix, getNodeChildAt, getNodeChildCount, getNodeWorldMatrix } from "@flighthq/node/contract";
import type { NodeRef } from "@flighthq/node/contract";

"#
        ));
        assert!(transform_output.contains("sample.previousWorldTransform !== null"));
        assert!(transform_output.contains("sample.previousWorldTransform === null"));
        assert!(transform_output.contains("getNodeChildAt(node, (i) | 0) !== null"));
    }

    #[test]
    fn lowers_some_let_else_bindings_and_real_requirement_collection() {
        let source = r#"
pub fn first_or(values: &[i32], fallback: i32) -> i32 {
    let Some(first) = values.first() else {
        return fallback;
    };
    return *first;
}

pub fn required(value: Option<i32>) -> i32 {
    let Some(value) = value else {
        return -1;
    };
    return value;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "const first = values[0];\n  if (first === undefined) {\n    return fallback;\n  }"
        ));
        assert!(
            output.contains("if (value === undefined) {\n    return -1;\n  }\n  return value;")
        );
        assert!(!output.contains("const value = value;"));

        let nullable_source = r#"
//! flight-compiler: nullable-options

pub fn required(value: Option<i32>) -> i32 {
    let Some(value) = value else {
        return -1;
    };
    return value;
}
"#;
        let nullable_output = compile_typescript(nullable_source, None).unwrap();
        assert!(nullable_output.contains("if (value === null) {"));

        let requirement_collector =
            include_str!("../../flight-requirement/src/requirement_collector.rs");
        let requirement_output = compile_typescript(requirement_collector, None).unwrap();
        assert!(requirement_output.contains(
            "if (sink === undefined) {\n    return;\n  }\n  sink.push({ facet: facet, key: String(key) });"
        ));
        assert!(!requirement_output.contains("sink = sink;"));
    }

    #[test]
    fn rejects_non_option_let_else_patterns_deterministically() {
        let source = r#"
pub fn required(value: Result<i32, i32>) -> i32 {
    let Ok(value) = value else {
        return -1;
    };
    return value;
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `let-else` supports only a `Some(name)` pattern"
        );
    }

    #[test]
    fn emits_readonly_entity_initializers_with_a_writable_construction_view() {
        let source = r#"
//! flight-compiler: readonly-fields Requirement RequirementSet
//! flight-compiler: string-union RequirementFacet

use flight_entity::{EntityRuntimeSlot, allocate_entity};

pub enum RequirementFacet {
    SceneNodeKind,
}

pub struct Requirement {
    pub facet: RequirementFacet,
    pub key: String,
}

pub struct RequirementSet {
    pub covers: Vec<RequirementFacet>,
    pub requirements: Vec<Requirement>,
    runtime: EntityRuntimeSlot,
}

pub fn create_requirement_set(
    covers: Vec<RequirementFacet>,
    requirements: Vec<Requirement>,
) -> RequirementSet {
    let mut out: RequirementSet = allocate_entity();
    initialize_requirement_set(&mut out, covers, requirements);
    return out;
}

pub fn initialize_requirement_set(
    out: &mut RequirementSet,
    covers: Vec<RequirementFacet>,
    requirements: Vec<Requirement>,
) {
    out.covers = covers;
    out.requirements = requirements;
}

flight_entity::impl_entity!(RequirementSet);
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert_eq!(
            output,
            r#"import { allocateEntity } from "@flighthq/entity/contract";
import type { EntityConstruction, EntityRaw } from "@flighthq/entity/contract";

export type RequirementFacet = "sceneNodeKind";

export interface Requirement {
  readonly facet: RequirementFacet;
  readonly key: string;
}

export interface RequirementSetRaw extends EntityRaw {
  readonly covers: RequirementFacet[];
  readonly requirements: Requirement[];
}

export function createRequirementSet(covers: RequirementFacet[], requirements: Requirement[]): RequirementSetRaw {
  let out: RequirementSetRaw = Object.assign(allocateEntity<RequirementSetRaw>(), { covers: [], requirements: [] });
  initializeRequirementSet(out, covers, requirements);
  return out;
}

export function initializeRequirementSet(out: EntityConstruction<RequirementSetRaw>, covers: RequirementFacet[], requirements: Requirement[]): void {
  out.covers = covers;
  out.requirements = requirements;
}
"#
        );
    }

    #[test]
    fn retains_parameter_types_without_the_complete_readonly_entity_initializer_proof() {
        let source = r#"
//! flight-compiler: readonly-fields ReadonlyEntity ReadonlyRecord

pub struct ReadonlyEntity {
    runtime: EntityRuntimeSlot,
    pub value: u32,
}

pub struct MutableEntity {
    runtime: EntityRuntimeSlot,
    pub value: u32,
}

pub struct ReadonlyRecord {
    pub value: u32,
}

pub fn initialize_nonleading(flag: bool, out: &mut ReadonlyEntity) {}

pub fn initialize_shared(out: &ReadonlyEntity) {}

pub fn initialize_record(out: &mut ReadonlyRecord) {}

pub fn update_readonly_entity(out: &mut ReadonlyEntity) {}

pub fn initialize_mutable_entity(out: &mut MutableEntity) {}

flight_entity::impl_entity!(ReadonlyEntity);
flight_entity::impl_entity!(MutableEntity);
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "export function initializeNonleading(flag: boolean, out: ReadonlyEntityRaw): void"
        ));
        assert!(
            output.contains(
                "export function initializeShared(out: Readonly<ReadonlyEntityRaw>): void"
            )
        );
        assert!(output.contains("export function initializeRecord(out: ReadonlyRecord): void"));
        assert!(
            output.contains("export function updateReadonlyEntity(out: ReadonlyEntityRaw): void")
        );
        assert!(
            output.contains("export function initializeMutableEntity(out: MutableEntityRaw): void")
        );
        assert!(!output.contains("EntityConstruction"));
    }

    #[test]
    fn emits_private_fields_on_module_private_plain_data_structs() {
        let source = r#"
struct DecoderState {
    bytes: Vec<u8>,
    position: usize,
    limit: Option<usize>,
}

pub fn advance_decoder(bytes: Vec<u8>) -> usize {
    let mut state = DecoderState {
        bytes,
        position: 0,
        limit: None,
    };
    state.position += 1;
    return state.position;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "interface DecoderState {\n  bytes: number[];\n  position: number;\n  limit?: number;\n}"
        ));
        assert!(!output.contains("export interface DecoderState"));
        assert!(
            output.contains("let state = { bytes: bytes, position: 0, limit: undefined };"),
            "{output}"
        );
        assert!(output.contains("state.position += 1;"));
    }

    #[test]
    fn lowers_designated_entity_runtime_state_into_the_runtime_slot() {
        let source = r#"
//! flight-compiler: entity-runtime-state LassoSelection.state

use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Opaque freeform gesture state.
pub struct LassoSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: LassoSelectionRuntime,
}

pub struct LassoSelectionRuntime {
    pub active: bool,
    pub count: f64,
}

impl Default for LassoSelection {
    fn default() -> Self {
        return LassoSelection {
            runtime: EntityRuntimeSlot::default(),
            state: LassoSelectionRuntime { active: false, count: 0.0 },
        };
    }
}

flight_entity::impl_entity!(LassoSelection);

pub fn create_lasso_selection() -> LassoSelection {
    let mut out: LassoSelection = allocate_entity();
    initialize_lasso_selection(&mut out);
    return out;
}

pub fn initialize_lasso_selection(out: &mut LassoSelection) {
    out.state = LassoSelectionRuntime { active: false, count: 0.0 };
}

pub fn begin_lasso_selection(selection: &mut LassoSelection) {
    selection.state.active = true;
    selection.state.count += 1.0;
}

pub fn is_lasso_selection_active(selection: &LassoSelection) -> bool {
    return selection.state.active;
}
"#;
        let access = "lassoSelectionStateStore.get(selection)!";

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.starts_with(
            "import { allocateEntity } from \"@flighthq/entity/contract\";\nimport type { EntityRaw } from \"@flighthq/entity/contract\";\n"
        ));
        assert!(output.contains(
            "/**\n * Opaque freeform gesture state.\n */\nexport interface LassoSelectionRaw extends EntityRaw {\n}\n"
        ));
        assert!(
            output
                .contains("  lassoSelectionStateStore.set(out, { active: false, count: 0.0 });\n")
        );
        assert!(output.ends_with(
            "\n// Crate-private `LassoSelection.state`, keyed by entity identity and reachable only from this package's modules.\nconst lassoSelectionStateStore = /* @__PURE__ */ new WeakMap<Readonly<LassoSelectionRaw>, LassoSelectionRuntime>();\n\nexport { lassoSelectionStateStore };\n"
        ));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(!output.contains("export const"));
        assert!(output.contains(&format!("  {access}.active = true;\n")));
        assert!(output.contains(&format!("  {access}.count += 1.0;\n")));
        assert!(output.contains(
            "export function isLassoSelectionActive(selection: Readonly<LassoSelectionRaw>): boolean {\n"
        ));
        assert!(output.contains(&format!("  return {access}.active;\n")));
        assert!(!output.contains("selection.state") && !output.contains("out.state"));
        assert!(!output.contains("state:"));
        assert!(!output.contains("export type"));
    }

    #[test]
    fn lowers_ref_wrapped_entity_runtime_state_into_the_runtime_slot() {
        let source = r#"
//! flight-compiler: entity-runtime-state SelectionState.state

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};

pub struct SelectionState {
    runtime: EntityRuntimeSlot,
    pub(crate) state: Ref<SelectionStateRuntime>,
}

pub struct SelectionStateRuntime {
    pub count: f64,
    pub items: Vec<f64>,
}

flight_entity::impl_entity!(SelectionState);

pub fn initialize_selection_state(out: &mut SelectionState) {
    out.state = flight_entity::Ref::new(std::sync::RwLock::new(SelectionStateRuntime {
        count: 0.0,
        items: Vec::new(),
    }));
}

pub fn add_selection_item(state: &SelectionState, item: f64) {
    let mut runtime = state.state.write().unwrap();
    runtime.count += 1.0;
    runtime.items.push(item);
}

pub fn get_selection_count(state: &SelectionState) -> f64 {
    return state.state.read().unwrap().count;
}
"#;
        let access = "selectionStateStateStore.get(state)!";

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(
            output.starts_with("import type { EntityRaw } from \"@flighthq/entity/contract\";\n")
        );
        assert!(output.contains("export interface SelectionStateRaw extends EntityRaw {\n}\n"));
        assert!(output.contains(
            "  selectionStateStateStore.set(out, { count: 0.0, items: [] as never[] });\n"
        ));
        assert!(output.contains(
            "const selectionStateStateStore = /* @__PURE__ */ new WeakMap<Readonly<SelectionStateRaw>, SelectionStateRuntime>();\n\nexport { selectionStateStateStore };\n"
        ));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(output.contains(&format!("  let runtime = {access}!;\n")));
        assert!(output.contains("  runtime.items.push(item);\n"));
        assert!(output.contains(&format!("  return {access}!.count;\n")));
        assert!(!output.contains("Ref"));
        assert!(!output.contains("state.state") && !output.contains("out.state"));
    }

    #[test]
    fn lowers_entity_runtime_state_designated_in_a_sibling_module() {
        let types = r#"
//! flight-compiler: entity-runtime-state LassoSelection.state

use flight_entity::EntityRuntimeSlot;

pub struct LassoSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: LassoSelectionRuntime,
}

pub struct LassoSelectionRuntime {
    pub active: bool,
}

flight_entity::impl_entity!(LassoSelection);
"#;
        let functions = r#"
use crate::types::*;

pub fn end_lasso_selection(selection: &mut LassoSelection) -> bool {
    let active = selection.state.active;
    selection.state.active = false;
    return active;
}
"#;

        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-selection/src/lasso_selection.rs",
                source: functions,
            },
            Some("@flighthq/entity/contract"),
            &[ModuleSource {
                path: "crates/flight-selection/src/types.rs",
                source: types,
            }],
            &[],
        )
        .unwrap();

        assert!(output.starts_with(
            "import { lassoSelectionStateStore } from \"./types.ts\";\n\nexport function endLassoSelection("
        ));
        assert!(
            output.contains("  const active = lassoSelectionStateStore.get(selection)!.active;\n")
        );
        assert!(output.contains("  lassoSelectionStateStore.get(selection)!.active = false;\n"));
        assert!(!output.contains("const lassoSelectionStateStore"));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(!output.contains(".state"));

        let unidentified = compile_typescript_with_alias_sources(
            functions,
            Some("@flighthq/entity/contract"),
            &[types],
        )
        .unwrap_err();
        assert_eq!(
            unidentified.to_string(),
            "cannot resolve the receiver of `.state`, which is designated entity runtime state on `LassoSelection`; bind the receiver to a local or parameter of that entity type"
        );
    }

    #[test]
    fn rejects_entity_runtime_state_access_that_would_expose_or_miss_the_slot() {
        let declaration = r#"
//! flight-compiler: entity-runtime-state LassoSelection.state

use flight_entity::{EntityRuntimeSlot, allocate_entity};

pub struct LassoSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: LassoSelectionRuntime,
}

pub struct LassoSelectionRuntime {
    pub active: bool,
}

pub struct Tool {
    pub state: f64,
}

flight_entity::impl_entity!(LassoSelection);
"#;
        let cases = [
            (
                "pub fn first_active(selections: Vec<LassoSelection>) -> bool {\n    return selections[0].state.active;\n}\n",
                "cannot resolve the receiver of `.state`, which is designated entity runtime state on `LassoSelection`; bind the receiver to a local or parameter of that entity type",
            ),
            (
                "pub fn make_lasso_selection() -> LassoSelection {\n    return LassoSelection {\n        runtime: EntityRuntimeSlot::default(),\n        state: LassoSelectionRuntime { active: true },\n    };\n}\n",
                "a `LassoSelection` struct literal would expose its designated entity runtime state as a public property; allocate it with `allocate_entity` and assign the state field",
            ),
        ];
        for (function, expected) in cases {
            assert_eq!(
                compile_typescript(
                    &format!("{declaration}\n{function}"),
                    Some("@flighthq/entity/contract")
                )
                .unwrap_err()
                .to_string(),
                expected
            );
        }

        assert_eq!(
            compile_typescript(
                &format!(
                    "{declaration}\npub fn lasso_selection_state_store() -> f64 {{\n    return 0.0;\n}}\n"
                ),
                Some("@flighthq/entity/contract")
            )
            .unwrap_err()
            .to_string(),
            "Rust identifier lowering to `lassoSelectionStateStore` collides with a generated entity runtime state store"
        );

        let ordinary = compile_typescript(
            &format!(
                "{declaration}\npub fn read_tool(tool: &Tool) -> f64 {{\n    return tool.state;\n}}\n"
            ),
            Some("@flighthq/entity/contract"),
        )
        .unwrap();
        assert!(ordinary.contains("  return tool.state;\n"));
    }

    #[test]
    fn rejects_malformed_entity_runtime_state_designations() {
        let entity = |directive: &str, fields: &str| {
            format!(
                "{directive}\nuse flight_entity::EntityRuntimeSlot;\n\npub struct Lasso {{\n    runtime: EntityRuntimeSlot,\n{fields}}}\n\nstruct Plain {{\n    state: f64,\n}}\n\nflight_entity::impl_entity!(Lasso);\n"
            )
        };
        let private_state = "    pub(crate) state: f64,\n";
        let cases = [
            (
                entity("//! flight-compiler: entity-runtime-state", private_state),
                "`flight-compiler: entity-runtime-state` requires at least one `Owner.field` designation".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Lasso", private_state),
                "`flight-compiler: entity-runtime-state` designation `Lasso` is not `Owner.field`".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Lasso.state.active", private_state),
                "`flight-compiler: entity-runtime-state` designation `Lasso.state.active` is not `Owner.field`".to_string(),
            ),
            (
                entity(
                    "//! flight-compiler: entity-runtime-state Lasso.state Lasso.extra",
                    "    pub(crate) state: f64,\n    pub(crate) extra: f64,\n",
                ),
                "ambiguous `flight-compiler: entity-runtime-state` for `Lasso`: `state` and `extra` are both designated; an entity has one runtime state field".to_string(),
            ),
            (
                entity(
                    "//! flight-compiler: entity-runtime-state Lasso.state\n//! flight-compiler: entity-runtime-state Lasso.state",
                    private_state,
                ),
                "ambiguous `flight-compiler: entity-runtime-state` for `Lasso`: `state` and `state` are both designated; an entity has one runtime state field".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Missing.state", ""),
                "`flight-compiler: entity-runtime-state Missing.state` names no struct declared in this source".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Plain.state", ""),
                "`flight-compiler: entity-runtime-state Plain.state` requires `Plain` to be an entity with a private `runtime: EntityRuntimeSlot`".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Lasso.missing", ""),
                "`flight-compiler: entity-runtime-state Lasso.missing` names no field of `Lasso`".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Lasso.state", "    pub state: f64,\n"),
                "`flight-compiler: entity-runtime-state Lasso.state` must designate a crate-private state field, not a public field or the runtime slot".to_string(),
            ),
            (
                entity("//! flight-compiler: entity-runtime-state Lasso.runtime", ""),
                "`flight-compiler: entity-runtime-state Lasso.runtime` must designate a crate-private state field, not a public field or the runtime slot".to_string(),
            ),
            (
                entity("", "    pub(crate) state: f64,\n    pub(crate) extra: f64,\n")
                    .replace("//! flight-compiler: entity-runtime-state Lasso.state", ""),
                "unsupported private field `state` on `Lasso`; only the EntityRuntimeSlot is target-private unless the field is designated with `flight-compiler: entity-runtime-state Lasso.state`".to_string(),
            ),
            (
                entity(
                    "//! flight-compiler: entity-runtime-state Lasso.state",
                    "    pub(crate) state: f64,\n    pub(crate) extra: f64,\n",
                ),
                "unsupported private field `extra` on `Lasso`; only the EntityRuntimeSlot is target-private unless the field is designated with `flight-compiler: entity-runtime-state Lasso.extra`".to_string(),
            ),
        ];

        for (source, expected) in cases {
            assert_eq!(
                compile_typescript(&source, Some("@flighthq/entity/contract"))
                    .unwrap_err()
                    .to_string(),
                expected
            );
        }
    }

    #[test]
    fn keeps_private_fields_invalid_on_exported_structs_and_entities() {
        let cases = [
            (
                r#"
pub struct PublicRecord {
    hidden: f32,
}
"#,
                "unsupported private field `hidden` on `PublicRecord`; only the EntityRuntimeSlot is target-private",
            ),
            (
                r#"
struct InternalEntity {
    runtime: EntityRuntimeSlot,
    hidden: f32,
}

flight_entity::impl_entity!(InternalEntity);
"#,
                "unsupported private field `hidden` on `InternalEntity`; only the EntityRuntimeSlot is target-private unless the field is designated with `flight-compiler: entity-runtime-state InternalEntity.hidden`",
            ),
        ];

        for (source, expected) in cases {
            assert_eq!(
                compile_typescript(source, Some("@flighthq/entity/contract"))
                    .unwrap_err()
                    .to_string(),
                expected
            );
        }
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
    fn rejects_unsupported_entity_defaults_the_initializer_does_not_definitely_assign() {
        let declarations = r#"
pub enum Mode {
    Disabled,
    Enabled,
}

pub struct Marker {
    runtime: EntityRuntimeSlot,
    pub label: Mode,
    pub mode: Mode,
}
"#;
        let cases = [
            (
                "one branch",
                r#"
pub fn create_marker(enabled: bool) -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    initialize_marker(&mut out, enabled);
    return out;
}

pub fn initialize_marker(out: &mut Marker, enabled: bool) {
    out.label = Mode::Enabled;
    if enabled {
        out.mode = Mode::Enabled;
    }
}
"#,
                "mode",
            ),
            (
                "after early return",
                r#"
pub fn create_marker(enabled: bool) -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    initialize_marker(&mut out, enabled);
    return out;
}

pub fn initialize_marker(out: &mut Marker, enabled: bool) {
    out.label = Mode::Enabled;
    if !enabled {
        return;
    }
    out.mode = Mode::Enabled;
}
"#,
                "mode",
            ),
            (
                "not the next statement",
                r#"
pub fn create_marker(enabled: bool) -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    let ready = enabled;
    initialize_marker(&mut out, ready);
    return out;
}

pub fn initialize_marker(out: &mut Marker, enabled: bool) {
    out.label = Mode::Enabled;
    out.mode = Mode::Disabled;
}
"#,
                "label",
            ),
            (
                "shared reference",
                r#"
pub fn create_marker() -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    inspect_marker(&out);
    return out;
}

pub fn inspect_marker(out: &Marker) {}
"#,
                "label",
            ),
            (
                "another local",
                r#"
pub fn create_marker(other: &mut Marker) -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    initialize_marker(other);
    return out;
}

pub fn initialize_marker(out: &mut Marker) {
    out.label = Mode::Enabled;
    out.mode = Mode::Disabled;
}
"#,
                "label",
            ),
            (
                "one field unassigned",
                r#"
pub fn create_marker() -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    initialize_marker(&mut out);
    return out;
}

pub fn initialize_marker(out: &mut Marker) {
    out.label = Mode::Enabled;
}
"#,
                "mode",
            ),
        ];

        for (shape, functions, field) in cases {
            let source = format!("{declarations}{functions}");
            let error = compile_typescript(&source, Some("@flighthq/entity/contract")).unwrap_err();
            assert_eq!(
                error.to_string(),
                format!(
                    "cannot lower `allocate_entity` default for `MarkerRaw.{field}`: unsupported Rust field type `Mode`"
                ),
                "{shape}"
            );
        }
    }

    #[test]
    fn omits_unsupported_entity_defaults_the_next_initializer_definitely_assigns() {
        let source = r#"
use flight_entity::Ref;

pub enum Mode {
    Disabled,
    Enabled,
}

pub struct Settings {
    pub scale: f32,
}

pub struct Marker {
    runtime: EntityRuntimeSlot,
    pub mode: Mode,
    pub settings: Ref<Settings>,
    pub speed: f64,
}

pub fn create_marker(settings: Ref<Settings>, enabled: bool) -> Marker {
    let mut out: Marker = flight_entity::allocate_entity();
    initialize_marker(&mut out, settings, enabled);
    return out;
}

pub fn initialize_marker(out: &mut Marker, settings: Ref<Settings>, enabled: bool) {
    if enabled {
        out.mode = Mode::Enabled;
    } else {
        out.mode = Mode::Disabled;
    }
    out.settings = settings;
    out.speed = 1.0;
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "let out: MarkerRaw = Object.assign(allocateEntity<MarkerRaw>(), { speed: 0 });"
        ));
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
    fn preserves_explicit_kebab_case_string_union_literals() {
        let source = r#"
//! flight-compiler: string-union ResultReason=kebab-case

pub enum ResultReason {
    NoSample,
    HTTPError,
    Ok,
}

pub fn default_reason() -> ResultReason {
    return ResultReason::NoSample;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("export type ResultReason = \"no-sample\" | \"http-error\" | \"ok\";")
        );
        assert!(output.contains("return \"no-sample\";"));
        assert!(!output.contains("noSample"));
    }

    #[test]
    fn emits_exact_string_union_const_objects_and_rewrites_references() {
        let source = r#"
//! flight-compiler: string-union Facet=exact
//! flight-compiler: string-union-value Facet Compression "compression.kind"
//! flight-compiler: string-union-value Facet DisplayName "display  name"
//! flight-compiler: string-union-value Facet SceneNode "scene.node-kind"

#[repr(u8)]
pub enum Facet {
    Compression = 0,
    DisplayName = 1,
    SceneNode = 2,
}

pub fn default_facet() -> Facet {
    return Facet::SceneNode;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export const Facet = {\n  Compression: \"compression.kind\",\n  DisplayName: \"display  name\",\n  SceneNode: \"scene.node-kind\",\n} as const;"
        ));
        assert!(output.contains("export type Facet = (typeof Facet)[keyof typeof Facet];"));
        assert!(output.contains("return \"scene.node-kind\";"));
        assert!(!output.contains("export enum Facet"));
    }

    #[test]
    fn lowers_real_requirement_facet_as_its_exact_const_object() {
        let source = include_str!("../../flight-requirement/src/types.rs");
        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "export const RequirementFacet = {\n  CompressionKind: \"compression.kind\",\n  DocumentFormat: \"document.format\","
        ));
        assert!(
            output
                .contains("  SceneTextureSourceKind: \"scene.texture-source-kind\",\n} as const;")
        );
        assert!(output.contains(
            "export type RequirementFacet = (typeof RequirementFacet)[keyof typeof RequirementFacet];"
        ));
        assert!(output.contains(
            "case \"scene.resource-mime-type\":\n      return \"scene.resource-mime-type\";"
        ));
        assert!(!output.contains("export enum RequirementFacet"));
    }

    #[test]
    fn rejects_malformed_numeric_unions() {
        for (source, expected) in [
            (
                "//! flight-compiler: numeric-union\n",
                "`flight-compiler: numeric-union` requires at least one enum name",
            ),
            (
                "//! flight-compiler: numeric-union Direction Direction\npub enum Direction { Forward = 1 }\n",
                "duplicate `flight-compiler: numeric-union` directive for enum `Direction`",
            ),
            (
                "//! flight-compiler: numeric-union Missing\npub enum Direction { Forward = 1 }\n",
                "`flight-compiler: numeric-union` enum `Missing` does not exist",
            ),
            (
                "//! flight-compiler: numeric-union Direction\npub enum Direction { Forward = 1, Backward }\n",
                "numeric union variant `Direction::Backward` requires an explicit integer discriminant",
            ),
            (
                "//! flight-compiler: numeric-union Direction\npub enum Direction { Forward(f32) }\n",
                "unsupported enum variant `Direction::Forward`; only unit variants are portable",
            ),
            (
                "//! flight-compiler: numeric-union Direction\npub enum Direction { Forward = 1 + 1 }\n",
                "unsupported enum discriminant `Direction::Forward`; explicit discriminants must be integer literals",
            ),
            (
                "//! flight-compiler: numeric-union Direction\npub enum Direction { Forward = 1, Backward = 1 }\n",
                "numeric union `Direction` repeats discriminant `1`",
            ),
            (
                "//! flight-compiler: numeric-union Direction\n//! flight-compiler: data-union Direction\npub enum Direction { Forward(f32), Backward(f32) }\n",
                "enum `Direction` cannot combine `flight-compiler: numeric-union` with another union directive",
            ),
            (
                "//! flight-compiler: numeric-union Direction\n//! flight-compiler: string-union Direction\npub enum Direction { Forward = 1 }\n",
                "enum `Direction` cannot combine `flight-compiler: numeric-union` with another union directive",
            ),
            (
                "//! flight-compiler: numeric-union Direction\npub enum Direction { Backward = -1 }\npub fn negated() -> i8 { return -Direction::Backward as i8; }\n",
                "numeric union `Direction::Backward` cannot follow a unary or binary sign",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
    }

    #[test]
    fn rejects_malformed_string_union_styles() {
        for (source, expected) in [
            (
                "//! flight-compiler: string-union\n",
                "`flight-compiler: string-union` requires at least one enum name",
            ),
            (
                "//! flight-compiler: string-union ResultReason=snake-case\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union` enum `ResultReason` has unknown style `snake-case`",
            ),
            (
                "//! flight-compiler: string-union Result-Reason=kebab-case\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union` enum name `Result-Reason` is not a valid identifier",
            ),
            (
                "//! flight-compiler: string-union ResultReason ResultReason=kebab-case\npub enum ResultReason { Ok }\n",
                "duplicate `flight-compiler: string-union` directive for enum `ResultReason`",
            ),
            (
                "//! flight-compiler: string-union Missing=kebab-case\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union` enum `Missing` does not exist",
            ),
            (
                "//! flight-compiler: string-union ResultReason=exact\npub enum ResultReason { Ok }\n",
                "exact string union `ResultReason` requires one `flight-compiler: string-union-value` directive per variant",
            ),
            (
                "//! flight-compiler: string-union-value ResultReason Ok \"ok\"\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union-value` enum `ResultReason` is not declared by `flight-compiler: string-union`",
            ),
            (
                "//! flight-compiler: string-union ResultReason\n//! flight-compiler: string-union-value ResultReason Ok \"ok\"\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union-value` enum `ResultReason` must use `string-union ResultReason=exact`",
            ),
            (
                "//! flight-compiler: string-union ResultReason=exact\n//! flight-compiler: string-union-value ResultReason Other \"other\"\npub enum ResultReason { Ok }\n",
                "`flight-compiler: string-union-value` variant `ResultReason::Other` does not exist",
            ),
            (
                "//! flight-compiler: string-union ResultReason=exact\n//! flight-compiler: string-union-value ResultReason First \"same\"\n//! flight-compiler: string-union-value ResultReason Second \"same\"\npub enum ResultReason { First, Second }\n",
                "exact string union `ResultReason` repeats value `same`",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    #[test]
    fn lowers_real_velocity_reason_literals_in_sources_and_tests() {
        let production = include_str!("../../flight-velocity/src/velocity_explanation.rs");
        let output = compile_typescript(production, None).unwrap();
        assert!(output.contains(
            "export type VelocityReason = \"no-sample\" | \"stale\" | \"explicit-zero\" | \"derived-zero\" | \"ok\";"
        ));
        assert!(output.contains("case \"no-sample\":"));
        assert!(output.contains("return \"explicit-zero\";"));

        let tests = include_str!("../../flight-velocity/tests/velocity_explanation_test.rs");
        let test_output =
            compile_vitest_with_alias_sources(tests, "@flighthq/velocity/contract", &[production])
                .unwrap();
        assert!(test_output.contains("getVelocityReasonString(\"no-sample\")"));
        assert!(test_output.contains("parseVelocityReason(\"derived-zero\")"));
        assert!(!test_output.contains("VelocityReason.NoSample"));
    }

    #[test]
    fn lowers_union_variant_references_only_in_code() {
        let source = r#"
//! flight-compiler: numeric-union Direction
//! flight-compiler: string-union Mode

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Forward = 1,
    Backward = -1,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Fast,
    Slow,
}

/// Names `Direction.Forward` and `Mode.Fast` in prose; neither is a reference.
pub fn describe(direction: Direction, mode: Mode) -> String {
    if direction == Direction::Forward && mode == Mode::Fast {
        return format!("Direction.Forward Mode.Fast {}", direction_value(Direction::Backward));
    }
    let label = "Direction.Backward 'Mode.Slow' `Direction.Forward`";
    return format!("{label} {}", mode_label(Mode::Slow));
}

pub fn direction_label() -> &'static str {
    return "Direction.Forward";
}

pub fn direction_value(direction: Direction) -> i32 {
    return match direction {
        Direction::Forward => 1,
        Direction::Backward => -1,
    };
}

pub fn mode_label(mode: Mode) -> &'static str {
    return match mode {
        Mode::Fast => "Mode.Fast",
        Mode::Slow => "Mode.Slow",
    };
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            " * Names `Direction.Forward` and `Mode.Fast` in prose; neither is a reference.\n"
        ));
        assert!(output.contains("if (direction === 1 && mode === \"fast\") {"));
        assert!(output.contains("return `Direction.Forward Mode.Fast ${directionValue(-1)}`;"));
        assert!(
            output
                .contains("const label = \"Direction.Backward 'Mode.Slow' `Direction.Forward`\";")
        );
        assert!(output.contains("return `${label} ${modeLabel(\"slow\")}`;"));
        assert!(output.contains("return \"Direction.Forward\";"));
        assert!(output.contains("case 1:\n      return 1;"));
        assert!(output.contains("case -1:\n      return -1;"));
        assert!(output.contains("case \"fast\":\n      return \"Mode.Fast\";"));
        assert!(output.contains("case \"slow\":\n      return \"Mode.Slow\";"));
    }

    #[test]
    fn emits_numeric_unions_as_type_only_integer_aliases() {
        let source = r#"
//! flight-compiler: numeric-union Direction

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(i8)]
pub enum Direction {
    Forward = 1,
    Backward = -1,
}

pub struct Marker {
    pub direction: Direction,
}

pub fn reverse(marker: &mut Marker) {
    marker.direction = match marker.direction {
        Direction::Forward => Direction::Backward,
        Direction::Backward => Direction::Forward,
    };
}

pub fn is_forward(marker: &Marker) -> bool {
    return marker.direction == Direction::Forward;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type Direction = 1 | -1;"));
        assert!(!output.contains("enum Direction"));
        assert!(!output.contains("Direction.Forward"));
        assert!(!output.contains("Direction.Backward"));
        assert!(output.contains("case 1:"));
        assert!(output.contains("case -1:"));
        assert!(output.contains("return marker.direction === 1;"));
    }

    #[test]
    fn inherits_numeric_union_discriminants_in_sibling_production_sources() {
        let union = r#"
//! flight-compiler: numeric-union Direction

pub enum Direction {
    Forward = 1,
    Backward = -1,
}
"#;
        let source = r#"
use crate::Direction;

pub struct Marker {
    pub direction: Direction,
}

pub fn create_marker() -> Marker {
    return Marker { direction: Direction::Backward };
}
"#;

        let output = compile_typescript_with_alias_sources(source, None, &[union]).unwrap();

        assert!(output.contains("direction: Direction;"));
        assert!(output.contains("return { direction: -1 };"));
        assert!(!output.contains("Direction.Backward"));
    }

    #[test]
    fn inherits_string_union_literals_in_sibling_production_sources() {
        let union = r#"
//! flight-compiler: string-union Status=kebab-case

pub enum Status {
    NotReady,
    Ready,
}
"#;
        let source = r#"
use crate::Status;

pub struct Result {
    pub status: Status,
}

pub fn ready() -> Result {
    return Result { status: Status::Ready };
}
"#;

        let output = compile_typescript_with_alias_sources(source, None, &[union]).unwrap();

        assert!(output.contains("status: Status;"));
        assert!(output.contains("return { status: \"ready\" };"));
        assert!(!output.contains("Status.Ready"));

        let velocity_reason = include_str!("../../flight-velocity/src/velocity_explanation.rs");
        let velocity2d = include_str!("../../flight-velocity/src/velocity2d.rs");
        let velocity_sample = include_str!("../../flight-velocity/src/velocity_sample.rs");
        let velocity_output = compile_typescript_with_alias_sources(
            velocity_sample,
            None,
            &[velocity_reason, velocity2d],
        )
        .unwrap();
        assert!(velocity_output.contains("? \"explicit-zero\" : \"derived-zero\""));
        assert!(velocity_output.contains("reason: \"no-sample\""));
        assert!(!velocity_output.contains("VelocityReason."));
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
    fn names_callable_fields_and_makes_only_trailing_options_optional() {
        let source = r#"
//! flight-compiler: callable-field-parameters Hooks impact style intensity
//! flight-compiler: callable-field-parameters Hooks mixed value count
//! flight-compiler: callable-field-parameters Hooks waveform timings repeat
//! flight-compiler: callable-field-parameters Hooks bare count repeat
//! flight-compiler: callable-parameters Callback value fallback

use std::sync::Arc;

pub enum Style {
    Light,
}

pub type Callback = Arc<dyn Fn(i32, Option<i32>) -> bool + Send + Sync>;

pub struct Hooks {
    pub impact: Arc<dyn Fn(Style, Option<f32>) -> bool + Send + Sync>,
    pub mixed: Arc<dyn Fn(Option<f32>, i32) -> bool + Send + Sync>,
    pub waveform: Option<Arc<dyn Fn(&Vec<f32>, Option<i32>) -> bool + Send + Sync>>,
    pub bare: fn(i32, Option<i32>) -> bool,
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output
                .contains("export type Callback = (value: number, fallback?: number) => boolean;")
        );
        assert!(output.contains("impact: (style: Style, intensity?: number) => boolean;"));
        assert!(output.contains("mixed: (value: number | undefined, count: number) => boolean;"));
        assert!(
            output
                .contains("waveform?: (timings: Readonly<number[]>, repeat?: number) => boolean;")
        );
        assert!(output.contains("bare: (count: number, repeat?: number) => boolean;"));

        let nullable_source = r#"
//! flight-compiler: nullable-options
//! flight-compiler: callable-parameters Callback value fallback

pub type Callback = fn(i32, Option<i32>) -> bool;
"#;
        let nullable_output = compile_typescript(nullable_source, None).unwrap();
        assert!(nullable_output.contains(
            "export type Callback = (value: number, fallback: number | null) => boolean;"
        ));
        assert!(!nullable_output.contains("fallback?:"));
    }

    #[test]
    fn emits_real_haptics_callable_field_signatures() {
        let source = include_str!("../../flight-haptics/src/types.rs");
        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("Every operation exposed by `HostHapticsCapability`."));
        assert!(!output.contains("[`HostHapticsCapability`]"));
        assert!(output.contains(
            "Snapshot of what the supplied provider supports. Filled into a caller-owned `out` value; absent"
        ));
        assert!(output.contains("features resolve to `false` rather than throwing."));
        assert!(output.contains("capabilities: (out: HapticsCapabilities) => void;"));
        assert!(
            output.contains("impact: (style: HapticImpactStyle, intensity?: number) => boolean;")
        );
        assert!(output.contains("notification: (type: HapticNotificationType) => boolean;"));
        assert!(output.contains("vibrate: (durationMs: number) => boolean;"));
        assert!(output.contains("vibratePattern: (pattern: Readonly<number[]>) => boolean;"));
        assert!(output.contains(
            "vibrateWaveform?: (timings: Readonly<number[]>, amplitudes: Readonly<number[]>, repeat?: number) => boolean;"
        ));
        for documentation in [
            "Cancels any in-progress vibration. Returns `false` when haptics are unavailable.",
            "Fills `out` with the provider's capabilities.",
            "Triggers a physical impact, with optional continuous intensity (`0..1`).",
            "Reports whether haptics are available on the current device.",
            "Warm-up hint to reduce first-trigger latency. Optional; no-op on providers without",
            "Vibrates with a pattern `[onMs, offMs, ...]`. Returns `false` on an empty pattern or when",
            "Amplitude-aware waveform (`Android VibrationEffect.createWaveform`). Optional; callers fall",
            "back to `vibratePattern(timings)` when absent. `repeat` is the loop index into `timings`, or",
        ] {
            assert!(output.contains(documentation), "missing {documentation}");
        }
    }

    #[test]
    fn accepts_await_as_a_callable_field_parameter_name() {
        let source = r#"
//! flight-compiler: callable-field-parameters Hooks run await

pub struct Hooks {
    pub run: fn(f32) -> f32,
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("run: (await: number) => number;"));
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
                "//! flight-compiler: callable-parameters Remap await\npub type Remap = fn(f32) -> f32;\n",
                "`flight-compiler: callable-parameters Remap` parameter name `await` is not a valid identifier",
            ),
            (
                "//! flight-compiler: callable-parameters Remap super\npub type Remap = fn(f32) -> f32;\n",
                "`flight-compiler: callable-parameters Remap` parameter name `super` is not a valid identifier",
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
    fn rejects_malformed_callable_field_parameter_directives() {
        let cases = [
            (
                "//! flight-compiler: callable-field-parameters\npub struct Hooks { pub run: fn(f32) }\n",
                "`flight-compiler: callable-field-parameters` requires an owner struct name",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks\npub struct Hooks { pub run: fn(f32) }\n",
                "`flight-compiler: callable-field-parameters Hooks` requires a field name",
            ),
            (
                "//! flight-compiler: callable-field-parameters Missing run value\npub struct Hooks { pub run: fn(f32) }\n",
                "`flight-compiler: callable-field-parameters` owner `Missing` does not exist",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks missing value\npub struct Hooks { pub run: fn(f32) }\n",
                "`flight-compiler: callable-field-parameters` field `Hooks.missing` does not exist",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks value value\npub struct Hooks { pub value: f32 }\n",
                "`flight-compiler: callable-field-parameters` field `Hooks.value` is not callable",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run value\npub struct Hooks { pub run: fn(f32, f32) }\n",
                "`flight-compiler: callable-field-parameters` field `Hooks.run` expects 2 parameter names, got 1",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run value\n//! flight-compiler: callable-field-parameters Hooks run next\npub struct Hooks { pub run: fn(f32) }\n",
                "duplicate `flight-compiler: callable-field-parameters` directive for field `Hooks.run`",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run x-y\npub struct Hooks { pub run: fn(f32) }\n",
                "`flight-compiler: callable-field-parameters Hooks run` parameter name `x-y` is not a valid identifier",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run super\npub struct Hooks { pub run: fn(f32) -> f32 }\n",
                "`flight-compiler: callable-field-parameters Hooks run` parameter name `super` is not a valid identifier",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run this\npub struct Hooks { pub run: fn(f32) -> f32 }\n",
                "`flight-compiler: callable-field-parameters Hooks run` parameter name `this` is not a valid identifier",
            ),
            (
                "//! flight-compiler: callable-field-parameters Hooks run value value\npub struct Hooks { pub run: fn(f32, f32) }\n",
                "`flight-compiler: callable-field-parameters Hooks run` repeats parameter name `value`",
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
    fn emits_explicit_export_names_at_every_reference() {
        let utf8 = r#"//! flight-compiler: export-name decode_utf8 decodeUTF8
//! flight-compiler: export-name encode_utf8 encodeUTF8
//! flight-compiler: export-name MAX_UTF8_BYTES maxUTF8Bytes

pub const MAX_UTF8_BYTES: usize = 4;

pub fn decode_utf8(length: usize) -> usize {
    return length + MAX_UTF8_BYTES;
}

pub fn encode_utf8(length: usize) -> usize {
    return decode_utf8(length) * 2;
}
"#;
        let user = r#"use super::utf8::decode_utf8;

pub fn measure(length: usize) -> usize {
    return decode_utf8(length);
}
"#;
        let tests = r#"use flight_probe::*;

mod decode_utf8 {
    use super::*;

    #[test]
    fn adds_the_maximum() {
        assert_eq!(decode_utf8(1), 1 + MAX_UTF8_BYTES);
        assert_eq!(encode_utf8(1), 10);
    }
}
"#;

        assert_eq!(
            compile_typescript_with_alias_sources(utf8, None, &[user]).unwrap(),
            "export const maxUTF8Bytes: number = 4;\n\nexport function decodeUTF8(length: number): number {\n  return length + maxUTF8Bytes;\n}\n\nexport function encodeUTF8(length: number): number {\n  return decodeUTF8(length) * 2;\n}\n"
        );
        assert_eq!(
            compile_typescript_with_alias_sources(user, None, &[utf8]).unwrap(),
            "export function measure(length: number): number {\n  return decodeUTF8(length);\n}\n"
        );
        assert_eq!(
            compile_vitest_with_alias_sources(tests, "./contract.ts", &[utf8]).unwrap(),
            "import { describe, expect, it } from 'vitest';\n\nimport {\n  decodeUTF8,\n  encodeUTF8,\n  maxUTF8Bytes,\n} from \"./contract.ts\";\n\ndescribe(\"decodeUTF8\", () => {\n  it(\"adds the maximum\", () => {\n    expect(decodeUTF8(1)).toEqual(1 + maxUTF8Bytes);\n    expect(encodeUTF8(1)).toEqual(10);\n  });\n});\n"
        );
    }

    #[test]
    fn imports_dependency_export_names_across_packages() {
        let codec = "//! flight-compiler: export-name decode_utf8 decodeUTF8\npub fn decode_utf8(value: usize) -> usize {\n    return value;\n}\n";
        let codec_package = [ExternalAliasSource {
            source: codec,
            module: "@flighthq/codec/contract",
        }];
        let consumer = r#"use flight_codec::decode_utf8;
use flight_codec::decode_utf8 as decode;

pub fn call_decoder(value: usize) -> usize {
    return decode_utf8(value) + decode(value);
}
"#;
        assert_eq!(
            compile_typescript_with_external_alias_sources(consumer, None, &[], &codec_package)
                .unwrap(),
            "import { decodeUTF8, decodeUTF8 as decode } from \"@flighthq/codec/contract\";\n\nexport function callDecoder(value: number): number {\n  return decodeUTF8(value) + decode(value);\n}\n"
        );

        let production = "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n";
        let production_sources = [VitestAliasSource {
            source: production,
            module: "crates/flight-consumer/src/caller.rs",
        }];
        let explicit = r#"use flight_codec::decode_utf8;

mod call_decoder {
    use super::*;

    #[test]
    fn decodes() {
        let decoded = decode_utf8(1);
        assert_eq!(decoded, call_decoder(1));
    }
}
"#;
        assert_eq!(
            compile_vitest_with_external_alias_sources(
                explicit,
                "@flighthq/consumer/contract",
                None,
                &production_sources,
                &codec_package,
            )
            .unwrap(),
            "import { describe, expect, it } from 'vitest';\n\nimport { decodeUTF8 } from \"@flighthq/codec/contract\";\n\nimport {\n  callDecoder,\n} from \"@flighthq/consumer/contract\";\n\ndescribe(\"callDecoder\", () => {\n  it(\"decodes\", () => {\n    const decoded = decodeUTF8(1);\n    expect(decoded).toEqual(callDecoder(1));\n  });\n});\n"
        );
        let wildcard = "use flight_codec::*;\nuse flight_consumer::*;\n\n#[test]\nfn decodes() {\n    let decoded = decode_utf8(1);\n    assert_eq!(decoded, call_decoder(1));\n}\n";
        assert_eq!(
            compile_vitest_with_external_alias_sources(
                wildcard,
                "@flighthq/consumer/contract",
                Some("pub use crate::caller::call_decoder;\n"),
                &production_sources,
                &codec_package,
            )
            .unwrap(),
            "import { describe, expect, it } from 'vitest';\n\nimport { decodeUTF8 } from \"@flighthq/codec/contract\";\n\nimport {\n  callDecoder,\n} from \"@flighthq/consumer/contract\";\n\ndescribe(\"portableTests\", () => {\n  it(\"decodes\", () => {\n    const decoded = decodeUTF8(1);\n    expect(decoded).toEqual(callDecoder(1));\n  });\n});\n"
        );

        let other = ExternalAliasSource {
            source: "//! flight-compiler: export-name encode_utf8 decodeUTF8\npub fn encode_utf8() {}\n",
            module: "@flighthq/other/contract",
        };
        for (source, external, expected) in [
            (
                "use flight_codec::decode_utf8;\npub fn call(decode_utf8: usize) -> usize { return decode_utf8; }\n",
                vec![codec_package[0]],
                "`flight-compiler: export-name` item `decode_utf8` imported from `@flighthq/codec/contract` is shadowed by a local binding of the same name",
            ),
            (
                "use flight_codec::decode_utf8;\npub fn decode_u_t_f8() -> usize { return decode_utf8(1); }\n",
                vec![codec_package[0]],
                "`flight-compiler: export-name` TypeScript name `decodeUTF8` imported from `@flighthq/codec/contract` collides with a local item",
            ),
            (
                "use flight_codec::decode_utf8;\nuse flight_other::encode_utf8;\npub fn call() -> usize { encode_utf8(); return decode_utf8(1); }\n",
                vec![codec_package[0], other],
                "`flight-compiler: export-name` TypeScript name `decodeUTF8` imported from `@flighthq/codec/contract` collides with another import from `@flighthq/other/contract`",
            ),
            (
                "use flight_codec::decode_utf8;\npub fn call() -> usize { return decode_utf8(1); }\n",
                vec![
                    codec_package[0],
                    ExternalAliasSource {
                        source: "//! flight-compiler: export-name decode_utf8 decodeUtf8Text\npub fn decode_utf8() {}\n",
                        module: "@flighthq/codec/contract",
                    },
                ],
                "`flight-compiler: export-name` item `decode_utf8` of `@flighthq/codec/contract` is given more than one TypeScript name",
            ),
            (
                "use flight_codec::decode_utf8;\npub fn call() -> usize { return decode_utf8(1); }\n",
                vec![ExternalAliasSource {
                    source: "//! flight-compiler: export-name decode_utf8 decodeUTF8\npub fn encode_utf8() {}\n",
                    module: "@flighthq/codec/contract",
                }],
                "`flight-compiler: export-name` item `decode_utf8` is not a function or constant of this source",
            ),
        ] {
            let error =
                compile_typescript_with_external_alias_sources(source, None, &[], &external)
                    .unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
        let error = compile_typescript_with_external_alias_sources(
            "//! flight-compiler: export-name decode_utf8 decodeUtf8Text\npub fn decode_utf8() {}\npub fn call() -> usize { return 1; }\n",
            None,
            &[
                "use flight_codec::decode_utf8;\npub fn caller() -> usize { return decode_utf8(1); }\n",
            ],
            &codec_package,
        );
        assert!(error.is_ok(), "{error:?}");
        let error = compile_typescript_with_external_alias_sources(
            "use flight_codec::decode_utf8;\npub fn caller() -> usize { return decode_utf8(1); }\n",
            None,
            &["//! flight-compiler: export-name decode_utf8 decodeUtf8Text\npub fn decode_utf8() {}\n"],
            &codec_package,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "`flight-compiler: export-name` item `decode_utf8` imported from `@flighthq/codec/contract` as `decodeUTF8` collides with the local mapping `decodeUtf8Text`"
        );
    }

    #[test]
    fn maps_grouped_and_nested_foreign_wildcard_dependency_imports() {
        let codec_package = [ExternalAliasSource {
            source: "//! flight-compiler: export-name decode_utf8 decodeUTF8\npub fn decode_utf8(value: usize) -> usize {\n    return value;\n}\n",
            module: "@flighthq/codec/contract",
        }];
        let production_sources = [VitestAliasSource {
            source: "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n",
            module: "crates/flight-consumer/src/caller.rs",
        }];
        let expected = "import { describe, expect, it } from 'vitest';\n\nimport { decodeUTF8 } from \"@flighthq/codec/contract\";\n\nimport {\n  callDecoder,\n} from \"@flighthq/consumer/contract\";\n\ndescribe(\"portableTests\", () => {\n  it(\"decodes\", () => {\n    const decoded = decodeUTF8(1);\n    expect(decoded).toEqual(callDecoder(1));\n  });\n});\n";
        for uses in [
            "use {flight_codec::*, flight_consumer::*};\n",
            "use flight_codec::{*};\nuse flight_consumer::*;\n",
        ] {
            let source = format!(
                "{uses}\n#[test]\nfn decodes() {{\n    let decoded = decode_utf8(1);\n    assert_eq!(decoded, call_decoder(1));\n}}\n"
            );
            assert_eq!(
                compile_vitest_with_external_alias_sources(
                    &source,
                    "@flighthq/consumer/contract",
                    Some("pub use crate::caller::call_decoder;\n"),
                    &production_sources,
                    &codec_package,
                )
                .unwrap(),
                expected,
                "{uses}"
            );
        }
    }

    #[test]
    fn emits_explicitly_named_frozen_object_constants_and_rewrites_references() {
        let source = r#"
//! flight-compiler: frozen-object SPRING_PRESET_BOUNCY SpringPresetBouncy
//! flight-compiler: frozen-object SPRING_PRESET_GENTLE SpringPresetGentle
//! flight-compiler: frozen-object SPRING_PRESET_STIFF SpringPresetStiff

pub struct SpringConfig {
    pub damping_ratio: f32,
    pub frequency: f32,
}

pub const SPRING_PRESET_BOUNCY: SpringConfig = SpringConfig {
    damping_ratio: 0.35,
    frequency: 2.0,
};

pub const SPRING_PRESET_GENTLE: SpringConfig = SpringConfig {
    damping_ratio: 0.8,
    frequency: 1.5,
};

pub const SPRING_PRESET_STIFF: SpringConfig = SpringConfig {
    damping_ratio: 1.0,
    frequency: 4.0,
};

pub fn default_spring_preset() -> SpringConfig {
    return SPRING_PRESET_BOUNCY;
}

pub fn customized_spring_preset() -> SpringConfig {
    let mut customized = SPRING_PRESET_GENTLE;
    customized.frequency = 3.0;
    return customized;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export const SpringPresetBouncy: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 0.35, frequency: 2.0 });"
        ));
        assert!(output.contains(
            "export const SpringPresetGentle: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 0.8, frequency: 1.5 });"
        ));
        assert!(output.contains(
            "export const SpringPresetStiff: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 1.0, frequency: 4.0 });"
        ));
        assert_eq!(output.matches("Object.freeze(").count(), 3);
        assert!(output.contains("return SpringPresetBouncy;"));
        assert!(output.contains("let customized = { ...SpringPresetGentle };"));
        assert!(!output.contains("SPRING_PRESET_BOUNCY"));
        assert!(!output.contains("SPRING_PRESET_GENTLE"));
        assert!(!output.contains("SPRING_PRESET_STIFF"));
    }

    #[test]
    fn rejects_dependency_export_names_colliding_with_any_emitted_binding() {
        let owner = |target: &str| {
            format!(
                "//! flight-compiler: export-name decode_utf8 {target}\npub fn decode_utf8(value: usize) -> usize {{\n    return value;\n}}\n"
            )
        };
        let status_owner = owner("Status");
        let status_package = [ExternalAliasSource {
            source: &status_owner,
            module: "@flighthq/codec/contract",
        }];
        let consumer = |declarations: &str| {
            format!(
                "use flight_codec::decode_utf8;\n\n{declarations}\npub fn call_decoder(value: usize) -> usize {{\n    return decode_utf8(value);\n}}\n"
            )
        };
        let local_item = "`flight-compiler: export-name` TypeScript name `Status` imported from `@flighthq/codec/contract` collides with a local item";
        for declarations in [
            "pub enum Status {\n    Ready,\n}\n",
            "//! flight-compiler: string-union Status=exact\n//! flight-compiler: string-union-value Status Ready \"ready\"\npub enum Status {\n    Ready,\n}\n",
            "pub const Status: usize = 1;\n",
        ] {
            let (directives, items): (Vec<_>, Vec<_>) = declarations
                .lines()
                .partition(|line| line.starts_with("//!"));
            let source = format!(
                "{}{}",
                directives
                    .iter()
                    .map(|line| format!("{line}\n"))
                    .collect::<String>(),
                consumer(&items.join("\n"))
            );
            let error =
                compile_typescript_with_external_alias_sources(&source, None, &[], &status_package)
                    .unwrap_err();
            assert_eq!(error.to_string(), local_item, "{source}");
        }
        for declarations in [
            "//! flight-compiler: string-union Status\npub enum Status {\n    Ready,\n}\n",
            "//! flight-compiler: data-union Status\npub enum Status {\n    Ready(u32),\n    Done(String),\n}\n",
        ] {
            let (directives, items): (Vec<_>, Vec<_>) = declarations
                .lines()
                .partition(|line| line.starts_with("//!"));
            let source = format!(
                "{}{}",
                directives
                    .iter()
                    .map(|line| format!("{line}\n"))
                    .collect::<String>(),
                consumer(&items.join("\n"))
            );
            let output =
                compile_typescript_with_external_alias_sources(&source, None, &[], &status_package)
                    .unwrap();
            assert!(
                output.contains("import { Status } from \"@flighthq/codec/contract\";"),
                "{output}"
            );
            assert!(output.contains("  return Status(value);\n"), "{output}");
        }

        let production_sources = [VitestAliasSource {
            source: "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n\npub fn decode_u_t_f8() -> usize {\n    return 0;\n}\n",
            module: "crates/flight-consumer/src/caller.rs",
        }];
        let test = |body: &str| {
            format!(
                "use flight_codec::decode_utf8;\nuse flight_consumer::*;\n\nmod call_decoder {{\n    use super::*;\n\n    #[test]\n    fn decodes() {{\n        let decoded = decode_utf8(1);\n{body}    }}\n}}\n"
            )
        };
        for (target, body, expected) in [
            (
                "expect",
                "        assert_eq!(decoded, call_decoder(1));\n",
                "`flight-compiler: export-name` TypeScript name `expect` imported from `@flighthq/codec/contract` collides with another import from `vitest`",
            ),
            (
                "describe",
                "        assert_eq!(decoded, call_decoder(1));\n",
                "`flight-compiler: export-name` TypeScript name `describe` imported from `@flighthq/codec/contract` collides with another import from `vitest`",
            ),
            (
                "decodeUTF8",
                "        assert_eq!(decoded, decode_u_t_f8());\n",
                "`flight-compiler: export-name` TypeScript name `decodeUTF8` imported from `@flighthq/codec/contract` collides with another import from `@flighthq/consumer/contract`",
            ),
        ] {
            let source = owner(target);
            let error = compile_vitest_with_external_alias_sources(
                &test(body),
                "@flighthq/consumer/contract",
                Some("pub use crate::caller::*;\n"),
                &production_sources,
                &[ExternalAliasSource {
                    source: &source,
                    module: "@flighthq/codec/contract",
                }],
            )
            .unwrap_err();
            assert_eq!(error.to_string(), expected, "{target}");
        }
    }

    #[test]
    fn accepts_dependency_export_names_named_like_unemitted_test_support() {
        let owner = |target: &str| {
            format!(
                "//! flight-compiler: export-name decode_utf8 {target}\npub fn decode_utf8(value: usize) -> usize {{\n    return value;\n}}\n"
            )
        };
        let production_sources = [VitestAliasSource {
            source: "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n",
            module: "src/caller.rs",
        }];
        let test = |uses: &str, body: &str| {
            format!(
                "use flight_codec::decode_utf8;\n{uses}\nmod call_decoder {{\n    use super::*;\n\n    #[test]\n    fn decodes() {{\n        let decoded = decode_utf8(1);\n{body}    }}\n}}\n"
            )
        };
        let compile = |target: &str, source: &str| {
            let owner = owner(target);
            return compile_vitest_with_external_alias_sources(
                source,
                "./contract.ts",
                None,
                &production_sources,
                &[ExternalAliasSource {
                    source: &owner,
                    module: "@flighthq/codec/contract",
                }],
            );
        };

        let without_pi = test("", "        assert_eq!(decoded, call_decoder(1));\n");
        let output = compile("crate", &without_pi).unwrap();
        assert!(
            output.contains("import { crate } from \"@flighthq/codec/contract\";"),
            "{output}"
        );
        assert!(
            output.contains("    const decoded = crate(1);\n"),
            "{output}"
        );
        assert!(!output.contains("crate."), "{output}");
        let support = test(
            "",
            "        crate::assert_decoded(decoded, call_decoder(1));\n",
        );
        assert_eq!(
            compile("crate", &support).unwrap_err().to_string(),
            "`flight-compiler: export-name` TypeScript name `crate` imported from `@flighthq/codec/contract` collides with another import from `./rustTestSupport.ts`"
        );
        let output = compile("decodeUTF8", &support).unwrap();
        assert!(
            output.contains("    crate.assertDecoded(decoded, callDecoder(1));\n"),
            "{output}"
        );
    }

    #[test]
    fn rejects_dependency_export_names_colliding_with_emitted_pi() {
        let owner = |target: &str| {
            format!(
                "//! flight-compiler: export-name decode_utf8 {target}\npub fn decode_utf8(value: usize) -> usize {{\n    return value;\n}}\n"
            )
        };
        let production_sources = [VitestAliasSource {
            source: "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n",
            module: "src/caller.rs",
        }];
        let test = |uses: &str, body: &str| {
            format!(
                "use flight_codec::decode_utf8;\n{uses}\nmod call_decoder {{\n    use super::*;\n\n    #[test]\n    fn decodes() {{\n        let decoded = decode_utf8(1);\n{body}    }}\n}}\n"
            )
        };
        let compile = |target: &str, source: &str| {
            let owner = owner(target);
            return compile_vitest_with_external_alias_sources(
                source,
                "./contract.ts",
                None,
                &production_sources,
                &[ExternalAliasSource {
                    source: &owner,
                    module: "@flighthq/codec/contract",
                }],
            );
        };

        let pi = test(
            "use std::f32::consts::PI;\n",
            "        assert_eq!(decoded as f32 * PI, call_decoder(1) as f32 * PI);\n",
        );
        assert_eq!(
            compile("PI", &pi).unwrap_err().to_string(),
            "`flight-compiler: export-name` TypeScript name `PI` imported from `@flighthq/codec/contract` collides with a local item"
        );
        let without_pi = test("", "        assert_eq!(decoded, call_decoder(1));\n");
        let output = compile("PI", &without_pi).unwrap();
        assert!(
            output.contains("import { PI } from \"@flighthq/codec/contract\";"),
            "{output}"
        );
        assert!(!output.contains("Math.PI"), "{output}");
    }

    #[test]
    fn rejects_dependency_export_names_colliding_with_qualified_namespace_imports() {
        let owner = |target: &str| {
            format!(
                "//! flight-compiler: export-name decode_utf8 {target}\npub fn decode_utf8(value: usize) -> usize {{\n    return value;\n}}\n"
            )
        };
        let production_sources = [VitestAliasSource {
            source: "pub fn call_decoder(value: usize) -> usize {\n    return value;\n}\n",
            module: "src/caller.rs",
        }];
        let test = |uses: &str, body: &str| {
            format!(
                "use flight_codec::decode_utf8;\n{uses}\nmod call_decoder {{\n    use super::*;\n\n    #[test]\n    fn decodes() {{\n        let decoded = decode_utf8(1);\n{body}    }}\n}}\n"
            )
        };
        let compile = |target: &str, source: &str| {
            let owner = owner(target);
            return compile_vitest_with_external_alias_sources(
                source,
                "./contract.ts",
                None,
                &production_sources,
                &[ExternalAliasSource {
                    source: &owner,
                    module: "@flighthq/codec/contract",
                }],
            );
        };

        let namespace = test(
            "",
            "        assert_eq!(decoded, flight_other::identity(call_decoder(1)));\n",
        );
        assert_eq!(
            compile("flightOther", &namespace).unwrap_err().to_string(),
            "`flight-compiler: export-name` TypeScript name `flightOther` imported from `@flighthq/codec/contract` collides with another import from `@flighthq/other/contract`"
        );
    }

    #[test]
    fn rejects_invalid_export_name_directives() {
        let item = "pub fn decode_utf8() {}\n";
        for (source, expected) in [
            (
                format!("//! flight-compiler: export-name\n{item}"),
                "`flight-compiler: export-name` requires a Rust item name and TypeScript name",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8\n{item}"),
                "`flight-compiler: export-name decode_utf8` requires a TypeScript name",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 decodeUTF8 extra\n{item}"),
                "`flight-compiler: export-name decode_utf8` accepts exactly one TypeScript name",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 decode-UTF8\n{item}"),
                "`flight-compiler: export-name decode_utf8` TypeScript name `decode-UTF8` is not a valid identifier",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 9decode\n{item}"),
                "`flight-compiler: export-name decode_utf8` TypeScript name `9decode` is not a valid identifier",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 delete\n{item}"),
                "`flight-compiler: export-name decode_utf8` TypeScript name `delete` is reserved",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 undefined\n{item}"),
                "`flight-compiler: export-name decode_utf8` TypeScript name `undefined` is reserved",
            ),
            (
                format!(
                    "//! flight-compiler: export-name decode_utf8 decodeUTF8\n//! flight-compiler: export-name decode_utf8 decodeUtf8Bytes\n{item}"
                ),
                "duplicate `flight-compiler: export-name` directive for `decode_utf8`",
            ),
            (
                format!(
                    "//! flight-compiler: export-name decode_utf8 decodeUTF8\n//! flight-compiler: export-name encode_utf8 decodeUTF8\n{item}pub fn encode_utf8() {{}}\n"
                ),
                "`flight-compiler: export-name` TypeScript name `decodeUTF8` is assigned more than once",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf16 decodeUTF16\n{item}"),
                "`flight-compiler: export-name` item `decode_utf16` is not a function or constant of this source",
            ),
            (
                "//! flight-compiler: export-name decode_utf8 decodeUTF8\nfn decode_utf8() {}\n"
                    .to_string(),
                "`flight-compiler: export-name` item `decode_utf8` must be public",
            ),
            (
                format!("//! flight-compiler: export-name decode_utf8 decodeUtf8\n{item}"),
                "`flight-compiler: export-name decode_utf8` repeats the default TypeScript name `decodeUtf8`",
            ),
            (
                format!(
                    "//! flight-compiler: export-name decode_utf8 decodeUTF8\n{item}pub fn decode_u_t_f8() {{}}\n"
                ),
                "`flight-compiler: export-name decode_utf8` TypeScript name `decodeUTF8` collides with another item",
            ),
            (
                format!(
                    "//! flight-compiler: export-name decode_utf8 decodeUTF8\n{item}pub fn measure(decode_utf8: usize) -> usize {{ return decode_utf8; }}\n"
                ),
                "`flight-compiler: export-name` item `decode_utf8` is shadowed by a local binding of the same name",
            ),
        ] {
            let error = compile_typescript(&source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }

        let mapped =
            "//! flight-compiler: export-name decode_utf8 decodeUTF8\npub fn decode_utf8() {}\n";
        for (alias, expected) in [
            (
                "//! flight-compiler: export-name decode_utf8 decodeUtf8Text\npub fn decode_utf8() {}\n",
                "`flight-compiler: export-name` item `decode_utf8` is given more than one TypeScript name",
            ),
            (
                "pub fn decode_utf8() {}\npub fn encode_utf8() {}\n",
                "`flight-compiler: export-name` item `decode_utf8` is declared by more than one source",
            ),
            (
                "pub fn decode_u_t_f8() {}\n",
                "`flight-compiler: export-name decode_utf8` TypeScript name `decodeUTF8` collides with another item",
            ),
            (
                "pub fn measure() -> usize { let decode_utf8 = 1; return decode_utf8; }\n",
                "`flight-compiler: export-name` item `decode_utf8` is shadowed by a local binding of the same name",
            ),
        ] {
            let error = compile_typescript_with_alias_sources(mapped, None, &[alias]).unwrap_err();
            assert_eq!(error.to_string(), expected, "{alias}");
        }
        assert_eq!(
            compile_typescript_with_alias_sources(mapped, None, &[mapped]).unwrap(),
            "export function decodeUTF8(): void {\n}\n"
        );
    }

    #[test]
    fn rejects_malformed_frozen_object_directives() {
        let cases = [
            (
                "//! flight-compiler: frozen-object\n",
                "`flight-compiler: frozen-object` requires a constant name and TypeScript name",
            ),
            (
                "//! flight-compiler: frozen-object PRESET\n",
                "`flight-compiler: frozen-object PRESET` requires a TypeScript name",
            ),
            (
                "//! flight-compiler: frozen-object PRESET Preset extra\n",
                "`flight-compiler: frozen-object PRESET` accepts exactly one TypeScript name",
            ),
            (
                "//! flight-compiler: frozen-object PRE-SET Preset\n",
                "`flight-compiler: frozen-object` constant name `PRE-SET` is not a valid identifier",
            ),
            (
                "//! flight-compiler: frozen-object PRESET Pre-set\n",
                "`flight-compiler: frozen-object PRESET` TypeScript name `Pre-set` is not a valid identifier",
            ),
            (
                "//! flight-compiler: frozen-object PRESET Preset\n//! flight-compiler: frozen-object PRESET OtherPreset\npub struct Config { pub value: f32 }\npub const PRESET: Config = Config { value: 1.0 };\n",
                "duplicate `flight-compiler: frozen-object` directive for constant `PRESET`",
            ),
            (
                "//! flight-compiler: frozen-object FIRST Preset\n//! flight-compiler: frozen-object SECOND Preset\npub struct Config { pub value: f32 }\npub const FIRST: Config = Config { value: 1.0 };\npub const SECOND: Config = Config { value: 2.0 };\n",
                "`flight-compiler: frozen-object` TypeScript name `Preset` is assigned more than once",
            ),
            (
                "//! flight-compiler: frozen-object MISSING Preset\n",
                "`flight-compiler: frozen-object` constant `MISSING` does not exist",
            ),
            (
                "//! flight-compiler: frozen-object PRESET Preset\npub struct Config { pub value: f32 }\nconst PRESET: Config = Config { value: 1.0 };\n",
                "`flight-compiler: frozen-object` constant `PRESET` must be public",
            ),
            (
                "//! flight-compiler: frozen-object PRESET Preset\npub const PRESET: f32 = 1.0;\n",
                "`flight-compiler: frozen-object` constant `PRESET` must be initialized with a struct literal",
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
    fn lowers_tuple_destructuring_in_closure_parameters() {
        let source = r#"
pub fn first_values(values: &Vec<(i32, bool)>) -> Vec<i32> {
    return values.iter().map(|&(value, _)| value).collect();
}

pub fn select_value(pair: (i32, bool)) -> i32 {
    let select = |(value, _): (i32, bool)| value;
    return select(pair);
}

pub fn ignore_values() -> i32 {
    let ignore = |_, _| 1;
    return ignore(false, true);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return values.map(([value, _unused0]) => value);"));
        assert!(
            output.contains(
                "const select = ([value, _unused0]: readonly [number, boolean]) => value;"
            )
        );
        assert!(output.contains("const ignore = (_unused0, _unused1) => 1;"));
    }

    #[test]
    fn lowers_unreachable_macros_to_deterministic_errors() {
        let source = r#"
pub fn impossible_value(code: i32) -> i32 {
    return match code {
        0 => 0,
        _ => unreachable!("unexpected code {}", code),
    };
}

pub fn impossible_statement() {
    unreachable!();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "throw new Error(`internal error: entered unreachable code: unexpected code ${code}`);"
        ));
        assert!(output.contains(
            "export function impossibleStatement(): void {\n  throw new Error(\"internal error: entered unreachable code\");\n}"
        ));
    }

    #[test]
    fn preserves_receivers_for_optional_member_calls() {
        let source = r#"
use std::sync::Arc;

pub struct Backend {
    pub prepare: Option<Arc<dyn Fn() + Send + Sync>>,
    pub run: Option<Arc<dyn Fn(i32) -> bool + Send + Sync>>,
}

pub fn prepare(backend: &Backend) {
    if let Some(prepare) = &backend.prepare {
        prepare();
    }
}

pub fn run(backend: &Backend) -> bool {
    if let Some(run) = &backend.run {
        return run(2);
    }
    return false;
}

pub fn invoke_local(callback: Option<Arc<dyn Fn() + Send + Sync>>) {
    if let Some(value) = callback {
        value();
    }
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("backend.prepare?.();"));
        assert!(
            output.contains("if (backend.run !== undefined) {\n    return backend.run(2);\n  }")
        );
        assert!(output.contains(
            "if (callback !== undefined) {\n    const value = callback;\n    value();\n  }"
        ));
    }

    #[test]
    fn preserves_unsupported_macro_diagnostics_around_unreachable_lowering() {
        let invalid_unreachable = r#"
pub fn impossible(message: &str) {
    unreachable!(message);
}
"#;
        let unsupported_macro = r#"
pub fn unfinished() {
    todo!();
}
"#;

        assert_eq!(
            compile_typescript(invalid_unreachable, None)
                .unwrap_err()
                .to_string(),
            "portable `unreachable!` needs a string literal template"
        );
        assert_eq!(
            compile_typescript(unsupported_macro, None)
                .unwrap_err()
                .to_string(),
            "unsupported macro statement inside function body"
        );
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
    LineTo { x: f64, y: f64 },
    QuadraticCurveTo { control_x: f64, control_y: f64, x: f64, y: f64 },
    CubicCurveTo { control_x1: f64, control_y1: f64, control_x2: f64, control_y2: f64, x: f64, y: f64 },
    Close,
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type RectangleId = number | string;"));
        assert!(output.contains("export type LogValue = unknown;"));
        assert!(output.contains("export type LogDataOrProvider = LogData | LogDataProvider;"));
        assert!(output.contains(
            "export type PathSegment = { readonly kind: \"moveTo\"; readonly x: number; readonly y: number } | { readonly kind: \"lineTo\"; readonly x: number; readonly y: number } | { readonly kind: \"quadraticCurveTo\"; readonly controlX: number; readonly controlY: number; readonly x: number; readonly y: number } | { readonly kind: \"cubicCurveTo\"; readonly controlX1: number; readonly controlY1: number; readonly controlX2: number; readonly controlY2: number; readonly x: number; readonly y: number } | { readonly kind: \"close\" };"
        ));
        assert!(!output.contains("number | number"));
    }

    #[test]
    fn lowers_tagged_data_union_constructors_and_matches_exact_kinds() {
        let source = r#"
//! flight-compiler: data-union PathSegment

pub enum PathSegment {
    MoveTo { x: f64, y: f64 },
    LineTo { x: f64, y: f64 },
    QuadraticCurveTo { control_x: f64, control_y: f64, x: f64, y: f64 },
    CubicCurveTo { control_x1: f64, control_y1: f64, control_x2: f64, control_y2: f64, x: f64, y: f64 },
    Close,
}

pub fn move_to(x: f64, y: f64) -> PathSegment {
    return PathSegment::MoveTo { x, y };
}

pub fn line_to(x: f64, y: f64) -> PathSegment {
    return PathSegment::LineTo { x, y };
}

pub fn quadratic_curve_to(control_x: f64, control_y: f64, x: f64, y: f64) -> PathSegment {
    return PathSegment::QuadraticCurveTo { control_x, control_y, x, y };
}

pub fn cubic_curve_to(
    control_x1: f64,
    control_y1: f64,
    control_x2: f64,
    control_y2: f64,
    x: f64,
    y: f64,
) -> PathSegment {
    return PathSegment::CubicCurveTo {
        control_x1,
        control_y1,
        control_x2,
        control_y2,
        x,
        y,
    };
}

pub fn close() -> PathSegment {
    return PathSegment::Close;
}

pub fn terminal_x(segment: PathSegment) -> f64 {
    return match segment {
        PathSegment::MoveTo { x, .. } | PathSegment::LineTo { x, .. } => x,
        PathSegment::QuadraticCurveTo { x, .. } => x,
        PathSegment::CubicCurveTo { x, .. } => x,
        PathSegment::Close => 0.0,
    };
}

pub fn append_terminal_y(out: &mut Vec<f64>, segment: PathSegment) {
    match segment {
        PathSegment::MoveTo { y, .. } | PathSegment::LineTo { y, .. } => out.push(y),
        PathSegment::QuadraticCurveTo { y, .. } => out.push(y),
        PathSegment::CubicCurveTo { y, .. } => out.push(y),
        PathSegment::Close => {}
    }
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("{ kind: \"moveTo\" as const, x: x, y: y }"));
        assert!(output.contains("{ kind: \"lineTo\" as const, x: x, y: y }"));
        assert!(output.contains("kind: \"quadraticCurveTo\" as const"));
        assert!(output.contains("kind: \"cubicCurveTo\" as const"));
        assert!(output.contains("return { kind: \"close\" as const };"));
        assert!(
            output.contains("matchValue.kind === \"moveTo\" || matchValue.kind === \"lineTo\"")
        );
        assert!(output.contains("matchValue.kind === \"quadraticCurveTo\""));
        assert!(output.contains("matchValue.kind === \"cubicCurveTo\""));
        assert!(output.contains("else {\n    return 0.0;"));
        assert!(output.contains("const x = matchValue.x;"));
        assert!(output.contains("const y = matchValue.y;"));
        assert!(!output.contains("PathSegment.MoveTo"));
        assert!(!output.contains("PathSegment.Close"));
    }

    #[test]
    fn lowers_the_real_path_segment_constructors() {
        let path = include_str!("../../flight-path/src/path.rs");
        let for_each_path_segment = include_str!("../../flight-path/src/for_each_path_segment.rs");

        let output =
            compile_typescript_with_alias_sources(for_each_path_segment, None, &[path]).unwrap();

        assert!(output.contains("visitor({ kind: \"moveTo\" as const, x: x, y: y });"));
        assert!(output.contains("visitor({ kind: \"lineTo\" as const, x: x, y: y });"));
        assert!(output.contains("kind: \"quadraticCurveTo\" as const"));
        assert!(output.contains("kind: \"cubicCurveTo\" as const"));
        assert!(output.contains("visitor({ kind: \"close\" as const });"));
        assert!(!output.contains("PathSegment.MoveTo"));
        assert!(!output.contains("PathSegment.Close"));
    }

    #[test]
    fn rejects_repeated_tagged_data_union_match_variants() {
        let source = r#"
//! flight-compiler: data-union PathSegment

pub enum PathSegment {
    MoveTo { x: f64, y: f64 },
    Close,
}

pub fn terminal_x(segment: PathSegment) -> f64 {
    return match segment {
        PathSegment::MoveTo { x, .. } => x,
        PathSegment::MoveTo { x, .. } => x,
        PathSegment::Close => 0.0,
    };
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "tagged data union match arm `PathSegment::MoveTo` is unreachable after `PathSegment::MoveTo`"
        );
    }

    #[test]
    fn rejects_nonexhaustive_tagged_data_union_matches() {
        let source = r#"
//! flight-compiler: data-union PathSegment

pub enum PathSegment {
    MoveTo { x: f64, y: f64 },
    LineTo { x: f64, y: f64 },
    Close,
}

pub fn terminal_x(segment: PathSegment) -> f64 {
    return match segment {
        PathSegment::MoveTo { x, .. } => x,
    };
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "tagged data union match is not exhaustive; missing `PathSegment::Close`, `PathSegment::LineTo`"
        );
    }

    #[test]
    fn erases_transparent_data_union_constructors_and_matches_runtime_categories() {
        let source = r#"
//! flight-compiler: data-union LogData LogValue LogDataOrProvider RectangleId

use std::collections::HashMap;
use std::sync::Arc;

pub enum LogData {
    Message(String),
    Record(HashMap<String, LogValue>),
}

pub enum LogValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Record(HashMap<String, LogValue>),
    Array(Vec<LogValue>),
    Object(UnknownValue),
}

pub type LogDataProvider = Arc<dyn Fn() -> LogData + Send + Sync>;

pub enum LogDataOrProvider {
    Data(LogData),
    Provider(LogDataProvider),
}

pub enum RectangleId {
    Number(i32),
    Text(String),
}

pub fn message(value: String) -> LogData {
    return LogData::Message(value);
}

pub fn null_value() -> LogValue {
    return LogValue::Null;
}

pub fn string_values(values: Vec<String>) -> Vec<LogValue> {
    return values.into_iter().map(LogValue::Str).collect();
}

pub fn resolve_data(value: LogDataOrProvider) -> LogData {
    return match value {
        LogDataOrProvider::Data(data) => data,
        LogDataOrProvider::Provider(provider) => provider(),
    };
}

pub fn data_kind(value: LogData) -> String {
    return match value {
        LogData::Message(_) => "message".to_string(),
        LogData::Record(_) => "record".to_string(),
    };
}

pub fn value_kind(value: LogValue) -> String {
    return match value {
        LogValue::Null => "null".to_string(),
        LogValue::Bool(_) => "boolean".to_string(),
        LogValue::Int(_) | LogValue::Float(_) => "number".to_string(),
        LogValue::Str(_) => "string".to_string(),
        LogValue::Array(_) => "array".to_string(),
        LogValue::Record(_) => "record".to_string(),
        LogValue::Object(_) => "object".to_string(),
    };
}

pub fn append_value_kind(out: &mut Vec<String>, value: LogValue) {
    match value {
        LogValue::Null => out.push("null".to_string()),
        _ => out.push("value".to_string()),
    }
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return value;"));
        assert!(output.contains("return null;"));
        assert!(output.contains("values.map((value) => value)"));
        assert!(output.contains("typeof matchValue === \"function\""));
        assert!(output.contains("typeof matchValue === \"number\""));
        assert!(output.contains("Array.isArray(matchValue)"));
        assert!(output.contains("Object.getPrototypeOf(matchValue) === Object.prototype"));
        assert!(output.contains("Object.getPrototypeOf(matchValue) !== Object.prototype"));
        assert!(output.contains("const provider = matchValue;"));
        assert!(output.contains("const matchValue = value;"));
        assert!(!output.contains("LogData.Message(value)"));
        assert!(!output.contains("LogValue.Null"));
        assert!(!output.contains("LogValue.Str"));
    }

    #[test]
    fn rejects_overlapping_transparent_data_union_match_arms() {
        let source = r#"
//! flight-compiler: data-union LogValue

pub enum LogValue {
    Int(i64),
    Float(f64),
}

pub fn value_kind(value: LogValue) -> &'static str {
    return match value {
        LogValue::Int(_) => "integer",
        LogValue::Float(_) => "float",
    };
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "transparent data union match arm `LogValue::Float` is unreachable after `LogValue::Int` because both lower to the TypeScript `number` runtime category"
        );
    }

    #[test]
    fn rejects_transparent_data_union_payloads_without_runtime_categories() {
        let source = r#"
//! flight-compiler: data-union Value

pub enum Value {
    Opaque(ExternalThing),
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "cannot determine the TypeScript runtime category of data union payload type `ExternalThing`"
        );
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
    fn lowers_some_let_else_in_portable_tests() {
        let source = r#"
mod required {
    #[test]
    fn narrows_the_existing_binding() {
        let value: Option<i32> = Some(2);
        let Some(value) = value else {
            assert!(false);
            return;
        };
        assert_eq!(value, 2);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/example/contract").unwrap();

        assert!(output.contains(
            "let value: number | undefined = 2;\n    if (value === undefined) {\n      expect(false).toBe(true);\n      return;\n    }"
        ));
        assert!(output.contains("expect(value).toEqual(2);"));
        assert!(!output.contains("value = value;"));
    }

    #[test]
    fn lowers_option_presence_checks_by_the_owning_source_mode() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableSample {
    pub previous: Option<i32>,
}

pub fn create_nullable_sample() -> NullableSample {
    return NullableSample { previous: None };
}
"#;
        let optional_production = r#"
pub struct OptionalSample {
    pub previous: Option<i32>,
}

pub fn create_optional_sample() -> OptionalSample {
    return OptionalSample { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

mod option_presence {
    use super::*;

    #[test]
    fn follows_each_fields_source_mode() {
        let nullable = create_nullable_sample();
        assert!(nullable.previous.is_none());
        nullable.previous = Some(1);
        assert!(nullable.previous.is_some());

        let optional = create_optional_sample();
        assert!(optional.previous.is_none());
        optional.previous = Some(1);
        assert!(optional.previous.is_some());
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/example/contract",
            &[nullable_production, optional_production],
        )
        .unwrap();

        assert!(output.contains("expect(nullable.previous === null).toBe(true);"));
        assert!(output.contains("expect(nullable.previous !== null).toBe(true);"));
        assert!(output.contains("expect(optional.previous === undefined).toBe(true);"));
        assert!(output.contains("expect(optional.previous !== undefined).toBe(true);"));
    }

    #[test]
    fn ignores_private_same_named_function_provenance_deterministically() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableSample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> NullableSample {
    return NullableSample { previous: None };
}
"#;
        let private_optional_production = r#"
struct OptionalSample {
    previous: Option<i32>,
}

fn create_sample() -> OptionalSample {
    return OptionalSample { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn reads_public_sample() {
        let sample = create_sample();
        assert!(sample.previous.is_none());
    }
}
"#;
        let aliases = [
            VitestAliasSource {
                source: private_optional_production,
                module: "src/private_optional.rs",
            },
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable.rs",
            },
        ];
        let mut first = None;

        for _ in 0..64 {
            let output = compile_vitest_with_module_alias_sources(
                source,
                "@flighthq/example/contract",
                &aliases,
            )
            .unwrap();
            assert!(output.contains("expect(sample.previous === null).toBe(true);"));
            assert!(!output.contains("sample.previous === undefined"));
            if let Some(first) = &first {
                assert_eq!(&output, first);
            } else {
                first = Some(output);
            }
        }
    }

    #[test]
    fn ignores_private_same_named_nullable_struct_provenance_deterministically() {
        let optional_production = r#"
pub struct SharedSample {
    pub previous: Option<i32>,
}

pub fn create_optional_sample() -> SharedSample {
    return SharedSample { previous: None };
}
"#;
        let private_nullable_production = r#"
//! flight-compiler: nullable-options

struct SharedSample {
    previous: Option<i32>,
}

fn create_private_sample() -> SharedSample {
    return SharedSample { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn reads_public_sample() {
        let sample = create_optional_sample();
        assert!(sample.previous.is_none());
    }
}
"#;
        let aliases = [
            VitestAliasSource {
                source: private_nullable_production,
                module: "src/private_nullable.rs",
            },
            VitestAliasSource {
                source: optional_production,
                module: "src/optional.rs",
            },
        ];
        let mut first = None;

        for _ in 0..64 {
            let output = compile_vitest_with_module_alias_sources(
                source,
                "@flighthq/example/contract",
                &aliases,
            )
            .unwrap();
            assert!(output.contains("expect(sample.previous === undefined).toBe(true);"));
            assert!(!output.contains("sample.previous === null"));
            if let Some(first) = &first {
                assert_eq!(&output, first);
            } else {
                first = Some(output);
            }
        }
    }

    #[test]
    fn lets_test_local_bindings_shadow_unselected_contract_names() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct LocalSample {
    pub previous: Option<i32>,
}

pub fn create_local_sample() -> LocalSample {
    return LocalSample { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

struct LocalSample {
    previous: Option<i32>,
}

#[test]
fn reads_test_local_sample() {
    let create_local_sample = || 1;
    let sample = LocalSample { previous: None };
    assert_eq!(create_local_sample(), 1);
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            "",
            &[VitestAliasSource {
                source: production,
                module: "src/production.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("const createLocalSample = () => 1;"));
        assert!(output.contains("const sample: LocalSample = { previous: undefined };"));
        assert!(output.contains("expect(sample.previous === undefined).toBe(true);"));
        assert!(!output.contains("sample.previous === null"));
    }

    #[test]
    fn resolves_same_named_public_functions_through_contract_exports() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableSample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> NullableSample {
    return NullableSample { previous: None };
}
"#;
        let optional_production = r#"
pub struct OptionalCollision {
    pub previous: Option<i32>,
}

pub fn create_sample() -> OptionalCollision {
    return OptionalCollision { previous: None };
}
"#;
        let contract = "pub use super::nullable_sample::{NullableSample, create_sample};\n";
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn reads_contract_selected_sample() {
        let sample = create_sample();
        assert!(sample.previous.is_none());
    }
}
"#;
        let aliases = [
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_collision.rs",
            },
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_sample.rs",
            },
        ];

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();

        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("sample.previous === undefined"));
    }

    #[test]
    fn propagates_selected_struct_provenance_through_supported_patterns() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use super::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;

#[test]
fn follows_pattern_payloads() {
    let samples = vec![create_sample()];
    for mut sample in samples {
        sample.previous = None;
        assert!(sample.previous.is_none());
    }

    let maybe = Some(create_sample());
    if let Some(mut sample) = maybe {
        sample.previous = None;
    }

    let mut repeated = Some(create_sample());
    while let Some(mut sample) = repeated {
        sample.previous = None;
        repeated = None;
    }

    match Some(create_sample()) {
        Some(mut sample) => sample.previous = None,
        None => {}
    }

    let pair = (create_sample(), 1);
    let (mut sample, _) = pair;
    sample.previous = None;
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.matches(".previous = null;").count() >= 5, "{output}");
        assert!(output.contains(".previous === null"));
        assert!(output.contains(
            "let repeated: ReturnType<typeof createSample> | undefined = createSample();"
        ));
        assert!(output.contains("const pair = [createSample(), 1] as const;"));
        assert!(!output.contains(".previous = undefined;"));
        assert!(!output.contains(".previous === undefined"));
    }

    #[test]
    fn rejects_field_access_from_an_unresolved_pattern_owner() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use super::sample::Sample;\n";
        let source = r#"
use flight_example::*;

#[test]
fn refuses_to_guess_the_iterable_owner() {
    for mut sample in unknown_samples() {
        sample.previous = None;
    }
}
"#;

        let error = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("pattern binding `sample` has no source-qualified type provenance"));
        assert!(error.contains("typed iterable or matched payload"));
    }

    #[test]
    fn resolves_selected_package_crate_aliases_without_a_runtime_namespace() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use super::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example as current;

#[test]
fn uses_the_selected_package_alias() {
    let mut literal: current::Sample = current::Sample { previous: None };
    literal.previous = None;
    let mut created = current::create_sample();
    created.previous = None;
    assert!(created.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("  createSample,"), "{output}");
        assert!(output.contains("  Sample,"));
        assert!(output.contains("literal: Sample = { previous: null }"));
        assert!(output.contains("created = createSample();"));
        assert!(!output.contains("current."));
        assert!(!output.contains("previous = undefined"));
    }

    #[test]
    fn preserves_submodule_identity_through_relative_and_module_alias_paths() {
        let nullable_root = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let optional_submodule = r#"
pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let aliases = [
            VitestAliasSource {
                source: nullable_root,
                module: "src/root.rs",
            },
            VitestAliasSource {
                source: optional_submodule,
                module: "src/optional.rs",
            },
        ];
        let root_only_contract = "pub use super::root::Sample;\n";
        let unselected_source = r#"
#[test]
fn refuses_the_same_leaf_root_fallback() {
    let sample = flight_example::optional::Sample { previous: None };
    assert!(sample.previous.is_none());
}
"#;
        let first = compile_vitest_with_contract_alias_sources(
            unselected_source,
            "@flighthq/example/contract",
            root_only_contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        let second = compile_vitest_with_contract_alias_sources(
            unselected_source,
            "@flighthq/example/contract",
            root_only_contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        assert_eq!(first, second);
        assert!(first.contains("`Sample` in `src/optional.rs`"));
        assert!(first.contains("does not select that exact declaration"));

        let contract = r#"
pub use super::root::Sample;
pub use super::optional::Sample as OptionalSample;
"#;
        let source = r#"
use crate::optional as storage;

#[test]
fn uses_complete_module_paths() {
    let aliased = storage::Sample { previous: None };
    let absolute = crate::optional::Sample { previous: None };
    let local = self::optional::Sample { previous: None };
    let parent = super::optional::Sample { previous: None };
    assert!(aliased.previous.is_none());
    assert!(absolute.previous.is_none());
    assert!(local.previous.is_none());
    assert!(parent.previous.is_none());
}
"#;
        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();

        assert!(output.contains("  OptionalSample,"), "{output}");
        assert_eq!(
            output
                .matches(": OptionalSample = { previous: undefined }")
                .count(),
            4
        );
        assert!(!output.contains("previous: null"));
        assert!(!output.contains("storage."));
        assert!(!output.contains("crate."));
        assert!(!output.contains("self."));
        assert!(!output.contains("super."));
    }

    // Option `.map()` / `.and_then()` on a field of a contract-selected struct resolve the field's
    // Option fact through the Vitest owner binding; the test module is not itself a program source.
    #[test]
    fn lowers_option_combinators_on_contract_selected_struct_fields() {
        let production = r#"
pub struct Sample {
    pub value: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { value: Some(4) };
}
"#;
        let contract = "pub use super::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;

fn doubled(sample: &Sample) -> i32 {
    return sample.value.map(|value| value * 2).unwrap_or(0);
}

fn incremented(sample: &Sample) -> i32 {
    return sample.value.and_then(|value| Some(value + 1)).unwrap_or(0);
}

mod sample {
    use super::*;

    #[test]
    fn maps_contract_selected_option_fields() {
        let sample = create_sample();
        assert_eq!(doubled(&sample), 8);
        assert_eq!(incremented(&sample), 5);
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains(
            "  return (((value) => value === undefined ? undefined : value * 2)(sample.value) ?? 0);\n"
        ));
        assert!(output.contains(
            "  return (((value) => value === undefined ? undefined : value + 1)(sample.value) ?? 0);\n"
        ));
    }

    #[test]
    fn resolves_same_named_public_structs_through_contract_exports() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct SharedCollision {
    pub previous: Option<i32>,
}
"#;
        let optional_production = r#"
pub struct SharedCollision {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use super::nullable_collision::*;\n";
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn uses_contract_selected_struct() {
        let mut sample = SharedCollision { previous: None };
        sample.previous = None;
        assert!(sample.previous.is_none());
    }
}
"#;
        let aliases = [
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_collision.rs",
            },
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_collision.rs",
            },
        ];

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();

        assert!(output.contains("{ previous: null }"));
        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
        assert!(!output.contains("sample.previous = undefined"));
    }

    #[test]
    fn resolves_contract_renamed_nullable_struct_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use super::renamed_prod::OriginalSample as Sample;\n";
        let source = r#"
use flight_example::*;

#[test]
fn uses_contract_renamed_sample() {
    let mut sample = Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
    sample.previous = Some(1);
    assert!(sample.previous.is_some());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/renamed_prod.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("import type {\n  Sample,\n}"));
        assert!(output.contains("let sample: Sample = { previous: null };"));
        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(output.contains("expect(sample.previous !== null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
        assert!(!output.contains("sample.previous = undefined"));
    }

    #[test]
    fn resolves_test_import_renamed_nullable_struct_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use super::renamed_prod::OriginalSample;\n";
        let source = r#"
mod sample {
    use flight_example::OriginalSample as Sample;

    #[test]
    fn uses_test_renamed_sample() {
        let mut sample = Sample { previous: None };
        sample.previous = None;
        assert!(sample.previous.is_none());
        sample.previous = Some(1);
        assert!(sample.previous.is_some());
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/renamed_prod.rs",
            }],
        )
        .unwrap();

        assert!(output.contains(
            "import type { OriginalSample as Sample } from \"@flighthq/example/contract\";"
        ));
        assert!(output.contains("let sample: Sample = { previous: null };"));
        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(output.contains("expect(sample.previous !== null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
        assert!(!output.contains("sample.previous = undefined"));
    }

    #[test]
    fn keeps_contract_and_test_renamed_optional_structs_undefined() {
        let production = r#"
pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use super::renamed_prod::OriginalSample as Sample;\n";
        let contract_rename_source = r#"
use flight_example::*;

#[test]
fn uses_contract_renamed_sample() {
    let mut sample = Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
    sample.previous = Some(1);
    assert!(sample.previous.is_some());
}
"#;
        let aliases = [VitestAliasSource {
            source: production,
            module: "src/renamed_prod.rs",
        }];
        let contract_output = compile_vitest_with_contract_alias_sources(
            contract_rename_source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();

        assert!(contract_output.contains("let sample: Sample = { previous: undefined };"));
        assert!(contract_output.contains("sample.previous = undefined;"));
        assert!(contract_output.contains("expect(sample.previous === undefined).toBe(true);"));
        assert!(contract_output.contains("expect(sample.previous !== undefined).toBe(true);"));
        assert!(!contract_output.contains("sample.previous === null"));

        let test_rename_contract = "pub use super::renamed_prod::OriginalSample;\n";
        let test_rename_source = r#"
mod sample {
    use flight_example::OriginalSample as Sample;

    #[test]
    fn uses_test_renamed_sample() {
        let mut sample = Sample { previous: None };
        sample.previous = None;
        assert!(sample.previous.is_none());
        sample.previous = Some(1);
        assert!(sample.previous.is_some());
    }
}
"#;
        let test_output = compile_vitest_with_contract_alias_sources(
            test_rename_source,
            "@flighthq/example/contract",
            test_rename_contract,
            &aliases,
        )
        .unwrap();

        assert!(test_output.contains("let sample: Sample = { previous: undefined };"));
        assert!(test_output.contains("sample.previous = undefined;"));
        assert!(test_output.contains("expect(sample.previous === undefined).toBe(true);"));
        assert!(test_output.contains("expect(sample.previous !== undefined).toBe(true);"));
        assert!(!test_output.contains("sample.previous === null"));
    }

    #[test]
    fn rejects_ambiguous_and_unselected_struct_aliases_deterministically() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let optional_production = r#"
pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let ambiguous_contract = r#"
pub use super::nullable_prod::OriginalSample as Sample;
pub use super::optional_prod::OriginalSample as Sample;
"#;
        let contract_rename_source = r#"
use flight_example::*;

#[test]
fn uses_ambiguous_sample() {
    let sample = Sample { previous: None };
    assert!(sample.previous.is_none());
}
"#;
        let aliases = [
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_prod.rs",
            },
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_prod.rs",
            },
        ];

        let first = compile_vitest_with_contract_alias_sources(
            contract_rename_source,
            "@flighthq/example/contract",
            ambiguous_contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        let second = compile_vitest_with_contract_alias_sources(
            contract_rename_source,
            "@flighthq/example/contract",
            ambiguous_contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();

        assert_eq!(first, second);
        assert!(first.contains("ambiguous public struct/type export `Sample`"));
        assert!(first.contains("src/nullable_prod.rs"));
        assert!(first.contains("src/optional_prod.rs"));

        let unselected_source = r#"
mod sample {
    use flight_example::OriginalSample as Sample;

    fn clear_sample(sample: &mut Sample) {
        sample.previous = None;
    }

    #[test]
    fn uses_unselected_sample() {
        let mut sample = Sample { previous: None };
        clear_sample(&mut sample);
        assert!(sample.previous.is_none());
    }
}
"#;
        let unselected = compile_vitest_with_contract_alias_sources(
            unselected_source,
            "@flighthq/example/contract",
            "",
            &[VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_prod.rs",
            }],
        )
        .unwrap_err()
        .to_string();

        assert!(unselected.contains("portable test struct/type `Sample`"));
        assert!(unselected.contains("contract.rs does not select a unique public export"));
    }

    #[test]
    fn resolves_chained_contract_and_test_aliases_to_canonical_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let contract = r#"
pub use self::SecondName as Sample;
pub use self::FirstName as SecondName;
pub use super::nullable_prod::OriginalSample as FirstName;
"#;
        let source = r#"
mod sample {
    use flight_example::Sample as ImportedName;
    use self::ImportedName as LocalName;

    #[test]
    fn follows_every_alias_hop() {
        let mut sample = LocalName { previous: None };
        sample.previous = None;
        assert!(sample.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/nullable_prod.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("previous: null"));
        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
    }

    #[test]
    fn resolves_production_return_alias_chains_to_canonical_provenance() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let factory = r#"
use crate::nullable_prod::OriginalSample as ImportedSample;
use self::ImportedSample as ReturnSample;

pub fn create_sample() -> ReturnSample {
    unimplemented!()
}
"#;
        let contract = r#"
pub use super::nullable_prod::OriginalSample;
pub use super::factory::create_sample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn follows_production_return_aliases() {
    let mut sample = create_sample();
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: nullable_production,
                    module: "src/nullable_prod.rs",
                },
                VitestAliasSource {
                    source: factory,
                    module: "src/factory.rs",
                },
            ],
        )
        .unwrap();

        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("sample.previous = undefined"));
    }

    #[test]
    fn rejects_missing_production_return_imports_without_name_fallback() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct OriginalSample {
    pub previous: Option<i32>,
}
"#;
        let factory = r#"
pub fn create_sample() -> OriginalSample {
    unimplemented!()
}
"#;
        let contract = r#"
pub use super::nullable_prod::OriginalSample;
pub use super::factory::create_sample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn uses_unresolved_return_owner() {
    let sample = create_sample();
    assert!(sample.previous.is_none());
}
"#;

        let error = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: nullable_production,
                    module: "src/nullable_prod.rs",
                },
                VitestAliasSource {
                    source: factory,
                    module: "src/factory.rs",
                },
            ],
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("function `create_sample` has unresolved struct return type(s)"));
        assert!(error.contains("OriginalSample"));
        assert!(error.contains("import or qualify exactly one public source owner"));
    }

    #[test]
    fn rejects_wildcard_and_explicit_contract_conflicts_deterministically() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct SharedSample {
    pub previous: Option<i32>,
}
"#;
        let optional_production = r#"
pub struct SharedSample {
    pub previous: Option<i32>,
}
"#;
        let contract = r#"
pub use super::nullable_prod::*;
pub use super::optional_prod::SharedSample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn uses_conflicting_sample() {
    let sample = SharedSample { previous: None };
    assert!(sample.previous.is_none());
}
"#;
        let aliases = [
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_prod.rs",
            },
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_prod.rs",
            },
        ];

        let first = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        let second = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();

        assert_eq!(first, second);
        assert!(first.contains("ambiguous public struct/type export `SharedSample`"));
        assert!(first.contains("src/nullable_prod.rs"));
        assert!(first.contains("src/optional_prod.rs"));
    }

    #[test]
    fn rejects_conflicting_test_alias_bindings_deterministically() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableSample {
    pub previous: Option<i32>,
}
"#;
        let optional_production = r#"
pub struct OptionalSample {
    pub previous: Option<i32>,
}
"#;
        let contract = r#"
pub use super::nullable_prod::NullableSample;
pub use super::optional_prod::OptionalSample;
"#;
        let source = r#"
use flight_example::{NullableSample as Sample, OptionalSample as Sample};

#[test]
fn uses_conflicting_alias() {
    let sample = Sample { previous: None };
    assert!(sample.previous.is_none());
}
"#;
        let aliases = [
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_prod.rs",
            },
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_prod.rs",
            },
        ];

        let first = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        let second = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();

        assert_eq!(first, second);
        assert!(first.contains("portable test struct/type binding `Sample` is ambiguous"));
        assert!(first.contains("src/nullable_prod.rs"));
        assert!(first.contains("src/optional_prod.rs"));
    }

    #[test]
    fn honors_selected_struct_and_function_shadowing_in_nested_scopes() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use super::production::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;

struct Sample {
    previous: Option<i32>,
}

#[test]
fn follows_nested_function_shadowing() {
    let local_struct = Sample { previous: None };
    assert!(local_struct.previous.is_none());
    let outer = create_sample();
    assert!(outer.previous.is_none());
    if true {
        let create_sample = || 7;
        let local = create_sample();
        assert_eq!(local, 7);
    }
    let after = create_sample();
    assert!(after.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/production.rs",
            }],
        )
        .unwrap();

        assert_eq!(output.matches("previous === null").count(), 2);
        assert!(output.contains("const localStruct: Sample = { previous: undefined };"));
        assert!(output.contains("expect(localStruct.previous === undefined).toBe(true);"));
        assert!(output.contains("const createSample = () => 7;"));
        assert!(output.contains("const local = createSample();"));
        assert!(!output.contains("const local: ReturnType<typeof createSample>"));
    }

    #[test]
    fn rejects_unresolved_public_function_provenance_deterministically() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableSample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> NullableSample {
    return NullableSample { previous: None };
}
"#;
        let optional_production = r#"
pub struct OptionalCollision {
    pub previous: Option<i32>,
}

pub fn create_sample() -> OptionalCollision {
    return OptionalCollision { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

#[test]
fn reads_sample() {
    let sample = create_sample();
    assert!(sample.previous.is_none());
}
"#;
        let aliases = [
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_sample.rs",
            },
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_collision.rs",
            },
        ];

        let first = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &aliases,
        )
        .unwrap_err()
        .to_string();
        let second = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &aliases,
        )
        .unwrap_err()
        .to_string();

        assert_eq!(first, second);
        assert!(first.contains("ambiguous public function export `create_sample`"));
        assert!(first.contains("provide contract.rs with --contract-source"));
        assert!(first.contains("src/nullable_sample.rs"));
        assert!(first.contains("src/optional_collision.rs"));
    }

    #[test]
    fn tracks_shadowed_struct_return_provenance_by_binding() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub struct NullableUnique {
    pub previous: Option<i32>,
}

pub fn create_nullable_unique() -> NullableUnique {
    return NullableUnique { previous: None };
}
"#;
        let optional_production = r#"
pub struct OptionalUnique {
    pub previous: Option<i32>,
}

pub fn create_optional_unique() -> OptionalUnique {
    return OptionalUnique { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn follows_each_shadowed_binding() {
        let sample = create_nullable_unique();
        assert!(sample.previous.is_none());
        let sample = create_optional_unique();
        assert!(sample.previous.is_none());
    }
}
"#;
        let aliases = [
            VitestAliasSource {
                source: nullable_production,
                module: "src/nullable_unique.rs",
            },
            VitestAliasSource {
                source: optional_production,
                module: "src/optional_unique.rs",
            },
        ];

        let output = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &aliases,
        )
        .unwrap();

        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(output.contains("expect(sample.previous === undefined).toBe(true);"));
        assert!(output.contains(
            "let sample: ReturnType<typeof createNullableUnique> | ReturnType<typeof createOptionalUnique> = createNullableUnique();"
        ));
        assert!(output.contains("sample = createOptionalUnique();"));
    }

    #[test]
    fn resolves_renamed_imports_to_struct_return_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct NullableUnique {
    pub previous: Option<i32>,
}

pub fn create_nullable_unique() -> NullableUnique {
    return NullableUnique { previous: None };
}
"#;
        let source = r#"
use flight_example::create_nullable_unique as make_sample;

mod sample {
    use super::*;

    #[test]
    fn reads_renamed_sample() {
        let sample = make_sample();
        assert!(sample.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &[VitestAliasSource {
                source: production,
                module: "src/nullable_unique.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("createNullableUnique as makeSample"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("sample.previous === undefined"));
    }

    #[test]
    fn indexes_top_level_and_suite_helper_struct_returns() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct NullableUnique {
    pub previous: Option<i32>,
}

pub fn create_nullable_unique() -> NullableUnique {
    return NullableUnique { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

fn nullable_sample() -> NullableUnique {
    return create_nullable_unique();
}

mod sample {
    use super::*;

    fn suite_nullable_sample() -> NullableUnique {
        return create_nullable_unique();
    }

    #[test]
    fn reads_helper_samples() {
        let top_level = nullable_sample();
        assert!(top_level.previous.is_none());
        let suite_local = suite_nullable_sample();
        assert!(suite_local.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &[VitestAliasSource {
                source: production,
                module: "src/nullable_unique.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("function nullableSample(): NullableUnique"));
        assert!(output.contains("function suiteNullableSample(): NullableUnique"));
        assert!(output.contains("expect(topLevel.previous === null).toBe(true);"));
        assert!(output.contains("expect(suiteLocal.previous === null).toBe(true);"));
    }

    #[test]
    fn initializes_nullable_struct_literal_fields_with_null() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct NullableUnique {
    pub previous: Option<i32>,
}
"#;
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn creates_nullable_sample() {
        let sample = NullableUnique { previous: None };
        assert!(sample.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &[VitestAliasSource {
                source: production,
                module: "src/nullable_unique.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("const sample: NullableUnique = { previous: null };"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
    }

    #[test]
    fn assigns_nullable_struct_fields_with_null() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct NullableUnique {
    pub previous: Option<i32>,
}

pub fn create_nullable_unique() -> NullableUnique {
    return NullableUnique { previous: None };
}
"#;
        let source = r#"
use flight_example::*;

mod sample {
    use super::*;

    #[test]
    fn clears_nullable_sample() {
        let mut sample = create_nullable_unique();
        sample.previous = None;
        assert!(sample.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_module_alias_sources(
            source,
            "@flighthq/example/contract",
            &[VitestAliasSource {
                source: production,
                module: "src/nullable_unique.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(!output.contains("sample.previous = undefined"));
    }

    #[test]
    fn lowers_real_velocity_nullable_field_checks_to_null() {
        let production = include_str!("../../flight-velocity/src/velocity_sample.rs");
        let contract = include_str!("../../flight-velocity/src/contract.rs");
        let tests = include_str!("../../flight-velocity/tests/velocity_sample_test.rs");

        let output = compile_vitest_with_contract_alias_sources(
            tests,
            "@flighthq/velocity/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/velocity_sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("expect(sample.previousWorldTransform === null).toBe(true);"));
        assert!(!output.contains("sample.previousWorldTransform === undefined"));
    }

    #[test]
    fn lowers_real_velocity_tests_with_the_generated_alias_set_deterministically() {
        let contract = include_str!("../../flight-velocity/src/contract.rs");
        let tests = include_str!("../../flight-velocity/tests/velocity_sample_test.rs");
        let aliases = [
            VitestAliasSource {
                source: include_str!("../../flight-velocity/src/transform_velocity.rs"),
                module: "crates/flight-velocity/src/transform_velocity.rs",
            },
            VitestAliasSource {
                source: include_str!("../../flight-velocity/src/velocity2d.rs"),
                module: "crates/flight-velocity/src/velocity2d.rs",
            },
            VitestAliasSource {
                source: include_str!("../../flight-velocity/src/velocity_explanation.rs"),
                module: "crates/flight-velocity/src/velocity_explanation.rs",
            },
            VitestAliasSource {
                source: include_str!("../../flight-velocity/src/velocity_sample.rs"),
                module: "crates/flight-velocity/src/velocity_sample.rs",
            },
        ];
        let mut expected = None;

        for _ in 0..16 {
            let output = compile_vitest_with_contract_alias_sources(
                tests,
                "@flighthq/velocity/contract",
                contract,
                &aliases,
            )
            .unwrap();
            assert!(output.contains("sample.previousWorldTransform === null"));
            assert!(output.contains("const result = explainVelocitySample(null, 3);"));
            assert!(!output.contains("previousWorldTransform === undefined"));
            if let Some(expected) = &expected {
                assert_eq!(&output, expected);
            } else {
                expected = Some(output);
            }
        }
    }

    #[test]
    fn resolves_fully_qualified_returns_and_complete_nested_module_paths() {
        let nullable = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let optional = r#"
pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let factory = r#"
pub fn create_sample() -> crate::a::sample::Sample {
    unimplemented!()
}
"#;
        let contract = r#"
pub use crate::a::sample::Sample;
pub use crate::factory::create_sample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn uses_the_fully_qualified_owner() {
    let mut sample = create_sample();
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;
        let aliases = [
            VitestAliasSource {
                source: optional,
                module: "src/b/sample.rs",
            },
            VitestAliasSource {
                source: nullable,
                module: "src/a/sample.rs",
            },
            VitestAliasSource {
                source: factory,
                module: "src/factory.rs",
            },
        ];

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();

        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("sample.previous === null"));
        assert!(!output.contains("sample.previous = undefined;"));
    }

    #[test]
    fn resolves_directory_module_paths_without_treating_mod_as_the_module() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct FooSample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use crate::foo::FooSample;\n";
        let source = r#"
use flight_example::*;

#[test]
fn uses_the_directory_module_owner() {
    let mut sample = FooSample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/foo/mod.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("FooSample = { previous: null }"));
        assert!(output.contains("sample.previous = null;"));
    }

    #[test]
    fn isolates_foreign_imports_qualified_calls_literals_and_annotations() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;
use flight_other::Sample as OtherSample;

#[test]
fn keeps_foreign_provenance_foreign() {
    let mut literal = OtherSample { previous: None };
    literal.previous = None;
    assert!(literal.previous.is_none());

    let mut called = flight_other::create_sample();
    called.previous = None;
    assert!(called.previous.is_none());

    let mut typed: flight_other::Sample = flight_other::create_sample();
    typed.previous = None;
    assert!(typed.previous.is_none());

    let current = create_sample();
    assert!(current.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("literal = { previous: undefined }"));
        assert!(output.contains("literal.previous = undefined;"));
        assert!(output.contains("called.previous = undefined;"));
        assert!(output.contains("typed.previous = undefined;"));
        assert!(output.contains("current.previous === null"));
        assert!(!output.contains("literal.previous = null;"));
        assert!(!output.contains("called.previous = null;"));
        assert!(!output.contains("typed.previous = null;"));
    }

    #[test]
    fn rejects_foreign_wildcards_instead_of_borrowing_current_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let sources = [
            r#"
use flight_other::*;

#[test]
fn foreign_wildcard_call_is_not_current() {
    let sample = create_sample();
    assert!(sample.previous.is_none());
}
"#,
            r#"
use flight_other::*;

#[test]
fn foreign_wildcard_literal_is_not_current() {
    let sample = Sample { previous: None };
    assert!(sample.previous.is_none());
}
"#,
            r#"
use flight_other::*;

#[test]
fn foreign_wildcard_type_is_not_current() {
    let sample: Sample = Sample { previous: None };
    assert!(sample.previous.is_none());
}
"#,
        ];

        for source in sources {
            let compile = || {
                compile_vitest_with_contract_alias_sources(
                    source,
                    "@flighthq/example/contract",
                    contract,
                    &[VitestAliasSource {
                        source: production,
                        module: "src/sample.rs",
                    }],
                )
                .unwrap_err()
                .to_string()
            };
            let first = compile();
            assert_eq!(first, compile());
            assert!(
                first.contains("contract.rs does not select a unique public export"),
                "{first}"
            );
        }
    }

    #[test]
    fn pattern_scopes_clear_value_provenance_and_restore_the_outer_binding() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let cases = [
            r#"
use flight_example::*;

struct LocalSample { previous: Option<i32> }

#[test]
fn for_pattern() {
    let mut sample = create_sample();
    let locals = vec![LocalSample { previous: None }];
    for sample in locals {
        let mut inner = sample;
        inner.previous = None;
        assert!(inner.previous.is_none());
    }
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#,
            r#"
use flight_example::*;

struct LocalSample { previous: Option<i32> }

#[test]
fn nested_for_pattern() {
    let mut sample = create_sample();
    let locals = vec![((LocalSample { previous: None },), 0)];
    for ((sample,), _) in locals {
        let mut inner = sample;
        inner.previous = None;
        assert!(inner.previous.is_none());
    }
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#,
        ];

        for source in cases {
            let output = compile_vitest_with_contract_alias_sources(
                source,
                "@flighthq/example/contract",
                contract,
                &[VitestAliasSource {
                    source: production,
                    module: "src/sample.rs",
                }],
            )
            .unwrap_or_else(|error| panic!("{error}: {source}"));

            assert!(output.contains("inner.previous = undefined;"), "{output}");
            assert!(
                output.contains("expect(inner.previous === undefined).toBe(true);"),
                "{output}"
            );
            assert!(output.contains("sample.previous = null;"), "{output}");
            assert!(
                output.contains("expect(sample.previous === null).toBe(true);"),
                "{output}"
            );
            assert!(!output.contains("inner.previous = null;"), "{output}");
        }
    }

    #[test]
    fn resolves_qualified_current_package_struct_literals_through_the_local_lane() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
#[test]
fn qualified_literal_uses_current_provenance() {
    let mut sample = flight_example::Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());

    let mut called = flight_example::create_sample();
    called.previous = None;
    assert!(called.previous.is_none());

    let mut typed: flight_example::Sample = flight_example::create_sample();
    typed.previous = None;
    assert!(typed.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(
            output.contains("let sample: Sample = { previous: null };"),
            "{output}"
        );
        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("expect(sample.previous === null).toBe(true);"));
        assert!(output.contains("called.previous = null;"));
        assert!(output.contains("expect(called.previous === null).toBe(true);"));
        assert!(output.contains("typed.previous = null;"));
        assert!(output.contains("expect(typed.previous === null).toBe(true);"));
        assert!(!output.contains("previous: undefined"));
    }

    #[test]
    fn resolves_chained_crate_root_contract_aliases_to_a_fixed_point() {
        let sample = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let factory = r#"
use crate::Sample;

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = r#"
pub use crate::sample::Sample as PublicSample;
pub use crate::PublicSample as Sample;
pub use crate::factory::create_sample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn follows_chained_root_aliases() {
    let mut sample = create_sample();
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: factory,
                    module: "src/factory.rs",
                },
                VitestAliasSource {
                    source: sample,
                    module: "src/sample.rs",
                },
            ],
        )
        .unwrap();

        assert!(output.contains("sample.previous = null;"));
        assert!(output.contains("sample.previous === null"));
    }

    #[test]
    fn resolves_contract_globs_through_public_prelude_reexports() {
        let bucket = r#"
//! flight-compiler: nullable-options

pub struct Bucket {
    pub previous: Option<i32>,
}

pub fn create_bucket() -> Bucket {
    return Bucket { previous: None };
}
"#;
        let prelude =
            "pub use crate::bucket::{Bucket as PublicBucket, create_bucket as make_bucket};\n";
        let contract = "pub use crate::prelude::*;\n";
        let source = r#"
use flight_example::*;

#[test]
fn follows_the_public_prelude() {
    let mut bucket: PublicBucket = make_bucket();
    bucket.previous = None;
    assert!(bucket.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: bucket,
                    module: "src/bucket.rs",
                },
                VitestAliasSource {
                    source: prelude,
                    module: "src/prelude.rs",
                },
            ],
        )
        .unwrap();

        assert!(output.contains("bucket.previous = null;"));
        assert!(output.contains("bucket.previous === null"));
    }

    #[test]
    fn resolves_relative_imports_from_the_complete_nested_module() {
        let sample = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let decoy = r#"
pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let factory = r#"
use super::super::sample::Sample;

pub fn create_nested_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let directory = r#"
use self::sample::Sample;

pub fn create_self_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = r#"
pub use crate::nested::create_self_sample;
pub use crate::nested::deeper::factory::create_nested_sample;
pub use crate::nested::sample::Sample;
"#;
        let source = r#"
use flight_example::*;

#[test]
fn follows_nested_relative_import() {
    let mut nested = create_nested_sample();
    nested.previous = None;
    assert!(nested.previous.is_none());
    let mut sibling = create_self_sample();
    sibling.previous = None;
    assert!(sibling.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: factory,
                    module: "src/nested/deeper/factory.rs",
                },
                VitestAliasSource {
                    source: directory,
                    module: "src/nested/mod.rs",
                },
                VitestAliasSource {
                    source: decoy,
                    module: "src/other/sample.rs",
                },
                VitestAliasSource {
                    source: sample,
                    module: "src/nested/sample.rs",
                },
            ],
        )
        .unwrap();

        assert!(output.contains("nested.previous = null;"));
        assert!(output.contains("nested.previous === null"));
        assert!(output.contains("sibling.previous = null;"));
        assert!(output.contains("sibling.previous === null"));
    }

    #[test]
    fn normalizes_relative_and_absolute_modules_from_the_deepest_source_root() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use crate::nested::Sample;\n";
        let source = r#"
use flight_example::*;

#[test]
fn uses_sample() {
    let mut sample = Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;
        let compile = |module| {
            compile_vitest_with_contract_alias_sources(
                source,
                "@flighthq/example/contract",
                contract,
                &[VitestAliasSource {
                    source: production,
                    module,
                }],
            )
            .unwrap()
        };

        let relative = compile("src/workspace/src/nested/mod.rs");
        let absolute = compile("/tmp/ancestor/src/workspace/src/nested/mod.rs");
        assert_eq!(relative, absolute);
        assert!(relative.contains("sample.previous = null;"));
    }

    #[test]
    fn lets_local_type_aliases_shadow_selected_struct_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use crate::sample::Sample;\n";
        let source = r#"
use flight_example::*;

struct LocalSample {
    previous: Option<i32>,
}

type Sample = LocalSample;

#[test]
fn uses_the_local_alias() {
    let mut sample = Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("type Sample = LocalSample;"));
        assert!(output.contains("sample: Sample = { previous: undefined }"));
        assert!(output.contains("sample.previous = undefined;"));
        assert!(!output.contains("sample.previous = null;"));
    }

    #[test]
    fn indexes_local_structs_before_local_helper_returns() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use crate::sample::Sample;\n";
        let source = r#"
use flight_example::*;

struct Sample {
    previous: Option<i32>,
}

fn local_sample() -> Sample {
    return Sample { previous: None };
}

#[test]
fn uses_the_local_helper_owner() {
    let mut sample = local_sample();
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("function localSample(): Sample"));
        assert!(output.contains("sample.previous = undefined;"));
        assert!(output.contains("sample.previous === undefined"));
        assert!(!output.contains("sample.previous = null;"));
    }

    #[test]
    fn lets_nested_for_patterns_shadow_selected_function_provenance() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;

struct LocalSample {
    previous: Option<i32>,
}

fn local_sample() -> LocalSample {
    return LocalSample { previous: None };
}

#[test]
fn shadows_the_selected_factory_in_a_nested_pattern() {
    for (create_sample, _) in vec![(local_sample, 0)] {
        let mut local = create_sample();
        local.previous = None;
        assert!(local.previous.is_none());
    }
    let selected = create_sample();
    assert!(selected.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("for (const [createSample, ] of"));
        assert!(output.contains("local.previous = undefined;"));
        assert!(output.contains("local.previous === undefined"));
        assert!(output.contains("selected.previous === null"));
        assert!(!output.contains("local.previous = null;"));
    }

    #[test]
    fn preserves_explicit_cross_crate_bindings_with_an_unrelated_wildcard() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_binpack::*;
use flight_example::*;
use flight_geometry::{Matrix, create_matrix};

fn read_matrix_a(matrix: &Matrix) -> f32 {
    return matrix.a;
}

#[test]
fn keeps_explicit_owners() {
    let sample: Sample = create_sample();
    let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
    assert!(sample.previous.is_none());
    assert_eq!(read_matrix_a(&matrix), 1.0);
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert_eq!(
            output,
            r#"import { describe, expect, it } from 'vitest';

import { createMatrix } from "@flighthq/geometry/contract";

import type { Matrix } from "@flighthq/geometry/contract";

import {
  createSample,
} from "@flighthq/example/contract";

import type {
  Sample,
} from "@flighthq/example/contract";

function readMatrixA(matrix: Readonly<Matrix>): number {
  return matrix.a;
}

describe("portableTests", () => {
  it("keeps explicit owners", () => {
    const sample: Sample = createSample();
    const matrix = createMatrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
    expect(sample.previous === null).toBe(true);
    expect(readMatrixA(matrix)).toEqual(1.0);
  });
});
"#
        );
    }

    #[test]
    fn preserves_suite_local_cross_crate_aliases_with_an_unrelated_wildcard() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_binpack::*;
use flight_example::*;

mod explicit_geometry_aliases {
    use flight_geometry::{Matrix as GeometryMatrix, create_matrix as make_matrix};
    use super::*;

    fn read_matrix_a(matrix: &GeometryMatrix) -> f32 {
        return matrix.a;
    }

    #[test]
    fn keeps_explicit_alias_owners() {
        let sample: Sample = create_sample();
        let matrix = make_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        assert!(sample.previous.is_none());
        assert_eq!(read_matrix_a(&matrix), 1.0);
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert_eq!(
            output,
            r#"import { describe, expect, it } from 'vitest';

import { createMatrix as makeMatrix } from "@flighthq/geometry/contract";

import type { Matrix as GeometryMatrix } from "@flighthq/geometry/contract";

import {
  createSample,
} from "@flighthq/example/contract";

import type {
  Sample,
} from "@flighthq/example/contract";

describe("explicitGeometryAliases", () => {
  function readMatrixA(matrix: Readonly<GeometryMatrix>): number {
    return matrix.a;
  }
  it("keeps explicit alias owners", () => {
    const sample: Sample = createSample();
    const matrix = makeMatrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
    expect(sample.previous === null).toBe(true);
    expect(readMatrixA(matrix)).toEqual(1.0);
  });
});
"#
        );
    }

    #[test]
    fn routes_unresolved_values_from_mixed_current_and_foreign_wildcards() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_geometry::*;
use flight_example::*;

#[test]
fn uses_each_wildcard_contract() {
    let sample = create_sample();
    assert!(sample.previous.is_none());
    let matrix = create_matrix();
    assert_eq!(matrix, create_matrix());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(
            output.contains("import { createMatrix } from \"@flighthq/geometry/contract\";"),
            "{output}"
        );
        assert!(
            output.contains("  createSample,\n} from \"@flighthq/example/contract\";"),
            "{output}"
        );
        assert!(!output.contains("  createMatrix,\n"), "{output}");
    }

    #[test]
    fn rejects_unresolved_values_from_multiple_mixed_foreign_wildcards() {
        let production = r#"
pub fn create_sample() -> i32 {
    return 1;
}
"#;
        let contract = "pub use crate::sample::create_sample;\n";
        let source = r#"
use flight_example::*;
use flight_geometry::*;
use flight_math::*;

#[test]
fn ambiguous_foreign_wildcard_value() {
    assert_eq!(create_sample(), 1);
    assert_eq!(create_matrix(), create_matrix());
}
"#;
        let compile = || {
            compile_vitest_with_contract_alias_sources(
                source,
                "@flighthq/example/contract",
                contract,
                &[VitestAliasSource {
                    source: production,
                    module: "src/sample.rs",
                }],
            )
            .unwrap_err()
            .to_string()
        };

        let first = compile();
        assert_eq!(first, compile());
        assert!(first.contains("flight_geometry, flight_math"), "{first}");
        assert!(first.contains("use explicit Rust imports"), "{first}");
    }

    #[test]
    fn routes_unresolved_types_from_mixed_current_and_foreign_wildcards() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_sample() -> Sample {
    return Sample { previous: None };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;
use flight_geometry::*;

#[test]
fn uses_each_wildcard_contract_type() {
    let sample: Sample = create_sample();
    let matrix: Matrix = create_matrix();
    assert!(sample.previous.is_none());
    assert_eq!(matrix, create_matrix());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/sample.rs",
            }],
        )
        .unwrap();

        assert!(
            output.contains("import { createMatrix } from \"@flighthq/geometry/contract\";"),
            "{output}"
        );
        assert!(
            output.contains("import type { Matrix } from \"@flighthq/geometry/contract\";"),
            "{output}"
        );
        assert!(
            output.contains("  createSample,\n} from \"@flighthq/example/contract\";"),
            "{output}"
        );
        assert!(
            output.contains("  Sample,\n} from \"@flighthq/example/contract\";"),
            "{output}"
        );
        assert!(!output.contains("  Matrix,\n"), "{output}");
    }

    #[test]
    fn rejects_unresolved_types_from_multiple_mixed_foreign_wildcards() {
        let production = r#"
pub struct Sample {
    pub value: i32,
}

pub fn create_sample() -> Sample {
    return Sample { value: 1 };
}
"#;
        let contract = "pub use crate::sample::{Sample, create_sample};\n";
        let source = r#"
use flight_example::*;
use flight_geometry::*;
use flight_math::*;

fn keeps_the_foreign_type(_: Matrix) {}

#[test]
fn ambiguous_foreign_wildcard_type() {
    let sample: Sample = create_sample();
    assert_eq!(sample.value, 1);
}
"#;
        let compile = || {
            compile_vitest_with_contract_alias_sources(
                source,
                "@flighthq/example/contract",
                contract,
                &[VitestAliasSource {
                    source: production,
                    module: "src/sample.rs",
                }],
            )
            .unwrap_err()
            .to_string()
        };

        let first = compile();
        assert_eq!(first, compile());
        assert!(first.contains("portable test types Matrix"), "{first}");
        assert!(first.contains("flight_geometry, flight_math"), "{first}");
        assert!(first.contains("use explicit Rust imports"), "{first}");
    }

    #[test]
    fn treats_grouped_current_submodule_aliases_as_qualifiers_not_contract_imports() {
        let optional = r#"
pub struct OptionalSample {
    pub previous: Option<i32>,
}
"#;
        let nullable = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = r#"
pub use crate::optional::OptionalSample;
pub use crate::root::Sample;
"#;
        let source = r#"
use flight_example::{optional as storage, root as nullable};

#[test]
fn uses_grouped_module_aliases() {
    let mut optional = storage::OptionalSample { previous: None };
    optional.previous = None;
    let mut sample = nullable::Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[
                VitestAliasSource {
                    source: optional,
                    module: "src/optional.rs",
                },
                VitestAliasSource {
                    source: nullable,
                    module: "src/root.rs",
                },
            ],
        )
        .unwrap();

        assert!(output.contains("  OptionalSample,"), "{output}");
        assert!(output.contains("  Sample,"), "{output}");
        assert!(!output.contains("optional as storage"), "{output}");
        assert!(!output.contains("root as nullable"), "{output}");
        assert!(!output.contains("storage.OptionalSample"), "{output}");
        assert!(!output.contains("nullable.Sample"), "{output}");
        assert!(
            output.contains("optional.previous = undefined;"),
            "{output}"
        );
        assert!(output.contains("sample.previous = null;"), "{output}");
    }

    #[test]
    fn canonicalizes_grouped_self_as_the_current_crate_root() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}
"#;
        let contract = "pub use crate::root::Sample;\n";
        let source = r#"
use flight_example::{self as current};

#[test]
fn uses_the_grouped_crate_alias() {
    let mut sample = current::Sample { previous: None };
    sample.previous = None;
    assert!(sample.previous.is_none());
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/root.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("  Sample,"), "{output}");
        assert!(!output.contains("self as current"), "{output}");
        assert!(!output.contains("current.Sample"), "{output}");
        assert!(output.contains("sample.previous = null;"), "{output}");
    }

    #[test]
    fn rejects_direct_foreign_crate_aliases_before_emitting_typescript() {
        let source = r#"
use flight_geometry as geometry;

#[test]
fn uses_the_foreign_crate_alias() {
    let matrix: geometry::Matrix = geometry::create_matrix();
    assert_eq!(matrix, geometry::create_matrix());
}
"#;
        let compile = || {
            compile_vitest(source, "@flighthq/example/contract")
                .unwrap_err()
                .to_string()
        };

        let first = compile();
        assert_eq!(first, compile());
        assert!(first.contains("foreign Flight crate `flight_geometry`"));
        assert!(first.contains("namespace alias `geometry`"));
        assert!(first.contains("import the used items explicitly"));
    }

    #[test]
    fn rejects_grouped_foreign_crate_aliases_before_emitting_typescript() {
        let source = r#"
use flight_geometry::{self as geometry};

#[test]
fn uses_the_grouped_foreign_crate_alias() {
    let matrix: geometry::Matrix = geometry::create_matrix();
    assert_eq!(matrix, geometry::create_matrix());
}
"#;
        let compile = || {
            compile_vitest(source, "@flighthq/example/contract")
                .unwrap_err()
                .to_string()
        };

        let first = compile();
        assert_eq!(first, compile());
        assert!(first.contains("foreign Flight crate `flight_geometry`"));
        assert!(first.contains("namespace alias `geometry`"));
        assert!(first.contains("import the used items explicitly"));
        assert!(!first.contains("self as geometry"));
    }

    #[test]
    fn preserves_sequence_element_provenance_through_mutable_references() {
        let production = r#"
//! flight-compiler: nullable-options

pub struct Sample {
    pub previous: Option<i32>,
}

pub fn create_samples() -> Vec<Sample> {
    return vec![Sample { previous: None }];
}
"#;
        let contract = "pub use crate::root::{Sample, create_samples};\n";
        let source = r#"
use flight_example::*;

#[test]
fn mutates_samples_by_reference() {
    let mut samples = create_samples();
    for sample in &mut samples {
        sample.previous = None;
        assert!(sample.previous.is_none());
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "src/root.rs",
            }],
        )
        .unwrap();

        assert!(output.contains("sample.previous = null;"), "{output}");
        assert!(output.contains("sample.previous === null"), "{output}");
        assert!(!output.contains("sample.previous = undefined;"), "{output}");
    }

    #[test]
    fn contextualizes_declared_struct_literal_bindings() {
        let source = r#"
use std::sync::Arc;

struct Fixture {
    pairs: Vec<(String, String)>,
    record: Arc<dyn Fn(&mut Vec<(String, String)>, &Vec<f32>) + Send + Sync>,
}

fn make_fixture() -> Fixture {
    let fixture = Fixture {
        pairs: Vec::new(),
        record: Arc::new(|pairs, values| {
            pairs.push(("left".to_string(), values.clone().len().to_string()));
        }),
    };
    return fixture;
}

mod fixture {
    use super::*;

    #[test]
    fn records_a_pair() {
        let fixture = make_fixture();
        (fixture.record)(&mut fixture.pairs, &vec![1.0]);
        assert_eq!(fixture.pairs, vec![("left".to_string(), "1".to_string())]);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/example/contract").unwrap();

        assert!(output.contains("pairs: Array<readonly [string, string]>;"));
        assert!(output.contains(
            "record: (arg0: Array<readonly [string, string]>, arg1: Readonly<number[]>) => void;"
        ));
        assert!(
            output.contains("const fixture: Fixture = { pairs: [], record: (pairs, values) => {")
        );
        assert!(output.contains("pairs.push([\"left\", String(values.slice().length)]);"));
        assert!(!output.contains("[] as never[]"));
    }

    #[test]
    fn imports_contract_types_used_only_by_struct_literals() {
        let production = r#"
pub struct Sample {
    pub x: f32,
}

pub fn read_sample(sample: &Sample) -> f32 {
    return sample.x;
}
"#;
        let source = r#"
use flight_example::*;

mod read_sample {
    use super::*;

    #[test]
    fn reads_a_struct_literal() {
        let sample = Sample { x: 2.0 };
        assert_eq!(read_sample(&sample), 2.0);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/example/contract", &[production])
                .unwrap();

        assert!(
            output.contains("import type {\n  Sample,\n} from \"@flighthq/example/contract\";")
        );
        assert!(output.contains("const sample: Sample = { x: 2.0 };"));

        let velocity2d = include_str!("../../flight-velocity/src/velocity2d.rs");
        let velocity2d_tests = include_str!("../../flight-velocity/tests/velocity2d_test.rs");
        let velocity_output = compile_vitest_with_alias_sources(
            velocity2d_tests,
            "@flighthq/velocity/contract",
            &[velocity2d],
        )
        .unwrap();
        assert!(
            velocity_output
                .contains("import type {\n  Velocity2D,\n} from \"@flighthq/velocity/contract\";")
        );
        assert!(velocity_output.contains("const a: Velocity2D = { x: 1.0, y: 2.0 };"));
    }

    #[test]
    fn routes_explicit_cross_crate_test_imports_to_their_own_contracts() {
        let source = r#"
use flight_geometry::{Matrix, create_matrix as make_matrix, unused_value};
use flight_velocity::contract::*;

fn read_a(matrix: &Matrix) -> f32 {
    return matrix.a;
}

mod sample_velocity {
    use super::*;

    #[test]
    fn reads_a_cross_crate_matrix() {
        let matrix = make_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        assert_eq!(read_a(&matrix), 1.0);
        assert_eq!(sample_velocity(), 1.0);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/velocity/contract").unwrap();

        assert!(output.contains(
            "import { createMatrix as makeMatrix } from \"@flighthq/geometry/contract\";"
        ));
        assert!(output.contains("import type { Matrix } from \"@flighthq/geometry/contract\";"));
        assert!(
            output.contains("import {\n  sampleVelocity,\n} from \"@flighthq/velocity/contract\";")
        );
        assert!(!output.contains("  makeMatrix,\n} from \"@flighthq/velocity/contract\";"));
        assert!(!output.contains("  Matrix,\n} from \"@flighthq/velocity/contract\";"));
        assert!(!output.contains("unusedValue"));
    }

    #[test]
    fn routes_module_local_cross_crate_test_imports_to_their_own_contracts() {
        let source = r#"
use flight_velocity::contract::*;

mod sample_velocity {
    use flight_geometry::Matrix;
    use super::*;

    fn read_a(matrix: &Matrix) -> f32 {
        return matrix.a;
    }

    #[test]
    fn reads_a_cross_crate_matrix() {
        let matrix = Matrix { a: 1.0 };
        assert_eq!(read_a(&matrix), 1.0);
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/velocity/contract").unwrap();

        assert!(output.contains("import type { Matrix } from \"@flighthq/geometry/contract\";"));
        assert!(!output.contains("  Matrix,\n} from \"@flighthq/velocity/contract\";"));
    }

    #[test]
    fn rejects_colliding_module_local_cross_crate_test_imports() {
        let source = r#"
use flight_velocity::contract::*;

mod geometry_suite {
    use flight_geometry::Matrix;

    fn accepts_geometry(value: &Matrix) -> bool {
        return value.a == 1.0;
    }

    #[test]
    fn accepts() {
        assert!(true);
    }
}

mod node_suite {
    use flight_node::NodeRef as Matrix;

    fn accepts_node(value: &Matrix) -> bool {
        return value.visible;
    }

    #[test]
    fn accepts() {
        assert!(true);
    }
}
"#;

        let error = compile_vitest(source, "@flighthq/velocity/contract").unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable test modules import TypeScript binding `Matrix` from both `Matrix` in `@flighthq/geometry/contract` and `NodeRef as Matrix` in `@flighthq/node/contract`; use distinct Rust import aliases"
        );
    }

    #[test]
    fn lowers_shared_test_state_and_string_union_case_tables() {
        let production = r#"
//! flight-compiler: string-union Status

pub enum Status {
    Ready,
    Waiting,
}

pub fn read_status(value: Status) -> Status {
    return value;
}
"#;
        let source = r#"
use std::sync::{Arc, Mutex};
use flight_example::*;

struct Recorded {
    values: Vec<Status>,
}

type Calls = Arc<Mutex<Recorded>>;

fn make_calls() -> Calls {
    return Arc::new(Mutex::new(Recorded { values: Vec::new() }));
}

mod read_status {
    use super::*;

    #[test]
    fn preserves_shared_state_and_literal_types() {
        let calls = make_calls();
        let alias = Arc::clone(&calls);
        alias.lock().unwrap().values.push(Status::Ready);
        let (_, selected) = (0, Status::Ready);
        let cases = [
            (Status::Ready, "ready"),
            (Status::Waiting, "waiting"),
        ];
        for (value, expected) in cases {
            assert_eq!(read_status(value), expected);
        }
        assert_eq!(calls.lock().unwrap().values, vec![selected]);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/example/contract", &[production])
                .unwrap();

        assert!(output.contains("import type {\n  Status,\n}"));
        assert!(!output.contains("Arc.clone"));
        assert!(output.contains("alias.value.values.push(\"ready\");"));
        assert!(output.contains("const [, selected] = [0, \"ready\"] as const;"));
        assert!(output.contains(
            "const cases = [[\"ready\", \"ready\"], [\"waiting\", \"waiting\"]] as const;"
        ));
        assert!(output.contains("expect(calls.value.values).toEqual([selected]);"));
    }

    #[test]
    fn lowers_real_haptics_shared_state_and_union_tables() {
        let types = include_str!("../../flight-haptics/src/types.rs");
        let haptics = include_str!("../../flight-haptics/src/haptics.rs");
        let haptics_tests = include_str!("../../flight-haptics/tests/haptics_test.rs");
        let types_tests = include_str!("../../flight-haptics/tests/types_test.rs");

        let haptics_output = compile_vitest_with_alias_sources(
            haptics_tests,
            "@flighthq/haptics/contract",
            &[types, haptics],
        )
        .unwrap();
        let types_output = compile_vitest_with_alias_sources(
            types_tests,
            "@flighthq/haptics/contract",
            &[types, haptics],
        )
        .unwrap();

        assert!(haptics_output.contains(
            "import type {\n  HapticImpactStyle,\n  HapticNotificationType,\n  HapticsCapabilities,\n  HostHapticsCapability,\n}"
        ));
        assert!(!haptics_output.contains("Arc.clone"));
        assert!(haptics_output.contains("cancelCalls.value.names.push(\"cancel\");"));
        assert!(haptics_output.contains("let calls = impactCalls.value;"));
        assert!(haptics_output.contains("let [, host] = makeHost();"));
        assert!(haptics_output.contains(
            "const calls: Readonly<{ value: RecordedCalls }> = { value: { impacts: [], names: [], notifications: [], patterns: [], vibrations: [], waveforms: [] } };"
        ));
        assert!(haptics_output.contains("const host: HostHapticsCapability = { cancel: () => {"));
        assert!(haptics_output.contains("capabilities: (out) => {"));
        assert!(haptics_output.contains("calls.patterns.push(pattern.slice());"));
        assert!(
            haptics_output
                .contains("calls.waveforms.push([timings.slice(), amplitudes.slice(), repeat]);")
        );
        assert!(haptics_output.contains(
            "const styles = [\"heavy\", \"light\", \"medium\", \"rigid\", \"soft\"] as const;"
        ));
        assert!(
            haptics_output.contains(
                "const notificationTypes = [\"error\", \"success\", \"warning\"] as const;"
            )
        );
        assert!(types_output.contains(
            "const cases = [[\"cancel\", \"cancel\"], [\"capabilities\", \"capabilities\"]"
        ));
        assert_eq!(types_output.matches("]] as const;").count(), 2);
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
    fn lowers_inherited_union_variant_references_only_in_code() {
        let production = r#"
//! flight-compiler: numeric-union Direction
//! flight-compiler: string-union Mode

pub enum Direction {
    Forward = 1,
    Backward = -1,
}

pub enum Mode {
    Fast,
    Slow,
}

pub fn mode_label(mode: Mode) -> &'static str {
    return match mode {
        Mode::Fast => "Mode.Fast",
        Mode::Slow => "Mode.Slow",
    };
}

pub fn reverse(direction: Direction) -> Direction {
    return match direction {
        Direction::Forward => Direction::Backward,
        Direction::Backward => Direction::Forward,
    };
}
"#;
        let source = r#"
use flight_motionpath::*;

mod reverse {
    use super::*;

    #[test]
    fn keeps_variant_text_in_literals() {
        assert_eq!(reverse(Direction::Forward), Direction::Backward);
        assert_eq!(mode_label(Mode::Fast), "Mode.Fast");
        assert_eq!(
            format!("Direction.Forward {}", mode_label(Mode::Slow)),
            "Direction.Forward Mode.Slow"
        );
        assert_eq!("Direction.Backward", "Direction.Backward");
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/motionpath/contract",
            &[production],
        )
        .unwrap();

        assert!(output.contains("expect(reverse(1)).toEqual(-1);"));
        assert!(output.contains("expect(modeLabel(\"fast\")).toEqual(\"Mode.Fast\");"));
        assert!(output.contains(
            "expect(`Direction.Forward ${modeLabel(\"slow\")}`).toEqual(\"Direction.Forward Mode.Slow\");"
        ));
        assert!(output.contains("expect(\"Direction.Backward\").toEqual(\"Direction.Backward\");"));
        assert!(!output.contains("  Direction,"));
    }

    #[test]
    fn inherits_entity_runtime_state_designations_from_production_sources() {
        let production = r#"
//! flight-compiler: entity-runtime-state LassoSelection.state

use flight_entity::{EntityRuntimeSlot, allocate_entity};

pub struct LassoSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: LassoSelectionRuntime,
}

pub struct LassoSelectionRuntime {
    pub active: bool,
}

flight_entity::impl_entity!(LassoSelection);

pub fn create_lasso_selection() -> LassoSelection {
    let mut out: LassoSelection = allocate_entity();
    out.state = LassoSelectionRuntime { active: false };
    return out;
}

pub fn begin_lasso_selection(selection: &mut LassoSelection) {
    selection.state.active = true;
}

pub fn is_lasso_selection_active(selection: &LassoSelection) -> bool {
    return selection.state.active;
}
"#;
        let source = r#"
use flight_selection::*;

mod begin_lasso_selection {
    use super::*;

    #[test]
    fn activates_only_the_begun_selection() {
        let mut selection = create_lasso_selection();
        let other = create_lasso_selection();
        begin_lasso_selection(&mut selection);
        assert!(is_lasso_selection_active(&selection));
        assert!(!is_lasso_selection_active(&other));
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/selection/contract",
            &[production],
        )
        .unwrap();

        assert!(output.contains("    let selection = createLassoSelection();\n"));
        assert!(output.contains("    beginLassoSelection(selection);\n"));
        assert!(output.contains("    expect(isLassoSelectionActive(selection)).toBe(true);\n"));
        assert!(output.contains("    expect(!isLassoSelectionActive(other)).toBe(true);\n"));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(!output.contains(".state"));
    }

    #[test]
    fn inherits_numeric_union_discriminants_from_production_sources() {
        let production = r#"
//! flight-compiler: numeric-union Direction

pub enum Direction {
    Forward = 1,
    Backward = -1,
}

pub fn reverse(direction: Direction) -> Direction {
    return match direction {
        Direction::Forward => Direction::Backward,
        Direction::Backward => Direction::Forward,
    };
}
"#;
        let source = r#"
use flight_motionpath::*;

mod reverse {
    use super::*;

    #[test]
    fn flips_the_direction() {
        assert_eq!(reverse(Direction::Forward), Direction::Backward);
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/motionpath/contract",
            &[production],
        )
        .unwrap();

        assert!(output.contains("expect(reverse(1)).toEqual(-1);"));
        assert!(!output.contains("Direction.Forward"));
        assert!(!output.contains("  Direction,"));
    }

    #[test]
    fn inherits_exact_string_union_values_from_production_sources() {
        let production = r#"
//! flight-compiler: string-union Facet=exact
//! flight-compiler: string-union-value Facet Compression "compression.kind"
//! flight-compiler: string-union-value Facet SceneNode "scene.node-kind"

pub enum Facet {
    Compression,
    SceneNode,
}
"#;
        let source = r#"
use flight_requirement::*;

mod facet {
    use super::*;

    #[test]
    fn accepts_an_exact_facet() {
        assert_eq!(identity(Facet::SceneNode), "scene.node-kind");
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/requirement/contract",
            &[production],
        )
        .unwrap();

        assert!(!output.contains("  Facet,"));
        assert!(output.contains("identity(\"scene.node-kind\")"));
        assert!(!output.contains("Facet.SceneNode"));
    }

    #[test]
    fn imports_frozen_objects_by_their_explicit_typescript_names() {
        let production = r#"
//! flight-compiler: frozen-object SPRING_PRESET_BOUNCY SpringPresetBouncy

pub struct SpringConfig {
    pub damping_ratio: f32,
    pub frequency: f32,
}

pub const SPRING_PRESET_BOUNCY: SpringConfig = SpringConfig {
    damping_ratio: 0.35,
    frequency: 2.0,
};
"#;
        let source = r#"
use flight_spring::*;

mod spring_presets {
    use super::*;

    #[test]
    fn exposes_the_bouncy_frequency() {
        assert_eq!(SPRING_PRESET_BOUNCY.frequency, 2.0);
        let mut customized = SPRING_PRESET_BOUNCY;
        customized.frequency = 3.0;
        assert_eq!(customized.frequency, 3.0);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/spring/contract", &[production])
                .unwrap();

        assert!(output.contains("  SpringPresetBouncy,"));
        assert!(
            output.contains("expect(SpringPresetBouncy.frequency).toEqual(2.0);"),
            "{output}"
        );
        assert!(output.contains("let customized = { ...SpringPresetBouncy };"));
        assert!(!output.contains("SPRING_PRESET_BOUNCY"));
    }

    #[test]
    fn inherits_data_union_runtime_lowering_from_production_sources() {
        let production = r#"
//! flight-compiler: data-union RectangleId

pub enum RectangleId {
    Number(i32),
    Text(String),
}
"#;
        let source = r#"
use flight_binpack::*;

mod rectangle_ids {
    use super::*;

    #[test]
    fn constructs_and_matches_an_id() {
        let id = RectangleId::Number(4);
        let number = match id {
            RectangleId::Number(value) => value,
            RectangleId::Text(_) => 0,
        };
        assert_eq!(number, 4);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/binpack/contract", &[production])
                .unwrap();

        assert!(output.contains("const id = 4;"));
        assert!(output.contains("typeof matchValue === \"number\""));
        assert!(output.contains("typeof matchValue === \"string\""));
        assert!(!output.contains("  RectangleId,"));
        assert!(!output.contains("RectangleId.Number"));
    }

    #[test]
    fn inherits_tagged_data_union_runtime_lowering_from_production_sources() {
        let production = include_str!("../../flight-path/src/path.rs");
        let source = r#"
use flight_path::*;

mod path_segments {
    use super::*;

    #[test]
    fn constructs_and_matches_a_segment() {
        let segment = PathSegment::MoveTo { x: 4.0, y: 5.0 };
        let x = match segment {
            PathSegment::MoveTo { x, .. } => x,
            PathSegment::LineTo { x, .. } => x,
            PathSegment::QuadraticCurveTo { x, .. } => x,
            PathSegment::CubicCurveTo { x, .. } => x,
            PathSegment::Close => 0.0,
        };
        assert_eq!(x, 4.0);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/path/contract", &[production])
                .unwrap();

        assert!(output.contains("const segment = { kind: \"moveTo\" as const, x: 4.0, y: 5.0 };"));
        assert!(output.contains("matchValue.kind === \"moveTo\""));
        assert!(output.contains("else {\n"));
        assert!(output.contains("return 0.0;"));
        assert!(!output.contains("  PathSegment,"));
        assert!(!output.contains("PathSegment.MoveTo"));
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

// Rust's own `Vec::retain` unwind behavior, which the TypeScript lowering mirrors (exercised against the
// generated code by scripts/flight-compile-retain.test.ts): kept elements, then the element whose predicate
// panicked and the unprocessed tail.
#[test]
fn vec_retain_unwind_reference() {
    fn retain_even_until(values: &[i32], stop: i32) -> Vec<i32> {
        let mut values = values.to_vec();
        let previous_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            values.retain(|value| {
                if *value == stop {
                    panic!("stop");
                }
                return *value % 2 == 0;
            });
        }));
        std::panic::set_hook(previous_hook);
        return values;
    }

    assert_eq!(retain_even_until(&[1, 2, 3, 4], 3), vec![2, 3, 4]);
    assert_eq!(retain_even_until(&[1, 3, 5, 2, 7, 9], 7), vec![2, 7, 9]);
    assert_eq!(retain_even_until(&[2, 4, 6], 4), vec![2, 4, 6]);
    assert_eq!(retain_even_until(&[1, 2, 3], 1), vec![1, 2, 3]);
    assert_eq!(retain_even_until(&[1, 2, 3, 4], 99), vec![2, 4]);
}
