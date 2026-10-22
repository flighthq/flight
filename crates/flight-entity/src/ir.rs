//! IR vocabulary aliases (agents/rust/ir-vocabulary.md). Each alias has exactly one mapping per
//! transpile target; contract code names the alias, never the type behind it.

use std::any::Any;
use std::sync::{Arc, RwLock};

/// Shared object identity (A2): `create_*` returns it, `dispose_*` breaks cycles, and memory
/// frees at the last drop. Thread-safe by default. TS `T`, C++ `std::shared_ptr<T>`, Haxe `T`.
pub type Ref<T> = Arc<RwLock<T>>;

/// Object identity tag (D2). TS `Kind (= string)`, C++ `std::string`, Haxe `String`.
pub type Kind = String;

/// The only erased type (D2): an optional slot read back through a typed `get_*_data` cast.
/// TS `unknown`, C++ `std::any`, Haxe `Dynamic`.
pub type AnySlot = Option<Box<dyn Any + Send + Sync>>;

/// A cloneable erased value with shared object identity. TS `unknown`, C++ shared `std::any`,
/// Haxe `Dynamic`. `None` is an explicit null; wrap this alias in `Option` when absence must remain
/// distinct from null.
pub type Unknown = Option<UnknownValue>;

/// A non-null erased value with shared object identity: the payload of `Unknown`. TS `unknown`
/// (an object value), C++ `std::shared_ptr<const std::any>`, Haxe `Dynamic`.
pub type UnknownValue = Arc<dyn Any + Send + Sync>;

// Typed-array aliases for TS APIs that declare a typed array. `&Float32Array` maps to
// `Readonly<Float32Array>` in TS while Rust callers may pass any matching slice, `Vec` or array.
// C++ `std::span<N>`, Haxe `haxe.io.Float32Array` etc.

/// `f32` typed array. TS `Float32Array`.
pub type Float32Array = [f32];
// flight-lint: allow(f64) vocabulary alias for TS Float64Array; only used where TS declares one
/// `f64` typed array. TS `Float64Array`.
pub type Float64Array = [f64];
/// `u8` typed array. TS `Uint8Array` (also pixel data; no clamped variant in the IR).
pub type Uint8Array = [u8];
/// `u16` typed array. TS `Uint16Array`.
pub type Uint16Array = [u16];
/// `u32` typed array. TS `Uint32Array`.
pub type Uint32Array = [u32];
/// `i8` typed array. TS `Int8Array`.
pub type Int8Array = [i8];
/// `i16` typed array. TS `Int16Array`.
pub type Int16Array = [i16];
/// `i32` typed array. TS `Int32Array`.
pub type Int32Array = [i32];
