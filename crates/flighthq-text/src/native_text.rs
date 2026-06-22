use flighthq_types::{KindId, NativeTextData, NativeTextStyle, Rectangle, TextAutoSize};

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

/// Returns the singleton `KindId` for `NativeText` display objects.
pub fn native_text_kind() -> KindId {
    flighthq_types::native_text_kind()
}

// ---------------------------------------------------------------------------
// Runtime state (opaque to callers outside this crate)
// ---------------------------------------------------------------------------

/// Internal per-node runtime state for a `NativeText`.
///
/// `measured_width`/`measured_height` are written back by the platform renderer
/// after layout so that `compute_native_text_local_bounds_rectangle` can remain
/// DOM-free. `content_revision`/`bounds_revision` are bumped by the setters,
/// mirroring the TS `invalidateNodeLocalContent`/`invalidateNodeLocalBounds`
/// calls so cache-validity checks have a monotonic stamp to compare against.
pub struct NativeTextRuntime {
    pub measured_height: f32,
    pub measured_width: f32,
    pub(crate) bounds_revision: i64,
    pub(crate) content_revision: i64,
}

impl NativeTextRuntime {
    fn new() -> Self {
        create_native_text_runtime()
    }
}

// ---------------------------------------------------------------------------
// Public entity struct
// ---------------------------------------------------------------------------

/// A platform/DOM-backed text display object.
///
/// `NativeText` opts out of the `TextLayout` spine entirely. The platform
/// engine owns layout, measurement, and rendering. Bounds come from the
/// renderer writing back `measured_width`/`measured_height` rather than from
/// the layout engine.
pub struct NativeText {
    pub data: NativeTextData,
    pub(crate) runtime: NativeTextRuntime,
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/// Fills `out` with the local-bounds rectangle for `source`.
///
/// Under `auto_size = None` the box is the fixed `data.width` × `data.height`.
/// Otherwise, the renderer-written measured size is used, falling back to the
/// fixed box until first measured.
pub fn compute_native_text_local_bounds_rectangle(out: &mut Rectangle, source: &NativeText) {
    let data = &source.data;
    out.x = 0.0;
    out.y = 0.0;
    if data.auto_size == TextAutoSize::None {
        out.width = data.width;
        out.height = data.height;
        return;
    }
    let runtime = &source.runtime;
    out.width = if runtime.measured_width > 0.0 {
        runtime.measured_width
    } else {
        data.width
    };
    out.height = if runtime.measured_height > 0.0 {
        runtime.measured_height
    } else {
        data.height
    };
}

/// Allocates a new `NativeText` with default field values, optionally
/// overriding them from `data`.
pub fn create_native_text(data: Option<&NativeTextData>) -> NativeText {
    NativeText {
        data: create_native_text_data(data),
        runtime: NativeTextRuntime::new(),
    }
}

/// Allocates a `NativeTextData` with defaults, optionally overriding from
/// `data`.
pub fn create_native_text_data(data: Option<&NativeTextData>) -> NativeTextData {
    NativeTextData {
        auto_size: data.map(|d| d.auto_size).unwrap_or_default(),
        height: data.map(|d| d.height).unwrap_or(100.0),
        style: data.map(|d| d.style.clone()).unwrap_or_default(),
        text: data.map(|d| d.text.clone()).unwrap_or_default(),
        width: data.map(|d| d.width).unwrap_or(100.0),
    }
}

/// Allocates a `NativeTextRuntime` with default values, mirroring the TS
/// `createNativeTextRuntime`. (The TS `element` slot is DOM-only and has no
/// native counterpart; measured sizes start at `0`.)
pub fn create_native_text_runtime() -> NativeTextRuntime {
    NativeTextRuntime {
        measured_height: 0.0,
        measured_width: 0.0,
        bounds_revision: 0,
        content_revision: 0,
    }
}

/// Returns a reference to the `NativeTextRuntime` of `source`.
pub fn get_native_text_runtime(source: &NativeText) -> &NativeTextRuntime {
    &source.runtime
}

/// Sets `auto_size` on `source.data`, invalidating local content and bounds.
pub fn set_native_text_auto_size(source: &mut NativeText, value: TextAutoSize) {
    if source.data.auto_size == value {
        return;
    }
    source.data.auto_size = value;
    source.runtime.content_revision += 1;
    source.runtime.bounds_revision += 1;
}

/// Sets `data.height` on `source`, invalidating local content and bounds.
pub fn set_native_text_height(source: &mut NativeText, value: f32) {
    if source.data.height == value {
        return;
    }
    source.data.height = value;
    source.runtime.content_revision += 1;
    source.runtime.bounds_revision += 1;
}

/// Sets `data.text` on `source`, invalidating local content and bounds.
pub fn set_native_text_string(source: &mut NativeText, value: String) {
    if source.data.text == value {
        return;
    }
    source.data.text = value;
    source.runtime.content_revision += 1;
    source.runtime.bounds_revision += 1;
}

/// Replaces the style descriptor wholesale, invalidating local content and
/// bounds. The content revision bumps unconditionally because field-level
/// equality is not tracked, mirroring `set_text_label_format`.
pub fn set_native_text_style(source: &mut NativeText, value: NativeTextStyle) {
    source.data.style = value;
    source.runtime.content_revision += 1;
    source.runtime.bounds_revision += 1;
}

/// Sets `data.width` on `source`, invalidating local content and bounds.
pub fn set_native_text_width(source: &mut NativeText, value: f32) {
    if source.data.width == value {
        return;
    }
    source.data.width = value;
    source.runtime.content_revision += 1;
    source.runtime.bounds_revision += 1;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data(auto: TextAutoSize, w: f32, h: f32) -> NativeTextData {
        NativeTextData {
            auto_size: auto,
            height: h,
            width: w,
            ..NativeTextData::default()
        }
    }

    #[test]
    fn compute_native_text_local_bounds_rectangle_fixed() {
        let native = create_native_text(Some(&data(TextAutoSize::None, 200.0, 50.0)));
        let mut out = Rectangle::default();
        compute_native_text_local_bounds_rectangle(&mut out, &native);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn compute_native_text_local_bounds_rectangle_falls_back_to_fixed_until_measured() {
        let native = create_native_text(Some(&data(TextAutoSize::Left, 200.0, 50.0)));
        let mut out = Rectangle::default();
        compute_native_text_local_bounds_rectangle(&mut out, &native);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn compute_native_text_local_bounds_rectangle_uses_measured_size() {
        let mut native = create_native_text(Some(&data(TextAutoSize::Left, 200.0, 50.0)));
        native.runtime.measured_width = 80.0;
        native.runtime.measured_height = 24.0;
        let mut out = Rectangle::default();
        compute_native_text_local_bounds_rectangle(&mut out, &native);
        assert_eq!(out.width, 80.0);
        assert_eq!(out.height, 24.0);
    }

    #[test]
    fn create_native_text_data_defaults() {
        let d = create_native_text_data(None);
        assert_eq!(d.width, 100.0);
        assert_eq!(d.height, 100.0);
        assert!(d.text.is_empty());
        assert_eq!(d.auto_size, TextAutoSize::None);
    }

    #[test]
    fn create_native_text_data_overrides() {
        let d = create_native_text_data(Some(&NativeTextData {
            auto_size: TextAutoSize::Left,
            text: "hello".to_string(),
            width: 250.0,
            height: 30.0,
            ..NativeTextData::default()
        }));
        assert_eq!(d.auto_size, TextAutoSize::Left);
        assert_eq!(d.text, "hello");
        assert_eq!(d.width, 250.0);
        assert_eq!(d.height, 30.0);
    }

    #[test]
    fn create_native_text_defaults() {
        let native = create_native_text(None);
        assert_eq!(native.data.text, "");
        assert_eq!(native.data.auto_size, TextAutoSize::None);
        assert_eq!(native.data.width, 100.0);
        assert_eq!(native.data.height, 100.0);
        assert_eq!(native.runtime.measured_width, 0.0);
        assert_eq!(native.runtime.measured_height, 0.0);
    }

    #[test]
    fn create_native_text_runtime_initializes_measured_sizes_to_zero() {
        let runtime = create_native_text_runtime();
        assert_eq!(runtime.measured_width, 0.0);
        assert_eq!(runtime.measured_height, 0.0);
    }

    #[test]
    fn get_native_text_runtime_returns_runtime() {
        let mut native = create_native_text(None);
        native.runtime.measured_width = 42.0;
        let runtime = get_native_text_runtime(&native);
        assert_eq!(runtime.measured_width, 42.0);
        assert_eq!(runtime.measured_height, 0.0);
    }

    #[test]
    fn set_native_text_auto_size_no_op_when_same() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        set_native_text_auto_size(&mut native, TextAutoSize::None);
        assert_eq!(native.runtime.content_revision, content);
    }

    #[test]
    fn set_native_text_auto_size_updates_and_invalidates() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        let bounds = native.runtime.bounds_revision;
        set_native_text_auto_size(&mut native, TextAutoSize::Left);
        assert_eq!(native.data.auto_size, TextAutoSize::Left);
        assert_eq!(native.runtime.content_revision, content + 1);
        assert_ne!(native.runtime.bounds_revision, bounds);
    }

    #[test]
    fn set_native_text_height_updates_data() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        let bounds = native.runtime.bounds_revision;
        set_native_text_height(&mut native, 250.0);
        assert_eq!(native.data.height, 250.0);
        assert_eq!(native.runtime.content_revision, content + 1);
        assert_ne!(native.runtime.bounds_revision, bounds);
    }

    #[test]
    fn set_native_text_string_updates_data() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        set_native_text_string(&mut native, "hello".to_string());
        assert_eq!(native.data.text, "hello");
        assert_eq!(native.runtime.content_revision, content + 1);
    }

    #[test]
    fn set_native_text_string_no_op_when_same() {
        let mut native = create_native_text(Some(&NativeTextData {
            text: "same".to_string(),
            ..NativeTextData::default()
        }));
        let content = native.runtime.content_revision;
        set_native_text_string(&mut native, "same".to_string());
        assert_eq!(native.runtime.content_revision, content);
    }

    #[test]
    fn set_native_text_style_replaces() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        let style = NativeTextStyle {
            size: Some(24.0),
            ..NativeTextStyle::default()
        };
        set_native_text_style(&mut native, style);
        assert_eq!(native.data.style.size, Some(24.0));
        assert_eq!(native.runtime.content_revision, content + 1);
    }

    #[test]
    fn set_native_text_width_updates_data() {
        let mut native = create_native_text(None);
        let content = native.runtime.content_revision;
        let bounds = native.runtime.bounds_revision;
        set_native_text_width(&mut native, 300.0);
        assert_eq!(native.data.width, 300.0);
        assert_eq!(native.runtime.content_revision, content + 1);
        assert_ne!(native.runtime.bounds_revision, bounds);
    }
}
