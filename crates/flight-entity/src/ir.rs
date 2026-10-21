//! IR vocabulary aliases (agents/ir-vocabulary.md). Each alias has exactly one mapping per
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

/// Typed-array aliases for TS APIs that declare a typed array. `&Float32Array` maps to
/// `Readonly<Float32Array>` in TS while Rust callers may pass any `f32` slice, `Vec` or array.
/// C++ `std::span<N>`, Haxe `haxe.io.Float32Array` etc.
pub type Float32Array = [f32];
// flight-lint: allow(f64) vocabulary alias for TS Float64Array; only used where TS declares one
pub type Float64Array = [f64];
pub type Uint8Array = [u8];
pub type Uint16Array = [u16];
pub type Uint32Array = [u32];
pub type Int8Array = [i8];
pub type Int16Array = [i16];
pub type Int32Array = [i32];
