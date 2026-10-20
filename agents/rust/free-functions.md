# Free Function Patterns

Every public API in the Flight SDK must exist as a free function. This document shows the canonical patterns by category.

## Constructor pair

```rust
pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    let mut out = Vector2::default();
    initialize_vector2(&mut out, x, y);
    return out;
}

pub fn initialize_vector2(out: &mut Vector2, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}
```

`create_*` returns by value. `initialize_*` writes to pre-allocated memory.

## Out-parameter with alias safety

Functions that write a result must capture all inputs into locals before any write to `out`:

```rust
pub fn add_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + bx;
    out.y = ay + by;
}
```

This ensures correctness when `out` points to the same memory as `a` or `b` (extern C aliasing).

## Clone / Copy

```rust
pub fn clone_vector2(source: &Vector2) -> Vector2 {
    return create_vector2(source.x, source.y);
}

pub fn copy_vector2(out: &mut Vector2, source: &Vector2) {
    let x = source.x;
    let y = source.y;
    out.x = x;
    out.y = y;
}
```

`clone` allocates and returns. `copy` writes to an existing out-parameter. Both capture before writing.

## Equality with identity check

```rust
pub fn equals_vector2(a: Option<&Vector2>, b: Option<&Vector2>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}
```

`Option<&T>` maps to nullable. `ptr::eq` handles NaN (identity means equal even if NaN fields).

## Near-equality with explicit tolerance

```rust
pub fn near_equals_vector2(a: &Vector2, b: &Vector2, tolerance: f32) -> bool {
    return (a.x - b.x).abs() <= tolerance && (a.y - b.y).abs() <= tolerance;
}
```

No default parameters in Rust — tolerance is always explicit. The TS equivalent has a default; callers choose the tolerance.

## Normalize (returns prior state)

```rust
pub fn normalize_vector2(out: &mut Vector2, source: &Vector2) -> f32 {
    let x = source.x;
    let y = source.y;
    let len = (x * x + y * y).sqrt();
    if len > 1e-10 {
        let inv = 1.0 / len;
        out.x = x * inv;
        out.y = y * inv;
    } else {
        out.x = 0.0;
        out.y = 0.0;
    }
    return len;
}
```

Returns the original length (useful for callers that need it). Matches TS signature.

## Float32Array interop

```rust
pub fn set_vector2_from_float32_array(out: &mut Vector2, offset: usize, source: &[f32]) {
    out.x = source[offset];
    out.y = source[offset + 1];
}

pub fn write_vector2_to_float32_array(out: &mut [f32], offset: usize, source: &Vector2) {
    out[offset] = source.x;
    out[offset + 1] = source.y;
}
```

`&[f32]` / `&mut [f32]` map to `Float32Array` in TS and `float*` in C.

## Cross-type conversion

```rust
pub fn set_vector2_from_vector3(out: &mut Vector2, source: &Vector3) {
    out.x = source.x;
    out.y = source.y;
}
```

Named explicitly by source and target type. No generics — each conversion is a distinct function.

## Impl block (NOT transpiled)

```rust
impl Vector2 {
    pub fn new(x: f32, y: f32) -> Self {
        return create_vector2(x, y);
    }

    pub fn add(&self, other: &Self) -> Self {
        let mut out = Self::new(0.0, 0.0);
        add_vector2(&mut out, self, other);
        return out;
    }
}
```

Pure Rust convenience — each target language writes its own class layer. Methods always delegate to free functions.

## Constants

```rust
pub const VECTOR2_X_AXIS: Vector2 = Vector2 { x: 1.0, y: 0.0 };
pub const VECTOR2_Y_AXIS: Vector2 = Vector2 { x: 0.0, y: 1.0 };
```

Placed after the impl block. Named with the type prefix.
