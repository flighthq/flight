use flight_compiler::{
    ExternalAliasSource, ModuleSource, SourceMode, VitestAliasSource, compile_typescript,
    compile_typescript_with_alias_sources, compile_typescript_with_external_alias_sources,
    compile_typescript_with_module_sources, compile_typescript_with_visibility_sources,
    compile_vitest, compile_vitest_with_alias_sources, compile_vitest_with_contract_alias_sources,
    compile_vitest_with_external_alias_sources, compile_vitest_with_module_alias_sources,
    root_only_names, source_mode,
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
            root_only_names(
                "#![doc = \"flight-compiler: root-only Signal, createSignal\"]\npub struct Signal {}\n"
            )
            .unwrap(),
            ["Signal", "createSignal"]
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
        assert_eq!(
            source_mode(
                "//! flight-compiler: root-only Signal, createSignal\npub struct Signal {}\npub fn create_signal() -> Signal { Signal {} }\n"
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
    fn rejects_malformed_root_only_targets() {
        for (source, expected) in [
            (
                "//! flight-compiler: root-only\npub struct Signal {}\n",
                "`flight-compiler: root-only` requires at least one TypeScript export name",
            ),
            (
                "//! flight-compiler: root-only Signal,,createSignal\npub struct Signal {}\n",
                "`flight-compiler: root-only` contains an empty export target",
            ),
            (
                "//! flight-compiler: root-only Signal<T>\npub struct Signal<T> { pub value: T }\n",
                "`flight-compiler: root-only` target `Signal<T>` is not a TypeScript identifier",
            ),
        ] {
            assert_eq!(source_mode(source).unwrap_err().to_string(), expected);
        }
    }

    #[test]
    fn unions_repeated_root_only_declarations_and_deduplicates_targets() {
        assert_eq!(
            root_only_names(
                "//! flight-compiler: root-only Signal, createSignal\n#![doc = \"flight-compiler: root-only createSignal ContractOnly Signal\"]\npub struct Signal {}\n"
            )
            .unwrap(),
            ["Signal", "createSignal", "ContractOnly"]
        );
        assert_eq!(
            source_mode(
                "//! flight-compiler: root-only Signal Signal\n#![doc = \"flight-compiler: root-only Signal\"]\npub struct Signal {}\n"
            )
            .unwrap(),
            SourceMode::Generate
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

    // A proven standard `RwLock<T>`, under its own or a renamed import, is the shared cell `Ref<T>`
    // erases to `T` in parameters and locals; a locally declared `RwLock` keeps its name, and an
    // unresolved one fails closed.
    #[test]
    fn lowers_standard_rwlock_cells_to_their_shared_payload() {
        let source = r#"
use std::sync::Arc;
use std::sync::RwLock as Lock;
use std::sync::RwLock;

pub struct Counter {
    pub count: i32,
}

pub fn bump(state: Arc<RwLock<Counter>>) -> i32 {
    let alias: Arc<RwLock<Counter>> = state.clone();
    alias.write().unwrap().count += 1;
    return state.read().unwrap().count;
}

pub fn read_renamed(state: &Arc<Lock<Counter>>) -> i32 {
    return state.read().unwrap().count;
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Counter {
  count: number;
}

export function bump(state: Counter): number {
  const alias: Counter = state;
  alias!.count += 1;
  return state!.count;
}

export function readRenamed(state: Counter): number {
  return state!.count;
}
"#
        );
        let local = compile_typescript(r#"use std::sync::Arc;

pub struct RwLock<T> {
    pub inner: T,
}

pub fn read(value: Arc<RwLock<i32>>) -> i32 {
    return value.inner;
}
"#, None).unwrap();
        assert!(local.contains("export function read(value: RwLock<number>): number {"), "{local}");
        assert_eq!(
            compile_typescript(r#"use std::sync::Arc;

pub fn read(value: Arc<RwLock<i32>>) -> i32 {
    return 0;
}
"#, None)
                .unwrap_err()
                .to_string(),
            "cannot resolve the provenance of `RwLock`; import it from `std::sync` to lower it to its shared payload"
        );
    }

    // `Arc::ptr_eq` lowers to `===`, which compares allocations only when the payload lowers to an
    // object: struct, collection, callable, `Mutex` cell or opaque `dyn Any`, through aliases and
    // shared clones. A primitive, string or unit payload lowers to its value and fails closed.
    #[test]
    fn lowers_pointer_equality_only_over_identity_bearing_payloads() {
        let source = r#"
use std::any::Any;
use std::sync::{Arc, Mutex};

pub type ProviderRef = Arc<dyn Any + Send + Sync>;

pub struct Node {
    pub value: i32,
}

pub struct Source {
    pub provider: ProviderRef,
    pub node: Arc<Node>,
    pub items: Arc<Vec<i32>>,
    pub cell: Arc<Mutex<i32>>,
    pub callback: Arc<dyn Fn() + Send + Sync>,
}

pub fn same_provider(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.provider, &b.provider);
}

pub fn same_parts(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.node, &b.node)
        && Arc::ptr_eq(&a.items, &b.items)
        && Arc::ptr_eq(&a.cell, &b.cell)
        && Arc::ptr_eq(&a.callback, &b.callback);
}

pub fn same_param(a: &ProviderRef, b: &ProviderRef) -> bool {
    return Arc::ptr_eq(a, b);
}

pub fn fresh_differs() -> bool {
    let first = Arc::new(Node { value: 1 });
    let second = first.clone();
    let third: Arc<Vec<i32>> = Arc::new(Vec::new());
    let fourth = Arc::new(Vec::<i32>::new());
    return Arc::ptr_eq(&first, &second) && !Arc::ptr_eq(&third, &fourth);
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export type ProviderRef = object;

export interface Node {
  value: number;
}

export interface Source {
  provider: ProviderRef;
  node: Readonly<Node>;
  items: Readonly<number[]>;
  cell: { value: number };
  callback: () => void;
}

export function sameProvider(a: Source, b: Source): boolean {
  return a.provider === b.provider;
}

export function sameParts(a: Source, b: Source): boolean {
  return (a.node === b.node) && (a.items === b.items) && (a.cell === b.cell) && (a.callback === b.callback);
}

export function sameParam(a: Readonly<ProviderRef>, b: Readonly<ProviderRef>): boolean {
  return a === b;
}

export function freshDiffers(): boolean {
  const first: Readonly<Node> = { value: 1 };
  const second = first;
  const third: Readonly<number[]> = [] as never[];
  const fourth = [] as never[];
  return (first === second) && !(third === fourth);
}
"#
        );
        for source in [
            r#"use std::sync::Arc;
pub fn same(a: &Arc<i32>, b: &Arc<i32>) -> bool {
    return Arc::ptr_eq(a, b);
}
"#,
            r#"use std::sync::Arc;
pub fn fresh() -> bool {
    let a = Arc::new(());
    let b = Arc::new(());
    return Arc::ptr_eq(&a, &b);
}
"#,
            r#"use std::sync::Arc;
pub struct Holder {
    pub name: Arc<String>,
}
pub fn same(a: &Holder, b: &Holder) -> bool {
    return Arc::ptr_eq(&a.name, &b.name);
}
"#,
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                "portable `Arc::ptr_eq` needs an operand proven to hold an identity-bearing payload (a struct, collection, callable, `Mutex` cell or `dyn Any`); a primitive or unit payload lowers to its value, so `===` would compare values instead of allocations",
                "{source}"
            );
        }
    }

    // A dependency crate's identity-bearing types and public fields are read in that crate's own
    // sources (an alias in one file, the struct using it in another), so its handles compare by
    // allocation; its primitive payload still fails closed.
    #[test]
    fn proves_pointer_equality_through_dependency_struct_fields() {
        let dependency = [
            ExternalAliasSource {
                source: r#"use std::any::Any;
use std::sync::Arc;

pub type ProviderRef = Arc<dyn Any + Send + Sync>;
"#,
                module: "@flighthq/dep/contract",
            },
            ExternalAliasSource {
                source: r#"use std::any::Any;
use std::sync::Arc;

use crate::provider_ref::ProviderRef;

pub struct Source {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
    pub serial: Arc<i32>,
}
"#,
                module: "@flighthq/dep/contract",
            },
        ];
        let source = r#"use std::sync::Arc;

use flight_dep::{ProviderRef, Source};

pub struct Binding {
    pub source: Source,
    pub provider: ProviderRef,
}

pub fn same_handle(binding: &Binding, source: &Source) -> bool {
    return Arc::ptr_eq(&binding.source.handle, &source.handle)
        && Arc::ptr_eq(&binding.provider, &source.provider);
}
"#;
        assert_eq!(
            compile_typescript_with_external_alias_sources(source, None, &[], &dependency).unwrap(),
            r#"import type { ProviderRef, Source } from "@flighthq/dep/contract";

export interface Binding {
  source: Source;
  provider: ProviderRef;
}

export function sameHandle(binding: Readonly<Binding>, source: Readonly<Source>): boolean {
  return (binding.source.handle === source.handle) && (binding.provider === source.provider);
}
"#
        );
        let primitive = r#"use std::sync::Arc;

use flight_dep::Source;

pub fn same_serial(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.serial, &b.serial);
}
"#;
        assert_eq!(
            compile_typescript_with_external_alias_sources(primitive, None, &[], &dependency)
                .unwrap_err()
                .to_string(),
            "portable `Arc::ptr_eq` needs an operand proven to hold an identity-bearing payload (a struct, collection, callable, `Mutex` cell or `dyn Any`); a primitive or unit payload lowers to its value, so `===` would compare values instead of allocations"
        );
    }

    // A shadowing `let x = x.clone()` over a shared handle erases to the binding itself, so it emits no
    // self-assignment; a shadow whose initializer computes a new value still rebinds.
    #[test]
    fn omits_shadowing_rebinds_that_erase_to_the_binding_itself() {
        let source = r#"
use std::sync::Arc;

pub struct Node {
    pub value: i32,
}

pub fn reader(node: Arc<Node>) -> Arc<dyn Fn() -> i32 + Send + Sync> {
    return Arc::new({
        let node = node.clone();
        move || {
            return node.value;
        }
    });
}

pub fn offset(node: &Arc<Node>, delta: i32) -> i32 {
    let node = Arc::clone(node);
    let delta = delta + 1;
    return node.value + delta;
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Node {
  value: number;
}

export function reader(node: Readonly<Node>): () => number {
  return (() => {
  return () => {
  return node.value;
};
})();
}

export function offset(node: Readonly<Readonly<Node>>, delta: number): number {
  delta = delta + 1;
  return node.value + delta;
}
"#
        );
    }

    // Ordinary calls lower to operator expressions too (`Arc::ptr_eq(a, b)` emits `a === b`), so the
    // operand guard classifies emitted text rather than enumerating method calls.
    // Ordinary calls lower to operator expressions too (`Arc::ptr_eq(a, b)` emits `a === b`), so the
    // operand guard classifies emitted text rather than enumerating method calls.
    #[test]
    fn parenthesizes_operator_lowered_calls_used_as_operands() {
        let source = r#"
use std::sync::Arc;

pub struct Node {
    pub value: i32,
}

pub fn different(a: &Arc<Node>, b: &Arc<Node>) -> bool {
    return !Arc::ptr_eq(a, b);
}

pub fn equality_matches(a: &Arc<Node>, b: &Arc<Node>, expected: bool) -> bool {
    return Arc::ptr_eq(a, b) == expected;
}

pub fn same(a: &Arc<Node>, b: &Arc<Node>) -> bool {
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
    fn lowers_hash_collections_through_qualified_aliased_and_derived_receivers() {
        let source = r#"
use std::collections::HashMap as Table;
use std::collections::{self, hash_set};

pub struct Store {
    pub full: std::collections::hash_map::HashMap<String, i32>,
    pub other: hash_set::HashSet<bool>,
    pub set: collections::HashSet<String>,
    pub table: Table<i32, f32>,
}

fn get_set(store: &Store) -> &collections::HashSet<String> {
    return &store.set;
}

pub fn create_store() -> Store {
    return Store {
        full: std::collections::HashMap::default(),
        other: hash_set::HashSet::with_capacity(2),
        set: collections::HashSet::new(),
        table: Table::new(),
    };
}

pub fn fill_store(store: &mut Store) -> bool {
    let table = &mut store.table;
    table.insert(1, 2.0);
    store.full.clear();
    let set = get_set(store);
    return set.contains("a") && get_set(store).is_empty() && store.other.is_empty();
}
"#;

        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Store {
  full: Map<string, number>;
  other: Set<boolean>;
  set: Set<string>;
  table: Map<number, number>;
}

function getSet(store: Readonly<Store>): Readonly<Set<string>> {
  return store.set;
}

export function createStore(): Store {
  return { full: new Map(), other: new Set(), set: new Set(), table: new Map() };
}

export function fillStore(store: Store): boolean {
  const table = store.table;
  (<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => { const previous = entries.get(key); entries.set(key, value); return previous; })(table, 1, 2.0);
  store.full.clear();
  const set = getSet(store);
  return set.has("a") && (getSet(store).size === 0) && (store.other.size === 0);
}
"#
        );
    }

    #[test]
    fn lowers_hash_collections_to_sets_and_maps_on_proven_receivers() {
        let source = r#"
use std::collections::{HashMap, HashSet};

pub struct Tracker {
    pub counts: HashMap<i32, f32>,
    pub seen: HashSet<String>,
}

pub fn create_tracker() -> Tracker {
    return Tracker {
        counts: HashMap::new(),
        seen: HashSet::with_capacity(4),
    };
}

pub fn count_tracker(tracker: &Tracker, id: i32) -> f32 {
    if !tracker.counts.contains_key(&id) {
        return -1.0;
    }
    return *tracker.counts.get(&id).unwrap_or(&0.0);
}

pub fn mark_tracker(tracker: &mut Tracker, label: String) -> bool {
    return tracker.seen.insert(label);
}

pub fn measure_tracker(tracker: &Tracker) -> usize {
    let mut local: HashSet<i32> = HashSet::default();
    local.insert(1);
    if local.contains(&1) && !tracker.seen.is_empty() {
        return tracker.seen.len() + tracker.counts.len();
    }
    return 0;
}

pub fn reset_tracker(tracker: &mut Tracker) {
    tracker.seen.clear();
    tracker.counts.clear();
}

pub fn set_tracker_count(tracker: &mut Tracker, id: i32, value: f32) -> Option<f32> {
    return tracker.counts.insert(id, value);
}

pub fn take_tracker_count(tracker: &mut Tracker, id: i32) -> Option<f32> {
    return tracker.counts.remove(&id);
}

pub fn unmark_tracker(tracker: &mut Tracker, label: &str) -> bool {
    return tracker.seen.remove(label);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert_eq!(
            output,
            r#"export interface Tracker {
  counts: Map<number, number>;
  seen: Set<string>;
}

export function createTracker(): Tracker {
  return { counts: new Map(), seen: new Set() };
}

export function countTracker(tracker: Readonly<Tracker>, id: number): number {
  if (!tracker.counts.has(id)) {
    return -1.0;
  }
  return (tracker.counts.get(id) ?? 0.0);
}

export function markTracker(tracker: Tracker, label: string): boolean {
  return (<T>(items: Set<T>, value: T): boolean => { if (items.has(value)) { return false; } items.add(value); return true; })(tracker.seen, label);
}

export function measureTracker(tracker: Readonly<Tracker>): number {
  let local: Set<number> = new Set();
  (<T>(items: Set<T>, value: T): boolean => { if (items.has(value)) { return false; } items.add(value); return true; })(local, 1);
  if (local.has(1) && !(tracker.seen.size === 0)) {
    return tracker.seen.size + tracker.counts.size;
  }
  return 0;
}

export function resetTracker(tracker: Tracker): void {
  tracker.seen.clear();
  tracker.counts.clear();
}

export function setTrackerCount(tracker: Tracker, id: number, value: number): number | undefined {
  return (<K, V>(entries: Map<K, V>, key: K, value: V): V | undefined => { const previous = entries.get(key); entries.set(key, value); return previous; })(tracker.counts, id, value);
}

export function takeTrackerCount(tracker: Tracker, id: number): number | undefined {
  return (<K, V>(entries: Map<K, V>, key: K): V | undefined => { const previous = entries.get(key); entries.delete(key); return previous; })(tracker.counts, id);
}

export function unmarkTracker(tracker: Tracker, label: string): boolean {
  return tracker.seen.delete(label);
}
"#
        );
        for (source, message) in [
            (
                "use other::make;\npub fn a() -> bool { return make().insert(1); }",
                "unsupported Rust method call `.insert()`; impl sugar is not a transpilation source",
            ),
            (
                "use std::collections::HashSet;\npub fn a(s: &HashSet<i32>) -> usize { return s.iter().count(); }",
                "portable `HashSet::iter` with 0 argument(s) has no portable lowering",
            ),
            (
                "use std::collections::HashMap;\npub fn a(m: &mut HashMap<i32, f32>) { m.entry(1); }",
                "portable `HashMap::entry` with 1 argument(s) has no portable lowering",
            ),
            (
                "use std::collections::HashSet;\npub struct K { pub x: i32 }\npub fn a(s: &HashSet<K>) -> usize { return s.len(); }",
                "portable `HashSet` requires a number, string or boolean key; JavaScript compares `K` keys by identity",
            ),
            (
                "use std::collections::HashMap;\npub fn a(m: &HashMap<i32, Option<f32>>) -> usize { return m.len(); }",
                "portable `HashMap` cannot hold `Option` values; `Map.get` reports a missing key and a `None` value alike",
            ),
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                message
            );
        }
    }

    #[test]
    fn lowers_hash_collection_data_union_payloads_as_non_plain_objects() {
        let source = r#"
//! flight-compiler: data-union Payload

use std::collections::HashMap;

pub enum Payload {
    Count(i32),
    Table(HashMap<String, i32>),
}

pub fn payload_kind(value: Payload) -> String {
    return match value {
        Payload::Count(_) => "count".to_string(),
        Payload::Table(_) => "table".to_string(),
    };
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type Payload = number | Map<string, number>;"));
        assert!(output.contains("Object.getPrototypeOf(matchValue) !== Object.prototype"));
        assert!(!output.contains("Object.getPrototypeOf(matchValue) === Object.prototype"));
    }

    #[test]
    fn lowers_const_groups_to_exported_const_objects() {
        let source = r#"
//! The table.
//! flight-compiler: const-group KeyCode KEY_CODE_

/// `KeyCode.A`.
pub const KEY_CODE_A: i32 = 0x61;

/// B.
pub const KEY_CODE_B: i32 = 0x62;

pub const OTHER: f32 = 1.5;

pub const KEY_CODE_NUMBER_0: i32 = 0x30;

pub type KeyCode = i32;

pub fn is_a(code: KeyCode) -> bool { return code == KEY_CODE_A || code == KEY_CODE_NUMBER_0; }
"#;

        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export type KeyCode = number;

export const KeyCode = {
  /**
   * `KeyCode.A`.
   */
  A: 0x61,
  /**
   * B.
   */
  B: 0x62,
  NUMBER_0: 0x30,
};

export const OTHER: number = 1.5;

export function isA(code: KeyCode): boolean {
  return code === KeyCode.A || code === KeyCode.NUMBER_0;
}
"#
        );
        for (source, expected) in [
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\npub const CODE_B: i32 = CODE_A + 1;\n",
                "`const-group Code` member `CODE_B` must be initialized with an independent literal",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\npub fn is_a(value: i32) -> bool {\n    return value == crate::CODE_A;\n}\n",
                "qualified `const-group` member path `crate::CODE_A` has no portable lowering; reference the member by its bare name",
            ),
            (
                "//! flight-compiler: const-group Status CODE_\npub const CODE_A: i32 = 1;\npub enum Status {\n    Ready,\n}\n",
                "`const-group Status` collides with an emitted enum named `Status`",
            ),
            (
                "//! flight-compiler: const-group code CODE_\npub const CODE_A: i32 = 1;\npub fn code() -> i32 {\n    return 1;\n}\n",
                "`const-group code` collides with an emitted function named `code`",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\n//! flight-compiler: export-name make_code Code\npub const CODE_A: i32 = 1;\npub fn make_code() -> i32 {\n    return 1;\n}\n",
                "`const-group Code` collides with an emitted function named `Code`",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_upper_case_globals)]\npub const Code: i32 = 2;\n",
                "`const-group Code` collides with an emitted constant named `Code`",
            ),
            (
                "//! flight-compiler: const-group Preset CODE_\n//! flight-compiler: frozen-object DEFAULT_PRESET Preset\npub struct PresetValue {\n    pub x: i32,\n}\npub const CODE_A: i32 = 1;\npub const DEFAULT_PRESET: PresetValue = PresetValue { x: 1 };\n",
                "`const-group Preset` collides with an emitted constant named `Preset`",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_upper_case_globals)]\npub static Code: i32 = 2;\n",
                "`const-group Code` collides with an emitted static named `Code`",
            ),
            (
                "//! flight-compiler: const-group KeyCode KEY_\npub const KEY_0: i32 = 1;\n",
                "`const-group KeyCode` member `KEY_0` leaves `0`, which is not a TypeScript identifier",
            ),
            (
                "//! flight-compiler: const-group KeyCode KEY_\nconst KEY_A: i32 = 1;\n",
                "`const-group KeyCode` member `KEY_A` must be public",
            ),
            (
                "//! flight-compiler: const-group KeyCode KEY_\npub const KEY_A: i32 = 1;\npub const KEY_B: u8 = 1;\n",
                "`const-group KeyCode` members must share one type",
            ),
            (
                "//! flight-compiler: const-group KeyCode NOPE_\npub const KEY_A: i32 = 1;\n",
                "`const-group KeyCode` prefix `NOPE_` matches no constant",
            ),
            (
                "//! flight-compiler: const-group Key KEY_\n//! flight-compiler: const-group KeyCode KEY_C\npub const KEY_CA: i32 = 1;\n",
                "constant `KEY_CA` matches more than one `const-group` prefix",
            ),
            (
                "//! flight-compiler: const-group KeyCode\npub const KEY_A: i32 = 1;\n",
                "`flight-compiler: const-group` requires exactly a TypeScript name and a constant prefix",
            ),
            (
                "//! flight-compiler: const-group Key-Code KEY_\npub const KEY_A: i32 = 1;\n",
                "`flight-compiler: const-group` name `Key-Code` is not a TypeScript identifier",
            ),
            (
                "//! flight-compiler: const-group KeyCode KEY_\n//! flight-compiler: export-name KEY_A KeyA\npub const KEY_A: i32 = 1;\n",
                "`const-group KeyCode` member `KEY_A` is also named by another directive",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
    }

    #[test]
    fn rejects_const_group_owners_colliding_with_any_emitted_value_binding() {
        let collision = |owner: &str| {
            return format!(
                "`const-group {owner}` collides with another emitted value binding named `{owner}`"
            );
        };
        // A compiler-injected local.
        let injected = "//! flight-compiler: const-group PI CODE_\n\nuse std::f32::consts::PI;\n\npub const CODE_A: i32 = 1;\n\npub fn circle_area(radius: f32) -> f32 {\n    return PI * radius * radius;\n}\n";
        assert_eq!(
            compile_typescript(injected, None).unwrap_err().to_string(),
            collision("PI")
        );
        // A compiler-provided import.
        let provided = "//! flight-compiler: const-group allocateEntity CODE_\n\nuse flight_entity::allocate_entity;\n\npub const CODE_A: i32 = 1;\n\n#[derive(Default)]\npub struct Record {\n    pub value: i32,\n}\n\npub fn create_record() -> Record {\n    let record: Record = allocate_entity();\n    return record;\n}\n";
        assert_eq!(
            compile_typescript(provided, Some("@flighthq/entity/contract"))
                .unwrap_err()
                .to_string(),
            collision("allocateEntity")
        );
        // Dependency imports, by name and renamed.
        let codec = [ExternalAliasSource {
            source: "//! flight-compiler: export-name decode_utf8 decodeUTF8\npub fn decode_utf8(value: usize) -> usize {\n    return value;\n}\n",
            module: "@flighthq/codec/contract",
        }];
        for (consumer, owner) in [
            (
                "//! flight-compiler: const-group decodeUTF8 CODE_\nuse flight_codec::decode_utf8;\npub const CODE_A: i32 = 1;\npub fn call(value: usize) -> usize {\n    return decode_utf8(value);\n}\n",
                "decodeUTF8",
            ),
            (
                "//! flight-compiler: const-group Decode CODE_\nuse flight_codec::decode_utf8 as Decode;\npub const CODE_A: i32 = 1;\npub fn call(value: usize) -> usize {\n    return Decode(value);\n}\n",
                "Decode",
            ),
        ] {
            assert_eq!(
                compile_typescript_with_external_alias_sources(consumer, None, &[], &codec)
                    .unwrap_err()
                    .to_string(),
                collision(owner),
                "{consumer}"
            );
        }
        // Local declarations, including a destructured tuple binding.
        for (source, owner) in [
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn shadow(value: i32) -> i32 {\n    let Code = value;\n    return Code + CODE_A;\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn split(value: (i32, i32)) -> i32 {\n    let (Code, other) = value;\n    return Code + other;\n}\n",
                "Code",
            ),
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                collision(owner),
                "{source}"
            );
        }
        // Function and closure parameters: plain, typed and untyped closures, destructured, nested,
        // and a snake_case parameter whose emitted name is the owner.
        for (source, owner) in [
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn offset(Code: i32) -> i32 {\n    return Code + CODE_A;\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn offset(value: i32) -> i32 {\n    let add = |Code: i32| -> i32 {\n        return Code + CODE_A;\n    };\n    return add(value);\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn offset(values: Vec<i32>) -> Vec<i32> {\n    return values.iter().map(|Code| Code + CODE_A).collect();\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn offset(pair: (i32, i32)) -> i32 {\n    let add = |(Code, b): (i32, i32)| -> i32 {\n        return Code + b + CODE_A;\n    };\n    return add(pair);\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\n#[allow(non_snake_case)]\npub fn offset(value: i32) -> i32 {\n    let outer = |a: i32| -> i32 {\n        let inner = |Code: i32| -> i32 {\n            return Code + CODE_A;\n        };\n        return inner(a);\n    };\n    return outer(value);\n}\n",
                "Code",
            ),
            (
                "//! flight-compiler: const-group keyCode KEY_CODE_\npub const KEY_CODE_A: i32 = 1;\npub fn offset(key_code: i32) -> i32 {\n    return key_code + KEY_CODE_A;\n}\n",
                "keyCode",
            ),
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                collision(owner),
                "{source}"
            );
        }
        let unshadowed = compile_typescript(
            "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = 1;\npub fn offset(value: i32) -> i32 {\n    let add = |code: i32| -> i32 {\n        return code + CODE_A;\n    };\n    return add(value);\n}\n",
            None,
        )
        .unwrap();
        assert!(unshadowed.contains("return code + Code.A;"), "{unshadowed}");
        // The owner's name in literal text, comments, type positions and member access binds nothing.
        let unbound = "//! flight-compiler: const-group Code CODE_\n\n/// Mentions `const Code` in documentation.\npub const CODE_A: i32 = 1;\n\npub type Code = i32;\n\npub fn label(value: Code) -> String {\n    if value == CODE_A {\n        return \"let Code = 1\".to_string();\n    }\n    return String::new();\n}\n";
        let output = compile_typescript(unbound, None).unwrap();
        assert!(output.contains("export const Code = {"), "{output}");
        assert!(output.contains("value === Code.A"), "{output}");
    }

    #[test]
    fn lowers_const_groups_beside_types_with_negated_and_parenthesized_literals() {
        let source = "//! flight-compiler: const-group Code CODE_\npub const CODE_A: i32 = -1;\npub const CODE_B: i32 = (0x2);\npub struct Code {\n    pub x: i32,\n}\n";
        let output = compile_typescript(source, None).unwrap();
        assert!(
            output.contains("export interface Code {\n  x: number;\n}"),
            "{output}"
        );
        assert!(
            output.contains("export const Code = {\n  A: -1,\n  B: (0x2),\n};"),
            "{output}"
        );
    }

    #[test]
    fn lowers_imported_const_group_members_through_their_owner() {
        let keys = "//! flight-compiler: const-group KeyCode KEY_CODE_\npub const KEY_CODE_A: i32 = 0x61;\npub const KEY_CODE_B: i32 = 0x62;\npub type KeyCode = i32;\n";
        let keys_package = [ExternalAliasSource {
            source: keys,
            module: "@flighthq/keys/contract",
        }];
        let consumer = "use flight_keys::{KEY_CODE_A, KEY_CODE_B as B};\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A || code == B;\n}\n";
        assert_eq!(
            compile_typescript_with_external_alias_sources(consumer, None, &[], &keys_package)
                .unwrap(),
            "import { KeyCode } from \"@flighthq/keys/contract\";\n\nexport function isA(code: number): boolean {\n  return code === KeyCode.A || code === KeyCode.B;\n}\n"
        );

        let tests = "use flight_keys::{KEY_CODE_A, KEY_CODE_B as B};\n\n#[test]\nfn compares_keys() {\n    assert_ne!(KEY_CODE_A, B);\n}\n";
        assert_eq!(
            compile_vitest_with_external_alias_sources(
                tests,
                "@flighthq/consumer/contract",
                None,
                &[],
                &keys_package,
            )
            .unwrap(),
            "import { describe, expect, it } from 'vitest';\n\nimport { KeyCode } from \"@flighthq/keys/contract\";\n\ndescribe(\"portableTests\", () => {\n  it(\"compares keys\", () => {\n    expect(KeyCode.A).not.toEqual(KeyCode.B);\n  });\n});\n"
        );

        let wildcard = "use flight_keys::*;\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A;\n}\n";
        let error =
            compile_typescript_with_external_alias_sources(wildcard, None, &[], &keys_package)
                .unwrap_err();
        assert_eq!(
            error.to_string(),
            "a wildcard import of `@flighthq/keys/contract` would bring in `const-group` member `KEY_CODE_A` (`KeyCode.A` in TypeScript), which has no portable lowering"
        );
    }

    #[test]
    fn lowers_option_if_let_and_while_let_with_single_scrutinee_evaluation() {
        let source = r#"
pub struct Counter {
    pub calls: i32,
    pub remaining: i32,
    pub last: Option<i32>,
}

pub fn create_counter() -> Counter {
    return Counter {
        calls: 0,
        remaining: 0,
        last: None,
    };
}

fn take_next(counter: &mut Counter) -> Option<i32> {
    counter.calls += 1;
    if counter.remaining == 0 {
        return None;
    }
    counter.remaining -= 1;
    return Some(counter.remaining);
}

pub fn take_once(counter: &mut Counter) -> i32 {
    if let Some(value) = take_next(counter) {
        return value;
    }
    return -1;
}

pub fn drain(counter: &mut Counter) -> i32 {
    let mut total = 0;
    while let Some(value) = take_next(counter) {
        total += value;
    }
    return total;
}

pub fn call_if_present(callback: Option<fn(i32) -> i32>, value: i32) -> i32 {
    if let Some(callback) = callback {
        return callback(value);
    }
    return value;
}

pub fn last_or(counter: &Counter, value: i32) -> i32 {
    if let Some(value) = counter.last {
        return value;
    } else {
        return value;
    }
}
"#;

        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Counter {
  calls: number;
  remaining: number;
  last?: number;
}

export function createCounter(): Counter {
  return { calls: 0, remaining: 0, last: undefined };
}

function takeNext(counter: Counter): number | undefined {
  counter.calls += 1;
  if (counter.remaining === 0) {
    return undefined;
  }
  counter.remaining -= 1;
  return counter.remaining;
}

export function takeOnce(counter: Counter): number {
  {
    const $value = takeNext(counter);
    if ($value !== undefined) {
      const value = $value;
      return value;
    }
  }
  return -1;
}

export function drain(counter: Counter): number {
  let total = 0;
  for (;;) {
    const $value = takeNext(counter);
    if ($value === undefined) {
      break;
    }
    const value = $value;
    total += value;
  }
  return total;
}

export function callIfPresent(callback: ((arg0: number) => number) | undefined, value: number): number {
  if (callback !== undefined) {
    return callback(value);
  }
  return value;
}

export function lastOr(counter: Readonly<Counter>, value: number): number {
  if (counter.last !== undefined) {
    const value = counter.last;
    return value;
  } else {
    return value;
  }
}
"#
        );
    }

    #[test]
    fn exports_crate_visible_items_that_sibling_sources_reference() {
        let owner = r#"
pub(crate) struct Registry {
    pub(crate) count: i32,
}

pub(crate) enum Slot {
    Empty,
    Full,
}

pub(crate) const REGISTRY_LIMIT: i32 = 4;

pub(crate) fn create_registry() -> Registry {
    return Registry { count: 0 };
}

pub(crate) fn unused_helper() -> i32 {
    return 1;
}

pub fn public_value() -> i32 {
    return REGISTRY_LIMIT;
}
"#;
        let user = r#"
use crate::owner::{Registry, Slot, REGISTRY_LIMIT, create_registry};

pub fn count_registry(full: bool) -> i32 {
    let registry: Registry = create_registry();
    let slot = if full { Slot::Full } else { Slot::Empty };
    return match slot {
        Slot::Empty => 0,
        Slot::Full => registry.count + REGISTRY_LIMIT,
    };
}
"#;

        assert_eq!(
            compile_typescript_with_alias_sources(owner, None, &[user]).unwrap(),
            r#"enum Slot {
  Empty = "empty",
  Full = "full",
}

interface Registry {
  count: number;
}

const REGISTRY_LIMIT: number = 4;

function createRegistry(): Registry {
  return { count: 0 };
}

function unusedHelper(): number {
  return 1;
}

export function publicValue(): number {
  return REGISTRY_LIMIT;
}

export { REGISTRY_LIMIT, Slot, createRegistry };
export type { Registry };
"#
        );
        let unreferenced = compile_typescript_with_alias_sources(owner, None, &[]).unwrap();
        assert!(!unreferenced.contains("export {"), "{unreferenced}");
        assert!(!unreferenced.contains("export type {"), "{unreferenced}");
    }

    #[test]
    fn imports_foreign_items_used_only_inside_assertion_macros() {
        let source = r#"
use flight_entity::has_entity_runtime;

mod foreign_assertions {
    use super::*;

    #[test]
    fn reads_foreign_values_inside_assertions() {
        let value = 1;
        assert!(!has_entity_runtime(&value));
        assert_eq!(has_entity_runtime(&value), false);
    }
}
"#;

        assert_eq!(
            compile_vitest(source, "./contract.ts").unwrap(),
            r#"import { describe, expect, it } from 'vitest';

import { hasEntityRuntime } from "@flighthq/entity/contract";

describe("foreignAssertions", () => {
  it("reads foreign values inside assertions", () => {
    const value = 1;
    expect(!hasEntityRuntime(value)).toBe(true);
    expect(hasEntityRuntime(value)).toEqual(false);
  });
});
"#
        );
    }

    #[test]
    fn imports_foreign_items_inside_matches_ref_patterns_and_vec_repeats() {
        let source = r#"
//! flight-compiler: data-union Payload

use flight_codec::decode_payload;

pub enum Payload {
    Count(i32),
    Label(String),
}

pub fn is_label(value: i32) -> bool {
    return matches!(decode_payload(value), Payload::Label(ref text));
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"import { decodePayload } from "@flighthq/codec/contract";

export type Payload = number | string;

export function isLabel(value: number): boolean {
  return ((value) => typeof value === "string")(decodePayload(value));
}
"#
        );

        let tests = r#"
use flight_entity::has_entity_runtime;

mod foreign_macro_arguments {
    use super::*;

    #[test]
    fn reads_foreign_values_inside_vec_repeats() {
        let flags = vec![has_entity_runtime(&1); 2];
        assert_eq!(flags.len(), 2);
    }
}
"#;
        let output = compile_vitest(tests, "./contract.ts").unwrap();
        assert!(
            output.contains("import { hasEntityRuntime } from \"@flighthq/entity/contract\";"),
            "{output}"
        );
        assert!(!output.contains("./contract.ts"), "{output}");
    }

    #[test]
    fn exports_crate_visible_items_only_from_the_module_siblings_name() {
        let alpha = "pub(crate) const LIMIT: i32 = 1;\n\npub(crate) struct State {\n    pub(crate) value: i32,\n}\n";
        let beta = "pub(crate) const LIMIT: i32 = 2;\n\npub(crate) struct State {\n    pub(crate) label: String,\n}\n";
        let user = "use crate::alpha::{LIMIT, State};\n\npub fn read_limit() -> i32 {\n    let state = State { value: LIMIT };\n    return state.value;\n}\n";
        let qualified = "pub fn read_limit() -> i32 {\n    return crate::beta::LIMIT;\n}\n";
        let compile = |path: &str, source: &str, siblings: &[(&str, &str)]| {
            let siblings = siblings
                .iter()
                .map(|(path, source)| ModuleSource { path, source })
                .collect::<Vec<_>>();
            return compile_typescript_with_visibility_sources(
                ModuleSource { path, source },
                None,
                &siblings,
                &[],
                &[],
            )
            .unwrap();
        };

        let alpha_output = compile(
            "src/alpha.rs",
            alpha,
            &[("src/beta.rs", beta), ("src/user.rs", user)],
        );
        assert!(
            alpha_output.ends_with("export { LIMIT };\nexport type { State };\n"),
            "{alpha_output}"
        );
        let beta_output = compile(
            "src/beta.rs",
            beta,
            &[("src/alpha.rs", alpha), ("src/user.rs", user)],
        );
        assert!(!beta_output.contains("export {"), "{beta_output}");
        assert!(!beta_output.contains("export type {"), "{beta_output}");
        let beta_qualified = compile(
            "src/beta.rs",
            beta,
            &[("src/alpha.rs", alpha), ("src/user.rs", qualified)],
        );
        assert!(
            beta_qualified.ends_with("export { LIMIT };\n"),
            "{beta_qualified}"
        );
    }

    #[test]
    fn renders_generic_dependency_entities_by_their_companion_raw_name() {
        let signals = [ExternalAliasSource {
            source: include_str!("../../flight-signals/src/types.rs"),
            module: "@flighthq/signals/contract",
        }];
        let source = "use flight_signals::Signal;\n\npub struct Hub {\n    pub on_tick: Signal<i32>,\n}\n\npub fn tick(hub: &Hub) -> &Signal<i32> {\n    return &hub.on_tick;\n}\n";

        assert_eq!(
            compile_typescript_with_external_alias_sources(source, None, &[], &signals).unwrap(),
            "import type { SignalRaw } from \"@flighthq/signals/contract\";\n\nexport interface Hub {\n  onTick: SignalRaw<number>;\n}\n\nexport function tick(hub: Readonly<Hub>): Readonly<SignalRaw<number>> {\n  return hub.onTick;\n}\n"
        );
    }

    #[test]
    fn rejects_function_exits_inside_value_blocks_and_match_values() {
        for (source, expected) in [
            (
                r#"pub struct Gate {
    pub enabled: bool,
    pub value: i32,
}

pub fn read(gate: &Gate) -> i32 {
    let value = {
        if !gate.enabled {
            return -1;
        }
        gate.value
    };
    return value * 2;
}
"#,
                "portable value block cannot use `return` to leave the enclosing function; bind the value first and exit with a statement",
            ),
            (
                r#"pub fn pick(flag: bool, value: i32) -> i32 {
    let picked = match flag {
        true => value,
        false => return 0,
    };
    return picked + 1;
}
"#,
                "portable `match` used as a value cannot use `return` to leave the enclosing function; bind the value first and exit with a statement",
            ),
            (
                r#"pub fn parse(value: Option<i32>) -> Option<i32> {
    let doubled = {
        let inner = value?;
        inner * 2
    };
    return Some(doubled);
}
"#,
                "portable value block cannot use `?` to leave the enclosing function; bind the value first and exit with a statement",
            ),
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                expected,
                "{source}"
            );
        }
        let output = compile_typescript(
            r#"pub fn apply(values: Vec<i32>) -> Vec<i32> {
    let mapped = {
        let step = 2;
        values
            .iter()
            .map(|value| {
                return value * step;
            })
            .collect::<Vec<i32>>()
    };
    return mapped;
}
"#,
            None,
        )
        .unwrap();
        assert!(output.contains("return value * step;"), "{output}");
    }

    #[test]
    fn lowers_standard_any_trait_objects_to_object() {
        let source = r#"
use std::any::Any;
use std::sync::Arc;

pub type ProviderRef = Arc<dyn Any + Send + Sync>;

pub struct Source {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

pub fn same_source(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.handle, &b.handle);
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export type ProviderRef = object;

export interface Source {
  provider: ProviderRef;
  handle: object;
}

export function sameSource(a: Readonly<Source>, b: Readonly<Source>): boolean {
  return a.handle === b.handle;
}
"#
        );
        assert_eq!(
            compile_typescript(
                "pub type Opaque = std::sync::Arc<dyn core::any::Any>;\n",
                None
            )
            .unwrap(),
            "export type Opaque = object;\n\n"
        );
        for source in [
            "use std::sync::Arc;\ntrait Any {}\npub type Local = Arc<dyn Any>;\n",
            "use std::sync::Arc;\npub type Unimported = Arc<dyn Any>;\n",
            "use std::any::Any;\nuse std::sync::Arc;\ntrait Extra {}\npub type Mixed = Arc<dyn Any + Extra>;\n",
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                "unsupported Rust trait object; only callable traits are portable",
                "{source}"
            );
        }
    }

    #[test]
    fn keeps_leading_underscores_on_unused_bindings() {
        let source = "pub fn initialize_handle(_out: &mut i32) {}\n\npub fn apply(values: &[f64]) -> usize {\n    let _unused_total = values.len();\n    return values.iter().map(|_delta_time: &f64| 1).count();\n}\n";
        let output = compile_typescript(source, None).unwrap();
        assert!(
            output.contains("export function initializeHandle(_out: number): void {\n}"),
            "{output}"
        );
        assert!(
            output.contains("const _unusedTotal = values.length;"),
            "{output}"
        );
        assert!(output.contains("(_deltaTime: number) =>"), "{output}");
    }

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

        let source = "pub fn inferred(value: f32) -> f32 { let local = Some(value); return local.and_then(|v| Some(v)).unwrap_or(0.0); }\n";
        let output = compile_typescript(source, None).unwrap();
        assert!(output.contains("(((v) => v === undefined ? undefined : v)(local) ?? 0.0)"));

        for (source, expected) in [
            (
                "pub fn first(values: &Vec<f32>) -> Option<f32> { return values.iter().and_then(|v| Some(*v)); }\n",
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
    fn lowers_pinned_boxed_futures_to_promises_in_type_positions() {
        let source = r#"
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub struct Outcome {
    pub ok: bool,
}

pub type Exit = Pin<Box<dyn Future<Output = Outcome> + Send>>;

pub type Lookup = Pin<Box<dyn Future<Output = Option<String>> + Send + Sync + 'static>>;

pub struct Capability {
    pub exit: Arc<dyn Fn() -> Exit + Send + Sync>,
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export type Exit = Promise<Outcome>;\n\nexport type Lookup = Promise<string | undefined>;\n\nexport interface Outcome {\n  ok: boolean;\n}\n\nexport interface Capability {\n  exit: () => Exit;\n}\n\n"
        );

        for (source, expected) in [
            (
                "pub async fn f() -> u32 { return 1; }\n",
                "portable `async fn f` has no portable lowering",
            ),
            (
                "pub fn f(x: u32) -> u32 { let y = x.await; return y; }\n",
                "unsupported Rust expression `await expression`",
            ),
            (
                "use std::pin::Pin;\npub type P = Pin<Box<u32>>;\n",
                "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position",
            ),
            (
                "use std::future::Future;\nuse std::pin::Pin;\npub type P = Pin<Box<dyn Future<Output = u32> + Unpin>>;\n",
                "portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position",
            ),
            (
                "use std::future::Future;\npub type P = Box<dyn Future<Output = u32> + Send>;\n",
                "unsupported Rust trait object; only callable traits are portable",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
    }

    #[test]
    fn lowers_qualified_and_aliased_standard_pinned_futures() {
        for source in [
            "pub type P = std::pin::Pin<std::boxed::Box<dyn std::future::Future<Output = u32> + std::marker::Send>>;\n",
            "extern crate alloc;\npub type P = ::core::pin::Pin<alloc::boxed::Box<dyn core::future::Future<Output = u32> + core::marker::Send + Sync + 'static>>;\n",
            "extern crate std as standard;\npub type P = standard::pin::Pin<standard::boxed::Box<dyn Future<Output = u32> + Send>>;\n",
            "#![no_std]\nextern crate std;\npub type P = std::pin::Pin<std::boxed::Box<dyn Future<Output = u32> + Send>>;\n",
            "mod std {\n    pub struct Local;\n}\n\nuse ::std::boxed::Box;\nuse ::std::future::Future;\nuse ::std::pin::Pin;\n\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
            "mod std {}\npub type P = ::std::pin::Pin<::std::boxed::Box<dyn ::std::future::Future<Output = u32>>>;\n",
            "mod std {}\nuse ::std::pin::*;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
            "use std::boxed::Box as Owned;\nuse std::future::Future as Pending;\nuse std::marker::Send as Movable;\nuse std::pin::Pin as Pinned;\npub type P = Pinned<Owned<dyn Pending<Output = u32> + Movable>>;\n",
            "use std as standard;\nuse std::pin;\npub type P = pin::Pin<standard::boxed::Box<dyn Future<Output = u32>>>;\n",
            "use std::pin::{self as pinning};\npub type P = pinning::Pin<Box<dyn Future<Output = u32> + Send>>;\n",
            "use std::pin::*;\npub type P = Pin<Box<dyn Future<Output = u32> + Send>>;\n",
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap(),
                "export type P = Promise<number>;\n\n",
                "{source}"
            );
        }
    }

    #[test]
    fn lowers_hash_collections_through_extern_crate_and_no_std_bindings() {
        for source in [
            "extern crate std as standard;\npub fn a(s: &mut standard::collections::HashSet<i32>) -> bool {\n    return s.insert(1);\n}\n",
            "#![no_std]\nextern crate std;\nuse std::collections::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool {\n    return s.insert(1);\n}\n",
            "mod std {\n    pub mod collections {\n        pub struct HashSet<T>(pub T);\n    }\n}\nuse ::std::collections::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool {\n    return s.insert(1);\n}\n",
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap(),
                "export function a(s: Set<number>): boolean {\n  return (<T>(items: Set<T>, value: T): boolean => { if (items.has(value)) { return false; } items.add(value); return true; })(s, 1);\n}\n",
                "{source}"
            );
        }
    }

    #[test]
    fn rejects_hash_collections_without_standard_provenance() {
        for (source, expected) in [
            (
                "use other::*;\npub fn a(s: &HashSet<i32>) -> usize { return s.len(); }\n",
                "cannot resolve the provenance of `HashSet`; import it from `std::collections` to lower it to a JavaScript collection",
            ),
            (
                "pub fn a(s: &HashMap<i32, i32>) -> usize { return s.len(); }\n",
                "cannot resolve the provenance of `HashMap`; import it from `std::collections` to lower it to a JavaScript collection",
            ),
            (
                "//! flight-compiler: data-union Payload\nuse other::HashMap;\npub enum Payload {\n    Count(i32),\n    Table(HashMap<String, i32>),\n}\npub fn kind(value: Payload) -> i32 {\n    return match value {\n        Payload::Count(_) => 1,\n        Payload::Table(_) => 2,\n    };\n}\n",
                "cannot resolve data union payload `HashMap` to `std::collections::HashMap`",
            ),
            (
                "use other::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool { return s.insert(1); }\n",
                "unsupported Rust method call `.insert()`; impl sugar is not a transpilation source",
            ),
            (
                "extern crate other as std;\nuse std::collections::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool { return s.insert(1); }\n",
                "unsupported Rust method call `.insert()`; impl sugar is not a transpilation source",
            ),
            (
                "mod std {\n    pub mod collections {\n        pub struct HashSet<T> {\n            pub value: T,\n        }\n    }\n}\nuse std::collections::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool { return s.insert(1); }\n",
                "unsupported Rust method call `.insert()`; impl sugar is not a transpilation source",
            ),
            (
                "#![no_std]\npub fn a(s: &std::collections::HashSet<i32>) -> usize { return s.len(); }\n",
                "cannot resolve the provenance of `HashSet`; import it from `std::collections` to lower it to a JavaScript collection",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
        let foreign = compile_typescript(
            "use other::HashSet;\npub struct Holder {\n    pub values: HashSet<i32>,\n}\npub fn create_holder(values: HashSet<i32>) -> Holder {\n    return Holder { values };\n}\n",
            None,
        )
        .unwrap();
        assert!(foreign.contains("values: HashSet<number>;"), "{foreign}");
    }

    #[test]
    fn rejects_pinned_future_shapes_without_standard_provenance() {
        let not_standard = "portable `Pin<Box<dyn Future<Output = T>>>` needs `Box`, `Future` and its auto-trait bounds to resolve to the standard library";
        let unresolved = "cannot resolve the provenance of `Pin`; import it from `std::pin` to lower a pinned boxed future to `Promise`";
        for (source, expected) in [
            (
                "use future_shapes::{Box, Future, Pin};\n\npub type LocalPending = Pin<Box<dyn Future<Output = u32>>>;\n",
                "portable `Pin` here resolves to `future_shapes::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "pub struct Pin<T> {\n    pub value: T,\n}\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                "portable `Pin` here resolves to `crate::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "use std::pin::Pin;\nuse future_shapes::Box;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                not_standard,
            ),
            (
                "use std::pin::Pin;\ntrait Future { type Output; }\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                not_standard,
            ),
            (
                "use std::pin::Pin;\nuse future_shapes::Send;\npub type P = Pin<Box<dyn Future<Output = u32> + Send>>;\n",
                not_standard,
            ),
            (
                "use std::pin::Pin;\nuse future_shapes::*;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                not_standard,
            ),
            (
                "use future_shapes::*;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                unresolved,
            ),
            (
                "pub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                unresolved,
            ),
            (
                "pub type P = shapes::Pin<Box<dyn Future<Output = u32>>>;\n",
                unresolved,
            ),
            (
                "#![no_std]\n\nextern crate future_shapes as std;\n\npub type LocalPending = std::pin::Pin<\n    std::boxed::Box<dyn std::future::Future<Output = u32>>,\n>;\n",
                "portable `Pin` here resolves to `future_shapes::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "extern crate future_shapes as std;\nuse std::pin::Pin;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                "portable `Pin` here resolves to `future_shapes::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "extern crate future_shapes as std;\npub type P = ::std::pin::Pin<Box<dyn Future<Output = u32>>>;\n",
                "portable `Pin` here resolves to `future_shapes::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "#![no_std]\npub type P = std::pin::Pin<std::boxed::Box<dyn Future<Output = u32>>>;\n",
                unresolved,
            ),
            (
                "mod std {\n    pub mod pin {\n        pub struct Pin<T> {\n            pub value: T,\n        }\n    }\n}\nuse std::pin::Pin;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                "portable `Pin` here resolves to `crate::std::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`",
            ),
            (
                "mod std {}\nuse std::pin::*;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n",
                unresolved,
            ),
            (
                "#![no_std]\npub type P = core::pin::Pin<Box<dyn Future<Output = u32>>>;\n",
                not_standard,
            ),
            (
                "pub type P = core::pin::Pin<alloc::boxed::Box<dyn Future<Output = u32>>>;\n",
                not_standard,
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
        assert_eq!(
            compile_typescript(
                "use future_shapes::Pin;\npub struct Handle {\n    pub pin: Pin,\n}\n",
                None
            )
            .unwrap(),
            "export interface Handle {\n  pin: Pin;\n}\n\n"
        );
    }

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
        assert_eq!(
            compile_typescript(
                "pub fn keep_even_in_value_block(values: &mut Vec<u32>) -> u32 {\n    return {\n        let items: &mut Vec<u32> = values;\n        items.retain(|value| *value % 2 == 0);\n        0\n    };\n}\n",
                None,
            )
            .unwrap(),
            format!(
                "export function keepEvenInValueBlock(values: number[]): number {{\n  return ((() => {{\n  const items: number[] = values;\n  {retain}(items, (value) => value % 2 === 0);\n  return 0;\n}})()) >>> 0;\n}}\n"
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
                "use std::mem::take;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return take(values); }\n",
                "portable `std::mem::take` has no portable lowering",
            ),
            (
                "use std::mem::take as grab;\npub fn f(values: &mut Vec<u32>) -> Vec<u32> { return grab(values); }\n",
                "portable `std::mem::take` has no portable lowering",
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
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected, "{source}");
        }
    }

    // `std::mem::swap` lowers to a destructuring reassignment only over two explicit `&mut` places the
    // caller observes (a field, an index, a local binding). Reference parameters and `*` reborrows lower
    // to values the swap would exchange only locally, so they fail closed.
    #[test]
    fn lowers_std_mem_swap_only_over_caller_visible_places() {
        let source = r#"
pub struct Joint {
    pub ax: f64,
    pub bx: f64,
}

pub fn flip(j: &mut Joint) {
    std::mem::swap(&mut j.ax, &mut j.bx);
}

pub fn order(values: &mut Vec<i32>) {
    if values[0] > values[1] {
        let (first, second) = (0, 1);
        values.swap(first, second);
    }
    std::mem::swap(&mut values[2], &mut values[3]);
}

pub fn ordered(a: i32, b: i32) -> i32 {
    let mut low = a;
    let mut high = b;
    if low > high {
        std::mem::swap(&mut low, &mut high);
    }
    return high - low;
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Joint {
  ax: number;
  bx: number;
}

export function flip(j: Joint): void {
  [j.ax, j.bx] = [j.bx, j.ax];
}

export function order(values: number[]): void {
  if (values[0] > values[1]) {
    const [first, second] = [0, 1] as const;
    ([values[first], values[second]] = [values[second], values[first]]);
  }
  [values[2], values[3]] = [values[3], values[2]];
}

export function ordered(a: number, b: number): number {
  let low = a;
  let high = b;
  if (low > high) {
    [low, high] = [high, low];
  }
  return high - low;
}
"#
        );
        for source in [
            "pub fn f(a: &mut u32, b: &mut u32) { core::mem::swap(a, b); }\n",
            "use std::mem::{replace, swap};\npub fn f(a: &mut u32, b: &mut u32) { swap(a, b); }\n",
            "use std::mem::swap as exchange;\npub fn f(a: &mut u32, b: &mut u32) { exchange(a, b); }\n",
            "pub fn f(a: &mut u32, b: &mut u32) { std::mem::swap(&mut *a, &mut *b); }\n",
            "pub struct Joint { pub ax: f64 }\npub fn f(j: &mut Joint, k: &mut f64) { std::mem::swap(&mut j.ax, k); }\n",
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                "portable `std::mem::swap` has no portable lowering",
                "{source}"
            );
        }
    }

    // `std::mem::replace` captures and reassigns only an explicit `&mut` place the caller observes (a
    // field, an index, a local binding); a reference parameter would be reassigned only locally.
    #[test]
    fn lowers_std_mem_replace_only_over_caller_visible_places() {
        let source = r#"
pub struct Slot {
    pub value: u32,
    pub items: Vec<u32>,
}

pub fn swap_value(slot: &mut Slot, next: u32) -> u32 {
    return std::mem::replace(&mut slot.value, next);
}

pub fn swap_items(slot: &mut Slot, next: Vec<u32>) -> Vec<u32> {
    return std::mem::replace(&mut slot.items, next);
}

pub fn first(values: &mut Vec<u32>, next: u32) -> u32 {
    return std::mem::replace(&mut values[0], next);
}

pub fn local(seed: u32) -> u32 {
    let mut current = seed;
    let previous = std::mem::replace(&mut current, seed + 1);
    return previous + current;
}
"#;
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            r#"export interface Slot {
  value: number;
  items: number[];
}

export function swapValue(slot: Slot, next: number): number {
  return ((() => { const __tmp = slot.value; slot.value = next; return __tmp; })()) >>> 0;
}

export function swapItems(slot: Slot, next: number[]): number[] {
  return (() => { const __tmp = slot.items; slot.items = next; return __tmp; })();
}

export function first(values: number[], next: number): number {
  return ((() => { const __tmp = values[0]; values[0] = next; return __tmp; })()) >>> 0;
}

export function local(seed: number): number {
  let current = seed;
  const previous = (() => { const __tmp = current; current = seed + 1; return __tmp; })();
  return (previous + current) >>> 0;
}
"#
        );
        for source in [
            "pub fn f(values: &mut Vec<u32>, other: Vec<u32>) -> Vec<u32> { return std::mem::replace(values, other); }\n",
            "use core::mem::replace;\npub fn f(value: &mut u32) -> u32 { return replace(value, 1); }\n",
            "pub fn f(flag: &mut bool, new_value: bool) -> bool { return std::mem::replace(&mut *flag, new_value); }\n",
        ] {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                "portable `std::mem::replace` has no portable lowering",
                "{source}"
            );
        }
    }

    #[test]
    fn lowers_vec_truncate_without_growing_shorter_arrays() {
        let source = "pub fn keep_prefix(values: &mut Vec<u32>, length: usize) { values.truncate(length); }\n";
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export function keepPrefix(values: number[], length: number): void {\n  (<T>(items: T[], length: number): void => { items.length = Math.min(items.length, length); })(values, length);\n}\n"
        );
    }

    #[test]
    fn lowers_vec_drain_half_open_range_in_place() {
        let source = "pub fn remove_range(values: &mut Vec<u32>, start: usize, end: usize) -> Vec<u32> { return values.drain(start..end).collect(); }\n";
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export function removeRange(values: number[], start: number, end: number): number[] {\n  return (<T>(items: T[], start: number, end: number): T[] => items.splice(start, end - start))(values, start, end);\n}\n"
        );
    }

    #[test]
    fn lowers_vec_insert_with_rust_bounds() {
        let source = "pub fn add(values: &mut Vec<u32>, index: usize, value: u32) { values.insert(index, value); }\n";
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export function add(values: number[], index: number, value: number): void {\n  (<T>(items: T[], index: number, value: T): void => { if (index > items.length) { throw new RangeError(\"Vec insertion index out of bounds\"); } items.splice(index, 0, value); })(values, index, value);\n}\n"
        );
    }

    #[test]
    fn lowers_vec_remove_with_rust_bounds_and_return_value() {
        let source = "pub fn take(values: &mut Vec<u32>, index: usize) -> u32 { return values.remove(index); }\n";
        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export function take(values: number[], index: number): number {\n  return ((<T>(items: T[], index: number): T => { if (index >= items.length) { throw new RangeError(\"Vec removal index out of bounds\"); } return items.splice(index, 1)[0]; })(values, index)) >>> 0;\n}\n"
        );
    }

    #[test]
    fn lowers_sequence_optional_access_and_search() {
        let source = r#"
pub fn get_or(values: &[i32], index: usize) -> i32 {
    return values.get(index).copied().unwrap_or(7);
}

pub fn last_or(values: &[i32]) -> i32 {
    return values.last().copied().unwrap_or(8);
}

pub fn find_value(values: &[i32], expected: i32) -> usize {
    return values.iter().position(|value| *value == expected).unwrap_or(values.len());
}

pub fn take_last(values: &mut Vec<i32>) -> i32 {
    return values.pop().map_or(9, |value| value + 1);
}

pub fn remove_spaces(value: &str) -> String {
    return value.replace(' ', "");
}

pub fn utf16_units_to_string(values: &[u16]) -> String {
    return String::from_utf16_lossy(values);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("return (values[index] ?? 7);"), "{output}");
        assert!(output.contains("return (values.at(-1) ?? 8);"), "{output}");
        assert!(output.contains("items.findIndex(predicate)"), "{output}");
        assert!(
            output.contains("values.pop(), 9, (value) => value + 1"),
            "{output}"
        );
        assert!(
            output.contains("return value.replaceAll(\" \", \"\");"),
            "{output}"
        );
        assert!(
            output.contains("String.fromCharCode(...units.slice"),
            "{output}"
        );
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
                "pub fn looped_nested(items: Vec<i32>, extra: Vec<i32>, all: &Vec<Vec<i32>>) {\n    for items in all {\n        items.extend(extra);\n    }\n}\n".to_string(),
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
    fn lowers_chain_to_spread_concatenation() {
        let source = r#"
pub fn join(a: Vec<i32>, b: Vec<i32>) -> Vec<i32> {
    return a.into_iter().chain(b.into_iter()).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("[...a, ...b]"), "{output}");
    }

    #[test]
    fn lowers_checked_add_and_checked_sub_with_overflow_guards() {
        let source = r#"
pub fn safe_add(a: i32, b: i32) -> Option<i32> {
    return a.checked_add(b);
}

pub fn safe_sub(a: i32, b: i32) -> Option<i32> {
    return a.checked_sub(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(
                "const sum = a + b; return sum > 0x7FFFFFFF || sum < -0x80000000 ? undefined : sum"
            ),
            "{output}"
        );
        assert!(
            output.contains("const diff = a - b; return diff > 0x7FFFFFFF || diff < -0x80000000 ? undefined : diff"),
            "{output}"
        );
    }

    #[test]
    fn lowers_contains_key_to_map_has() {
        let source = r#"
use std::collections::HashMap;

pub fn has_entry(map: &HashMap<String, i32>, key: &str) -> bool {
    return map.contains_key(key);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("map.has(key)"), "{output}");
    }

    #[test]
    fn lowers_hashmap_entry_or_insert_and_or_insert_with() {
        let source = r#"
use std::collections::HashMap;

pub fn count(map: &mut HashMap<String, i32>, key: String) {
    *map.entry(key).or_insert(0) += 1;
}

pub fn get_or_create(map: &mut HashMap<String, i32>, key: String) -> i32 {
    return *map.entry(key).or_insert_with(|| 42);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("entries.has(key)"),
            "or_insert should check has: {output}"
        );
        assert!(
            output.contains("entries.set(key, value)"),
            "or_insert should set: {output}"
        );
        assert!(
            output.contains("entries.get(key)!"),
            "or_insert should return get: {output}"
        );
        assert!(
            output.contains("entries.set(key, init())"),
            "or_insert_with should call init: {output}"
        );
    }

    #[test]
    fn lowers_as_slice_to_identity() {
        let source = r#"
pub fn items(values: &Vec<i32>) -> &[i32] {
    return values.as_slice();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("return values"),
            "as_slice should be identity: {output}"
        );
    }

    #[test]
    fn lowers_bytes_and_lines_with_string_provenance() {
        let source = r#"
pub fn get_bytes(s: &str) -> Vec<u8> {
    return s.bytes().collect();
}
pub fn get_lines(s: &str) -> Vec<&str> {
    return s.lines().collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("TextEncoder().encode(s)"),
            "bytes should use TextEncoder: {output}"
        );
        assert!(
            output.contains("s.split('\\n')"),
            "lines should split on newline: {output}"
        );
    }

    #[test]
    fn lowers_char_indices_with_string_provenance() {
        let source = r#"
pub fn indices(s: &str) -> Vec<(usize, char)> {
    return s.char_indices().collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("[...s].map"),
            "char_indices should spread and map: {output}"
        );
        assert!(
            output.contains("[index, char]"),
            "char_indices should produce [index, char] tuples: {output}"
        );
    }

    #[test]
    fn lowers_checked_mul_with_overflow_guard() {
        let source = r#"
pub fn safe_mul(a: i32, b: i32) -> Option<i32> {
    return a.checked_mul(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("product"),
            "checked_mul should compute product: {output}"
        );
        assert!(
            output.contains("0x7FFFFFFF"),
            "checked_mul should check overflow: {output}"
        );
    }

    #[test]
    fn lowers_chunks_and_chunks_exact_on_sequences() {
        let source = r#"
pub fn chunk_it(values: &Vec<i32>) -> Vec<Vec<i32>> {
    return values.chunks(3).map(|c| c.to_vec()).collect();
}
pub fn chunk_exact(values: &Vec<i32>) -> Vec<Vec<i32>> {
    return values.chunks_exact(4).map(|c| c.to_vec()).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("i += size"),
            "chunks should iterate by size: {output}"
        );
        assert!(
            output.contains("i + size <= items.length"),
            "chunks_exact should stop when remaining < size: {output}"
        );
    }

    #[test]
    fn lowers_copy_from_slice_with_range_indexing() {
        let source = r#"
pub fn copy_range(dest: &mut Vec<f32>, source: &Vec<f32>, count: usize) {
    dest[0..count].copy_from_slice(&source[0..count]);
}
pub fn copy_full(dest: &mut Vec<f32>, source: &[f32]) {
    dest.copy_from_slice(source);
}
pub fn copy_literal(dest: &mut Vec<f32>) {
    dest[0..3].copy_from_slice(&[1.0, 2.0, 3.0]);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("dest[0 + __i] = source[0 + __i]"),
            "range copy should emit element-by-element loop: {output}"
        );
        assert!(
            output.contains("for (let __i = 0;"),
            "copy_from_slice should emit a for loop: {output}"
        );
    }

    #[test]
    fn lowers_fill_on_proven_sequences() {
        let source = r#"
pub fn zero_out(values: &mut Vec<i32>) {
    values.fill(0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(".fill(0)"),
            "fill should emit .fill(): {output}"
        );
    }

    #[test]
    fn lowers_find_map_with_option_absent() {
        let source = r#"
pub fn first_even(values: &Vec<i32>) -> Option<i32> {
    return values.find_map(|v| if *v % 2 == 0 { Some(*v) } else { None });
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("for (const item of items)"),
            "find_map should iterate: {output}"
        );
        assert!(
            output.contains("!== undefined"),
            "find_map should check absent: {output}"
        );
    }

    #[test]
    fn lowers_get_or_insert_with_on_option() {
        let source = r#"
pub fn ensure(value: &mut Option<i32>) -> i32 {
    return *value.get_or_insert_with(|| 42);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("value = value ??"),
            "get_or_insert_with should use ??= pattern: {output}"
        );
    }

    #[test]
    fn lowers_hashmap_get_mut() {
        let source = r#"
use std::collections::HashMap;

pub fn modify(map: &mut HashMap<String, i32>, key: &str) -> Option<&mut i32> {
    return map.get_mut(key);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("map.get(key)"),
            "get_mut should lower to map.get: {output}"
        );
    }

    #[test]
    fn lowers_is_ascii_checks() {
        let source = r#"
pub fn check_digit(ch: char) -> bool {
    return ch.is_ascii_digit();
}
pub fn check_lower(ch: char) -> bool {
    return ch.is_ascii_lowercase();
}
pub fn check_upper(ch: char) -> bool {
    return ch.is_ascii_uppercase();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("ch >= '0' && ch <= '9'"),
            "is_ascii_digit should check char range: {output}"
        );
        assert!(
            output.contains("ch >= 'a' && ch <= 'z'"),
            "is_ascii_lowercase should check char range: {output}"
        );
        assert!(
            output.contains("ch >= 'A' && ch <= 'Z'"),
            "is_ascii_uppercase should check char range: {output}"
        );
    }

    #[test]
    fn lowers_is_err_and_is_ok() {
        let source = r#"
pub fn check_result(value: Option<i32>) -> bool {
    let ok = value.is_ok();
    let err = value.is_err();
    return ok && !err;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("!== undefined"),
            "is_ok should check !== absent: {output}"
        );
        assert!(
            output.contains("=== undefined"),
            "is_err should check === absent: {output}"
        );
    }

    #[test]
    fn lowers_is_infinite() {
        let source = r#"
pub fn check(value: f64) -> bool {
    return value.is_infinite();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("!Number.isFinite"),
            "is_infinite should negate isFinite: {output}"
        );
        assert!(
            output.contains("!Number.isNaN"),
            "is_infinite should exclude NaN: {output}"
        );
    }

    #[test]
    fn lowers_option_or() {
        let source = r#"
pub fn fallback(a: Option<i32>, b: Option<i32>) -> Option<i32> {
    return a.or(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("(a ?? b)"),
            "or should use nullish coalescing: {output}"
        );
    }

    #[test]
    fn lowers_rem_euclid() {
        let source = r#"
pub fn euclidean(n: i32, m: i32) -> i32 {
    return n.rem_euclid(m);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("((n % m) + m) % m"),
            "rem_euclid should use double-mod pattern: {output}"
        );
    }

    #[test]
    fn lowers_saturating_add() {
        let source = r#"
pub fn safe_add(a: u32, b: u32) -> u32 {
    return a.saturating_add(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("Math.min(0x7FFFFFFF"),
            "saturating_add should clamp to max: {output}"
        );
    }

    #[test]
    fn lowers_sort_by_key() {
        let source = r#"
pub fn sort_len(values: &mut Vec<String>) {
    values.sort_by_key(|s| s.len());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("key(a) - key(b)"),
            "sort_by_key should compare by key: {output}"
        );
    }

    #[test]
    fn lowers_split_once_with_string_provenance() {
        let source = r#"
pub fn first_part(s: &str) -> Option<(&str, &str)> {
    return s.split_once(':');
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("indexOf(delimiter)"),
            "split_once should use indexOf: {output}"
        );
        assert!(
            output.contains("value.slice(0, index)"),
            "split_once should slice for first part: {output}"
        );
    }

    #[test]
    fn lowers_split_whitespace_with_string_provenance() {
        let source = r#"
pub fn words(s: &str) -> Vec<&str> {
    return s.split_whitespace().collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("split(/\\s+/)"),
            "split_whitespace should split on regex: {output}"
        );
        assert!(
            output.contains(".filter("),
            "split_whitespace should filter empty: {output}"
        );
    }

    #[test]
    fn lowers_strip_prefix_and_strip_suffix() {
        let source = r#"
pub fn strip(s: &str) -> Option<&str> {
    return s.strip_prefix("hello");
}
pub fn strip_end(s: &str) -> Option<&str> {
    return s.strip_suffix("world");
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("startsWith(prefix)"),
            "strip_prefix should use startsWith: {output}"
        );
        assert!(
            output.contains("slice(prefix.length)"),
            "strip_prefix should slice after prefix: {output}"
        );
        assert!(
            output.contains("endsWith(suffix)"),
            "strip_suffix should use endsWith: {output}"
        );
    }

    #[test]
    fn lowers_trim_matches_with_string_provenance() {
        let source = r#"
pub fn clean(s: &str) -> &str {
    return s.trim_matches('.');
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("startsWith(ch)"),
            "trim_matches should check startsWith: {output}"
        );
        assert!(
            output.contains("endsWith(ch)"),
            "trim_matches should check endsWith: {output}"
        );
    }

    #[test]
    fn lowers_wrapping_sub() {
        let source = r#"
pub fn wrap_sub(a: u32, b: u32) -> u32 {
    return a.wrapping_sub(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(">>> 0"),
            "wrapping_sub should use unsigned shift: {output}"
        );
    }

    #[test]
    fn lowers_borrow_and_identity_conversions() {
        let source = r#"
pub fn identity_methods(value: &Vec<i32>) -> &[i32] {
    let b = value.borrow();
    let d = value.as_deref_mut();
    let t = value.try_into();
    return value.as_slice();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            !output.contains("borrow(") && !output.contains("as_deref_mut("),
            "borrow/as_deref_mut should be identity (no method call): {output}"
        );
    }

    #[test]
    fn lowers_is_null_to_null_check() {
        let source = r#"
pub fn check(ptr: Option<i32>) -> bool {
    return ptr.is_null();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("=== undefined") || output.contains("=== null"),
            "is_null should check against absent value: {output}"
        );
    }

    #[test]
    fn lowers_ok_and_result_conversions() {
        let source = r#"
pub fn convert(result: Option<i32>) -> Option<i32> {
    let a = result.ok();
    let b = result.ok_or("error");
    let c = result.ok_or_else(|| "error");
    let d = result.map_err(|_| "other");
    return a;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            !output.contains(".ok(") && !output.contains(".ok_or("),
            "ok/ok_or should be identity: {output}"
        );
    }

    #[test]
    fn lowers_reduce_to_array_reduce() {
        let source = r#"
pub fn sum_opt(values: &Vec<i32>) -> Option<i32> {
    return values.reduce(|a, b| a + b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(".reduce("),
            "reduce should emit .reduce(): {output}"
        );
    }

    #[test]
    fn lowers_replacen_with_string_provenance() {
        let source = r#"
pub fn replace_first_two(s: &str) -> String {
    return s.replacen("old", "new", 2);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("indexOf(pattern)"),
            "replacen should use indexOf: {output}"
        );
        assert!(
            output.contains("i < count"),
            "replacen should loop up to count: {output}"
        );
    }

    #[test]
    fn lowers_take_while_to_loop() {
        let source = r#"
pub fn positive(values: &Vec<i32>) -> Vec<i32> {
    return values.take_while(|v| *v > 0).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("if (!predicate(item)) break"),
            "take_while should break on false predicate: {output}"
        );
    }

    #[test]
    fn lowers_unwrap_or_default_with_proven_payload() {
        let source = r#"
pub fn vec_default(value: Option<Vec<i32>>) -> Vec<i32> {
    return value.unwrap_or_default();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("?? []"),
            "Vec default should be empty array: {output}"
        );
    }

    #[test]
    fn lowers_clone_from_to_object_assign() {
        let source = r#"
pub struct Point { pub x: f32, pub y: f32 }
pub fn copy(target: &mut Point, source: &Point) {
    target.clone_from(source);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("Object.assign(target, source)"), "{output}");
    }

    #[test]
    fn lowers_chunks_exact_mut_on_sequences() {
        let source = r#"
pub fn pairs(values: &mut Vec<i32>) -> Vec<Vec<i32>> {
    return values.chunks_exact_mut(2).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("i + size <= items.length"),
            "{output}"
        );
    }

    #[test]
    fn lowers_div_ceil() {
        let source = r#"
pub fn pages(total: usize, per_page: usize) -> usize {
    return total.div_ceil(per_page);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("Math.ceil(total / perPage)"),
            "{output}"
        );
    }

    #[test]
    fn lowers_get_or_init_to_lazy_initialization() {
        let source = r#"
pub fn lazy(cell: &mut Option<i32>, init: fn() -> i32) -> i32 {
    return *cell.get_or_init(init);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("(cell = cell ?? (init)())"),
            "{output}"
        );
    }

    #[test]
    fn lowers_is_ascii_alphanumeric_and_is_whitespace() {
        let source = r#"
pub fn classify(ch: char) -> (bool, bool, bool) {
    return (ch.is_ascii_alphanumeric(), ch.is_ascii_alphabetic(), ch.is_whitespace());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("(/^[a-zA-Z0-9]$/).test(ch)"),
            "is_ascii_alphanumeric: {output}"
        );
        assert!(
            output.contains("(/^[a-zA-Z]$/).test(ch)"),
            "is_ascii_alphabetic: {output}"
        );
        assert!(
            output.contains(r"(/^\s$/).test(ch)"),
            "is_whitespace: {output}"
        );
    }

    #[test]
    fn lowers_last_mut_on_sequences() {
        let source = r#"
pub fn tail(values: &mut Vec<i32>) -> i32 {
    return *values.last_mut().unwrap();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("values.at(-1)"), "{output}");
    }

    #[test]
    fn lowers_parse_with_turbofish() {
        let source = r#"
pub fn parse_float(text: &str) -> Option<f64> {
    return text.parse::<f64>().ok();
}

pub fn parse_int(text: &str) -> Option<i32> {
    return text.parse::<i32>().ok();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("parseFloat(text)"),
            "f64 parse: {output}"
        );
        assert!(
            output.contains("parseInt(text, 10)"),
            "i32 parse: {output}"
        );
    }

    #[test]
    fn lowers_sort_unstable_to_sort() {
        let source = r#"
pub fn ordered(values: &mut Vec<i32>) {
    values.sort_unstable();
}

pub fn ordered_by(values: &mut Vec<i32>, cmp: fn(&i32, &i32) -> std::cmp::Ordering) {
    values.sort_unstable_by(cmp);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(".sort((a, b) => a - b)"),
            "sort_unstable: {output}"
        );
        assert!(
            output.contains(".sort(cmp)"),
            "sort_unstable_by: {output}"
        );
    }

    #[test]
    fn lowers_step_by_in_for_loops() {
        let source = r#"
pub fn every_fourth(data: &[u8]) -> Vec<u8> {
    let mut result: Vec<u8> = Vec::new();
    for i in (0..data.len()).step_by(4) {
        result.push(data[i]);
    }
    return result;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("i += 4"),
            "step_by should change increment: {output}"
        );
        assert!(
            output.contains("let i = 0; i < data.length; i += 4"),
            "full for header: {output}"
        );
    }

    #[test]
    fn lowers_to_le_bytes_with_numeric_provenance() {
        let source = r#"
pub fn bytes_u32(value: u32) -> Vec<u8> {
    return value.to_le_bytes().to_vec();
}

pub fn bytes_f64(value: f64) -> Vec<u8> {
    return value.to_be_bytes().to_vec();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("setUint32(0, value, true)"),
            "u32 to_le_bytes: {output}"
        );
        assert!(
            output.contains("new Uint8Array(4)"),
            "u32 byte count: {output}"
        );
        assert!(
            output.contains("setFloat64(0, value, false)"),
            "f64 to_be_bytes: {output}"
        );
        assert!(
            output.contains("new Uint8Array(8)"),
            "f64 byte count: {output}"
        );
    }

    #[test]
    fn lowers_to_bits_with_float_provenance() {
        let source = r#"
pub fn bits(value: f32) -> u32 {
    return value.to_bits();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("setFloat32(0, value, true)"),
            "{output}"
        );
        assert!(
            output.contains("getUint32(0, true)"),
            "{output}"
        );
    }

    #[test]
    fn lowers_unwrap_or_default_with_primitive_payload() {
        let source = r#"
pub fn int_default(value: Option<i32>) -> i32 {
    return value.unwrap_or_default();
}

pub fn bool_default(value: Option<bool>) -> bool {
    return value.unwrap_or_default();
}

pub fn string_default(value: Option<String>) -> String {
    return value.unwrap_or_default();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("?? 0"),
            "i32 default should be 0: {output}"
        );
        assert!(
            output.contains("?? false"),
            "bool default should be false: {output}"
        );
        assert!(
            output.contains(r#"?? """#),
            "String default should be empty string: {output}"
        );
    }

    #[test]
    fn lowers_wrapping_shl() {
        let source = r#"
pub fn shift(value: u32, n: u32) -> u32 {
    return value.wrapping_shl(n);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("((value) << n) >>> 0"),
            "{output}"
        );
    }

    #[test]
    fn lowers_from_le_bytes_and_from_be_bytes_with_dataview() {
        let source = r#"
pub fn read_u16_le(bytes: &[u8]) -> u16 {
    return u16::from_le_bytes([bytes[0], bytes[1]]);
}

pub fn read_u32_be(bytes: &[u8]) -> u32 {
    return u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
}

pub fn read_f32_le(bytes: &[u8]) -> f32 {
    return f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("getUint16(0, true)"),
            "u16 from_le_bytes: {output}"
        );
        assert!(
            output.contains("getUint32(0, false)"),
            "u32 from_be_bytes: {output}"
        );
        assert!(
            output.contains("getFloat32(0, true)"),
            "f32 from_le_bytes: {output}"
        );
    }

    #[test]
    fn lowers_from_bits_with_dataview() {
        let source = r#"
pub fn from_u32(bits: u32) -> f32 {
    return f32::from_bits(bits);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("setUint32(0, bits, true)"),
            "{output}"
        );
        assert!(
            output.contains("getFloat32(0, true)"),
            "{output}"
        );
    }

    #[test]
    fn lowers_eq_ignore_ascii_case_with_string_provenance() {
        let source = r#"
pub fn same(a: &str, b: &str) -> bool {
    return a.eq_ignore_ascii_case(b);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(".toLowerCase() === "),
            "{output}"
        );
    }

    #[test]
    fn lowers_leading_zeros_to_clz32() {
        let source = r#"
pub fn zeros(value: u32) -> u32 {
    return value.leading_zeros();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("Math.clz32(value)"), "{output}");
    }

    #[test]
    fn lowers_log2_and_log10() {
        let source = r#"
pub fn logs(value: f64) -> (f64, f64) {
    return (value.log2(), value.log10());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("Math.log2(value)"), "{output}");
        assert!(output.contains("Math.log10(value)"), "{output}");
    }

    #[test]
    fn lowers_rfind_with_string_provenance() {
        let source = r#"
pub fn last_index(text: &str, pattern: &str) -> Option<usize> {
    return text.rfind(pattern);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("lastIndexOf(pattern)"),
            "{output}"
        );
    }

    #[test]
    fn lowers_rsplit_with_string_provenance() {
        let source = r#"
pub fn parts(text: &str, sep: &str) -> Vec<String> {
    return text.rsplit(sep).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(".split(sep).reverse()"),
            "{output}"
        );
    }

    #[test]
    fn lowers_to_owned_and_to_string_lossy_to_identity() {
        let source = r#"
pub fn owned(value: &str) -> String {
    return value.to_owned();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("return value;"),
            "to_owned should be identity: {output}"
        );
    }

    #[test]
    fn lowers_try_from_on_numeric_types() {
        let source = r#"
pub fn narrow(value: i64) -> Option<u32> {
    return u32::try_from(value).ok();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            !output.contains("try_from"),
            "try_from should be lowered: {output}"
        );
    }

    #[test]
    fn lowers_wrapping_neg() {
        let source = r#"
pub fn negate(value: u32) -> u32 {
    return value.wrapping_neg();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains(">>> 0"),
            "{output}"
        );
    }

    #[test]
    fn lowers_dedup_on_sorted_sequences() {
        let source = r#"
pub fn unique_sorted(values: &mut Vec<i32>) {
    values.dedup();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("items[read] !== items[read - 1]"),
            "{output}"
        );
        assert!(
            output.contains("items.length = Math.min(write, items.length)"),
            "{output}"
        );
    }

    #[test]
    fn lowers_flat_map_and_flatten() {
        let source = r#"
pub fn expand(values: Vec<Vec<i32>>) -> Vec<i32> {
    return values.into_iter().flat_map(|inner| inner).collect();
}

pub fn merge(values: Vec<Vec<i32>>) -> Vec<i32> {
    return values.into_iter().flatten().collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(".flatMap("), "{output}");
        assert!(output.contains(".flat()"), "{output}");
    }

    #[test]
    fn lowers_push_str_to_string_concatenation() {
        let source = r#"
pub fn append_suffix(value: &mut String) {
    value.push_str("_end");
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("value += \"_end\""), "{output}");
    }

    #[test]
    fn lowers_sort_unstable_by_to_array_sort() {
        let source = r#"
pub fn sort_by_key(values: &mut Vec<i32>, compare: fn(&i32, &i32) -> std::cmp::Ordering) {
    values.sort_unstable_by(compare);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("values.sort(compare)"), "{output}");
    }

    #[test]
    fn lowers_string_split_with_provenance() {
        let source = r#"
pub fn words(text: String) -> Vec<String> {
    return text.split(' ').map(|value| value.to_string()).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("text.split("), "{output}");
    }

    #[test]
    fn rejects_split_without_string_provenance() {
        let source =
            "pub fn bad_split(value: &[u8]) -> Vec<u8> { return value.split(0).collect(); }\n";

        let error = compile_typescript(source, None).unwrap_err();
        assert_eq!(
            error.to_string(),
            "portable `.split()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn lowers_take_with_option_absent_value() {
        let source = r#"
pub fn consume(value: &mut Option<i32>) -> Option<i32> {
    return value.take();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("const __tmp = value"), "{output}");
        assert!(output.contains("return __tmp"), "{output}");
    }

    #[test]
    fn lowers_then_some_with_option_absent_value() {
        let source = r#"
pub fn when_true(flag: bool, value: i32) -> Option<i32> {
    return flag.then_some(value);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("(flag ? value : undefined)"), "{output}");
    }

    #[test]
    fn lowers_trim_family_with_string_provenance() {
        let source = r#"
pub fn strip(text: String) -> String {
    return text.trim().to_string();
}

pub fn strip_start(text: String) -> String {
    return text.trim_start().to_string();
}

pub fn strip_end(text: String) -> String {
    return text.trim_end().to_string();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("text.trim()"), "{output}");
        assert!(output.contains("text.trimStart()"), "{output}");
        assert!(output.contains("text.trimEnd()"), "{output}");
    }

    #[test]
    fn rejects_trim_without_string_provenance() {
        for (source, expected) in [
            (
                "pub fn bad(value: i32) { value.trim(); }\n",
                "portable `.trim()` requires a receiver known to be `String` or `str`",
            ),
            (
                "pub fn bad(value: i32) { value.trim_start(); }\n",
                "portable `.trim_start()` requires a receiver known to be `String` or `str`",
            ),
            (
                "pub fn bad(value: i32) { value.trim_end(); }\n",
                "portable `.trim_end()` requires a receiver known to be `String` or `str`",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    #[test]
    fn lowers_unsigned_abs_to_unsigned_right_shift() {
        let source = "pub fn magnitude(value: i32) -> u32 { return value.unsigned_abs(); }\n";

        assert!(
            compile_typescript(source, None)
                .unwrap()
                .contains("Math.abs(value) >>> 0"),
        );
    }

    #[test]
    fn lowers_zip_to_index_mapped_tuples() {
        let source = r#"
pub fn pairs(keys: Vec<String>, values: Vec<i32>) -> Vec<(String, i32)> {
    return keys.into_iter().zip(values.into_iter()).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(".map((item, index) => [item,"), "{output}");
        assert!(output.contains("as const"), "{output}");
    }

    #[test]
    fn lowers_as_bytes_with_string_provenance() {
        let source = r#"
pub fn byte_length(text: String) -> usize {
    return text.as_bytes().len();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("new TextEncoder().encode(text)"),
            "{output}"
        );
    }

    #[test]
    fn rejects_as_bytes_without_string_provenance() {
        let source = "pub fn bad(value: i32) -> usize { return value.as_bytes().len(); }\n";

        let error = compile_typescript(source, None).unwrap_err();
        assert_eq!(
            error.to_string(),
            "portable `.as_bytes()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn lowers_as_str_to_identity() {
        let source = r#"
pub fn label(value: String) -> String {
    return value.as_str().to_string();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(!output.contains(".as_str"), "{output}");
    }

    #[test]
    fn lowers_filter_map_to_map_then_filter() {
        let source = r#"
pub fn positive_doubles(values: Vec<i32>) -> Vec<i32> {
    return values.into_iter().filter_map(|value| if value > 0 { Some(value * 2) } else { None }).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(".map("), "{output}");
        assert!(output.contains(".filter("), "{output}");
    }

    #[test]
    fn lowers_hypot_to_math_hypot() {
        let source = "pub fn distance(dx: f64, dy: f64) -> f64 { return dx.hypot(dy); }\n";

        assert!(
            compile_typescript(source, None)
                .unwrap()
                .contains("Math.hypot(dx, dy)"),
        );
    }

    #[test]
    fn lowers_into_boxed_slice_to_identity() {
        let source = r#"
pub fn freeze(values: Vec<i32>) -> Box<[i32]> {
    return values.into_boxed_slice();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(!output.contains("into_boxed_slice"), "{output}");
        assert!(!output.contains("intoBoxedSlice"), "{output}");
    }

    #[test]
    fn lowers_into_keys_and_into_values() {
        let source = r#"
use std::collections::HashMap;

pub fn keys(map: HashMap<String, i32>) -> Vec<String> {
    return map.into_keys().collect();
}

pub fn values(map: HashMap<String, i32>) -> Vec<i32> {
    return map.into_values().collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("[...map.keys()]"), "{output}");
        assert!(output.contains("[...map.values()]"), "{output}");
    }

    #[test]
    fn lowers_is_some_and_and_is_none_or() {
        let source = r#"
pub fn has_positive(value: Option<i32>) -> bool {
    return value.is_some_and(|v| v > 0);
}

pub fn missing_or_zero(value: Option<i32>) -> bool {
    return value.is_none_or(|v| v == 0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("!== undefined"), "{output}");
        assert!(output.contains("=== undefined"), "{output}");
    }

    #[test]
    fn lowers_join_to_array_join() {
        let source = r#"
pub fn comma_separated(values: Vec<String>) -> String {
    return values.join(", ");
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("values.join(\", \")"), "{output}");
    }

    #[test]
    fn lowers_map_or_else_on_proven_options() {
        let source = r#"
pub fn describe(value: Option<i32>) -> String {
    return value.map_or_else(|| "none".to_string(), |v| v.to_string());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("fallback()"), "{output}");
        assert!(output.contains("map(value)"), "{output}");
    }

    #[test]
    fn lowers_or_else_to_nullish_coalescing_call() {
        let source = r#"
pub fn fallback(value: Option<i32>) -> Option<i32> {
    return value.or_else(|| Some(42));
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("??"), "{output}");
    }

    #[test]
    fn lowers_resize_on_proven_sequences() {
        let source = r#"
pub fn grow(values: &mut Vec<f32>, size: usize) {
    values.resize(size, 0.0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("items.push(value)"), "{output}");
        assert!(output.contains("items.length = length"), "{output}");
    }

    #[test]
    fn lowers_case_conversion_with_string_provenance() {
        let source = r#"
pub fn shout(text: String) -> String {
    return text.to_uppercase();
}

pub fn whisper(text: String) -> String {
    return text.to_lowercase();
}

pub fn ascii_shout(text: String) -> String {
    return text.to_ascii_uppercase();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("text.toUpperCase()"), "{output}");
        assert!(output.contains("text.toLowerCase()"), "{output}");
    }

    #[test]
    fn rejects_case_conversion_without_string_provenance() {
        for (source, expected) in [
            (
                "pub fn bad(value: i32) -> String { return value.to_uppercase(); }\n",
                "portable `.to_uppercase()` requires a receiver known to be `String` or `str`",
            ),
            (
                "pub fn bad(value: i32) -> String { return value.to_lowercase(); }\n",
                "portable `.to_lowercase()` requires a receiver known to be `String` or `str`",
            ),
            (
                "pub fn bad(value: i32) -> String { return value.to_ascii_uppercase(); }\n",
                "portable `.to_ascii_uppercase()` requires a receiver known to be `String` or `str`",
            ),
        ] {
            let error = compile_typescript(source, None).unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
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
        assert!(transform_output.contains("const $child = getNodeChildAt(node, (i) | 0);"));
        assert!(transform_output.contains("if ($child !== null) {"));
        assert_eq!(transform_output.matches("getNodeChildAt(").count(), 1);
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
    fn emits_generic_struct_parameters_and_parenthesizes_array_unions() {
        let source = r#"
use std::sync::Arc;

pub type PayloadSlot<T> = Arc<dyn Fn(&T) + Send + Sync>;

pub struct Envelope<T: Clone> {
    pub value: T,
    pub history: Vec<Option<T>>,
}

pub struct EntityBox<T> {
    pub value: T,
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(EntityBox<T>);

pub fn borrow_entity_box<T>(value: &EntityBox<T>) -> &T {
    return &value.value;
}

pub fn borrow_payload<T>(value: &T) -> &T {
    return value;
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains(
            "export interface Envelope<T> {\n  value: T;\n  history: (T | undefined)[];\n}"
        ));
        assert!(
            output.contains("export interface EntityBoxRaw<T> extends EntityRaw {\n  value: T;\n}")
        );
        assert!(
            output.contains(
                "export function borrowEntityBox<T>(value: Readonly<EntityBoxRaw<T>>): T"
            )
        );
        assert!(output.contains("export function borrowPayload<T>(value: T): T"));
        assert!(output.contains("export type PayloadSlot<T> = (arg0: T) => void;"));
    }

    #[test]
    fn lowers_unit_values_to_undefined() {
        let source = r#"
pub fn accept_unit(value: ()) {}

pub fn call_unit() {
    accept_unit(());
    let value: () = ();
    accept_unit(value);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("export function acceptUnit(value: void): void"),
            "{output}"
        );
        assert!(output.contains("acceptUnit(undefined);"), "{output}");
        assert!(
            output.contains("const value: void = undefined;"),
            "{output}"
        );
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
        assert!(
            output.contains("  selectionStateStateStore.set(out, { count: 0.0, items: [] });\n")
        );
        assert!(output.contains(
            "const selectionStateStateStore = /* @__PURE__ */ new WeakMap<Readonly<SelectionStateRaw>, SelectionStateRuntime>();\n\nexport { selectionStateStateStore };\n"
        ));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(output.contains(&format!("  let runtime = {access};\n")));
        assert!(output.contains("  runtime.items.push(item);\n"));
        assert!(output.contains(&format!("  return {access}.count;\n")));
        assert!(!output.contains("!!"));
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
    fn leaves_target_native_entity_storage_defaults_to_its_companion() {
        let native_entity = r#"
//! flight-compiler: target-native

use flight_entity::EntityRuntimeSlot;

pub struct NativeRecord {
    pub value: f32,
}

pub struct NativeEntity {
    runtime: EntityRuntimeSlot,
    pub record: NativeRecord,
}

flight_entity::impl_entity!(NativeEntity);
"#;
        let factory = r#"
pub fn allocate_native_entity() -> NativeEntity {
    return flight_entity::allocate_entity();
}
"#;

        let output = compile_typescript_with_alias_sources(
            factory,
            Some("@flighthq/entity/contract"),
            &[native_entity],
        )
        .unwrap();

        assert!(output.contains("return allocateEntity<NativeEntity>();"));
        assert!(!output.contains("Object.assign"));
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
    fn preserves_a_mutex_guard_cell_across_an_atomic_clone_and_clear() {
        let source = r#"
use std::sync::{Arc, Mutex};

fn take_pending<T: Clone>(pending: &Arc<Mutex<Option<T>>>) -> Option<T> {
    let mut guard = pending.lock().unwrap();
    let value = (*guard).clone();
    *guard = None;
    return value;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("function takePending<T>(pending: { value: T | undefined })"));
        assert!(output.contains("let guard = pending;"));
        assert!(output.contains("const value = (guard.value);"), "{output}");
        assert!(output.contains("guard.value = undefined;"));
        assert!(!output.contains("pending.value;"));
        assert!(!output.contains("Readonly<{ value:"));
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
    fn lowers_lazy_lock_statics_to_eager_exported_constants() {
        let source = r#"
//! flight-compiler: export-name SHARED_KERNEL sharedKernel

use std::sync::LazyLock;

use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Default)]
pub struct Kernel {
    runtime: EntityRuntimeSlot,
    pub scale: f64,
    pub tags: Vec<f64>,
    pub weight: f64,
}

pub type KernelScale = f64;

flight_entity::impl_entity!(Kernel);

pub static LIMIT: f64 = 2.0;

static DEFAULT_SCALE: LazyLock<KernelScale> = LazyLock::new(|| {
    let base = LIMIT;
    base * 0.5
});

/// The kernel every caller shares unless it passes its own.
pub static SHARED_KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub static DOUBLE_KERNEL: LazyLock<Kernel> = LazyLock::new(|| create_scaled_kernel(2.0));

pub fn create_kernel() -> Kernel {
    return create_scaled_kernel(*DEFAULT_SCALE);
}

pub fn create_scaled_kernel(scale: f64) -> Kernel {
    let mut out: Kernel = allocate_entity();
    out.scale = scale;
    out.tags = Vec::new();
    out.weight = scale * 2.0 - 0.5 / 4.0;
    return out;
}

pub fn get_kernel(kernel: Option<&Kernel>) -> &Kernel {
    return kernel.unwrap_or(&*SHARED_KERNEL);
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(output.contains("export const LIMIT: number = 2.0;\n"));
        assert!(output.contains("\nconst DEFAULT_SCALE: KernelScale = (() => {\n"));
        assert!(output.contains(
            "/**\n * The kernel every caller shares unless it passes its own.\n */\nexport const sharedKernel: KernelRaw = createKernel();\n"
        ));
        assert!(
            output.contains("export const DOUBLE_KERNEL: KernelRaw = createScaledKernel(2.0);\n")
        );
        assert!(output.contains("  return createScaledKernel(DEFAULT_SCALE);\n"));
        assert!(output.contains("  return (kernel ?? sharedKernel);\n"));
        assert!(!output.contains("LazyLock"));
        assert!(!output.contains("SHARED_KERNEL"));
        let shared = output.find("export const sharedKernel").unwrap();
        assert!(
            output.find("export const LIMIT").unwrap()
                < output.find("const DEFAULT_SCALE").unwrap()
        );
        assert!(output.find("const DEFAULT_SCALE").unwrap() < shared);
        assert!(shared < output.find("export function createKernel").unwrap());
    }

    #[test]
    fn rejects_unsupported_lazy_lock_statics() {
        let declarations = "use std::sync::LazyLock;\n\npub struct Kernel {\n    pub scale: f64,\n}\n\npub fn create_kernel() -> Kernel {\n    return Kernel { scale: 1.0 };\n}\n";
        let unsupported_shape = |name: &str| {
            format!(
                "unsupported `LazyLock` static `{name}`; declare it as `static {name}: LazyLock<T> = LazyLock::new(init)`"
            )
        };
        let unsupported_initializer = |name: &str| {
            format!(
                "unsupported `LazyLock` initializer for `{name}`; pass a zero-argument function path or a `|| value` closure"
            )
        };
        let unresolved = |name: &str| {
            format!(
                "`LazyLock` static `{name}` must hold a struct or type alias declared in this source; dependency-owned or unresolved value types are not portable"
            )
        };
        let unsafe_initializer = |name: &str, reason: &str| {
            format!(
                "`LazyLock` static `{name}` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}"
            )
        };
        let non_static =
            "`LazyLock` is portable only as the type of `static NAME: LazyLock<T> = LazyLock::new(init)`"
                .to_string();
        let cases = [
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::force(&OTHER);\n".to_string(),
                unsupported_shape("KERNEL"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel, fn() -> Kernel> = LazyLock::new(create_kernel);\n".to_string(),
                unsupported_shape("KERNEL"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel());\n".to_string(),
                unsupported_initializer("KERNEL"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|scale| Kernel { scale });\n".to_string(),
                unsupported_initializer("KERNEL"),
            ),
            (
                "pub static mut KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n".to_string(),
                "`LazyLock` static `KERNEL` cannot be `mut`".to_string(),
            ),
            (
                "pub static MATRIX: LazyLock<flight_geometry::Matrix> = LazyLock::new(create_kernel);\n".to_string(),
                unresolved("MATRIX"),
            ),
            (
                "use flight_geometry::Matrix;\npub static MATRIX: LazyLock<Matrix> = LazyLock::new(create_kernel);\n".to_string(),
                unresolved("MATRIX"),
            ),
            (
                "pub static SCALES: LazyLock<Vec<f64>> = LazyLock::new(|| vec![1.0]);\n".to_string(),
                unresolved("SCALES"),
            ),
            (
                "pub fn make() -> f64 {\n    let local: LazyLock<Kernel> = LazyLock::new(create_kernel);\n    return local.scale;\n}\n".to_string(),
                non_static.clone(),
            ),
            (
                "pub struct Holder {\n    pub kernel: LazyLock<Kernel>,\n}\n".to_string(),
                non_static.clone(),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let nested: LazyLock<Kernel> = LazyLock::new(create_kernel);\n    return Kernel { scale: nested.scale };\n});\n".to_string(),
                "`LazyLock` initializer for `KERNEL` cannot construct another `LazyLock`".to_string(),
            ),
            (
                "impl Default for Kernel {\n    fn default() -> Self {\n        return Kernel { scale: 1.0 };\n    }\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(Kernel::default);\n".to_string(),
                "`LazyLock` initializer for `KERNEL` must name a free function of this crate; `Kernel::default` has no TypeScript value".to_string(),
            ),
            (
                "use std::sync::atomic::{AtomicU32, Ordering};\n\nstatic CREATED: AtomicU32 = AtomicU32::new(0);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_counted_kernel);\n\npub fn create_counted_kernel() -> Kernel {\n    CREATED.fetch_add(1, Ordering::SeqCst);\n    return Kernel { scale: 1.0 };\n}\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `.fetch_add()`, and a method name does not prove which operation its receiver performs"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: read_scale() });\n\npub fn read_scale() -> f64 {\n    return flight_math::random();\n}\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `flight_math::random`, which is not a side-effect-free function of this crate"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: first_scale(&[1.0]) });\n\npub fn first_scale(scales: &[f64]) -> f64 {\n    return scales[0];\n}\n".to_string(),
                unsafe_initializer("KERNEL", "it indexes, which can panic"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: Some(1.0).unwrap() });\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `.unwrap()`, and a method name does not prove which operation its receiver performs"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let label = format!(\"created\");\n    return Kernel { scale: label.len() as f64 };\n});\n".to_string(),
                unsafe_initializer("KERNEL", "it invokes `format!`"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(make_kernel);\n\npub fn make_kernel() -> Kernel {\n    return Kernel { scale: read_scale() };\n}\n\npub fn read_scale() -> f64 {\n    return KERNEL.scale;\n}\n".to_string(),
                unsafe_initializer("KERNEL", "it reaches the static itself (an initialization cycle)"),
            ),
            (
                "pub static FIRST: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: SECOND.scale });\n\npub static SECOND: LazyLock<Kernel> = LazyLock::new(create_kernel);\n".to_string(),
                unsafe_initializer("FIRST", "it reads `SECOND`, which is not a `LazyLock` or immutable primitive static declared before it"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: LIMIT });\n\npub static LIMIT: f64 = 2.0;\n".to_string(),
                unsafe_initializer("KERNEL", "it reads `LIMIT`, which is not a `LazyLock` or immutable primitive static declared before it"),
            ),
            (
                "pub struct Tally {\n    pub count: i32,\n}\n\npub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { count: 1 / 0 });\n".to_string(),
                unsafe_initializer("TALLY", "it applies `/` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"),
            ),
            (
                "pub struct Tally {\n    pub count: i32,\n}\n\npub static TALLY: LazyLock<Tally> = LazyLock::new(make_tally);\n\npub fn make_tally() -> Tally {\n    let divisor = 0;\n    return Tally { count: 7 % divisor };\n}\n".to_string(),
                unsafe_initializer("TALLY", "it applies `%` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"),
            ),
            (
                "pub struct Tally {\n    pub count: i32,\n}\n\npub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { count: 2147483647 + 1 });\n".to_string(),
                unsafe_initializer("TALLY", "it applies `+` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"),
            ),
            (
                "pub struct Tally {\n    pub count: i32,\n}\n\npub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { count: 1 << 31 });\n".to_string(),
                unsafe_initializer("TALLY", "it applies `<<` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"),
            ),
            (
                "use std::sync::atomic::{AtomicU32, Ordering};\n\nstatic CLONES: AtomicU32 = AtomicU32::new(0);\n\npub struct Seed {\n    pub scale: f64,\n}\n\nimpl Clone for Seed {\n    fn clone(&self) -> Seed {\n        CLONES.fetch_add(1, Ordering::SeqCst);\n        return Seed { scale: self.scale };\n    }\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let seed = Seed { scale: 1.0 };\n    return Kernel { scale: seed.clone().scale };\n});\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `.clone()`, and a method name does not prove which operation its receiver performs"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: scale_of(&[1.0, 2.0]) });\n\npub fn scale_of(scales: &[f64]) -> f64 {\n    return if scales.is_empty() { 1.0 } else { 2.0 };\n}\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `.is_empty()`, and a method name does not prove which operation its receiver performs"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: 1 as f64 });\n".to_string(),
                unsafe_initializer("KERNEL", "it casts with `as`, which converts differently in Rust"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: -flight_math::random() });\n".to_string(),
                unsafe_initializer("KERNEL", "it applies `-` to an operand not proven to be an `f64` value"),
            ),
            (
                "pub struct Vec {\n    pub length: f64,\n}\n\nimpl Vec {\n    pub fn new() -> Vec {\n        return Vec { length: 0.0 };\n    }\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let values = Vec::new();\n    return Kernel { scale: values.length };\n});\n".to_string(),
                unsafe_initializer("KERNEL", "it calls `Vec::new`, which is not a side-effect-free function of this crate"),
            ),
            (
                "//! flight-compiler: export-name KERNEL sharedKernel\nstatic KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n".to_string(),
                "`flight-compiler: export-name` item `KERNEL` must be public".to_string(),
            ),
        ];

        for (items, expected) in cases {
            let source = if let Some(directive) = items.strip_prefix("//! ") {
                let (directive, rest) = directive.split_once('\n').unwrap();
                format!("//! {directive}\n{declarations}\n{rest}")
            } else {
                format!("{declarations}\n{items}")
            };
            assert_eq!(
                compile_typescript(&source, None).unwrap_err().to_string(),
                expected,
                "{source}"
            );
        }

        let auditor_repros = [
            (
                r#"
use std::sync::LazyLock;

pub struct Kernel {
    pub scale: i32,
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| create_kernel(0));

pub fn create_kernel(divisor: i32) -> Kernel {
    return Kernel { scale: 1 / divisor };
}
"#,
                "it applies `/` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust",
            ),
            (
                r#"
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::LazyLock;

static CLONES: AtomicU32 = AtomicU32::new(0);

pub struct Seed {
    pub scale: f64,
}

impl Clone for Seed {
    fn clone(&self) -> Self {
        CLONES.fetch_add(1, Ordering::SeqCst);
        Self { scale: self.scale }
    }
}

pub struct Kernel {
    pub scale: f64,
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub fn create_kernel() -> Kernel {
    let seed = Seed { scale: 1.0 };
    let cloned = seed.clone();
    return Kernel { scale: cloned.scale };
}

pub fn get_clones() -> u32 {
    return CLONES.fetch_add(0, Ordering::SeqCst);
}
"#,
                "it calls `.clone()`, and a method name does not prove which operation its receiver performs",
            ),
        ];
        for (source, reason) in auditor_repros {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                unsafe_initializer("KERNEL", reason)
            );
        }

        let ordered = format!(
            "{declarations}\npub static LIMIT: f64 = 2.0;\n\npub static FIRST: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub static SECOND: LazyLock<Kernel> = LazyLock::new(|| Kernel {{ scale: FIRST.scale * 1.0 + LIMIT * -0.5 }});\n\npub static THIRD: LazyLock<Kernel> = LazyLock::new(|| {{\n    let mut unused: Option<Vec<f64>> = Some(Vec::new());\n    unused = None;\n    return Kernel {{ scale: 1.0f64 / 3.0 + -2.0 }};\n}});\n"
        );
        let output = compile_typescript(&ordered, None).unwrap();
        assert!(output.contains("export const FIRST: Kernel = createKernel();\n"));
        assert!(output.contains(
            "export const SECOND: Kernel = { scale: FIRST.scale * 1.0 + LIMIT * -0.5 };\n"
        ));
        assert!(output.contains("export const THIRD: Kernel = (() => {\n"));
    }

    #[test]
    fn parenthesizes_struct_literals_returned_by_expression_closures() {
        let source = r#"
pub struct Segment {
    pub x: f64,
    pub y: f64,
}

pub fn copy_segments(source: &[Segment]) -> Vec<Segment> {
    return source.iter().map(|s| Segment { x: s.x, y: s.y }).collect();
}

pub fn make_origins(count: usize) -> Vec<Segment> {
    let make = |_index: usize| -> Segment {
        return Segment { x: 0.0, y: 0.0 };
    };
    let mut out: Vec<Segment> = Vec::new();
    for index in 0..count {
        out.push(make(index));
    }
    return out;
}

pub fn scale_values(values: &[f64]) -> Vec<f64> {
    return values.iter().map(|value| value * 2.0).collect();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("source.map((s) => ({ x: s.x, y: s.y }))"));
        assert!(output.contains("return { x: 0.0, y: 0.0 };\n"));
        assert!(!output.contains("(({ x: 0.0"));
        assert!(output.contains("values.map((value) => value * 2.0)"));
    }

    #[test]
    fn erases_box_only_when_its_owner_is_the_standard_box() {
        let mesh = |prelude: &str, boxed: &str| {
            format!(
                "{prelude}use flight_entity::Float32Array;\n\npub struct Mesh {{\n    pub vertices: {boxed}<Float32Array>,\n}}\n\npub fn sample_count(mesh: &Mesh, extra: {boxed}<Float32Array>) -> usize {{\n    return mesh.vertices.len() + extra.len();\n}}\n"
            )
        };
        let erased = "export interface Mesh {\n  vertices: Float32Array;\n}\n";

        for (prelude, boxed) in [
            ("", "std::boxed::Box"),
            ("", "::std::boxed::Box"),
            ("use std::boxed::Box as Owned;\n", "Owned"),
            ("use std::boxed;\n", "boxed::Box"),
            ("extern crate alloc;\n\n", "alloc::boxed::Box"),
            (
                "#![no_std]\n\nextern crate alloc;\n\nuse alloc::boxed::Box;\n",
                "Box",
            ),
        ] {
            let output = compile_typescript(&mesh(prelude, boxed), None).unwrap();
            assert!(output.contains(erased), "{prelude}{boxed}:\n{output}");
            assert!(
                output.contains("export function sampleCount(mesh: Readonly<Mesh>, extra: Float32Array): number {"),
                "{prelude}{boxed}:\n{output}"
            );
        }

        for (prelude, boxed) in [
            ("pub struct Box<T> {\n    pub value: T,\n}\n\n", "Box"),
            ("use flight_storage::Box;\n", "Box"),
            ("use flight_storage::Owned as Box;\n", "Box"),
            ("use flight_storage::*;\n", "Box"),
            ("use crate::storage::Box;\n", "Box"),
            ("#![no_std]\n\n", "Box"),
            ("use flight_storage::Box as Owned;\n", "Owned"),
        ] {
            let source = mesh(prelude, boxed);
            let output = compile_typescript(&source, None);
            let output = output.as_deref().unwrap_or("");
            assert!(!output.contains(erased), "{source}\n{output}");
            assert!(
                !output.contains("extra: Float32Array)"),
                "{source}\n{output}"
            );
        }
    }

    #[test]
    fn erases_boxed_typed_array_aliases_to_typed_arrays() {
        let source = r#"
use flight_entity::{Float32Array, Float64Array, Int16Array, Uint32Array};

pub struct Mesh {
    pub vertices: Box<Float32Array>,
    pub indices: Box<Uint32Array>,
    pub weights: Box<Float64Array>,
    pub names: Box<Vec<f64>>,
}

pub fn sample_count(mesh: &Mesh, extra: Box<Int16Array>) -> usize {
    return mesh.vertices.len() + extra.len();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export interface Mesh {\n  vertices: Float32Array;\n  indices: Uint32Array;\n  weights: Float64Array;\n  names: Box<number[]>;\n}\n"
        ));
        assert!(output.contains(
            "export function sampleCount(mesh: Readonly<Mesh>, extra: Int16Array): number {"
        ));
        assert!(!output.contains("Box<Float32Array>"));
        assert!(!output.contains("Box<Int16Array>"));
    }

    #[test]
    fn converts_nested_literal_and_sibling_nullable_fields_through_the_cli() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-nullable-fields-cli-{}",
            std::process::id()
        ));
        let source_root = directory.join("flight-nest").join("src");
        std::fs::create_dir_all(&source_root).unwrap();
        let modules = [
            (
                "outer",
                r#"//! flight-compiler: nullable-option Inner.contour

pub struct Inner {
    pub contour: Option<f64>,
}

pub struct Outer {
    pub inner: Inner,
    pub label: f64,
}

pub fn literal_present(value: Option<f64>) -> bool {
    return Inner { contour: value }.contour.is_some();
}

pub fn make_outer(value: Option<f64>) -> Outer {
    return Outer {
        inner: Inner { contour: value },
        label: 1.0,
    };
}

pub fn nested_or(outer: &Outer) -> f64 {
    return outer.inner.contour.unwrap_or(-1.0);
}

pub fn nested_present(outer: &Outer) -> bool {
    return outer.inner.contour.is_some();
}

pub fn set_nested(outer: &mut Outer, value: Option<f64>) {
    outer.inner.contour = value;
}
"#,
            ),
            (
                "wide",
                r#"//! flight-compiler: nullable-options

pub struct Wide {
    pub value: Option<f64>,
}
"#,
            ),
            (
                "builder",
                r#"use crate::outer::Inner;
use crate::wide::Wide;

pub fn build_inner(value: Option<f64>) -> Inner {
    return Inner { contour: value };
}

pub fn build_wide(value: Option<f64>) -> Wide {
    return Wide { value };
}

pub fn wide_present(wide: &Wide) -> bool {
    return wide.value.is_some();
}
"#,
            ),
        ];
        for (name, source) in modules {
            std::fs::write(source_root.join(format!("{name}.rs")), source).unwrap();
        }
        let generate = |name: &str| {
            let source = source_root.join(format!("{name}.rs"));
            let output = source.with_extension("ts");
            let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
            command
                .arg("generate")
                .arg("--source")
                .arg(&source)
                .arg("--out")
                .arg(&output);
            for (other, _) in modules {
                if other != name {
                    command
                        .arg("--alias-source")
                        .arg(source_root.join(format!("{other}.rs")));
                }
            }
            let result = command.output().unwrap();
            assert_eq!(
                result.status.code(),
                Some(0),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
            return std::fs::read_to_string(output).unwrap();
        };

        let outer = generate("outer");
        for expected in [
            "  return (({ contour: (value) ?? null }.contour) ?? undefined) !== undefined;\n",
            "  return { inner: { contour: (value) ?? null }, label: 1.0 };\n",
            "  return (((outer.inner.contour) ?? undefined) ?? -1.0);\n",
            "  return ((outer.inner.contour) ?? undefined) !== undefined;\n",
            "  outer.inner.contour = (value) ?? null;\n",
        ] {
            assert!(outer.contains(expected), "{expected}\n{outer}");
        }
        let builder = generate("builder");
        for expected in [
            "  return { contour: (value) ?? null };\n",
            "  return { value: (value) ?? null };\n",
            "  return ((wide.value) ?? undefined) !== undefined;\n",
        ] {
            assert!(builder.contains(expected), "{expected}\n{builder}");
        }
        let wide = generate("wide");
        assert!(wide.contains("value: number | null;"), "{wide}");
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn resolves_nullable_fields_through_source_type_alias_chains() {
        let module = |path, source| ModuleSource { path, source };
        let a = r#"//! flight-compiler: nullable-option Inner.contour

pub struct Inner {
    pub contour: Option<f64>,
}

pub type SharedInner = Inner;

pub fn make_inner(value: Option<f64>) -> SharedInner {
    return Inner { contour: value };
}
"#;
        let b = r#"use crate::a::SharedInner;

pub type Chained = SharedInner;

pub type ChainedArc = std::sync::Arc<Chained>;

pub type Loop = Cycle;

pub type Cycle = Loop;

pub struct Outer {
    pub chained: Chained,
    pub shared: ChainedArc,
}

pub fn chained_present(outer: &Outer) -> bool {
    return outer.chained.contour.is_some();
}

pub fn shared_or(outer: &Outer) -> f64 {
    return outer.shared.contour.unwrap_or(-1.0);
}

pub fn alias_present(inner: &Chained) -> bool {
    return inner.contour.is_some();
}
"#;
        let output = compile_typescript_with_module_sources(
            module("crates/flight-alias/src/b.rs", b),
            None,
            &[module("crates/flight-alias/src/a.rs", a)],
            &[],
        )
        .unwrap();
        assert!(
            output.contains("  return ((outer.chained.contour) ?? undefined) !== undefined;\n"),
            "{output}"
        );
        assert!(
            output.contains("  return (((outer.shared.contour) ?? undefined) ?? -1.0);\n"),
            "{output}"
        );
        assert!(
            output.contains("  return ((inner.contour) ?? undefined) !== undefined;\n"),
            "{output}"
        );

        for alias in [
            "pub type Shared = Loop;\n\npub type Loop = Shared;\n",
            "pub type Shared<T> = T;\n",
        ] {
            let shared = if alias.contains("<T>") {
                "Shared<Inner>"
            } else {
                "Shared"
            };
            let source = format!(
                "//! flight-compiler: nullable-option Inner.contour\n\npub struct Inner {{\n    pub contour: Option<f64>,\n}}\n\n{alias}\npub struct Outer {{\n    pub inner: {shared},\n}}\n\npub fn present(outer: &Outer) -> bool {{\n    return outer.inner.contour.is_some();\n}}\n"
            );
            let output = compile_typescript_with_module_sources(
                ModuleSource {
                    path: "crates/flight-alias/src/c.rs",
                    source: &source,
                },
                None,
                &[],
                &[],
            )
            .unwrap();
            assert!(!output.contains("?? undefined"), "{source}\n{output}");
        }
    }

    #[test]
    fn gives_cross_source_readonly_entity_initializers_the_construction_view() {
        let module = |path, source| ModuleSource { path, source };
        let records = r#"//! flight-compiler: readonly-fields Marker

pub struct Marker {
    pub value: f64,
    runtime: EntityRuntimeSlot,
}

pub struct Plain {
    pub value: f64,
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(Marker);
flight_entity::impl_entity!(Plain);
"#;
        let builder = r#"use crate::records::{Marker, Plain};

pub fn initialize_marker_value(out: &mut Marker, value: f64) {
    out.value = value;
}

pub fn initialize_plain_value(out: &mut Plain, value: f64) {
    out.value = value;
}

pub fn read_marker_value(marker: &mut Marker) -> f64 {
    return marker.value;
}
"#;
        let output = compile_typescript_with_module_sources(
            module("crates/flight-records/src/builder.rs", builder),
            Some("@flighthq/entity/contract"),
            &[module("crates/flight-records/src/records.rs", records)],
            &[],
        )
        .unwrap();
        assert!(
            output.contains(
                "import type { EntityConstruction } from \"@flighthq/entity/contract\";\n"
            ),
            "{output}"
        );
        assert!(
            output.contains(
                "export function initializeMarkerValue(out: EntityConstruction<MarkerRaw>, value: number): void {\n"
            ),
            "{output}"
        );
        assert!(
            output.contains(
                "export function initializePlainValue(out: PlainRaw, value: number): void {\n"
            ),
            "{output}"
        );
        assert!(
            output.contains("export function readMarkerValue(marker: MarkerRaw): number {\n"),
            "{output}"
        );

        // An unresolved owner keeps the public type: the builder's `Marker` is its own local struct.
        let shadowed = r#"pub struct Marker {
    pub value: f64,
}

pub fn initialize_marker_value(out: &mut Marker, value: f64) {
    out.value = value;
}
"#;
        let output = compile_typescript_with_module_sources(
            module("crates/flight-records/src/shadowed.rs", shadowed),
            Some("@flighthq/entity/contract"),
            &[module("crates/flight-records/src/records.rs", records)],
            &[],
        )
        .unwrap();
        assert!(!output.contains("EntityConstruction"), "{output}");
    }

    #[test]
    fn constructs_typed_arrays_returned_from_fixed_array_functions() {
        let source = r#"pub fn coefficients(p: f64) -> [f64; 4] {
    return [p, 3.0 * p, 1.0, 0.0];
}

pub fn zeros() -> [f32; 3] {
    return [0.0; 3];
}

pub fn flags() -> [bool; 2] {
    return [true, false];
}

pub fn copied(values: [f64; 2]) -> [f64; 2] {
    return values;
}

pub fn listed(p: f64) -> Vec<f64> {
    return vec![p, p];
}
"#;
        let output = compile_typescript(source, None).unwrap();
        assert!(
            output.contains("  return new Float64Array([p, 3.0 * p, 1.0, 0.0]);\n"),
            "{output}"
        );
        assert!(
            output.contains("  return new Float32Array(3).fill(0.0);\n"),
            "{output}"
        );
        assert!(output.contains("  return [true, false];\n"), "{output}");
        assert!(output.contains("  return values;\n"), "{output}");
        assert!(output.contains("  return [p, p];\n"), "{output}");
    }

    #[test]
    fn emits_the_final_option_match_arm_as_the_exhaustive_else() {
        let source = r#"pub fn pattern(dash: Option<Vec<f64>>) -> Vec<f64> {
    let pattern: Vec<f64> = match dash {
        Some(values) => values,
        None => Vec::new(),
    };
    return pattern;
}

pub fn absent_first(value: Option<f64>) -> f64 {
    let resolved: f64 = match value {
        None => -1.0,
        Some(present) => present,
    };
    return resolved;
}
"#;
        let output = compile_typescript(source, None).unwrap();
        assert!(
            output.contains(
                "  const pattern: number[] = (() => {\n  const matchValue = dash;\n  if (matchValue !== undefined) {\n    const values = matchValue;\n    return values;\n  }\n  else {\n"
            ),
            "{output}"
        );
        assert!(
            output.contains(
                "  if (matchValue === undefined) {\n    return -1.0;\n  }\n  else {\n    const present = matchValue;\n    return present;\n  }\n"
            ),
            "{output}"
        );
        assert!(!output.contains("else if (matchValue"), "{output}");
    }

    #[test]
    fn lowers_module_qualified_string_union_variants() {
        let module = |path, source| ModuleSource { path, source };
        let kinds = r#"//! flight-compiler: string-union Kind

pub enum Kind {
    First,
    SecondKind,
}
"#;
        let user = r#"use crate::kinds::Kind;

pub fn second() -> Kind {
    return crate::kinds::Kind::SecondKind;
}

pub fn first() -> Kind {
    return Kind::First;
}
"#;
        let output = compile_typescript_with_module_sources(
            module("crates/flight-kinds/src/user.rs", user),
            None,
            &[module("crates/flight-kinds/src/kinds.rs", kinds)],
            &[],
        )
        .unwrap();
        assert!(output.contains("  return \"secondKind\";\n"), "{output}");
        assert!(output.contains("  return \"first\";\n"), "{output}");
        assert!(!output.contains("crate."), "{output}");
    }

    #[test]
    fn keeps_the_string_union_type_of_mutable_variant_bindings() {
        let module = |path, source| ModuleSource { path, source };
        let reasons = r#"//! flight-compiler: string-union Reason

pub enum Reason {
    Ok,
    Failed,
}

pub enum Plain {
    First,
    Second,
}
"#;
        let checker = r#"use crate::reasons::{Plain, Reason};

pub fn check(failed: bool, later: bool) -> Reason {
    let mut issue = if failed { Reason::Failed } else { Reason::Ok };
    if later {
        issue = Reason::Failed;
    }
    return issue;
}

pub fn pick(index: i32) -> Reason {
    let mut chosen = match index {
        0 => Reason::Ok,
        _ => Reason::Failed,
    };
    chosen = Reason::Ok;
    return chosen;
}

pub fn constant() -> Reason {
    let fixed = Reason::Ok;
    return fixed;
}

pub fn plain() -> Plain {
    let mut value = Plain::First;
    value = Plain::Second;
    return value;
}

pub fn mixed(flag: bool) -> f64 {
    let mut count = if flag { 1.0 } else { 0.0 };
    count += 1.0;
    return count;
}
"#;
        let output = compile_typescript_with_module_sources(
            module("crates/flight-reasons/src/checker.rs", checker),
            None,
            &[module("crates/flight-reasons/src/reasons.rs", reasons)],
            &[],
        )
        .unwrap();
        assert!(
            output.contains("  let issue: Reason = failed ? \"failed\" : \"ok\";\n"),
            "{output}"
        );
        assert!(output.contains("  let chosen: Reason = "), "{output}");
        assert!(output.contains("  const fixed = \"ok\";\n"), "{output}");
        assert!(output.contains("  let value = "), "{output}");
        assert!(!output.contains("let value: "), "{output}");
        assert!(output.contains("  let count = "), "{output}");
        assert!(!output.contains("let count: "), "{output}");
    }

    #[test]
    fn resolves_nullable_fields_through_proven_standard_arc() {
        let compile = |source: &str| {
            return compile_typescript_with_module_sources(
                ModuleSource {
                    path: "crates/flight-share/src/share.rs",
                    source,
                },
                None,
                &[],
                &[],
            )
            .unwrap();
        };
        let output = compile(
            r#"//! flight-compiler: nullable-option Inner.contour

use std::sync::Arc;

pub struct Inner {
    pub contour: Option<f64>,
}

pub struct Holder {
    pub inner: Arc<Inner>,
    pub qualified: std::sync::Arc<Inner>,
}

pub fn holder_present(holder: &Holder) -> bool {
    return holder.inner.contour.is_some();
}

pub fn make_holder(value: Option<f64>) -> Holder {
    return Holder {
        inner: Arc::new(Inner { contour: value }),
        qualified: Arc::new(Inner { contour: value }),
    };
}

pub fn qualified_or(holder: &Holder) -> f64 {
    return holder.qualified.contour.unwrap_or(-1.0);
}

pub fn shared_present(shared: &Arc<Inner>) -> bool {
    return shared.contour.is_some();
}
"#,
        );
        assert!(
            output.contains("  return ((holder.inner.contour) ?? undefined) !== undefined;\n"),
            "{output}"
        );
        assert!(
            output.contains("  return (((holder.qualified.contour) ?? undefined) ?? -1.0);\n"),
            "{output}"
        );
        assert!(
            output.contains("  return ((shared.contour) ?? undefined) !== undefined;\n"),
            "{output}"
        );

        for arc in ["use flight_cells::Arc;\n", "use flight_cells::*;\n"] {
            let source = format!(
                "//! flight-compiler: nullable-option Inner.contour\n\n{arc}\npub struct Inner {{\n    pub contour: Option<f64>,\n}}\n\npub struct Holder {{\n    pub inner: Arc<Inner>,\n}}\n\npub fn holder_present(holder: &Holder) -> bool {{\n    return holder.inner.contour.is_some();\n}}\n"
            );
            let output = compile(&source);
            assert!(!output.contains("?? undefined"), "{source}\n{output}");
        }
    }

    #[test]
    fn resolves_nullable_fields_through_canonical_standard_arc_paths() {
        let source = r#"//! flight-compiler: nullable-option Inner.contour

extern crate alloc as heap;

use std as standard;
use std::sync as synchronization;

pub struct Inner {
    pub contour: Option<f64>,
}

pub struct Holder {
    pub absolute: ::std::sync::Arc<Inner>,
    pub allocated: heap::sync::Arc<Inner>,
    pub module_alias: synchronization::Arc<Inner>,
    pub root_alias: standard::sync::Arc<Inner>,
}

pub fn all_present(holder: &Holder) -> bool {
    return holder.absolute.contour.is_some()
        && holder.allocated.contour.is_some()
        && holder.module_alias.contour.is_some()
        && holder.root_alias.contour.is_some();
}
"#;
        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-share/src/share.rs",
                source,
            },
            None,
            &[],
            &[],
        )
        .unwrap();
        for field in ["absolute", "allocated", "moduleAlias", "rootAlias"] {
            let expected = format!("((holder.{field}.contour) ?? undefined) !== undefined");
            assert!(output.contains(&expected), "{expected}\n{output}");
        }

        for (binding, shared) in [
            (
                "use flight_cells as standard;",
                "standard::sync::Arc<Inner>",
            ),
            (
                "use flight_cells::sync as synchronization;",
                "synchronization::Arc<Inner>",
            ),
        ] {
            let source = format!(
                "//! flight-compiler: nullable-option Inner.contour\n\n{binding}\n\npub struct Inner {{\n    pub contour: Option<f64>,\n}}\n\npub struct Holder {{\n    pub inner: {shared},\n}}\n\npub fn present(holder: &Holder) -> bool {{\n    return holder.inner.contour.is_some();\n}}\n"
            );
            let output = compile_typescript_with_module_sources(
                ModuleSource {
                    path: "crates/flight-share/src/foreign.rs",
                    source: &source,
                },
                None,
                &[],
                &[],
            )
            .unwrap();
            assert!(!output.contains("?? undefined"), "{source}\n{output}");
        }
    }

    #[test]
    fn resolves_nullable_alias_ownership_through_crate_visible_source_uses() {
        let owner = r#"//! flight-compiler: nullable-option Inner.contour

pub struct Inner {
    pub contour: Option<f64>,
}

pub(crate) type SharedInner = std::sync::Arc<Inner>;
"#;
        let consumer = r#"use crate::owner as renamed_owner;
use crate::owner::SharedInner as DirectShared;

pub struct Holder {
    pub direct: DirectShared,
    pub renamed: renamed_owner::SharedInner,
}

pub fn all_present(holder: &Holder) -> bool {
    return holder.direct.contour.is_some() && holder.renamed.contour.is_some();
}
"#;
        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-share/src/consumer.rs",
                source: consumer,
            },
            None,
            &[ModuleSource {
                path: "crates/flight-share/src/owner.rs",
                source: owner,
            }],
            &[],
        )
        .unwrap();
        for field in ["direct", "renamed"] {
            let expected = format!("((holder.{field}.contour) ?? undefined) !== undefined");
            assert!(output.contains(&expected), "{expected}\n{output}");
        }

        let private_owner = owner.replace("pub(crate) type SharedInner", "type SharedInner");
        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-share/src/consumer.rs",
                source: consumer,
            },
            None,
            &[ModuleSource {
                path: "crates/flight-share/src/owner.rs",
                source: &private_owner,
            }],
            &[],
        )
        .unwrap();
        assert!(!output.contains("?? undefined"), "{output}");
    }

    #[test]
    fn resolves_nullable_private_aliases_through_qualified_same_module_paths() {
        let source = r#"//! flight-compiler: nullable-option Inner.contour

pub struct Inner {
    pub contour: Option<f64>,
}

type SharedInner = std::sync::Arc<Inner>;

pub struct Holder {
    pub self_qualified: self::SharedInner,
    pub crate_qualified: crate::owner::SharedInner,
}

pub fn all_present(holder: &Holder) -> bool {
    return holder.self_qualified.contour.is_some()
        && holder.crate_qualified.contour.is_some();
}
"#;
        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-share/src/owner.rs",
                source,
            },
            None,
            &[],
            &[],
        )
        .unwrap();
        for field in ["selfQualified", "crateQualified"] {
            let expected = format!("((holder.{field}.contour) ?? undefined) !== undefined");
            assert!(output.contains(&expected), "{expected}\n{output}");
        }
    }

    #[test]
    fn converts_between_nullable_and_ordinary_options_at_every_boundary() {
        let source = r#"
//! flight-compiler: nullable-option find_scale nullable_from_ordinary Explanation.contour

pub struct Explanation {
    pub contour: Option<f64>,
    pub detail: Option<f64>,
}

pub fn contour_present(values: &[f64]) -> bool {
    let explanation = explain(values);
    return explanation.contour.is_some();
}

pub fn count_present(value: Option<f64>) -> i32 {
    if value.is_some() {
        return 1;
    }
    return 0;
}

pub fn explain(values: &[f64]) -> Explanation {
    let mut out = Explanation {
        contour: lookup(values),
        detail: find_scale(values),
    };
    if values.len() > 2 {
        out.contour = find_scale(values);
        out.detail = lookup(values);
    }
    return out;
}

pub fn find_scale(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    return Some(values[0]);
}

pub fn lookup(values: &[f64]) -> Option<f64> {
    if values.len() > 1 {
        return Some(values[1]);
    }
    return None;
}

pub fn nullable_from_ordinary(values: &[f64]) -> Option<f64> {
    return lookup(values);
}

pub fn ordinary_from_nullable(values: &[f64]) -> Option<f64> {
    return find_scale(values);
}

pub fn present_through_argument(values: &[f64]) -> i32 {
    return count_present(find_scale(values));
}
"#;

        let output = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-scales/src/scales.rs",
                source,
            },
            None,
            &[],
            &[],
        )
        .unwrap();

        assert!(output.contains("  return ((explanation.contour) ?? undefined) !== undefined;\n"));
        assert!(output.contains(
            "  let out: Explanation = { contour: (lookup(values)) ?? null, detail: ((findScale(values)) ?? undefined) };\n"
        ));
        assert!(output.contains("    out.contour = (findScale(values)) ?? null;\n"));
        assert!(output.contains("    out.detail = lookup(values);\n"));
        assert!(output.contains("  return (lookup(values)) ?? null;\n"));
        assert!(output.contains("  return ((findScale(values)) ?? undefined);\n"));
        assert!(output.contains("  return countPresent(((findScale(values)) ?? undefined));\n"));
        assert!(output.contains("  return values[0];\n"));
        assert!(!output.contains("!== null"));
    }

    #[test]
    fn scopes_nullable_option_fields_and_defaults_by_source_identity() {
        let module = |path, source| ModuleSource { path, source };
        let compile = |source: ModuleSource<'_>, aliases: &[ModuleSource<'_>]| {
            compile_typescript_with_module_sources(
                source,
                Some("@flighthq/entity/contract"),
                aliases,
                &[],
            )
        };
        let sibling = "//! flight-compiler: nullable-option Collision.value\n\npub struct Collision {\n    pub value: Option<f64>,\n}\n";
        let local = "pub struct Collision {\n    pub value: Option<f64>,\n}\n\npub fn make() -> Collision {\n    return Collision { value: None };\n}\n";
        let output = compile(
            module("crates/flight-probe/src/local.rs", local),
            &[module("crates/flight-probe/src/sibling.rs", sibling)],
        )
        .unwrap();
        assert!(output.contains("export interface Collision {\n  value?: number;\n}\n"));
        assert!(output.contains("  return { value: undefined };\n"));

        let imported = "use crate::sibling::Collision;\n\npub fn make() -> Collision {\n    return Collision { value: None };\n}\n\npub fn make_from(value: Option<f64>) -> Collision {\n    let out = Collision { value };\n    return out;\n}\n";
        let output = compile(
            module("crates/flight-probe/src/imported.rs", imported),
            &[module("crates/flight-probe/src/sibling.rs", sibling)],
        )
        .unwrap();
        assert!(output.contains("  return { value: null };\n"), "{output}");
        assert!(
            output.contains("  const out: Collision = { value: (value) ?? null };\n"),
            "{output}"
        );

        let entities = "//! flight-compiler: nullable-option Marker.contour\n\nuse flight_entity::{EntityRuntimeSlot, allocate_entity};\n\n#[derive(Default)]\npub struct Marker {\n    runtime: EntityRuntimeSlot,\n    pub contour: Option<f64>,\n    pub detail: Option<f64>,\n    pub scale: f64,\n}\n\nflight_entity::impl_entity!(Marker);\n\npub fn create_marker() -> Marker {\n    let out: Marker = allocate_entity();\n    return out;\n}\n";
        let output = compile(module("crates/flight-probe/src/marker.rs", entities), &[]).unwrap();
        assert!(
            output.contains("  contour: number | null;\n  detail?: number;\n"),
            "{output}"
        );
        assert!(
            output.contains("Object.assign(allocateEntity<MarkerRaw>(), { contour: null, detail: undefined, scale: 0 })"),
            "{output}"
        );

        let module_wide = "//! flight-compiler: nullable-options\n\nuse flight_entity::{EntityRuntimeSlot, allocate_entity};\n\n#[derive(Default)]\npub struct Marker {\n    runtime: EntityRuntimeSlot,\n    pub contour: Option<f64>,\n}\n\nflight_entity::impl_entity!(Marker);\n\npub fn create_marker() -> Marker {\n    let out: Marker = allocate_entity();\n    return out;\n}\n";
        let output = compile(
            module("crates/flight-probe/src/marker.rs", module_wide),
            &[],
        )
        .unwrap();
        assert!(
            output.contains("Object.assign(allocateEntity<MarkerRaw>(), { contour: null })"),
            "{output}"
        );
    }

    #[test]
    fn represents_designated_option_returns_and_fields_as_nullable() {
        let source = r#"
//! flight-compiler: nullable-option find_scale Explanation.contour

pub struct Explanation {
    pub supported: bool,
    pub contour: Option<f64>,
    pub detail: Option<f64>,
}

pub fn find_scale(values: &[f64], tolerance: Option<f64>) -> Option<f64> {
    let limit = tolerance.unwrap_or(0.25);
    if values.is_empty() {
        return None;
    }
    if values[0] > limit {
        return Some(values[0]);
    }
    return lookup(values);
}

pub fn lookup(values: &[f64]) -> Option<f64> {
    if values.len() > 1 {
        return Some(values[1]);
    }
    return None;
}

pub fn explain(values: &[f64]) -> Explanation {
    let found = lookup(values);
    let scale = find_scale(values, None);
    if let Some(value) = scale {
        return Explanation { supported: value > 0.0, contour: found, detail: None };
    }
    return Explanation { supported: false, contour: None, detail: found };
}
"#;
        let report = r#"
use crate::scales::*;

pub fn has_scale(values: &[f64]) -> bool {
    let scale = find_scale(values, Some(0.5));
    return scale.is_some();
}

pub fn contour_or_zero(values: &[f64]) -> f64 {
    let explanation = explain(values);
    return explanation.contour.unwrap_or(0.0);
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export interface Explanation {\n  supported: boolean;\n  contour: number | null;\n  detail?: number;\n}\n"
        ));
        assert!(output.contains(
            "export function findScale(values: Readonly<number[]>, tolerance?: number): number | null {"
        ));
        assert!(output.contains("    return null;\n"));
        assert!(output.contains("    return values[0];\n"));
        assert!(output.contains("  return (lookup(values)) ?? null;\n"));
        assert!(
            output.contains(
                "export function lookup(values: Readonly<number[]>): number | undefined {"
            )
        );
        assert!(output.contains("  return undefined;\n"));
        assert!(
            output.contains("  const scale = ((findScale(values, undefined)) ?? undefined);\n")
        );
        assert!(output.contains("  if (scale !== undefined) {\n"));
        assert!(output.contains(
            "return { supported: value > 0.0, contour: (found) ?? null, detail: undefined };"
        ));
        assert!(output.contains("return { supported: false, contour: null, detail: found };"));

        let sibling = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-scales/src/report.rs",
                source: report,
            },
            None,
            &[ModuleSource {
                path: "crates/flight-scales/src/scales.rs",
                source,
            }],
            &[],
        )
        .unwrap();
        assert!(sibling.contains("  const scale = ((findScale(values, 0.5)) ?? undefined);\n"));
        assert!(sibling.contains("  return scale !== undefined;\n"));
        assert!(sibling.contains("  return (((explanation.contour) ?? undefined) ?? 0.0);\n"));
    }

    #[test]
    fn rejects_invalid_nullable_option_directives() {
        let cases = [
            (
                "//! flight-compiler: nullable-option\npub fn f() -> Option<f64> { return None; }\n",
                "`flight-compiler: nullable-option` requires at least one `function` or `Struct.field`",
            ),
            (
                "//! flight-compiler: nullable-option Shape.radius.inner\npub struct Shape { pub radius: Option<f64> }\n",
                "`flight-compiler: nullable-option` item `Shape.radius.inner` is not `function` or `Struct.field`",
            ),
            (
                "//! flight-compiler: nullable-option f f\npub fn f() -> Option<f64> { return None; }\n",
                "duplicate `flight-compiler: nullable-option` item `f`",
            ),
            (
                "//! flight-compiler: nullable-option missing\npub fn f() -> Option<f64> { return None; }\n",
                "`flight-compiler: nullable-option` item `missing` must name a function returning `Option` or an `Option` field of a struct in this source",
            ),
            (
                "//! flight-compiler: nullable-option f\npub fn f() -> f64 { return 1.0; }\n",
                "`flight-compiler: nullable-option` item `f` must name a function returning `Option` or an `Option` field of a struct in this source",
            ),
            (
                "//! flight-compiler: nullable-option Shape.radius\npub struct Shape { pub radius: f64 }\n",
                "`flight-compiler: nullable-option` item `Shape.radius` must name a function returning `Option` or an `Option` field of a struct in this source",
            ),
        ];
        for (source, expected) in cases {
            assert_eq!(
                compile_typescript(source, None).unwrap_err().to_string(),
                expected,
                "{source}"
            );
        }
    }

    #[test]
    fn lowers_lazy_lock_statics_with_proven_operators_and_constructors() {
        let source = r#"
use std::sync::*;
use std::sync::LazyLock;

pub struct Kernel {
    pub enabled: bool,
    pub scale: f64,
    pub tags: Vec<f64>,
}

pub static LIMIT: f64 = 2.0;

pub static CHECKED: LazyLock<Kernel> = LazyLock::new(|| create_checked_kernel(3, true));

pub fn create_checked_kernel(count: i32, flag: bool) -> Kernel {
    let tags: Vec<f64> = Vec::new();
    let mut out = Kernel {
        enabled: count > 0 && count <= 4 && flag == true,
        scale: -LIMIT,
        tags,
    };
    let _shared = Arc::new(1.0f64);
    let _absolute: Vec<f64> = ::std::vec::Vec::new();
    if out.scale < LIMIT {
        out.scale += 0.5 * (LIMIT - 1.0 / 4.0);
    }
    return out;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export const CHECKED: Kernel = createCheckedKernel(3, true);\n"));
        assert!(output.contains("count > 0 && count <= 4 && flag === true"));
        assert!(output.contains("  out.scale += 0.5 * (LIMIT - 1.0 / 4.0);\n"));
    }

    #[test]
    fn proves_lazy_lock_defaults_across_the_whole_crate() {
        let visibility_paths = (0..4)
            .map(|index| format!("crates/flight-kernel/src/native_{index}.rs"))
            .collect::<Vec<_>>();
        let compile = |source: &str, visibility: &[&str]| {
            let visibility = visibility
                .iter()
                .zip(&visibility_paths)
                .map(|(source, path)| ModuleSource { path, source })
                .collect::<Vec<_>>();
            return compile_typescript_with_visibility_sources(
                ModuleSource {
                    path: "crates/flight-kernel/src/kernel.rs",
                    source,
                },
                Some("@flighthq/entity/contract"),
                &[],
                &[],
                &visibility,
            );
        };
        let unsafe_initializer = |reason: &str| {
            format!(
                "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}"
            )
        };
        let prelude = "use std::sync::LazyLock;\n\nuse flight_entity::{EntityRuntimeSlot, allocate_entity};\n\n";
        let factory = "\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {\n    let mut out: Kernel = allocate_entity();\n    out.scale = 2.0;\n    return out;\n}\n";
        let kernel = |declaration: &str| format!("{prelude}{declaration}{factory}");
        let derived = "#[derive(Debug, Clone, Default, PartialEq)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub tags: Vec<f64>,\n    pub label: String,\n    pub limit: Option<f64>,\n}\n";

        let output = compile(&kernel(derived), &[]).unwrap();
        assert!(output.contains("export const KERNEL: KernelRaw = createKernel();\n"));
        assert!(output.contains("allocateEntity<KernelRaw>()"));

        let pure_manual = "pub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub tags: Vec<f64>,\n    pub label: String,\n    pub limit: Option<f64>,\n    pub compute: fn(f64) -> f64,\n}\n\nimpl Default for Kernel {\n    fn default() -> Self {\n        return Kernel {\n            runtime: EntityRuntimeSlot::default(),\n            scale: 0.0,\n            tags: Vec::new(),\n            label: String::new(),\n            limit: None,\n            compute: identity,\n        };\n    }\n}\n\npub fn identity(value: f64) -> f64 {\n    return value;\n}\n";
        let pure_manual_factory = pure_manual.to_string()
            + "\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {\n    let mut out: Kernel = allocate_entity();\n    initialize_kernel(&mut out);\n    return out;\n}\n\npub fn initialize_kernel(out: &mut Kernel) {\n    out.compute = identity;\n}\n";
        let output = compile(&format!("{prelude}{pure_manual_factory}"), &[]).unwrap();
        assert!(output.contains("export const KERNEL: KernelRaw = createKernel();\n"));

        let hidden_impure = "use std::sync::atomic::{AtomicU32, Ordering};\n\nuse crate::kernel::Kernel;\n\nstatic DEFAULTS: AtomicU32 = AtomicU32::new(0);\n\nimpl Default for Kernel {\n    fn default() -> Kernel {\n        DEFAULTS.fetch_add(1, Ordering::SeqCst);\n        return Kernel { runtime: flight_entity::EntityRuntimeSlot::default(), scale: 0.0 };\n    }\n}\n";
        let plain =
            "pub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n}\n";
        let cases: [(String, Vec<&str>, String); 21] = [
            (
                kernel(plain),
                vec![],
                "`Kernel` has no `Default` implementation this crate shows, so a macro, a hidden module or nothing provides the one `allocate_entity` runs".to_string(),
            ),
            (
                kernel(plain),
                vec![hidden_impure],
                "the manual `Default` for `Kernel` must return one struct literal of `Kernel`, so its field values can be compared with the generated allocation".to_string(),
            ),
            (
                kernel(&format!("{plain}\nimpl Default for Kernel {{\n    fn default() -> Kernel {{\n        return Kernel {{ runtime: EntityRuntimeSlot::default(), scale: 7.0 }};\n    }}\n}}\n")),
                vec![],
                "the manual `Default` for `Kernel` sets `scale` to `7.0`, which the generated allocation does not reproduce".to_string(),
            ),
            (
                kernel(&format!("{plain}\nimpl Default for Kernel {{\n    fn default() -> Kernel {{\n        return Kernel {{ runtime: EntityRuntimeSlot::default(), scale: read_scale() }};\n    }}\n}}\n\npub fn read_scale() -> f64 {{\n    return flight_math::random();\n}}\n")),
                vec![],
                "the manual `Default` for `Kernel` sets `scale` to `read_scale ()`, which the generated allocation does not reproduce".to_string(),
            ),
            (
                kernel("pub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub compute: fn(f64) -> f64,\n}\n\nimpl Default for Kernel {\n    fn default() -> Kernel {\n        return Kernel { runtime: EntityRuntimeSlot::default(), scale: 0.0, compute: pick() };\n    }\n}\n\npub fn pick() -> fn(f64) -> f64 {\n    return flight_math::random_function();\n}\n"),
                vec![],
                "it calls `flight_math::random_function`, which is not a side-effect-free function of this crate".to_string(),
            ),
            (
                kernel("#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub inner: Inner,\n}\n\npub struct Inner {\n    pub value: f64,\n}\n\nimpl Default for Inner {\n    fn default() -> Inner {\n        return Inner { value: flight_math::random() };\n    }\n}\n"),
                vec![],
                "it calls `flight_math::random`, which is not a side-effect-free function of this crate".to_string(),
            ),
            (
                kernel("#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub inner: Inner,\n}\n\npub struct Inner {\n    pub value: f64,\n}\n"),
                vec![],
                "`Inner` has no `Default` implementation this crate shows, so a macro, a hidden module or nothing provides the one `allocate_entity` runs".to_string(),
            ),
            (
                kernel("#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub matrix: flight_geometry::Matrix,\n}\n"),
                vec![],
                "the `Default` of `flight_geometry::Matrix` (`flight_geometry::Matrix`) is not visible to the proof".to_string(),
            ),
            (
                kernel("#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n    pub tags: Vec,\n}\n\n#[derive(Default)]\npub struct Vec {\n    pub length: f64,\n}\n"),
                vec![],
                "the generated allocation defaults `Kernel.tags` by the spelling of `Vec`, which does not resolve to the standard type with that default".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}\nimpl Drop for Kernel {{\n    fn drop(&mut self) {{}}\n}}\n")),
                vec![],
                "the crate implements `Drop` for `Kernel`, which Rust runs implicitly".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["use crate::kernel::Kernel;\n\nimpl Drop for Kernel {\n    fn drop(&mut self) {}\n}\n"],
                "the crate implements `Drop` for `Kernel`, which Rust runs implicitly".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["use std::ops::Deref;\n\npub struct Wrapper {\n    pub value: f64,\n}\n\nimpl Deref for Wrapper {\n    type Target = f64;\n    fn deref(&self) -> &f64 {\n        return &self.value;\n    }\n}\n"],
                "the crate implements `Deref` for `Wrapper`, which Rust runs implicitly".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["use std::ops::DerefMut as Mutable;\n\npub struct Wrapper {\n    pub value: f64,\n}\n\nimpl Mutable for Wrapper {\n    fn deref_mut(&mut self) -> &mut f64 {\n        return &mut self.value;\n    }\n}\n"],
                "the crate implements `DerefMut` for `Wrapper`, which Rust runs implicitly".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["use flight_hidden::*;\n\npub struct Wrapper;\n\nimpl Finalize for Wrapper {}\n"],
                "it cannot resolve the trait of `impl Finalize for Wrapper`, which could be `Default`, `Drop` or `Deref`".to_string(),
            ),
            (
                kernel(&format!("use serde::Serialize;\n\n#[derive(Default, Serialize)]\n{plain}")),
                vec![],
                "the crate derives `Serialize`, which is not a standard derive and can generate any `impl`".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["#[derive(Clone, flight_macros::Tracked)]\npub struct Probe;\n"],
                "the crate derives `flight_macros::Tracked`, which is not a standard derive and can generate any `impl`".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["#[flight_macros::instrument]\npub fn probe() {}\n"],
                "the crate uses the attribute `#[flight_macros::instrument]`, which is not built in and can generate any item".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["#[cfg_attr(feature = \"trace\", tracked)]\npub fn probe() {}\n"],
                "the crate uses the attribute `#[tracked]`, which is not built in and can generate any item".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["macro_rules! finalize {\n    ($t:ty) => {\n        impl Drop for $t {\n            fn drop(&mut self) {}\n        }\n    };\n}\n\nfinalize!(crate::kernel::Kernel);\n"],
                "it cannot prove what the macro `finalize!` in this crate expands to, and a macro can generate any `impl`".to_string(),
            ),
            (
                kernel(&format!("#[derive(Default)]\n{plain}")),
                vec!["pub fn probe() -> Vec<u8> {\n    return vec![{\n        impl Drop for crate::kernel::Kernel {\n            fn drop(&mut self) {}\n        }\n        1\n    }];\n}\n"],
                "a macro invocation in this crate carries an `impl` or attribute in its arguments, which the proof cannot see".to_string(),
            ),
            (
                format!("{prelude}#[derive(Default)]\n{plain}\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {{\n    return wrap(allocate_entity());\n}}\n\npub fn wrap(kernel: Kernel) -> Kernel {{\n    return kernel;\n}}\n"),
                vec![],
                "it calls `allocate_entity` without a declared result type (a turbofish or an annotated `let`), so the `Default` it runs is not proven".to_string(),
            ),
        ];
        for (source, visibility, reason) in cases {
            assert_eq!(
                compile(&source, &visibility).unwrap_err().to_string(),
                unsafe_initializer(&reason),
                "{source}\n{visibility:?}"
            );
        }

        let turbofish = format!(
            "{prelude}#[derive(Default)]\n{plain}\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {{\n    return wrap(allocate_entity::<Kernel>());\n}}\n\npub fn wrap(kernel: Kernel) -> Kernel {{\n    return kernel;\n}}\n"
        );
        assert!(
            compile(&turbofish, &[])
                .unwrap()
                .contains("export const KERNEL: KernelRaw = createKernel();\n")
        );

        let visible_only = "use crate::kernel::Kernel;\n\npub struct HiddenPool {\n    pub size: f64,\n}\n\npub fn acquire_hidden_pool() -> f64 {\n    return 1.0;\n}\n\npub trait Undeclared {}\n";
        let output = compile(&kernel(derived), &[visible_only]).unwrap();
        assert!(output.contains("export const KERNEL: KernelRaw = createKernel();\n"));
        assert!(!output.contains("HiddenPool"));
        assert!(!output.contains("acquireHiddenPool"));
        assert!(!output.contains("Undeclared"));

        let without_lazy_lock = format!(
            "{prelude}{plain}\nimpl Drop for Kernel {{\n    fn drop(&mut self) {{}}\n}}\n\npub fn create_kernel() -> Kernel {{\n    let out: Kernel = allocate_entity();\n    return out;\n}}\n"
        );
        assert!(compile(&without_lazy_lock, &[]).is_ok());
    }

    #[test]
    fn rejects_hidden_default_and_drop_through_the_cli() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-lazy-lock-default-cli-{}",
            std::process::id()
        ));
        let source_root = directory.join("flight-kernel").join("src");
        std::fs::create_dir_all(&source_root).unwrap();
        let repro = source_root.join("lazy_lock_default_repro.rs");
        std::fs::write(
            &repro,
            r#"use std::sync::LazyLock;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_entity::{EntityRuntimeSlot, allocate_entity};

static DEFAULTS: AtomicU32 = AtomicU32::new(0);

pub struct Kernel {
    runtime: EntityRuntimeSlot,
    pub scale: f64,
}

flight_entity::impl_entity!(Kernel);

impl Default for Kernel {
    fn default() -> Kernel {
        DEFAULTS.fetch_add(1, Ordering::SeqCst);
        return Kernel {
            runtime: EntityRuntimeSlot::default(),
            scale: 1.0,
        };
    }
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub fn create_kernel() -> Kernel {
    let out: Kernel = allocate_entity();
    return out;
}

pub fn get_defaults() -> u32 {
    return DEFAULTS.fetch_add(0, Ordering::SeqCst);
}
"#,
        )
        .unwrap();
        let derived = source_root.join("kernel.rs");
        std::fs::write(
            &derived,
            "use std::sync::LazyLock;\n\nuse flight_entity::{EntityRuntimeSlot, allocate_entity};\n\n#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n}\n\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {\n    let out: Kernel = allocate_entity();\n    return out;\n}\n",
        )
        .unwrap();
        let hidden = source_root.join("kernel_drop.rs");
        std::fs::write(
            &hidden,
            "//! flight-compiler: target-native\n\nuse crate::kernel::Kernel;\n\nimpl Drop for Kernel {\n    fn drop(&mut self) {}\n}\n",
        )
        .unwrap();
        let run = |source: &std::path::Path, visibility: &[&std::path::Path]| {
            let output = source.with_extension("ts");
            let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
            command
                .arg("generate")
                .arg("--source")
                .arg(source)
                .arg("--out")
                .arg(&output)
                .arg("--entity-module")
                .arg("@flighthq/entity/contract");
            for path in visibility {
                command.arg("--visibility-source").arg(path);
            }
            let result = command.output().unwrap();
            return (
                result.status.code(),
                String::from_utf8(result.stderr).unwrap(),
                output,
            );
        };
        let prefix = "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; ";

        let (code, stderr, output) = run(&repro, &[]);
        assert_eq!(code, Some(2), "{stderr}");
        assert!(stderr.contains(&format!("{prefix}the manual `Default` for `Kernel` must return one struct literal of `Kernel`, so its field values can be compared with the generated allocation")), "{stderr}");
        assert!(!output.exists());

        let (code, stderr, output) = run(&derived, &[]);
        assert_eq!(code, Some(0), "{stderr}");
        assert!(
            std::fs::read_to_string(&output)
                .unwrap()
                .contains("export const KERNEL: KernelRaw = createKernel();")
        );
        std::fs::remove_file(&output).unwrap();

        let (code, stderr, output) = run(&derived, &[&hidden]);
        assert_eq!(code, Some(2), "{stderr}");
        assert!(
            stderr.contains(&format!(
                "{prefix}the crate implements `Drop` for `Kernel`, which Rust runs implicitly"
            )),
            "{stderr}"
        );
        assert!(!output.exists());
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn resolves_lazy_lock_callables_by_module_identity() {
        let compile = |source: &str, visibility: &[(&str, &str)]| {
            let other = ModuleSource {
                path: "crates/flight-kernel/src/other.rs",
                source: "pub fn make_value() -> f64 {\n    return 1.0;\n}\n",
            };
            let visibility = visibility
                .iter()
                .map(|(path, source)| ModuleSource { path, source })
                .collect::<Vec<_>>();
            return compile_typescript_with_visibility_sources(
                ModuleSource {
                    path: "crates/flight-kernel/src/kernel.rs",
                    source,
                },
                None,
                &[other],
                &[],
                &visibility,
            );
        };
        let native = (
            "crates/flight-kernel/src/native.rs",
            "//! flight-compiler: target-native\n\nuse std::sync::atomic::{AtomicU32, Ordering};\n\nstatic MADE: AtomicU32 = AtomicU32::new(0);\n\npub fn make_value() -> f64 {\n    MADE.fetch_add(1, Ordering::SeqCst);\n    return 2.0;\n}\n",
        );
        let kernel = |imports: &str, value: &str| {
            format!(
                "use std::sync::LazyLock;\n{imports}\npub struct Kernel {{\n    pub scale: f64,\n}}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel {{ scale: {value} }});\n"
            )
        };
        let rejected = |path: &str| {
            format!(
                "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; it calls `{path}`, which is not a side-effect-free function of this crate"
            )
        };

        assert_eq!(
            compile(
                &kernel("use crate::native::make_value;\n", "make_value()"),
                &[native]
            )
            .unwrap_err()
            .to_string(),
            rejected("make_value")
        );
        assert_eq!(
            compile(&kernel("", "crate::native::make_value()"), &[native])
                .unwrap_err()
                .to_string(),
            rejected("crate::native::make_value")
        );
        assert_eq!(
            compile(
                &kernel(
                    "use crate::native::*;\nuse crate::other::*;\n",
                    "make_value()"
                ),
                &[native]
            )
            .unwrap_err()
            .to_string(),
            rejected("make_value")
        );
        assert_eq!(
            compile(&kernel("", "missing::make_value()"), &[native])
                .unwrap_err()
                .to_string(),
            rejected("missing::make_value")
        );
        assert_eq!(
            compile(&kernel("", "super::make_value()"), &[native])
                .unwrap_err()
                .to_string(),
            rejected("super::make_value")
        );

        for (imports, value) in [
            ("", "crate::other::make_value()"),
            ("use crate::other::make_value;\n", "make_value()"),
            (
                "use crate::other::make_value as pure_value;\n",
                "pure_value()",
            ),
            ("use crate::other;\n", "other::make_value()"),
        ] {
            let output = compile(&kernel(imports, value), &[native]).unwrap();
            assert!(
                output.contains("export const KERNEL: Kernel = { scale: "),
                "{imports}{value}"
            );
        }
    }

    #[test]
    fn inventories_every_external_module_through_the_cli() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-lazy-lock-modules-cli-{}",
            std::process::id()
        ));
        let source_root = directory.join("flight-kernel").join("src");
        let outside = directory.join("outside");
        for path in [
            source_root.join("native"),
            source_root.join("nested"),
            source_root.join("outer"),
            source_root.join("elsewhere"),
            source_root.join("path_loaded").join("parent"),
            source_root.join("conditional"),
            source_root.join("alternative").join("conditional"),
            source_root.join("nested_lib").join("lib"),
            source_root.join("nested_main").join("main"),
            source_root.join("hidden_dir"),
            outside.clone(),
        ] {
            std::fs::create_dir_all(path).unwrap();
        }
        let write = |path: std::path::PathBuf, source: &str| {
            std::fs::write(&path, source).unwrap();
            return path;
        };
        let kernel = write(
            source_root.join("kernel.rs"),
            "use std::sync::LazyLock;\n\npub struct Kernel {\n    pub scale: f64,\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: 1.0 });\n",
        );
        let drop_impl = "impl Drop for crate::kernel::Kernel {\n    fn drop(&mut self) {}\n}\n";
        let hidden = write(source_root.join("hidden.rs"), drop_impl);
        let hidden_dir = write(source_root.join("hidden_dir").join("mod.rs"), drop_impl);
        let misplaced = write(source_root.join("inner.rs"), drop_impl);
        write(outside.join("hidden.rs"), drop_impl);
        let helper = write(source_root.join("helper.rs"), "pub fn help() {}\n");
        let nested = write(
            source_root.join("nested").join("mod.rs"),
            "pub fn nest() {}\n",
        );
        let inner = write(
            source_root.join("native").join("inner.rs"),
            "pub fn inner() {}\n",
        );
        let deep = write(
            source_root.join("outer").join("deep.rs"),
            "pub fn deep() {}\n",
        );
        let relocated_deep = write(
            source_root.join("elsewhere").join("deep.rs"),
            "pub fn deep() {}\n",
        );
        let path_loaded_parent = write(
            source_root.join("path_loaded").join("parent.rs"),
            "mod child;\n",
        );
        let path_loaded_child = write(
            source_root.join("path_loaded").join("child.rs"),
            "pub fn child() {}\n",
        );
        let misplaced_path_loaded_child = write(
            source_root
                .join("path_loaded")
                .join("parent")
                .join("child.rs"),
            "pub fn child() {}\n",
        );
        let conditional_parent = write(source_root.join("conditional.rs"), "mod child;\n");
        let conditional_child = write(
            source_root.join("conditional").join("child.rs"),
            "pub fn child() {}\n",
        );
        let alternative_parent = write(
            source_root.join("alternative").join("conditional.rs"),
            "mod child;\n",
        );
        let alternative_child = write(
            source_root.join("alternative").join("child.rs"),
            "pub fn child() {}\n",
        );
        let misplaced_alternative_child = write(
            source_root
                .join("alternative")
                .join("conditional")
                .join("child.rs"),
            "pub fn child() {}\n",
        );
        let raw_type = write(source_root.join("type.rs"), "pub fn raw() {}\n");
        let raw_match = write(
            source_root.join("outer").join("match.rs"),
            "pub fn raw() {}\n",
        );
        let nested_lib_parent = write(source_root.join("nested_lib.rs"), "mod lib;\n");
        let nested_lib_module = write(
            source_root.join("nested_lib").join("lib.rs"),
            "mod child;\n",
        );
        let nested_lib_child = write(
            source_root.join("nested_lib").join("lib").join("child.rs"),
            "pub fn child() {}\n",
        );
        let nested_lib_decoy = write(
            source_root.join("nested_lib").join("child.rs"),
            "pub fn child() {}\n",
        );
        let nested_main_parent = write(source_root.join("nested_main.rs"), "mod main;\n");
        let nested_main_module = write(
            source_root.join("nested_main").join("main.rs"),
            "mod child;\n",
        );
        let nested_main_child = write(
            source_root
                .join("nested_main")
                .join("main")
                .join("child.rs"),
            "pub fn child() {}\n",
        );
        let nested_main_decoy = write(
            source_root.join("nested_main").join("child.rs"),
            "pub fn child() {}\n",
        );
        let run = |root: &str, visibility: &[&std::path::PathBuf]| {
            let lib = write(source_root.join("lib.rs"), root);
            let output = kernel.with_extension("ts");
            let _ = std::fs::remove_file(&output);
            let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
            command
                .arg("generate")
                .arg("--source")
                .arg(&kernel)
                .arg("--out")
                .arg(&output)
                .arg("--visibility-source")
                .arg(&lib);
            for path in visibility {
                command.arg("--visibility-source").arg(path);
            }
            let result = command.output().unwrap();
            return (
                result.status.code(),
                String::from_utf8(result.stderr).unwrap(),
                output.exists(),
            );
        };
        let prefix = "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; ";
        let unseen = |declared: &str| {
            format!(
                "{prefix}the crate declares `{declared}`, whose source is not among the sources the proof sees"
            )
        };

        let native_inner = write(
            source_root.join("native.rs"),
            "//! flight-compiler: target-native\n\nmod inner;\n",
        );
        let negatives = [
            (
                "pub mod kernel;\nmod hidden;\n",
                vec![],
                unseen("mod hidden"),
            ),
            (
                "pub mod kernel;\nmod hidden_dir;\n",
                vec![],
                unseen("mod hidden_dir"),
            ),
            (
                "pub mod kernel;\nmod native;\n",
                vec![&native_inner, &misplaced],
                unseen("mod inner"),
            ),
            (
                "pub mod kernel;\n#[cfg_attr(feature = \"trace\", path = \"../../outside/hidden.rs\")]\nmod hidden;\n",
                vec![&hidden],
                unseen("mod hidden"),
            ),
            (
                "pub mod kernel;\n#[path = \"elsewhere\"]\nmod outer {\n    mod deep;\n}\n",
                vec![&deep],
                unseen("mod deep"),
            ),
            (
                "pub mod kernel;\n#[path = \"path_loaded/parent.rs\"]\nmod parent;\n",
                vec![&path_loaded_parent, &misplaced_path_loaded_child],
                unseen("mod child"),
            ),
            (
                "pub mod kernel;\n#[cfg_attr(feature = \"alternative\", path = \"alternative/conditional.rs\")]\nmod conditional;\n",
                vec![
                    &conditional_parent,
                    &conditional_child,
                    &alternative_parent,
                    &misplaced_alternative_child,
                ],
                unseen("mod child"),
            ),
            (
                "pub mod kernel;\nmod r#type;\n",
                vec![],
                unseen("mod r#type"),
            ),
            (
                "pub mod kernel;\nmod nested_lib;\n",
                vec![&nested_lib_parent, &nested_lib_module, &nested_lib_decoy],
                unseen("mod child"),
            ),
            (
                "pub mod kernel;\nmod nested_main;\n",
                vec![&nested_main_parent, &nested_main_module, &nested_main_decoy],
                unseen("mod child"),
            ),
        ];
        for (root, visibility, reason) in &negatives {
            let (code, stderr, emitted) = run(root, visibility);
            assert_eq!(code, Some(2), "{root}: {stderr}");
            assert!(stderr.contains(reason.as_str()), "{root}: {stderr}");
            assert!(!emitted, "{root} emitted TypeScript");
        }

        let positives = [
            (
                "pub mod kernel;\nmod helper;\nmod nested;\n",
                vec![&helper, &nested],
            ),
            (
                "pub mod kernel;\nmod native;\n",
                vec![&native_inner, &inner],
            ),
            (
                "pub mod kernel;\nmod outer {\n    mod deep;\n}\n",
                vec![&deep],
            ),
            (
                "pub mod kernel;\n#[cfg_attr(feature = \"relocated\", path = \"elsewhere\")]\nmod outer {\n    mod deep;\n}\n",
                vec![&deep, &relocated_deep],
            ),
            (
                "pub mod kernel;\n#[path = \"path_loaded/parent.rs\"]\nmod parent;\n",
                vec![&path_loaded_parent, &path_loaded_child],
            ),
            (
                "pub mod kernel;\n#[cfg_attr(feature = \"alternative\", path = \"alternative/conditional.rs\")]\nmod conditional;\n",
                vec![
                    &conditional_parent,
                    &conditional_child,
                    &alternative_parent,
                    &alternative_child,
                ],
            ),
            (
                "pub mod kernel;\nmod r#type;\nmod r#outer {\n    mod r#match;\n}\n",
                vec![&raw_type, &raw_match],
            ),
            (
                "pub mod kernel;\nmod nested_lib;\n",
                vec![&nested_lib_parent, &nested_lib_module, &nested_lib_child],
            ),
            (
                "pub mod kernel;\nmod nested_main;\n",
                vec![&nested_main_parent, &nested_main_module, &nested_main_child],
            ),
            (
                "pub mod kernel;\n#[cfg_attr(feature = \"trace\", path = \"nested/mod.rs\")]\nmod helper;\n",
                vec![&helper, &nested],
            ),
            (
                "pub mod kernel;\n#[cfg(test)]\nmod tests;\n#[cfg(test)]\n#[path = \"../../outside/hidden.rs\"]\nmod hidden_tests;\n",
                vec![],
            ),
            ("pub mod kernel;\nmod hidden_dir;\n", vec![&hidden_dir]),
        ];
        let (drop_case, successful) = positives.split_last().unwrap();
        let (code, stderr, _) = run(drop_case.0, &drop_case.1);
        assert_eq!(
            code,
            Some(2),
            "an inventoried module's Drop impl is still seen: {stderr}"
        );
        assert!(
            stderr.contains("the crate implements `Drop` for `crate::kernel::Kernel`"),
            "{stderr}"
        );
        for (root, visibility) in successful {
            let (code, stderr, emitted) = run(root, visibility);
            assert_eq!(code, Some(0), "{root}: {stderr}");
            assert!(emitted, "{root}");
        }
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn discovers_and_accepts_explicit_nonstandard_cargo_target_roots() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-target-roots-cli-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        let root_source = "use std::sync::LazyLock;\n\nmod helper;\n\npub struct Value {\n    pub amount: f64,\n}\n\npub static VALUE: LazyLock<Value> = LazyLock::new(|| Value { amount: 1.0 });\n\npub fn value() -> f64 {\n    return VALUE.amount;\n}\n";
        let helper_source = "pub fn value() -> f64 {\n    return 1.0;\n}\n";
        let cases = [
            (
                "implicit-bin-file",
                "[package]\nname = \"implicit-bin-file-package\"\nversion = \"0.0.0\"\nedition = \"2024\"\n",
                "src/bin/tool.rs",
                "src/bin/helper.rs",
                None,
            ),
            (
                "implicit-bin-directory",
                "[package]\nname = \"implicit-bin-directory-package\"\nversion = \"0.0.0\"\nedition = \"2024\"\n",
                "src/bin/tool/main.rs",
                "src/bin/tool/helper.rs",
                None,
            ),
            (
                "custom-lib",
                "[package]\nname = \"custom-lib-package\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[lib]\nname = \"custom_library\"\npath = \"source/root.rs\"\n",
                "source/root.rs",
                "source/helper.rs",
                None,
            ),
            (
                "custom-bin",
                "[package]\nname = \"custom-bin-package\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[[bin]]\nname = \"custom-runner\"\npath = \"tools/runner.rs\"\n",
                "tools/runner.rs",
                "tools/helper.rs",
                None,
            ),
            (
                "explicit",
                "",
                "sources/entry.rs",
                "sources/helper.rs",
                Some("manual_root"),
            ),
        ];
        for (name, manifest, root_relative, helper_relative, explicit_name) in cases {
            let case = directory.join(name);
            let root = case.join(root_relative);
            let helper = case.join(helper_relative);
            std::fs::create_dir_all(root.parent().unwrap()).unwrap();
            std::fs::write(&root, root_source).unwrap();
            std::fs::write(&helper, helper_source).unwrap();
            if !manifest.is_empty() {
                std::fs::write(case.join("Cargo.toml"), manifest).unwrap();
            }
            let output = case.join("generated.ts");
            let run = |with_helper: bool| {
                let _ = std::fs::remove_file(&output);
                let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
                command
                    .arg("generate")
                    .arg("--source")
                    .arg(&root)
                    .arg("--out")
                    .arg(&output);
                if with_helper {
                    command.arg("--visibility-source").arg(&helper);
                }
                if let Some(crate_name) = explicit_name {
                    command
                        .arg("--crate-root")
                        .arg(format!("{crate_name}={}", root.display()));
                }
                return command.output().unwrap();
            };
            let missing = run(false);
            assert_eq!(missing.status.code(), Some(2), "{name}");
            assert!(
                String::from_utf8(missing.stderr)
                    .unwrap()
                    .contains("whose source is not among the sources the proof sees"),
                "{name}"
            );
            assert!(
                !output.exists(),
                "{name} emitted without its declared module"
            );
            let complete = run(true);
            assert_eq!(
                complete.status.code(),
                Some(0),
                "{name}: {}",
                String::from_utf8(complete.stderr).unwrap()
            );
            assert!(
                output.exists(),
                "{name} did not emit with a complete inventory"
            );
        }
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn rejects_hidden_include_macro_and_path_module_sources_through_the_cli() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-lazy-lock-visibility-cli-{}",
            std::process::id()
        ));
        let source_root = directory.join("flight-kernel").join("src");
        std::fs::create_dir_all(&source_root).unwrap();
        let outside = directory.join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let write = |path: std::path::PathBuf, source: &str| {
            std::fs::write(&path, source).unwrap();
            return path;
        };
        let kernel = write(
            source_root.join("kernel.rs"),
            "use std::sync::LazyLock;\n\nuse flight_entity::{EntityRuntimeSlot, allocate_entity};\n\n#[derive(Default)]\npub struct Kernel {\n    runtime: EntityRuntimeSlot,\n    pub scale: f64,\n}\n\nflight_entity::impl_entity!(Kernel);\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);\n\npub fn create_kernel() -> Kernel {\n    let out: Kernel = allocate_entity();\n    return out;\n}\n",
        );
        let hidden_impls = [
            "impl Default for crate::kernel::Kernel {\n    fn default() -> Self {\n        loop {}\n    }\n}\n",
            "impl Drop for crate::kernel::Kernel {\n    fn drop(&mut self) {}\n}\n",
            "impl std::ops::Deref for crate::kernel::Kernel {\n    type Target = f64;\n    fn deref(&self) -> &f64 {\n        return &self.scale;\n    }\n}\n",
        ];
        let prefix = "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; ";
        let run = |visibility: &[&std::path::PathBuf]| {
            let output = kernel.with_extension("ts");
            let _ = std::fs::remove_file(&output);
            let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
            command
                .arg("generate")
                .arg("--source")
                .arg(&kernel)
                .arg("--out")
                .arg(&output)
                .arg("--entity-module")
                .arg("@flighthq/entity/contract");
            for path in visibility {
                command.arg("--visibility-source").arg(path);
            }
            let result = command.output().unwrap();
            return (
                result.status.code(),
                String::from_utf8(result.stderr).unwrap(),
                output.exists(),
            );
        };
        let mut cases = Vec::new();
        for (index, hidden) in hidden_impls.iter().enumerate() {
            write(outside.join(format!("hidden_{index}.rs")), hidden);
            cases.push((
                format!("include!(\"../../outside/hidden_{index}.rs\");\n"),
                "it cannot prove what the macro `include!` in this crate expands to, and a macro can generate any `impl`".to_string(),
            ));
            cases.push((
                format!("#[path = \"../../outside/hidden_{index}.rs\"]\nmod hidden_{index};\n"),
                format!("the crate declares `#[path = \"../../outside/hidden_{index}.rs\"] mod`, whose source is not among the sources the proof sees"),
            ));
        }
        cases.push((
            "external::make_drop!(crate::kernel::Kernel);\n".to_string(),
            "it cannot prove what the macro `external::make_drop!` in this crate expands to, and a macro can generate any `impl`".to_string(),
        ));
        cases.push((
            "pub fn probe() -> Vec<u8> {\n    return vec![external::make_drop!(crate::kernel::Kernel)];\n}\n".to_string(),
            "it cannot prove what the macro `external::make_drop!` in this crate expands to, and a macro can generate any `impl`".to_string(),
        ));
        cases.push((
            "std::thread_local! {\n    static CELLS: u32 = 0;\n}\n".to_string(),
            "it cannot prove what the macro `std::thread_local!` in this crate expands to, and a macro can generate any `impl`".to_string(),
        ));
        for (source, reason) in &cases {
            let native = write(
                source_root.join("native.rs"),
                &format!("//! flight-compiler: target-native\n\n{source}"),
            );
            let (code, stderr, emitted) = run(&[&native]);
            assert_eq!(code, Some(2), "{source}: {stderr}");
            assert!(
                stderr.contains(&format!("{prefix}{reason}")),
                "{source}: {stderr}"
            );
            assert!(!emitted, "{source} emitted TypeScript");
        }

        let inventoried = write(
            source_root.join("native_impl.rs"),
            "//! flight-compiler: target-native\n\npub fn describe(values: &[f64]) -> String {\n    assert!(!values.is_empty());\n    return format!(\"{}\", values.len());\n}\n",
        );
        let native = write(
            source_root.join("native.rs"),
            "//! flight-compiler: target-native\n\n#[path = \"native_impl.rs\"]\nmod renamed;\n\npub fn sizes() -> Vec<u32> {\n    return vec![1, 2];\n}\n",
        );
        let (code, stderr, emitted) = run(&[&native, &inventoried]);
        assert_eq!(code, Some(0), "{stderr}");
        assert!(emitted);
        let output = std::fs::read_to_string(kernel.with_extension("ts")).unwrap();
        assert!(output.contains("export const KERNEL: KernelRaw = createKernel();"));
        assert!(!output.contains("describe") && !output.contains("sizes"));
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn rejects_lazy_lock_operators_and_constructors_without_proven_provenance() {
        let declarations = "use std::sync::LazyLock;\n\npub struct Kernel {\n    pub scale: f64,\n}\n\npub struct Narrow {\n    pub scale: f32,\n}\n\npub struct Tally {\n    pub enabled: bool,\n}\n";
        let unsafe_initializer = |name: &str, reason: &str| {
            format!(
                "`LazyLock` static `{name}` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}"
            )
        };
        let arithmetic = |op: &str| {
            format!(
                "it applies `{op}` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust"
            )
        };
        let comparison = |op: &str| {
            format!(
                "it compares with `{op}` operands not proven to be one exactly representable primitive scalar type, so it could run a user `PartialEq` or `PartialOrd`"
            )
        };
        let not_crate_function = |path: &str| {
            format!("it calls `{path}`, which is not a side-effect-free function of this crate")
        };
        let cases = [
            (
                "pub struct Offset {\n    pub value: f64,\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: 1.0 + Offset { value: 2.0 } });\n",
                arithmetic("+"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| Kernel { scale: 1.0 / 3.0 });\n",
                arithmetic("/"),
            ),
            (
                "pub static NARROW: LazyLock<Narrow> = LazyLock::new(|| Narrow { scale: 1.0f32 * 3.0 });\n",
                arithmetic("*"),
            ),
            (
                "pub static KERNEL: LazyLock<Kernel> = LazyLock::new(make_kernel);\n\npub fn make_kernel() -> Kernel {\n    let mut out = Kernel { scale: 1.0 };\n    out.scale += flight_math::random();\n    return out;\n}\n",
                arithmetic("+="),
            ),
            (
                "pub struct Probe {\n    pub value: i32,\n}\n\npub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { enabled: Probe { value: 1 } == Probe { value: 1 } });\n",
                comparison("=="),
            ),
            (
                "pub static TALLY: LazyLock<Tally> = LazyLock::new(make_tally);\n\npub fn make_tally() -> Tally {\n    let big: u64 = 9007199254740993;\n    return Tally { enabled: big > 9007199254740992 };\n}\n",
                comparison(">"),
            ),
            (
                "pub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { enabled: 0.1f32 < 0.1 });\n",
                comparison("<"),
            ),
            (
                "pub static TALLY: LazyLock<Tally> = LazyLock::new(make_tally);\n\npub fn make_tally() -> Tally {\n    let limit: i64 = 1;\n    let count = limit;\n    return Tally { enabled: count >= 1 };\n}\n",
                comparison(">="),
            ),
            (
                "pub struct Wrapper {\n    pub scale: f64,\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let wrapper = Wrapper { scale: 1.0 };\n    return Kernel { scale: *wrapper };\n});\n",
                "it dereferences an operand not proven to be a reference or a standard `LazyLock`, `Box` or `Arc`, so it could run a user `Deref`".to_string(),
            ),
            (
                "pub static TALLY: LazyLock<Tally> = LazyLock::new(|| Tally { enabled: !flight_math::flag() });\n",
                "it applies `!` to an operand not proven to be a `bool`".to_string(),
            ),
            (
                "pub const SCALE: Offset = Offset { value: 1.0 };\n\npub struct Offset {\n    pub value: f64,\n}\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(make_kernel);\n\npub fn make_kernel() -> Kernel {\n    let doubled = SCALE * 2.0;\n    let SCALE = 1.0f64;\n    return Kernel { scale: doubled + SCALE };\n}\n",
                arithmetic("*"),
            ),
            (
                "use flight_math::Some;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let _picked = Some(1.0);\n    return Kernel { scale: 1.0 };\n});\n",
                not_crate_function("Some"),
            ),
            (
                "use flight_math::allocate_entity;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let out: Kernel = allocate_entity();\n    return out;\n});\n",
                not_crate_function("allocate_entity"),
            ),
            (
                "use flight_math::*;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let _values: Vec<f64> = Vec::new();\n    return Kernel { scale: 1.0 };\n});\n",
                not_crate_function("Vec::new"),
            ),
            (
                "extern crate flight_math as std;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let _values: Vec<f64> = std::vec::Vec::new();\n    return Kernel { scale: 1.0 };\n});\n",
                not_crate_function("std::vec::Vec::new"),
            ),
            (
                "use flight_entity::Vec;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(|| {\n    let _values = Vec::new();\n    return Kernel { scale: 1.0 };\n});\n",
                not_crate_function("Vec::new"),
            ),
            (
                "use flight_math::make_kernel;\n\npub static KERNEL: LazyLock<Kernel> = LazyLock::new(make_kernel);\n\nfn make_kernel_locally() -> Kernel {\n    return Kernel { scale: 1.0 };\n}\n",
                "`LazyLock` initializer for `KERNEL` must name a free function of this crate; `make_kernel` has no TypeScript value".to_string(),
            ),
        ];

        for (items, expected) in cases {
            let source = format!("{declarations}\n{items}");
            let error = compile_typescript(&source, None).unwrap_err().to_string();
            let expected = if expected.starts_with('`') {
                expected
            } else {
                let name = items
                    .split("pub static ")
                    .nth(1)
                    .and_then(|rest| rest.split(':').next())
                    .unwrap();
                unsafe_initializer(name, &expected)
            };
            assert_eq!(error, expected, "{source}");
        }
    }

    #[test]
    fn rejects_overloaded_lazy_lock_operators_and_imported_constructors_through_the_cli() {
        let repros = [
            (
                "lazy-lock-overloaded-float-repro.rs",
                r#"use std::ops::Add;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::LazyLock;

static ADDS: AtomicU32 = AtomicU32::new(0);

pub struct Offset {
    pub value: f64,
}

impl Add<Offset> for f64 {
    type Output = f64;

    fn add(self, other: Offset) -> f64 {
        ADDS.fetch_add(1, Ordering::SeqCst);
        return self + other.value;
    }
}

pub struct Kernel {
    pub scale: f64,
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub fn create_kernel() -> Kernel {
    return Kernel {
        scale: 1.0 + Offset { value: 2.0 },
    };
}

pub fn get_adds() -> u32 {
    return ADDS.fetch_add(0, Ordering::SeqCst);
}
"#,
                "it applies `+` to operands not proven to be `f64` values, so it could run an overloaded operator or integer arithmetic that panics or wraps differently in Rust",
            ),
            (
                "lazy-lock-overloaded-comparison-repro.rs",
                r#"use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::LazyLock;

static COMPARISONS: AtomicU32 = AtomicU32::new(0);

pub struct Probe {
    pub value: i32,
}

impl PartialEq for Probe {
    fn eq(&self, other: &Probe) -> bool {
        COMPARISONS.fetch_add(1, Ordering::SeqCst);
        return self.value == other.value;
    }
}

pub struct Kernel {
    pub enabled: bool,
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub fn create_kernel() -> Kernel {
    return Kernel {
        enabled: Probe { value: 1 } == Probe { value: 1 },
    };
}

pub fn get_comparisons() -> u32 {
    return COMPARISONS.fetch_add(0, Ordering::SeqCst);
}
"#,
                "it compares with `==` operands not proven to be one exactly representable primitive scalar type, so it could run a user `PartialEq` or `PartialOrd`",
            ),
            (
                "lazy-lock-imported-constructor-repro.rs",
                r#"use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::LazyLock;

use local::Vec;

static CONSTRUCTIONS: AtomicU32 = AtomicU32::new(0);

mod local {
    pub struct Vec {
        pub length: usize,
    }

    impl Vec {
        pub fn new() -> Vec {
            super::CONSTRUCTIONS.fetch_add(1, super::Ordering::SeqCst);
            return Vec { length: 0 };
        }
    }
}

pub struct Kernel {
    pub values: Vec,
}

pub static KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub fn create_kernel() -> Kernel {
    return Kernel { values: Vec::new() };
}

pub fn get_constructions() -> u32 {
    return CONSTRUCTIONS.fetch_add(0, Ordering::SeqCst);
}
"#,
                "it calls `Vec::new`, which is not a side-effect-free function of this crate",
            ),
        ];
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-lazy-lock-cli-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        for (file, source, reason) in repros {
            let input = directory.join(file);
            let output = input.with_extension("ts");
            std::fs::write(&input, source).unwrap();
            let result = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"))
                .arg("generate")
                .arg("--source")
                .arg(&input)
                .arg("--out")
                .arg(&output)
                .output()
                .unwrap();
            let stderr = String::from_utf8(result.stderr).unwrap();
            assert_eq!(result.status.code(), Some(2), "{file}: {stderr}");
            assert!(
                stderr.contains(&format!(
                    "`LazyLock` static `KERNEL` lowers to an eagerly initialized constant, so its initializer must be side-effect free and cannot panic; {reason}"
                )),
                "{file}: {stderr}"
            );
            assert!(!output.exists(), "{file} emitted TypeScript");
        }
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn types_designated_slice_parameters_as_array_like() {
        let source = r#"
//! flight-compiler: array-like sum_pairs.points pair_total.values

pub fn sum_pairs(points: &[f64], offset: f64) -> f64 {
    if points.is_empty() {
        return offset;
    }
    let mut total = offset;
    let mut i = 0;
    while i + 1 < points.len() {
        total += points[i] * points[i + 1];
        i += 2;
    }
    return total + pair_total(&points);
}

pub fn pair_total(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    return values[0] + values[1];
}

pub fn sum_values(values: &[f64]) -> f64 {
    let mut total = 0.0;
    for value in values {
        total += value;
    }
    return total;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "export function sumPairs(points: ArrayLike<number>, offset: number): number {"
        ));
        assert!(output.contains("export function pairTotal(values: ArrayLike<number>): number {"));
        assert!(output.contains("export function sumValues(values: Readonly<number[]>): number {"));
        assert!(output.contains("  if (points.length === 0) {\n"));
        assert!(output.contains("    total += points[i] * points[i + 1];\n"));
        assert!(output.contains("  return total + pairTotal(points);\n"));
    }

    #[test]
    fn resolves_array_like_onward_calls_by_source_identity() {
        let module = |path, source| ModuleSource { path, source };
        let compile = |source: ModuleSource<'_>, aliases: &[ModuleSource<'_>]| {
            compile_typescript_with_module_sources(source, None, aliases, &[])
        };
        let forward = "//! flight-compiler: array-like forward.points\n\nuse crate::helpers::sum_values;\n\npub fn forward(points: &[f64]) -> f64 {\n    return sum_values(points);\n}\n";
        let designated = "//! flight-compiler: array-like sum_values.values\n\npub fn sum_values(values: &[f64]) -> f64 {\n    return values[0];\n}\n";
        let undesignated = "pub fn sum_values(values: &[f64]) -> f64 {\n    return values[0];\n}\n";
        let rejected = "`array-like` parameter `points` of `forward` is passed to `sum_values` argument 0, which does not resolve to an `array-like` parameter";

        let output = compile(
            module("crates/flight-region/src/region.rs", forward),
            &[module("crates/flight-region/src/helpers.rs", designated)],
        )
        .unwrap();
        assert!(output.contains("export function forward(points: ArrayLike<number>): number {"));
        assert!(output.contains("  return sumValues(points);\n"));

        let output = compile(
            module("crates/flight-region/src/helpers.rs", designated),
            &[module("crates/flight-region/src/region.rs", forward)],
        )
        .unwrap();
        assert!(output.contains("export function sumValues(values: ArrayLike<number>): number {"));

        assert_eq!(
            compile(
                module("crates/flight-region/src/region.rs", forward),
                &[module("crates/flight-region/src/helpers.rs", undesignated)],
            )
            .unwrap_err()
            .to_string(),
            rejected
        );
        assert_eq!(
            compile(
                module("crates/flight-region/src/region.rs", forward),
                &[
                    module("crates/flight-region/src/helpers.rs", undesignated),
                    module("crates/flight-region/src/other.rs", designated),
                ],
            )
            .unwrap_err()
            .to_string(),
            rejected
        );

        let local = "pub fn consume(values: &[f64]) -> f64 {\n    let mut total = 0.0;\n    for value in values {\n        total += value;\n    }\n    return total;\n}\n";
        let sibling = "//! flight-compiler: array-like consume.values\n\npub fn consume(values: &[f64]) -> f64 {\n    return values[0];\n}\n";
        let output = compile(
            module("crates/flight-region/src/local.rs", local),
            &[module("crates/flight-region/src/sibling.rs", sibling)],
        )
        .unwrap();
        assert!(output.contains("export function consume(values: Readonly<number[]>): number {"));
        assert!(!output.contains("ArrayLike"));
    }

    #[test]
    fn rejects_array_like_designations_borrowed_by_shadowed_or_sibling_callees_through_the_cli() {
        let directory = std::env::temp_dir().join(format!(
            "flight-compiler-array-like-cli-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let write = |file: &str, source: &str| {
            let path = directory.join(file);
            std::fs::write(&path, source).unwrap();
            return path;
        };
        let shadowed = write(
            "array-like-shadowed-callee-repro.rs",
            r#"//! flight-compiler: array-like forward.points accept.values

pub fn accept(values: &[f64]) -> f64 {
    return values[0];
}

pub fn forward(points: &[f64]) -> f64 {
    let accept = |values: &[f64]| -> f64 {
        return values[0];
    };
    return accept(points);
}
"#,
        );
        let sibling_callee = write(
            "array-like-sibling-callee-repro.rs",
            r#"//! flight-compiler: array-like forward.points

pub fn forward(points: &[f64]) -> f64 {
    return consume(points);
}

pub fn consume(values: &[f64]) -> f64 {
    let mut total = 0.0;
    for value in values {
        total += value;
    }
    return total;
}
"#,
        );
        let sibling_alias = write(
            "array-like-sibling-alias.rs",
            r#"//! flight-compiler: array-like consume.values

pub fn consume(values: &[f64]) -> f64 {
    return values[0];
}
"#,
        );
        let cases = [
            (
                &shadowed,
                None,
                "`array-like` parameter `points` of `forward` is passed to `accept` argument 0, which does not resolve to an `array-like` parameter",
            ),
            (
                &sibling_callee,
                Some(&sibling_alias),
                "`array-like` parameter `points` of `forward` is passed to `consume` argument 0, which does not resolve to an `array-like` parameter",
            ),
        ];
        for (input, alias, reason) in cases {
            let output = input.with_extension("ts");
            let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_flight-compile"));
            command
                .arg("generate")
                .arg("--source")
                .arg(input)
                .arg("--out")
                .arg(&output);
            if let Some(alias) = alias {
                command.arg("--alias-source").arg(alias);
            }
            let result = command.output().unwrap();
            let stderr = String::from_utf8(result.stderr).unwrap();
            assert_eq!(
                result.status.code(),
                Some(2),
                "{}: {stderr}",
                input.display()
            );
            assert!(stderr.contains(reason), "{}: {stderr}", input.display());
            assert!(!output.exists(), "{} emitted TypeScript", input.display());
        }
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn rejects_array_like_parameters_used_beyond_length_and_elements() {
        let function = |designation: &str, parameter: &str, body: &str| {
            format!(
                "//! flight-compiler: array-like {designation}\n\npub fn sum_values(values: &[f64]) -> f64 {{\n    return values[0];\n}}\n\npub fn f(points: {parameter}) -> f64 {{\n    let mut total = 0.0;\n    {body}\n    return total;\n}}\n"
            )
        };
        let unsupported = "`array-like` parameter `points` of `f` is used in a way `ArrayLike` does not support; only `.len()`, `.is_empty()`, indexing, and passing it to another `array-like` parameter are".to_string();
        let cases = [
            (
                function("f.points", "&[f64]", "for value in points {\n        total += value;\n    }"),
                unsupported.clone(),
            ),
            (
                function("f.points", "&[f64]", "let copy = points;\n    total += copy[0];"),
                unsupported.clone(),
            ),
            (
                function("f.points", "&[f64]", "total += points[0..2][0];"),
                unsupported.clone(),
            ),
            (
                function("f.points", "&[f64]", "total += sum_values(points);"),
                "`array-like` parameter `points` of `f` is passed to `sum_values` argument 0, which does not resolve to an `array-like` parameter".to_string(),
            ),
            (
                function("", "&[f64]", "total += points[0];").replace("array-like \n", "array-like\n"),
                "`flight-compiler: array-like` requires at least one `function.parameter`".to_string(),
            ),
            (
                function("f", "&[f64]", "total += points[0];"),
                "`flight-compiler: array-like` designation `f` is not `function.parameter`".to_string(),
            ),
            (
                function("f.points f.points", "&[f64]", "total += points[0];"),
                "duplicate `flight-compiler: array-like` designation `f.points`".to_string(),
            ),
            (
                function("f.points", "&Vec<f64>", "total += points[0];"),
                "`flight-compiler: array-like f.points` must name a `&[T]` parameter of a function in this source".to_string(),
            ),
            (
                function("f.points", "&mut [f64]", "total += points[0];"),
                "`flight-compiler: array-like f.points` must name a `&[T]` parameter of a function in this source".to_string(),
            ),
            (
                function("g.points", "&[f64]", "total += points[0];"),
                "`flight-compiler: array-like g.points` must name a `&[T]` parameter of a function in this source".to_string(),
            ),
        ];
        for (source, expected) in cases {
            assert_eq!(
                compile_typescript(&source, None).unwrap_err().to_string(),
                expected,
                "{source}"
            );
        }
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
                "`flight-compiler: export-name` item `decode_utf8` is not a function, constant or static of this source",
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
    fn imports_dependency_entities_as_raw_contracts_and_lowers_their_string_unions() {
        let dependency = r#"
//! flight-compiler: companion widget.ts
//! flight-compiler: string-union WidgetMode

use flight_entity::EntityRuntimeSlot;

pub enum WidgetMode {
    Ready,
}

pub struct Widget {
    runtime: EntityRuntimeSlot,
    pub mode: WidgetMode,
}

flight_entity::impl_entity!(Widget);
"#;
        let externals = [ExternalAliasSource {
            source: dependency,
            module: "@flighthq/widget/contract",
        }];
        let consumer = r#"
use flight_widget::{Widget, WidgetMode};

pub fn is_ready(widget: &Widget) -> bool {
    return widget.mode == WidgetMode::Ready;
}
"#;

        assert_eq!(
            compile_typescript_with_external_alias_sources(consumer, None, &[], &externals)
                .unwrap(),
            "import type { WidgetRaw } from \"@flighthq/widget/contract\";\n\nexport function isReady(widget: Readonly<WidgetRaw>): boolean {\n  return widget.mode === \"ready\";\n}\n"
        );
    }

    #[test]
    fn imports_generic_dependency_export_names_in_type_positions() {
        let dependency = r#"
//! flight-compiler: companion wrapper.ts

use flight_entity::EntityRuntimeSlot;

pub struct Wrapper<T> {
    runtime: EntityRuntimeSlot,
    pub value: T,
}

flight_entity::impl_entity!(Wrapper<T>);
"#;
        let externals = [ExternalAliasSource {
            source: dependency,
            module: "@flighthq/wrapper/contract",
        }];
        let consumer = r#"
use flight_wrapper::Wrapper;

pub struct Consumer {
    pub wrapper: Wrapper<String>,
}
"#;

        assert_eq!(
            compile_typescript_with_external_alias_sources(consumer, None, &[], &externals)
                .unwrap(),
            "import type { WrapperRaw } from \"@flighthq/wrapper/contract\";\n\nexport interface Consumer {\n  wrapper: WrapperRaw<string>;\n}\n\n"
        );
    }

    #[test]
    fn honors_external_target_native_nullable_option_designations() {
        let dependency = r#"
//! flight-compiler: target-native
//! flight-compiler: nullable-option ExternalRuntime.value find_value

pub struct ExternalRuntime {
    pub value: Option<String>,
}

pub fn find_value() -> Option<i32> {
    return None;
}
"#;
        let externals = [ExternalAliasSource {
            source: dependency,
            module: "@flighthq/demo/contract",
        }];
        let consumer = r#"
use flight_demo::{ExternalRuntime, find_value};
use flight_entity::Ref;

pub fn clear_value(runtime: &Ref<ExternalRuntime>) {
    let runtime: Ref<ExternalRuntime> = runtime.clone();
    runtime.write().unwrap().value = None;
}

pub fn is_clear(runtime: &Ref<ExternalRuntime>) -> bool {
    let runtime: Ref<ExternalRuntime> = runtime.clone();
    return runtime.read().unwrap().value.is_none();
}

pub fn read_value() -> i32 {
    let Some(value) = find_value() else {
        return -1;
    };
    return value;
}
"#;

        let output =
            compile_typescript_with_external_alias_sources(consumer, None, &[], &externals)
                .unwrap();

        assert!(output.contains("runtime!.value = null;"), "{output}");
        assert!(
            output.contains("((runtime!.value) ?? undefined) === undefined"),
            "{output}"
        );
        assert!(
            output.contains("const value = ((findValue()) ?? undefined);"),
            "{output}"
        );
        assert!(output.contains("if (value === undefined)"), "{output}");
    }

    #[test]
    fn rejects_conflicting_dependency_string_union_owners_independent_of_argument_order() {
        let alpha = r#"
//! flight-compiler: string-union Status=exact
//! flight-compiler: string-union-value Status Ready "alpha.ready"

pub enum Status {
    Ready,
}
"#;
        let beta = r#"
//! flight-compiler: string-union Status=exact
//! flight-compiler: string-union-value Status Ready "beta.ready"

pub enum Status {
    Ready,
}
"#;
        let alpha = ExternalAliasSource {
            source: alpha,
            module: "@flighthq/alpha/contract",
        };
        let beta = ExternalAliasSource {
            source: beta,
            module: "@flighthq/beta/contract",
        };
        let consumer = r#"
use flight_alpha::Status;

pub fn is_ready(status: Status) -> bool {
    return status == Status::Ready;
}
"#;
        let test = r#"
use flight_alpha::Status;

#[test]
fn accepts_ready() {
    assert_eq!(Status::Ready, Status::Ready);
}
"#;
        let expected = "string union `Status` has conflicting metadata across external module `@flighthq/alpha/contract`, external module `@flighthq/beta/contract`";

        for externals in [[alpha, beta], [beta, alpha]] {
            let error =
                compile_typescript_with_external_alias_sources(consumer, None, &[], &externals)
                    .unwrap_err();
            assert_eq!(error.to_string(), expected);

            let error = compile_vitest_with_external_alias_sources(
                test,
                "@flighthq/consumer/contract",
                None,
                &[],
                &externals,
            )
            .unwrap_err();
            assert_eq!(error.to_string(), expected);
        }
    }

    #[test]
    fn rejects_local_string_union_metadata_conflicting_with_an_external_owner() {
        let local = r#"
//! flight-compiler: string-union Status=exact
//! flight-compiler: string-union-value Status Ready "local.ready"

pub enum Status {
    Ready,
}
"#;
        let external_source = r#"
//! flight-compiler: string-union Status=exact
//! flight-compiler: string-union-value Status Ready "external.ready"

pub enum Status {
        Ready,
}
"#;
        let external = [ExternalAliasSource {
            source: external_source,
            module: "@flighthq/status/contract",
        }];
        let consumer = "pub fn ready() -> bool {\n    return true;\n}\n";
        let alias = ModuleSource {
            path: "crates/flight-consumer/src/status.rs",
            source: local,
        };

        let error = compile_typescript_with_module_sources(
            ModuleSource {
                path: "crates/flight-consumer/src/consumer.rs",
                source: consumer,
            },
            None,
            &[alias],
            &external,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "string union `Status` has conflicting metadata across external module `@flighthq/status/contract`, same-package module `flight_consumer::status`"
        );

        let error =
            compile_typescript_with_external_alias_sources(consumer, None, &[local], &external)
                .unwrap_err();
        assert_eq!(
            error.to_string(),
            "string union `Status` has conflicting metadata across external module `@flighthq/status/contract`, same-package alias source #1"
        );

        let error =
            compile_typescript_with_module_sources(alias, None, &[], &external).unwrap_err();
        assert_eq!(
            error.to_string(),
            "string union `Status` has conflicting metadata across current module `flight_consumer::status`, external module `@flighthq/status/contract`"
        );

        let error = compile_typescript_with_module_sources(
            alias,
            None,
            &[ModuleSource {
                path: "crates/flight-consumer/src/other_status.rs",
                source: external_source,
            }],
            &[],
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "string union `Status` has conflicting metadata across current module `flight_consumer::status`, same-package module `flight_consumer::other_status`"
        );

        let test = "#[test]\nfn accepts_ready() {\n    assert!(true);\n}\n";
        let error = compile_vitest_with_external_alias_sources(
            test,
            "@flighthq/consumer/contract",
            None,
            &[VitestAliasSource {
                source: local,
                module: "crates/flight-consumer/src/status.rs",
            }],
            &external,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "string union `Status` has conflicting metadata across external module `@flighthq/status/contract`, same-package module `crates/flight-consumer/src/status.rs`"
        );
    }

    #[test]
    fn keeps_exact_dependency_entity_names_without_companion_wrappers() {
        let dependency = r#"
use flight_entity::EntityRuntimeSlot;

pub struct Rectangle {
    runtime: EntityRuntimeSlot,
    pub width: f32,
}

flight_entity::impl_entity!(Rectangle);
"#;
        let externals = [ExternalAliasSource {
            source: dependency,
            module: "@flighthq/geometry/contract",
        }];
        let consumer = r#"
use flight_geometry::Rectangle;

pub fn rectangle_width(rectangle: &Rectangle) -> f32 {
    return rectangle.width;
}
"#;

        assert_eq!(
            compile_typescript_with_external_alias_sources(consumer, None, &[], &externals)
                .unwrap(),
            "import type { Rectangle } from \"@flighthq/geometry/contract\";\n\nexport function rectangleWidth(rectangle: Readonly<Rectangle>): number {\n  return rectangle.width;\n}\n"
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
                "`flight-compiler: export-name` item `decode_utf16` is not a function, constant or static of this source",
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

pub struct Bucket {
    pub values: Vec<f32>,
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

pub fn clone_sequence_field(bucket: &Bucket) -> Vec<f32> {
    return bucket.values.clone();
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
        assert!(output.contains("return bucket.values.slice();"));
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

pub fn has_closing_parenthesis(value: &str) -> bool {
    return value.ends_with(")");
}

pub fn characters(value: &str) -> Vec<char> {
    return value.chars().collect();
}

pub fn filtered_characters(value: &str) -> String {
    return value.chars().filter(|character| *character != '\n').collect::<String>();
}

pub fn append_character(value: &mut String, character: char) {
    value.push(character);
}

pub fn first_character(value: &str) -> Option<char> {
    return value.chars().next();
}

pub fn lowercase_ascii(value: &str) -> String {
    return value.to_ascii_lowercase();
}

pub fn repeat_ascii(value: &str, count: usize) -> String {
    return value.repeat(count);
}

pub fn count_ampersands(value: &str) -> usize {
    let mut count = 0;
    let mut rest = value;
    while let Some(index) = rest.find('&') {
        count += 1;
        rest = &rest[index + 1..rest.len()];
    }
    return count;
}

pub fn find_semicolon_after_first_character(value: &str) -> Option<usize> {
    let suffix = &value[1..value.len()];
    return suffix.find(';');
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
        assert!(output.contains("return value.endsWith(\")\");"));
        assert!(output.contains("export function characters(value: string): string[]"));
        assert!(output.contains("return [...value];"));
        assert!(
            output.contains(
                "return [...value].filter((character) => character !== \"\\n\").join('');"
            )
        );
        assert!(output.contains("value += character;"));
        assert!(output.contains("return [...value][0];"));
        assert!(output.contains("return value.toLowerCase();"));
        assert!(output.contains("return value.repeat(count);"));
        assert!(output.contains("const index = value.indexOf(pattern);"));
        assert!(output.contains("return index === -1 ? undefined : index;"));
        assert!(output.contains("if ($index === undefined)"));
    }

    #[test]
    fn lowers_numeric_fraction_to_remainder() {
        let source = "pub fn fraction(value: f32) -> f32 { return value.fract(); }\n";

        assert_eq!(
            compile_typescript(source, None).unwrap(),
            "export function fraction(value: number): number {\n  return (value % 1);\n}\n"
        );
    }

    #[test]
    fn lowers_plain_struct_updates_to_object_spreads() {
        let source = r#"
pub struct Options {
    pub count: i32,
    pub label: String,
}

pub fn with_count(base: Options, count: i32) -> Options {
    return Options { count, ..base };
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("return { ...base, count: count };"),
            "{output}"
        );
    }

    #[test]
    fn lowers_string_clear_and_unicode_scalar_construction() {
        let source = r#"
pub struct Content {
    pub text: String,
    pub values: Vec<i32>,
}

pub fn reset(out: &mut Content) {
    out.text.clear();
    out.values.clear();
}

pub fn decode_codepoint(digits: &str, radix: u32) -> Option<String> {
    let codepoint = u32::from_str_radix(digits, radix).unwrap_or(u32::MAX);
    return char::from_u32(codepoint).map(|value| value.to_string());
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("out.text = '';"), "{output}");
        assert!(output.contains("out.values.length = 0;"), "{output}");
        assert!(output.contains("digits.charCodeAt(index)"), "{output}");
        assert!(output.contains("value > 0xffffffff"), "{output}");
        assert!(
            output.contains("String.fromCodePoint(codepoint)"),
            "{output}"
        );
        assert!(!output.contains("u32.fromStrRadix"), "{output}");
        assert!(!output.contains("char.fromU32"), "{output}");
        assert!(!output.contains(".map((value)"), "{output}");
    }

    #[test]
    fn rejects_clear_without_collection_or_string_provenance() {
        let source = r#"
pub fn reset(value: Mystery) {
    value.clear();
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.clear()` receiver `value` must be known to be `String`, `Vec`, slice, `HashMap`, or `HashSet`"
        );
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
    fn rejects_non_string_suffix_receivers() {
        let source = r#"
pub fn has_suffix(value: &[u8], suffix: &[u8]) -> bool {
    return value.ends_with(suffix);
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.ends_with()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn rejects_non_string_character_iterators() {
        let source = r#"
pub fn characters(value: &[u8]) -> Vec<u8> {
    return value.chars().collect();
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.chars()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn rejects_non_string_ascii_lowercase_receivers() {
        let source = r#"
pub fn lowercase(value: &[u8]) -> Vec<u8> {
    return value.to_ascii_lowercase();
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.to_ascii_lowercase()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn rejects_non_string_repeat_receivers() {
        let source = r#"
pub fn repeat(values: &[u8], count: usize) -> Vec<u8> {
    return values.repeat(count);
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.repeat()` requires a receiver known to be `String` or `str`"
        );
    }

    #[test]
    fn lowers_string_prefix_trimming_by_character_predicate() {
        let source = r#"
pub fn trim_padding(value: &str) -> String {
    return value.trim_start_matches(|character| character == ' ' || character == '🙂').to_string();
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains(
            "for (const character of text) { if (!matches(character)) break; offset += character.length; }"
        ));
        assert!(
            output.contains("(value, (character) => character === \" \" || character === \"🙂\")"),
            "{output}"
        );
    }

    #[test]
    fn rejects_non_string_prefix_trimming_receivers() {
        let source = r#"
pub fn trim_zero(values: &[u8]) -> String {
    return values.trim_start_matches(|value| *value == 0).to_string();
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "portable `.trim_start_matches()` requires a receiver known to be `String` or `str`"
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

pub fn utf16_length(value: &str) -> usize {
    return value.encode_utf16().count();
}

pub fn count_even(values: &[u16]) -> usize {
    return values.iter().filter(|value| **value % 2 == 0).count();
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
        assert!(output.contains(
            "return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)).length;"
        ));
        assert!(output.contains("return values.filter((value) => value % 2 === 0).length;"));
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
    fn lowers_reserved_key_data_unions_from_payload_declarations() {
        let source = r#"
//! flight-compiler: data-union MarkupResult=reserved-key

pub struct MarkupEffect {
    pub break_before: Option<bool>,
    pub format: Option<TextFormat>,
    pub text: Option<String>,
}

pub struct TextFormat {
    pub bold: Option<bool>,
    pub color: Option<u32>,
}

pub enum MarkupResult {
    Effect(MarkupEffect),
    Format(TextFormat),
}

pub fn result_kind(result: MarkupResult) -> &'static str {
    return match result {
        MarkupResult::Effect(_) => "effect",
        MarkupResult::Format(_) => "format",
    };
}

pub fn is_effect(result: &MarkupResult) -> bool {
    return matches!(result, MarkupResult::Effect(_));
}

pub fn is_format(result: &MarkupResult) -> bool {
    return matches!(result, MarkupResult::Format(_));
}

pub fn effect(value: MarkupEffect) -> MarkupResult {
    return MarkupResult::Effect(value);
}

pub fn format(value: TextFormat) -> MarkupResult {
    return MarkupResult::Format(value);
}

pub fn normalize(result: MarkupResult) -> MarkupEffect {
    return match result {
        MarkupResult::Effect(effect) => effect,
        MarkupResult::Format(format) => MarkupEffect {
            break_before: None,
            format: Some(format),
            text: None,
        },
    };
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("export type MarkupResult = MarkupEffect | TextFormat;"));
        assert!(output.contains(
            "if (Object.hasOwn(matchValue, \"breakBefore\") || Object.hasOwn(matchValue, \"format\") || Object.hasOwn(matchValue, \"text\"))"
        ));
        assert!(output.contains("else {\n    return \"format\";"));
        assert!(output.contains(
            "return Object.hasOwn(result, \"breakBefore\") || Object.hasOwn(result, \"format\") || Object.hasOwn(result, \"text\");"
        ));
        assert!(output.contains(
            "return !(Object.hasOwn(result, \"breakBefore\") || Object.hasOwn(result, \"format\") || Object.hasOwn(result, \"text\"));"
        ));
        assert!(output.contains("return value;"));
        assert!(output.contains("const effect = matchValue as MarkupEffect;"));
        assert!(output.contains("const format = matchValue as TextFormat;"));
        assert!(!output.contains("MarkupResult.Effect"));
        assert!(!output.contains("MarkupResult.Format"));
    }

    #[test]
    fn derives_reserved_keys_against_an_external_record_declaration() {
        let source = r#"
//! flight-compiler: data-union MarkupResult=reserved-key

pub struct MarkupEffect {
    pub format: Option<TextFormat>,
    pub text: Option<String>,
}

pub enum MarkupResult {
    Effect(MarkupEffect),
    Format(TextFormat),
}

pub fn kind(result: MarkupResult) -> &'static str {
    return match result {
        MarkupResult::Effect(_) => "effect",
        MarkupResult::Format(_) => "format",
    };
}
"#;
        let external = r#"
//! flight-compiler: target-native

pub trait Entity {}

pub struct TextFormat {
    pub bold: Option<bool>,
    pub color: Option<u32>,
}
"#;

        let output = compile_typescript_with_external_alias_sources(
            source,
            None,
            &[],
            &[ExternalAliasSource {
                module: "@flighthq/textformat/contract",
                source: external,
            }],
        )
        .unwrap();

        assert!(output.contains(
            "if (Object.hasOwn(matchValue, \"format\") || Object.hasOwn(matchValue, \"text\"))"
        ));
        assert!(output.contains("else {\n    return \"format\";"));
    }

    #[test]
    fn rejects_unsupported_reserved_key_data_union_shapes() {
        let cases = [
            (
                "//! flight-compiler: data-union Value=unknown\npub enum Value { First(i32), Second(String) }\n",
                "`flight-compiler: data-union` enum `Value` has unknown style `unknown`",
            ),
            (
                "//! flight-compiler: data-union Value=reserved-key\npub enum Value { Only(Record) }\npub struct Record { pub value: i32 }\n",
                "reserved-key data union `Value` requires exactly two payload variants",
            ),
            (
                "//! flight-compiler: data-union Value=reserved-key\npub enum Value { First(Record), Second }\npub struct Record { pub value: i32 }\n",
                "reserved-key data union `Value` requires exactly one unnamed payload field per variant",
            ),
            (
                "//! flight-compiler: data-union Value=reserved-key\npub enum Value { First(Missing), Second(Fallback) }\npub struct Fallback { pub value: i32 }\n",
                "cannot resolve reserved-key data union payload type `Missing` to a record declaration",
            ),
            (
                "//! flight-compiler: data-union Value=reserved-key\npub enum Value { First(Vec<i32>), Second(Fallback) }\npub struct Fallback { pub value: i32 }\n",
                "cannot resolve reserved-key data union payload type `Vec` to a record declaration",
            ),
            (
                "//! flight-compiler: data-union Value=reserved-key\npub enum Value { First(Record), Second(Record) }\npub struct Record { pub value: i32 }\n",
                "reserved-key data union `Value` has no first-variant property absent from its fallback payload",
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
    fn rejects_nonexhaustive_reserved_key_data_union_matches() {
        let source = r#"
//! flight-compiler: data-union Value=reserved-key

pub struct Effect { pub text: Option<String> }
pub struct Format { pub bold: Option<bool> }
pub enum Value { Effect(Effect), Format(Format) }

pub fn kind(value: Value) -> &'static str {
    return match value {
        Value::Effect(_) => "effect",
    };
}
"#;

        let error = compile_typescript(source, None).unwrap_err();

        assert_eq!(
            error.to_string(),
            "reserved-key data union match is not exhaustive; missing `Value::Format`"
        );
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
    Record(LogRecord),
    Array(Vec<LogValue>),
    Object(UnknownValue),
}

pub struct LogRecord {
    pub label: String,
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
    fn omits_suites_that_contain_only_rust_only_tests() {
        let source = r#"
mod native_only {
    /// flight-compiler: rust-only — target has a separate identity probe.
    #[test]
    fn preserves_native_identity() {}
}
"#;

        let output = compile_vitest(source, "./contract.ts").unwrap();
        assert!(!output.contains("describe(\"nativeOnly\""), "{output}");
        assert!(!output.contains("Rust-only"), "{output}");
    }

    #[test]
    fn keeps_unknown_crate_root_functions_in_the_target_native_test_support_lane() {
        let production = r#"
pub fn selected_value() -> i32 {
    return 1;
}

pub fn unselected_value() -> i32 {
    return 2;
}
"#;
        let contract = "pub use crate::sample::selected_value;\n";
        let source = r#"
use flight_example::*;

#[test]
fn compares_with_rust_only_support() {
    crate::assert_same(selected_value(), 1);
}
"#;
        let aliases = [VitestAliasSource {
            source: production,
            module: "crates/flight-example/src/sample.rs",
        }];

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap();
        assert!(output.contains("crate.assertSame(selectedValue(), 1);"));

        let unselected = source.replace("crate::assert_same", "crate::unselected_value");
        let error = compile_vitest_with_contract_alias_sources(
            &unselected,
            "@flighthq/example/contract",
            contract,
            &aliases,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("contract.rs does not select"), "{error}");
    }

    #[test]
    fn honors_nullable_options_in_portable_tests() {
        let production = r#"
pub fn optional_value() -> Option<i32> {
    return None;
}

pub fn pass_optional(value: Option<i32>) -> Option<i32> {
    return value;
}
"#;
        let source = r#"
//! flight-compiler: nullable-options

use flight_example::*;

fn nullable_helper(value: Option<i32>) -> Option<i32> {
    return value;
}

mod optional_value {
    use super::*;

    #[test]
    fn preserves_the_packages_null_representation() {
        assert_eq!(optional_value(), None);
        assert_eq!(pass_optional(None), None);
        assert_eq!(nullable_helper(None), None);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/example/contract", &[production])
                .unwrap();

        assert!(output.contains("expect(optionalValue()).toEqual(null);"));
        assert!(output.contains("expect(passOptional(undefined)).toEqual(null);"));
        assert!(output.contains("expect(nullableHelper(null)).toEqual(null);"));
    }

    #[test]
    fn emits_generic_test_helpers_with_their_own_type_parameters() {
        let source = r#"
use crate::*;

fn unwrap_value<T: Clone>(boxed: &Box2<T>) -> T {
    return boxed.value.clone();
}

#[test]
fn wraps_values() {
    assert_eq!(unwrap_value(&wrap(3)), 3);
}
"#;
        let output = compile_vitest(source, "./contract.ts").unwrap();
        assert!(
            output.contains("function unwrapValue<T>(boxed: Readonly<Box2<T>>): T {"),
            "{output}"
        );
        assert!(
            output.contains("import type {\n  Box2,\n} from \"./contract.ts\";"),
            "{output}"
        );
        assert!(!output.contains("  T,\n"), "{output}");
    }

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
    fn lowers_rwlock_guard_assignments_without_mutex_wrapper_cells() {
        let source = r#"
use std::sync::{Arc, Mutex, RwLock};

pub fn replace_shared(shared: Arc<RwLock<i32>>, fallback: Arc<Mutex<i32>>) {
    *shared.write().unwrap() = 2;
    let mut shared_guard = shared.write().unwrap();
    *shared_guard = 3;
    *shared_guard += 1;
    *fallback.lock().unwrap() = 4;
    drop(shared_guard);
}

pub fn replace_shadowed(shared: Arc<RwLock<i32>>, target: &mut i32) {
    if true {
        let mut target = shared.write().unwrap();
        *target = 5;
    }
    *target = 6;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("shared = 2;"), "{output}");
        assert!(output.contains("shared = 3;"), "{output}");
        assert!(output.contains("shared += 1;"), "{output}");
        assert!(output.contains("fallback.value = 4;"), "{output}");
        assert!(output.contains("shared = 5;"), "{output}");
        assert!(output.contains("target = 6;"), "{output}");
        assert!(!output.contains("target.value"), "{output}");
        assert!(output.contains("void sharedGuard;"), "{output}");
        assert!(!output.contains(".value.value"), "{output}");
    }

    #[test]
    fn writes_through_cloned_ref_fields_to_the_original_typescript_field() {
        let source = r#"
use std::sync::{Arc, RwLock};

pub struct Signal {
    pub emit: Arc<RwLock<i32>>,
}

pub struct SignalState {
    pub signal: Signal,
}

pub struct Owner {
    pub state: SignalState,
}

pub fn borrow_owner(owner: &Owner) -> &Owner {
    return owner;
}

pub fn replace_emit(signal: &Signal) {
    let cell = signal.emit.clone();
    *cell.write().unwrap() = 2;
    *cell.write().unwrap() += 1;
    let _captured = signal.emit.clone();
    *_captured.write().unwrap() = 4;
}

pub fn replace_nested_emit(owner: &Owner) {
    let cell = owner.state.signal.emit.clone();
    *cell.write().unwrap() = 5;
}

pub fn replace_inferred_state_emit(owner: &Owner) {
    let state = &owner.state;
    let cell = state.signal.emit.clone();
    *cell.write().unwrap() = 6;
}

pub fn replace_returned_owner_emit(owner: &Owner) {
    let cell = borrow_owner(owner).state.signal.emit.clone();
    *cell.write().unwrap() = 7;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(output.contains("const cell = signal.emit;"), "{output}");
        assert!(output.contains("signal.emit = 2;"), "{output}");
        assert!(output.contains("signal.emit += 1;"), "{output}");
        assert!(output.contains("signal.emit = 4;"), "{output}");
        assert!(
            output.contains("const cell = owner.state.signal.emit;"),
            "{output}"
        );
        assert!(output.contains("owner.state.signal.emit = 5;"), "{output}");
        assert!(output.contains("const state = owner.state;"), "{output}");
        assert!(
            output.contains("const cell = state.signal.emit;"),
            "{output}"
        );
        assert!(output.contains("state.signal.emit = 6;"), "{output}");
        assert!(
            output.contains("const cellReceiver = borrowOwner(owner);"),
            "{output}"
        );
        assert!(
            output.contains("const cell = cellReceiver.state.signal.emit;"),
            "{output}"
        );
        assert!(
            output.contains("cellReceiver.state.signal.emit = 7;"),
            "{output}"
        );
        assert_eq!(output.matches("borrowOwner(owner)").count(), 1, "{output}");
        assert!(!output.contains("const Captured"), "{output}");
        assert!(!output.contains("cell = 2;"), "{output}");
        assert!(!output.contains("cell = 5;"), "{output}");
        assert!(!output.contains("cell = 6;"), "{output}");
        assert!(!output.contains("cell = 7;"), "{output}");
    }

    #[test]
    fn writes_through_proven_ref_fields_in_portable_tests() {
        let production = r#"
use std::sync::{Arc, RwLock};

pub struct Signal {
    pub emit: Arc<RwLock<i32>>,
}

pub fn create_signal() -> Signal {
    unimplemented!()
}
"#;
        let tests = r#"
use flight_example::*;

#[test]
fn replaces_the_shared_cell() {
    let signal: Signal = create_signal();
    let cell = signal.emit.clone();
    *cell.write().unwrap() = 2;
}
"#;

        let output =
            compile_vitest_with_alias_sources(tests, "@flighthq/example/contract", &[production])
                .unwrap();

        assert!(output.contains("const cell = signal.emit;"), "{output}");
        assert!(output.contains("signal.emit = 2;"), "{output}");
        assert!(!output.contains("cell = 2;"), "{output}");
    }

    #[test]
    fn keeps_clones_of_non_cell_fields_independent() {
        let source = r#"
pub struct Bag {
    pub values: Vec<i32>,
}

pub fn append_to_clone(bag: &Bag) -> Vec<i32> {
    let mut copied = bag.values.clone();
    copied.push(3);
    return copied;
}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("let copied = bag.values.slice();"),
            "{output}"
        );
        assert!(output.contains("copied.push(3);"), "{output}");
        assert!(!output.contains("bag.values.push(3);"), "{output}");
    }

    #[test]
    fn preserves_tuple_positions_in_literal_array_for_loops() {
        let source = r#"
pub fn visit() {
    for (label, priority) in [("low", -1), ("high", 10)] {
        consume(label, priority);
    }
}

fn consume(_label: &str, _priority: i32) {}
"#;

        let output = compile_typescript(source, None).unwrap();

        assert!(
            output.contains("for (const [label, priority] of [[")
                && output.contains("]] as const)"),
            "{output}"
        );
    }

    #[test]
    fn clones_designated_entity_fields_as_shared_forwarding_properties() {
        let source = r#"
//! flight-compiler: entity-clone-fields Wrapper.data

pub struct Wrapper {
    pub data: std::sync::Arc<std::sync::RwLock<Option<i32>>>,
    runtime: flight_entity::EntityRuntimeSlot,
}

pub fn clone_wrapper(wrapper: &Wrapper) -> Wrapper {
    return wrapper.clone();
}
"#;

        let output = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap();

        assert!(
            output.contains("Object.defineProperties({ ...wrapper },"),
            "{output}"
        );
        assert!(output.contains("get: () => wrapper.data"), "{output}");
        assert!(
            output.contains("set: (value) => { wrapper.data = value; }"),
            "{output}"
        );
    }

    #[test]
    fn rejects_plain_fields_designated_as_shared_entity_clone_cells() {
        let source = r#"
//! flight-compiler: entity-clone-fields Wrapper.data

pub struct Wrapper {
    pub data: Vec<i32>,
    runtime: flight_entity::EntityRuntimeSlot,
}
"#;

        let error = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap_err();

        assert_eq!(
            error.to_string(),
            "`flight-compiler: entity-clone-fields Wrapper.data` must designate a proven `flight_entity::Ref<T>` or standard `Arc<RwLock<T>>` field"
        );
    }

    #[test]
    fn rejects_local_types_named_like_shared_entity_clone_cells() {
        let source = r#"
//! flight-compiler: entity-clone-fields Wrapper.data

pub struct Ref<T> {
    pub value: T,
}

pub struct Wrapper {
    pub data: Ref<i32>,
    runtime: flight_entity::EntityRuntimeSlot,
}
"#;

        let error = compile_typescript(source, Some("@flighthq/entity/contract")).unwrap_err();

        assert_eq!(
            error.to_string(),
            "`flight-compiler: entity-clone-fields Wrapper.data` must designate a proven `flight_entity::Ref<T>` or standard `Arc<RwLock<T>>` field"
        );
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
    fn lowers_nullable_fields_through_ref_lock_guards_in_portable_tests() {
        let production = r#"
//! flight-compiler: nullable-option NullableSample.previous

use flight_entity::Ref;

pub struct NullableSample {
    pub previous: Option<i32>,
}

pub fn create_nullable_sample() -> Ref<NullableSample> {
    unimplemented!()
}
"#;
        let source = r#"
use flight_example::*;

#[test]
fn reads_nullable_fields_through_ref_guards() {
    let sample = create_nullable_sample();
    assert!(sample.read().unwrap().previous.is_none());
    assert!(create_nullable_sample().read().unwrap().previous.is_none());
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/example/contract", &[production])
                .unwrap();

        assert_eq!(
            output
                .matches("expect(sample!.previous === null).toBe(true);")
                .count(),
            1,
            "{output}"
        );
        assert_eq!(
            output
                .matches("expect(createNullableSample()!.previous === null).toBe(true);")
                .count(),
            1,
            "{output}"
        );
        assert!(!output.contains("previous === undefined"), "{output}");
    }

    #[test]
    fn lowers_option_return_presence_checks_by_the_owning_source_mode() {
        let nullable_production = r#"
//! flight-compiler: nullable-options

pub fn find_nullable() -> Option<i32> {
    return None;
}
"#;
        let optional_production = r#"
pub fn find_optional() -> Option<i32> {
    return None;
}
"#;
        let source = r#"
use flight_example::*;

#[test]
fn follows_each_returns_source_mode() {
    assert!(find_nullable().is_none());
    assert!(find_optional().is_none());
    let returned_value = find_nullable();
    assert!(returned_value.is_none());
    let cloned_value = returned_value.clone();
    assert!(cloned_value.is_none());
    if true {
        let returned_value = find_optional();
        assert!(returned_value.is_none());
    }
    assert!(!returned_value.is_some());
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/example/contract",
            &[nullable_production, optional_production],
        )
        .unwrap();

        assert!(output.contains("expect(findNullable() === null).toBe(true);"));
        assert!(output.contains("expect(findOptional() === undefined).toBe(true);"));
        assert!(output.contains("expect(returnedValue === null).toBe(true);"));
        assert!(output.contains("expect(clonedValue === null).toBe(true);"));
        assert!(output.contains("expect(returnedValue === undefined).toBe(true);"));
        assert!(output.contains("expect(!(returnedValue !== null)).toBe(true);"));
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

struct Options {
    count: i32,
    label: String,
}

fn default_options() -> Options {
    return Options { count: 0, label: "default".to_string() };
}

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
        let options = Options { count: 2, ..default_options() };
        assert_eq!(options.count, 2);
        assert_eq!(options.label, "default");
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
        assert!(output.contains("const options: Options = { ...defaultOptions(), count: 2 };"));
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
    fn does_not_const_assert_calls_with_string_union_arguments() {
        let production = r#"
//! flight-compiler: string-union Mode

pub enum Mode {
    Fast,
    Slow,
}

pub fn select(mode: Mode) -> i32 {
    return if mode == Mode::Fast { 1 } else { 2 };
}
"#;
        let source = r#"
use flight_example::*;

mod select {
    use super::*;

    #[test]
    fn accepts_a_string_union_argument() {
        let selected = select(Mode::Fast);
        assert_eq!(selected, 1);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/example/contract", &[production])
                .unwrap();

        assert!(output.contains("const selected = select(\"fast\");"));
        assert!(!output.contains("select(\"fast\") as const"));
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
        let mut selection: LassoSelection = create_lasso_selection();
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

        assert!(output.contains(
            "import type {\n  LassoSelectionRaw,\n} from \"@flighthq/selection/contract\";"
        ));
        assert!(
            output.contains("    let selection: LassoSelectionRaw = createLassoSelection();\n")
        );
        assert!(output.contains("    beginLassoSelection(selection);\n"));
        assert!(output.contains("    expect(isLassoSelectionActive(selection)).toBe(true);\n"));
        assert!(output.contains("    expect(!isLassoSelectionActive(other)).toBe(true);\n"));
        assert!(!output.contains("EntityRuntimeKey"));
        assert!(!output.contains(".state"));
    }

    #[test]
    fn imports_lazy_lock_statics_by_their_exported_names() {
        let production = r#"
//! flight-compiler: export-name SHARED_KERNEL sharedKernel

use std::sync::LazyLock;

use flight_entity::{EntityRuntimeSlot, allocate_entity};

pub struct Kernel {
    runtime: EntityRuntimeSlot,
    pub scale: f64,
}

flight_entity::impl_entity!(Kernel);

pub static SHARED_KERNEL: LazyLock<Kernel> = LazyLock::new(create_kernel);

pub static DOUBLE_KERNEL: LazyLock<Kernel> = LazyLock::new(|| create_scaled_kernel(2.0));

pub fn create_kernel() -> Kernel {
    return create_scaled_kernel(1.0);
}

pub fn create_scaled_kernel(scale: f64) -> Kernel {
    let mut out: Kernel = allocate_entity();
    out.scale = scale;
    return out;
}

pub fn get_kernel(kernel: Option<&Kernel>) -> &Kernel {
    return kernel.unwrap_or(&*SHARED_KERNEL);
}
"#;
        let contract = "pub use crate::kernel::DOUBLE_KERNEL;\npub use crate::kernel::SHARED_KERNEL;\npub use crate::kernel::create_kernel;\npub use crate::kernel::create_scaled_kernel;\npub use crate::kernel::get_kernel;\n";
        let source = r#"
use flight_kernel::contract::*;

mod shared_kernel {
    use super::*;

    #[test]
    fn is_the_one_shared_default_kernel() {
        assert_eq!(SHARED_KERNEL.scale, 1.0);
        assert_eq!(DOUBLE_KERNEL.scale, 2.0);
        assert_eq!(get_kernel(None).scale, 1.0);
        let other = create_kernel();
        assert_eq!(get_kernel(Some(&other)).scale, 1.0);
    }
}
"#;

        let output = compile_vitest_with_contract_alias_sources(
            source,
            "@flighthq/kernel/contract",
            contract,
            &[VitestAliasSource {
                source: production,
                module: "crates/flight-kernel/src/kernel.rs",
            }],
        )
        .unwrap();

        assert!(output.contains(
            "  DOUBLE_KERNEL,\n  createKernel,\n  getKernel,\n  sharedKernel,\n} from \"@flighthq/kernel/contract\";"
        ));
        assert!(output.contains("describe(\"sharedKernel\", () => {"));
        assert!(output.contains("    expect(sharedKernel.scale).toEqual(1.0);\n"));
        assert!(output.contains("    expect(DOUBLE_KERNEL.scale).toEqual(2.0);\n"));
        assert!(output.contains("    expect(getKernel(undefined).scale).toEqual(1.0);\n"));
        assert!(!output.contains("SHARED_KERNEL"));
        assert!(!output.contains("LazyLock"));
    }

    #[test]
    fn calls_array_like_parameters_with_arrays_and_typed_arrays() {
        let production = r#"
//! flight-compiler: array-like sum_pairs.points pair_total.values

pub fn sum_pairs(points: &[f64], offset: f64) -> f64 {
    if points.is_empty() {
        return offset;
    }
    let mut total = offset;
    let mut i = 0;
    while i + 1 < points.len() {
        total += points[i] * points[i + 1];
        i += 2;
    }
    return total + pair_total(&points);
}

pub fn pair_total(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    return values[0] + values[1];
}

pub fn sum_values(values: &[f64]) -> f64 {
    let mut total = 0.0;
    for value in values {
        total += value;
    }
    return total;
}
"#;
        let source = r#"
use flight_pairs::*;

mod sum_pairs {
    use super::*;

    #[test]
    fn accepts_plain_and_typed_coordinate_arrays() {
        let typed: [f64; 4] = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(sum_pairs(&[1.0, 2.0, 3.0, 4.0], 0.5), 17.5);
        assert_eq!(sum_pairs(&typed, 0.5), 17.5);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/pairs/contract", &[production])
                .unwrap();

        assert!(output.contains("new Float64Array([1.0, 2.0, 3.0, 4.0])"));
        assert!(
            output.contains("    expect(sumPairs([1.0, 2.0, 3.0, 4.0], 0.5)).toEqual(17.5);\n")
        );
        assert!(output.contains("    expect(sumPairs(typed, 0.5)).toEqual(17.5);\n"));
    }

    #[test]
    fn lowers_crate_qualified_string_union_variants_in_tests() {
        let production = r#"
//! flight-compiler: string-union Winding

pub enum Winding {
    NonZero,
    EvenOdd,
}

pub fn is_even_odd(winding: Winding) -> bool {
    return matches!(winding, Winding::EvenOdd);
}
"#;
        let source = r#"
use flight_pairs::*;

mod is_even_odd {
    use super::*;

    #[test]
    fn reads_qualified_variants() {
        assert!(is_even_odd(flight_pairs::Winding::EvenOdd));
        assert!(!is_even_odd(Winding::NonZero));
    }
}
"#;
        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/pairs/contract", &[production])
                .unwrap();

        assert!(
            output.contains("expect(isEvenOdd(\"evenOdd\")).toBe(true);"),
            "{output}"
        );
        assert!(
            output.contains("expect(!isEvenOdd(\"nonZero\")).toBe(true);"),
            "{output}"
        );
        assert!(!output.contains("flightPairs"), "{output}");
    }

    #[test]
    fn keeps_own_crate_items_off_a_foreign_wildcard_import() {
        let production = r#"
pub type PairContour = Vec<f64>;

pub const PAIR_LIMIT: f64 = 2.0;

pub fn pair_total(values: &PairContour) -> f64 {
    return values[0] + values[1];
}
"#;
        let source = r#"
use flight_shapes::*;
use flight_pairs::contract::*;

mod pair_total {
    use super::*;

    #[test]
    fn totals_a_contour_from_a_foreign_shape() {
        let contour: PairContour = shape_contour(PAIR_LIMIT);
        assert_eq!(pair_total(&contour), 4.0);
    }
}
"#;
        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/pairs/contract", &[production])
                .unwrap();

        assert!(
            output.contains("import { shapeContour } from \"@flighthq/shapes/contract\";\n"),
            "{output}"
        );
        assert!(
            !output.contains("PairContour } from \"@flighthq/shapes"),
            "{output}"
        );
        assert!(!output.contains("PAIR_LIMIT, shapeContour"), "{output}");
        assert!(output.contains("PAIR_LIMIT"), "{output}");
        assert!(
            output
                .contains("import type {\n  PairContour,\n} from \"@flighthq/pairs/contract\";\n"),
            "{output}"
        );
        assert!(
            output.contains("  PAIR_LIMIT,\n  pairTotal,\n} from \"@flighthq/pairs/contract\";\n"),
            "{output}"
        );
    }

    #[test]
    fn converts_fixed_typed_array_test_constants_and_pushes() {
        let production = r#"
pub fn sum_values(values: &[f64]) -> f64 {
    let mut total = 0.0;
    for value in values {
        total += value;
    }
    return total;
}
"#;
        let source = r#"
use flight_pairs::*;

const UNIT_SQUARE: [f64; 4] = [0.0, 1.0, 1.0, 0.0];

fn helper_total(points: &[f64]) -> f64 {
    return sum_values(points);
}

fn helper_pairs(count: usize) -> Vec<[f64; 2]> {
    let mut pairs: Vec<[f64; 2]> = Vec::new();
    for index in 0..count {
        pairs.push([index as f64, 1.0]);
    }
    return pairs;
}

mod sum_values {
    use super::*;

    #[test]
    fn sums_fixed_typed_arrays_through_slices() {
        let typed: [f64; 2] = [1.0, 2.0];
        assert_eq!(sum_values(&typed), 3.0);
        assert_eq!(helper_total(&UNIT_SQUARE), 2.0);
        assert_eq!(helper_pairs(2).len(), 2);
    }
}
"#;
        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/pairs/contract", &[production])
                .unwrap();

        assert!(
            output.contains(
                "const UNIT_SQUARE: Float64Array = new Float64Array([0.0, 1.0, 1.0, 0.0]);\n"
            ),
            "{output}"
        );
        assert!(
            output.contains("pairs.push(new Float64Array([index, 1.0]));"),
            "{output}"
        );
        assert!(
            output.contains("expect(sumValues(Array.from(typed))).toEqual(3.0);"),
            "{output}"
        );
        assert!(
            output.contains("expect(helperTotal(Array.from(UNIT_SQUARE))).toEqual(2.0);"),
            "{output}"
        );
    }

    #[test]
    fn compares_none_against_the_absent_value_of_nullable_options() {
        let production = r#"
//! flight-compiler: nullable-option find_scale Explanation.contour

pub struct Explanation {
    pub supported: bool,
    pub contour: Option<f64>,
    pub detail: Option<f64>,
}

pub fn find_scale(values: &[f64], tolerance: Option<f64>) -> Option<f64> {
    let limit = tolerance.unwrap_or(0.25);
    if values.is_empty() {
        return None;
    }
    if values[0] > limit {
        return Some(values[0]);
    }
    return lookup(values);
}

pub fn lookup(values: &[f64]) -> Option<f64> {
    if values.len() > 1 {
        return Some(values[1]);
    }
    return None;
}

pub fn explain(values: &[f64]) -> Explanation {
    let found = lookup(values);
    let scale = find_scale(values, None);
    if let Some(value) = scale {
        return Explanation { supported: value > 0.0, contour: found, detail: None };
    }
    return Explanation { supported: false, contour: None, detail: found };
}
"#;
        let source = r#"
use flight_scales::*;

mod find_scale {
    use super::*;

    #[test]
    fn reports_absent_scales_as_none() {
        assert_eq!(find_scale(&[], None), None);
        assert!(find_scale(&[1.0], None).is_some());
        assert_eq!(explain(&[]).contour, None);
        assert_eq!(lookup(&[]), None);
    }
}
"#;

        let output =
            compile_vitest_with_alias_sources(source, "@flighthq/scales/contract", &[production])
                .unwrap();

        assert!(output.contains("    expect(findScale([], undefined)).toEqual(null);\n"));
        assert!(output.contains("    expect(findScale([1.0], undefined) !== null).toBe(true);\n"));
        assert!(output.contains("    expect(explain([]).contour).toEqual(null);\n"));
        assert!(output.contains("    expect(lookup([])).toEqual(undefined);\n"));
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
    fn inherits_reserved_key_data_union_lowering_from_production_sources() {
        let production = r#"
//! flight-compiler: data-union MarkupResult=reserved-key

pub struct MarkupEffect {
    pub text: Option<String>,
}

pub struct TextFormat {
    pub bold: Option<bool>,
}

pub enum MarkupResult {
    Effect(MarkupEffect),
    Format(TextFormat),
}
"#;
        let source = r#"
use flight_text_markup::*;

mod markup_results {
    use super::*;

    #[test]
    fn constructs_and_matches_an_effect() {
        let result = MarkupResult::Effect(MarkupEffect {
            text: Some("replacement".to_string()),
        });
        let kind = match result {
            MarkupResult::Effect(_) => "effect",
            MarkupResult::Format(_) => "format",
        };
        assert_eq!(kind, "effect");
    }
}
"#;

        let output = compile_vitest_with_alias_sources(
            source,
            "@flighthq/text-markup/contract",
            &[production],
        )
        .unwrap();

        assert!(output.contains("const result = { text: \"replacement\" };"));
        assert!(output.contains("if (Object.hasOwn(matchValue, \"text\"))"));
        assert!(
            output.contains("else {\n    return \"format\";"),
            "{output}"
        );
        assert!(!output.contains("MarkupResult.Effect"));
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
pub fn measure_text(measure: &dyn Fn(&str) -> f32) {}
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

        let measure = |text| text.encode_utf16().count() as f32;
        measure_text(&measure);
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
        assert!(output.contains(
            "const measure = (text: string) => Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length;"
        ));
        assert!(output.contains("measureText(measure);"));
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
