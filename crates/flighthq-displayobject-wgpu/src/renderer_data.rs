//! Typed renderer-data boxing helpers — the Rust analogue of the TS
//! `wgpuRendererData` double-cast helpers.
//!
//! In TS the two functions are pure `as` casts between a concrete `WgpuFooData`
//! and the erased `RendererData` slot a renderer's `createData` stores. The Rust
//! erasure is a `Box<dyn RendererData>`, so `create_wgpu_renderer_data` boxes the
//! concrete value and `get_wgpu_renderer_data` downcasts a borrowed slot back to
//! the concrete type, returning `None` when absent or mistyped.

use std::any::Any;

use flighthq_types::RendererData;

/// Boxes `data` as an erased `RendererData` for storage in a renderer's
/// `create_data` return value. The Rust analogue of the TS
/// `createWgpuRendererData` cast.
pub fn create_wgpu_renderer_data<T: RendererData>(data: T) -> Box<dyn RendererData> {
    Box::new(data)
}

/// Downcasts an erased `RendererData` slot back to `T` for reading inside
/// `submit` / `destroy_data` implementations. Returns `None` when the slot is
/// absent or holds a different concrete type. The Rust analogue of the TS
/// `getWgpuRendererData` cast.
pub fn get_wgpu_renderer_data<T: RendererData>(data: Option<&dyn RendererData>) -> Option<&T> {
    (data? as &dyn Any).downcast_ref::<T>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq)]
    struct WgpuFooData {
        value: i32,
    }
    impl RendererData for WgpuFooData {}

    struct WgpuBarData;
    impl RendererData for WgpuBarData {}

    #[test]
    fn create_then_get_round_trips_the_value() {
        let boxed = create_wgpu_renderer_data(WgpuFooData { value: 42 });
        let recovered = get_wgpu_renderer_data::<WgpuFooData>(Some(boxed.as_ref()));
        assert_eq!(recovered, Some(&WgpuFooData { value: 42 }));
    }

    #[test]
    fn get_returns_none_when_slot_is_absent() {
        assert!(get_wgpu_renderer_data::<WgpuFooData>(None).is_none());
    }

    #[test]
    fn get_returns_none_on_type_mismatch() {
        let boxed = create_wgpu_renderer_data(WgpuBarData);
        assert!(get_wgpu_renderer_data::<WgpuFooData>(Some(boxed.as_ref())).is_none());
    }
}
