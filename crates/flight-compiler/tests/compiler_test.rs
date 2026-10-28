use flight_compiler::{compile_typescript, compile_vitest};

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
    fn emits_documented_native_signatures_aliases_and_throws() {
        let source = r#"
use std::sync::Arc;

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
    fn reexports_canonical_typescript_types_without_redeclaring_them() {
        let source = r#"
use std::sync::Arc;

/// A callable random source.
/// flight-compiler: typescript-import @flighthq/types/contract
pub type RandomSource = Arc<dyn Fn() -> f32 + Send + Sync>;

pub fn reuse_random_source(random: RandomSource) -> RandomSource {
    return random;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "import type { RandomSource } from \"@flighthq/types/contract\";\n\n/**\n * A callable random source.\n */\nexport type { RandomSource };"
        ));
        assert!(
            output
                .contains("export function reuseRandomSource(random: RandomSource): RandomSource")
        );
        assert!(!output.contains("export type RandomSource ="));
        assert!(!output.contains("flight-compiler:"));
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
"#
        );
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
            assert!(f32::NAN.is_nan());
        }
    }
}
"#;

        let output = compile_vitest(source, "@flighthq/geometry/contract").unwrap();

        assert!(output.contains(
            "const cases: Readonly<readonly [number[], number][]> = [[[1.0, 2.0], 3.0]];"
        ));
        assert!(output.contains("for (const [value, expected] of cases) {"));
        assert!(output.contains("let out = new Array(2).fill(0.0);"));
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
}
