use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};

use flight_buffer::get_array_buffer_storage;
use flight_entity::{FlightError, FlightErrorKind, Ref, Unknown};
use flight_font::{
    FontFace, FontFaceSource, FontVariationAxis, GlyphRasterizeOptions,
    GlyphRasterizedBitmap, HostFontCapabilities, HostFontLoadingCapability, HostGlyphCapabilities,
    HostGlyphRasterizerCapability,
};
use flight_host::{FontFaceHandle, ProviderRef};
use flight_textformat::TextFormat;
use flight_textshaper::{
    FontMetrics, HostTextShaperCapabilities, HostTextShaperCapability, ShapedRun,
    TextShaperOptions, create_shaped_run,
};

use crate::opentype_backend::{self, BackendFailure, RasterFailure};
use crate::types::*;

pub(crate) struct TextFailure {
    pub(crate) message: &'static str,
    pub(crate) reason: TextHostOperationExplanationReason,
}

fn create_font_capabilities(
    state: &Arc<TextHostState>,
    provider: &ProviderRef,
    options: &TextHostOptions,
) -> HostFontCapabilities {
    let add_state = state.clone();
    let add_options = options.clone();
    let check_state = state.clone();
    let create_provider = provider.clone();
    let create_options = options.clone();
    let create_state = state.clone();
    let load_state = state.clone();
    let list_state = state.clone();
    let ready_state = state.clone();
    return HostFontCapabilities {
        loader: Some(HostFontLoadingCapability {
            add_font_face: Arc::new(move |face| {
                let _ = catch_operation(|| add_face(&add_state, &add_options, face));
            }),
            check_font_face: Arc::new(move |shorthand| {
                return catch_operation(|| {
                    require_alive(&check_state).is_ok()
                        && read_faces(&check_state)
                            .iter()
                            .any(|face| shorthand_contains_family(shorthand, &face.family))
                })
                .unwrap_or(false);
            }),
            create_font_face: Arc::new(move |family, source| {
                return catch_operation(|| {
                    let bytes = source_bytes(source)?;
                    if bytes.is_empty()
                        || bytes.len() > create_options.max_font_bytes
                        || read_faces(&create_state).len() >= create_options.max_faces
                    {
                        return None;
                    }
                    return opentype_backend::create_face(&create_provider, family, &bytes, 0).ok();
                })
                .flatten()
                .unwrap_or_else(|| create_invalid_face(&create_provider, family));
            }),
            load_font_face: Arc::new(move |face| {
                let state = load_state.clone();
                let face = face.clone();
                return Box::pin(async move {
                    return catch_result(|| {
                        require_alive(&state)?;
                        opentype_backend::validate_face(&face).map_err(backend_failure)
                    })
                    .map_err(unknown_from_failure);
                });
            }),
            load_font_faces: Arc::new(move |shorthand| {
                let state = list_state.clone();
                let shorthand = shorthand.to_string();
                return Box::pin(async move {
                    return catch_result(|| {
                        require_alive(&state)?;
                        let faces = read_faces(&state)
                            .iter()
                            .filter(|face| shorthand_contains_family(&shorthand, &face.family))
                            .cloned()
                            .collect();
                        return Ok(faces);
                    })
                    .map_err(unknown_from_failure);
                });
            }),
            provider: provider.clone(),
            when_ready: Arc::new(move || {
                let state = ready_state.clone();
                return Box::pin(async move {
                    return catch_result(|| require_alive(&state)).map_err(unknown_from_failure);
                });
            }),
        }),
    };
}

fn create_glyph_capabilities(
    state: &Arc<TextHostState>,
    provider: &ProviderRef,
    options: &TextHostOptions,
) -> HostGlyphCapabilities {
    let metrics_state = state.clone();
    let raster_state = state.clone();
    let raster_options = options.clone();
    return HostGlyphCapabilities {
        rasterizer: Some(HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(move |options| {
                return catch_operation(|| {
                    require_alive(&metrics_state).ok()?;
                    let face = find_face(&metrics_state, Some(&options.font_family)).ok()?;
                    return opentype_backend::measure_metrics(&face, options);
                })
                .flatten();
            })),
            provider: provider.clone(),
            rasterize: Arc::new(move |code_point, options| {
                return catch_operation(|| {
                    rasterize_with_parts(&raster_state, &raster_options, code_point, options).ok()
                })
                .flatten();
            }),
        }),
    };
}

fn create_invalid_face(provider: &ProviderRef, family: &str) -> Arc<FontFace> {
    return Arc::new(FontFace {
        handle: FontFaceHandle {
            provider: provider.clone(),
            handle: Arc::new(()),
        },
        family: family.to_string(),
    });
}

fn create_shaper_capabilities(
    state: &Arc<TextHostState>,
    provider: &ProviderRef,
) -> HostTextShaperCapabilities {
    let code_point_state = state.clone();
    let extents_state = state.clone();
    let index_state = state.clone();
    let metrics_state = state.clone();
    let name_state = state.clone();
    let measure_state = state.clone();
    let shape_state = state.clone();
    return HostTextShaperCapabilities {
        shaper: Some(HostTextShaperCapability {
            provider: provider.clone(),
            get_code_point_for_glyph: Some(Arc::new(move |glyph_id| {
                return catch_operation(|| {
                    let face = find_face(&code_point_state, None).ok()?;
                    return Some(opentype_backend::get_code_point_for_glyph(&face, glyph_id));
                })
                .flatten()
                .unwrap_or(-1);
            })),
            get_font_metrics: Some(Arc::new(move |format| {
                return catch_operation(|| metrics_with_parts(&metrics_state, format).ok()).flatten();
            })),
            get_glyph_extents: Some(Arc::new(move |glyph_id| {
                return catch_operation(|| {
                    let face = find_face(&extents_state, None).ok()?;
                    return opentype_backend::get_glyph_extents(&face, glyph_id, 12.0);
                })
                .flatten();
            })),
            get_glyph_index_for_code_point: Some(Arc::new(move |code_point| {
                return catch_operation(|| {
                    let face = find_face(&index_state, None).ok()?;
                    return Some(opentype_backend::get_glyph_index_for_code_point(
                        &face, code_point,
                    ));
                })
                .flatten()
                .unwrap_or(-1);
            })),
            get_glyph_name: Some(Arc::new(move |glyph_id| {
                return catch_operation(|| {
                    let face = find_face(&name_state, None).ok()?;
                    return Some(opentype_backend::get_glyph_name(&face, glyph_id));
                })
                .flatten()
                .unwrap_or_default();
            })),
            measure_text: Arc::new(move |text, format| {
                return catch_operation(|| {
                    let run = shape_with_parts(&measure_state, text, format, None).ok()?;
                    let advance = run.read().ok()?.advance_width;
                    return Some(advance);
                })
                .flatten()
                .unwrap_or(0.0);
            }),
            shape_run: Some(Arc::new(move |text, format, options| {
                let full_options = options.map(|options| TextShaperOptions {
                    direction: options.direction,
                    features: None,
                    language: None,
                    script: options.script.clone(),
                    variations: None,
                });
                return catch_operation(|| {
                    shape_with_parts(&shape_state, text, format, full_options.as_ref()).ok()
                })
                .flatten()
                .unwrap_or_else(create_shaped_run);
            })),
        }),
    };
}

/// Creates one caller-owned Rust text host and its retained fail-closed capabilities.
pub fn create_text_host(options: Option<&TextHostOptions>) -> TextHost {
    let options = options.cloned().unwrap_or_else(create_text_host_options);
    let state = Arc::new(TextHostState {
        alive: AtomicBool::new(true),
        faces: RwLock::new(Vec::new()),
    });
    let provider: ProviderRef = state.clone();
    let fonts = create_font_capabilities(&state, &provider, &options);
    let glyphs = create_glyph_capabilities(&state, &provider, &options);
    let shapers = create_shaper_capabilities(&state, &provider);
    return TextHost {
        fonts,
        glyphs,
        options,
        shapers,
        state,
    };
}

/// Returns the default face selection (face zero).
pub fn create_text_host_face_options() -> TextHostFaceOptions {
    return TextHostFaceOptions { face_index: 0 };
}

/// Returns bounded defaults and platform discovery roots. Byte loading does not depend on them.
pub fn create_text_host_options() -> TextHostOptions {
    return TextHostOptions {
        font_directories: default_font_directories(),
        max_discovery_files: 4_096,
        max_faces: 64,
        max_font_bytes: 32 * 1024 * 1024,
        max_font_size: 512.0,
        max_glyph_pixels: 4 * 1024 * 1024,
    };
}

fn add_face(state: &TextHostState, options: &TextHostOptions, face: &Arc<FontFace>) -> bool {
    if require_alive(state).is_err() || opentype_backend::validate_face(face).is_err() {
        return false;
    }
    let mut faces = write_faces(state);
    if faces.iter().any(|candidate| Arc::ptr_eq(candidate, face)) {
        return true;
    }
    if faces.len() >= options.max_faces {
        return false;
    }
    faces.push(face.clone());
    return true;
}

fn backend_failure(error: BackendFailure) -> TextFailure {
    return match error {
        BackendFailure::FaceIndexOutOfRange => failure(
            TextHostOperationExplanationReason::FaceIndexOutOfRange,
            "font collection face index is out of range",
        ),
        BackendFailure::InvalidFeature => failure(
            TextHostOperationExplanationReason::InvalidFeature,
            "script, language, variation or feature range is invalid",
        ),
        BackendFailure::MalformedFont => failure(
            TextHostOperationExplanationReason::MalformedFont,
            "font data or a required table is malformed",
        ),
        BackendFailure::UnsupportedFont => failure(
            TextHostOperationExplanationReason::UnsupportedFont,
            "font container is unsupported by this host",
        ),
    };
}

fn catch_operation<T>(operation: impl FnOnce() -> T) -> Option<T> {
    return catch_unwind(AssertUnwindSafe(operation)).ok();
}

pub(crate) fn catch_result<T>(
    operation: impl FnOnce() -> Result<T, TextFailure>,
) -> Result<T, TextFailure> {
    return catch_unwind(AssertUnwindSafe(operation)).unwrap_or_else(|_| {
        Err(failure(
            TextHostOperationExplanationReason::BackendPanicked,
            "text backend panicked and the operation failed closed",
        ))
    });
}

fn default_font_directories() -> Vec<String> {
    #[cfg(target_os = "windows")]
    return vec!["C:\\Windows\\Fonts".to_string()];
    #[cfg(target_os = "macos")]
    return vec![
        "/Library/Fonts".to_string(),
        "/System/Library/Fonts".to_string(),
    ];
    #[cfg(all(unix, not(target_os = "macos")))]
    return vec![
        "/usr/local/share/fonts".to_string(),
        "/usr/share/fonts".to_string(),
    ];
    #[cfg(not(any(unix, target_os = "windows")))]
    return Vec::new();
}

/// Finds, loads and registers a system font family when discovery is enabled. Returns `None` when
/// discovery is unavailable, no matching family exists, a limit is exceeded, or the host is
/// disposed; `explain_text_host_discover` distinguishes these cases.
pub fn discover_system_font_with_text_host(
    host: &TextHost,
    family: &str,
) -> Option<Arc<FontFace>> {
    return catch_operation(|| {
        discover_with_parts(
            &host.state,
            &host.options,
            &host.fonts.loader.as_ref()?.provider,
            family,
            true,
        )
        .ok()
    })
    .flatten();
}

fn discover_with_parts(
    state: &TextHostState,
    options: &TextHostOptions,
    provider: &ProviderRef,
    family: &str,
    register: bool,
) -> Result<Arc<FontFace>, TextFailure> {
    require_alive(state)?;
    if family.is_empty() || options.font_directories.is_empty() {
        return Err(discovery_unavailable());
    }
    #[cfg(feature = "system-discovery")]
    {
        let bytes = crate::system_discovery::find_font_bytes(
            &options.font_directories,
            family,
            options.max_discovery_files,
            options.max_font_bytes,
        )
        .ok_or_else(|| {
            failure(
                TextHostOperationExplanationReason::FontNotFound,
                "no matching font family was found in the configured roots",
            )
        })?;
        return load_with_parts(state, options, provider, family, &bytes, 0, register);
    }
    #[cfg(not(feature = "system-discovery"))]
    {
        let _ = (options, provider, register);
        return Err(discovery_unavailable());
    }
}

fn discovery_unavailable() -> TextFailure {
    return failure(
        TextHostOperationExplanationReason::DiscoveryUnavailable,
        "system font discovery is disabled or has no configured roots",
    );
}

/// Invalidates all direct and retained operations. Disposal is idempotent; owned byte allocations
/// are released after the last face/capability reference is dropped.
pub fn dispose_text_host(host: &mut TextHost) {
    host.state.alive.store(false, Ordering::Release);
    write_faces(&host.state).clear();
}

fn explain_result<T>(result: Result<T, TextFailure>) -> TextHostOperationExplanation {
    return match result {
        Ok(_) => TextHostOperationExplanation {
            message: String::new(),
            reason: TextHostOperationExplanationReason::Ready,
        },
        Err(error) => TextHostOperationExplanation {
            message: error.message.to_string(),
            reason: error.reason,
        },
    };
}

/// Pure bounded explanation for system discovery. The probe never registers a face.
pub fn explain_text_host_discover(
    host: &TextHost,
    family: &str,
) -> TextHostOperationExplanation {
    let result = catch_result(|| {
        let provider = host
            .fonts
            .loader
            .as_ref()
            .map(|loader| &loader.provider)
            .ok_or_else(discovery_unavailable)?;
        discover_with_parts(&host.state, &host.options, provider, family, false)
    });
    return explain_result(result);
}

/// Pure bounded explanation for byte loading. The probe parses but never registers a face.
pub fn explain_text_host_load(
    host: &TextHost,
    family: &str,
    bytes: &[u8],
    face_options: Option<&TextHostFaceOptions>,
) -> TextHostOperationExplanation {
    let result = catch_result(|| {
        require_alive(&host.state)?;
        validate_load_limits(&host.state, &host.options, bytes)?;
        let provider = host
            .fonts
            .loader
            .as_ref()
            .map(|loader| &loader.provider)
            .ok_or_else(discovery_unavailable)?;
        return opentype_backend::create_face(
            provider,
            family,
            bytes,
            face_options.copied().unwrap_or_default().face_index,
        )
        .map_err(backend_failure);
    });
    return explain_result(result);
}

/// Pure explanation for a metric lookup sentinel.
pub fn explain_text_host_metrics(
    host: &TextHost,
    format: &TextFormat,
) -> TextHostOperationExplanation {
    return explain_result(catch_result(|| metrics_with_parts(&host.state, format)));
}

/// Pure explanation for a glyph-raster sentinel.
pub fn explain_text_host_rasterize(
    host: &TextHost,
    code_point: u32,
    options: &GlyphRasterizeOptions,
) -> TextHostOperationExplanation {
    return explain_result(catch_result(|| {
        rasterize_with_parts(&host.state, &host.options, code_point, options)
    }));
}

/// Pure explanation for a shaping sentinel.
pub fn explain_text_host_shape(
    host: &TextHost,
    text: &str,
    format: &TextFormat,
    options: Option<&TextShaperOptions>,
) -> TextHostOperationExplanation {
    return explain_result(catch_result(|| {
        shape_with_parts(&host.state, text, format, options)
    }));
}

fn failure(reason: TextHostOperationExplanationReason, message: &'static str) -> TextFailure {
    return TextFailure { message, reason };
}

fn find_face(
    state: &TextHostState,
    family: Option<&str>,
) -> Result<Arc<FontFace>, TextFailure> {
    require_alive(state)?;
    return read_faces(state)
        .iter()
        .rev()
        .find(|face| family.is_none_or(|family| face.family.eq_ignore_ascii_case(family)))
        .cloned()
        .ok_or_else(|| {
            failure(
                TextHostOperationExplanationReason::FontFamilyNotLoaded,
                "font family is not loaded in this host",
            )
        });
}

/// Borrowed font-loading group. Retained callbacks fail closed after disposal or drop.
pub fn get_text_host_font_capabilities(host: &TextHost) -> &HostFontCapabilities {
    return &host.fonts;
}

/// Returns the selected face's variable axes. An empty vector is valid for a static font.
pub fn get_text_host_font_variation_axes(face: &FontFace) -> Vec<FontVariationAxis> {
    return catch_operation(|| opentype_backend::get_font_variation_axes(face)).unwrap_or_default();
}

/// Borrowed glyph-raster group. Retained callbacks fail closed after disposal or drop.
pub fn get_text_host_glyph_capabilities(host: &TextHost) -> &HostGlyphCapabilities {
    return &host.glyphs;
}

/// Borrowed shaping group. Retained callbacks fail closed after disposal or drop.
pub fn get_text_host_shaper_capabilities(host: &TextHost) -> &HostTextShaperCapabilities {
    return &host.shapers;
}

/// Whether this host has been explicitly disposed or dropped.
pub fn is_text_host_disposed(host: &TextHost) -> bool {
    return !host.state.alive.load(Ordering::Acquire);
}

/// Loads and registers exactly these bytes, independent of discovery. Returns `None` on invalid or
/// unsupported input, a face/byte cap, or disposal; `explain_text_host_load` gives the reason.
pub fn load_font_bytes_with_text_host(
    host: &TextHost,
    family: &str,
    bytes: &[u8],
    face_options: Option<&TextHostFaceOptions>,
) -> Option<Arc<FontFace>> {
    return catch_operation(|| {
        let provider = host.fonts.loader.as_ref()?.provider.clone();
        load_with_parts(
            &host.state,
            &host.options,
            &provider,
            family,
            bytes,
            face_options.copied().unwrap_or_default().face_index,
            true,
        )
        .ok()
    })
    .flatten();
}

fn load_with_parts(
    state: &TextHostState,
    options: &TextHostOptions,
    provider: &ProviderRef,
    family: &str,
    bytes: &[u8],
    face_index: u32,
    register: bool,
) -> Result<Arc<FontFace>, TextFailure> {
    require_alive(state)?;
    validate_load_limits(state, options, bytes)?;
    let face = opentype_backend::create_face(provider, family, bytes, face_index)
        .map_err(backend_failure)?;
    if register && !add_face(state, options, &face) {
        return Err(failure(
            TextHostOperationExplanationReason::FaceLimitExceeded,
            "font face registry limit was reached",
        ));
    }
    return Ok(face);
}

/// Returns design-unit font metrics for the selected family and variations.
pub fn measure_font_with_text_host(
    host: &TextHost,
    format: &TextFormat,
) -> Option<FontMetrics> {
    return catch_operation(|| metrics_with_parts(&host.state, format).ok()).flatten();
}

fn metrics_with_parts(
    state: &TextHostState,
    format: &TextFormat,
) -> Result<FontMetrics, TextFailure> {
    let face = find_face(state, format.font.as_deref())?;
    let variations = format.variations.as_deref().map_or(&[][..], Vec::as_slice);
    return opentype_backend::get_font_metrics(&face, variations).ok_or_else(|| {
        failure(
            TextHostOperationExplanationReason::MalformedFont,
            "font metrics are unavailable",
        )
    });
}

/// Rasterizes one Unicode scalar to straight-alpha, row-major RGBA8. Stride is `width * 4`.
pub fn rasterize_glyph_with_text_host(
    host: &TextHost,
    code_point: u32,
    options: &GlyphRasterizeOptions,
) -> Option<GlyphRasterizedBitmap> {
    return catch_operation(|| {
        rasterize_with_parts(&host.state, &host.options, code_point, options).ok()
    })
    .flatten();
}

fn rasterize_with_parts(
    state: &TextHostState,
    host_options: &TextHostOptions,
    code_point: u32,
    options: &GlyphRasterizeOptions,
) -> Result<GlyphRasterizedBitmap, TextFailure> {
    let Some(_) = char::from_u32(code_point) else {
        return Err(failure(
            TextHostOperationExplanationReason::InvalidCodePoint,
            "glyph key is not a Unicode scalar value",
        ));
    };
    if options.font_size <= 0.0
        || !options.font_size.is_finite()
        || options.font_size > host_options.max_font_size
    {
        return Err(failure(
            TextHostOperationExplanationReason::InvalidSize,
            "font size is non-finite, non-positive or exceeds the host limit",
        ));
    }
    let face = find_face(state, Some(&options.font_family))?;
    return opentype_backend::rasterize(
        &face,
        code_point,
        options,
        host_options.max_glyph_pixels,
    )
    .map_err(|error| match error {
        RasterFailure::GlyphNotFound => failure(
            TextHostOperationExplanationReason::GlyphNotFound,
            "font has no rasterizable outline for this code point",
        ),
        RasterFailure::ResourceLimitExceeded => failure(
            TextHostOperationExplanationReason::ResourceLimitExceeded,
            "glyph bitmap exceeds the host pixel limit",
        ),
    });
}

fn read_faces(state: &TextHostState) -> RwLockReadGuard<'_, Vec<Arc<FontFace>>> {
    return state
        .faces
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
}

fn require_alive(state: &TextHostState) -> Result<(), TextFailure> {
    if !state.alive.load(Ordering::Acquire) {
        return Err(failure(
            TextHostOperationExplanationReason::Disposed,
            "text host has been disposed",
        ));
    }
    return Ok(());
}

/// Shapes one run through rustybuzz. The direct form accepts the complete Flight shaping options;
/// the existing host callback carries only its narrower `ShapeRunOptions` subset.
pub fn shape_text_with_text_host(
    host: &TextHost,
    text: &str,
    format: &TextFormat,
    options: Option<&TextShaperOptions>,
) -> Option<Ref<ShapedRun>> {
    return catch_operation(|| shape_with_parts(&host.state, text, format, options).ok()).flatten();
}

fn shape_with_parts(
    state: &TextHostState,
    text: &str,
    format: &TextFormat,
    options: Option<&TextShaperOptions>,
) -> Result<Ref<ShapedRun>, TextFailure> {
    require_alive(state)?;
    let face = find_face(state, format.font.as_deref())?;
    let defaults = TextShaperOptions::default();
    let options = options.unwrap_or(&defaults);
    return opentype_backend::shape(&face, text, format, options).map_err(backend_failure);
}

fn shorthand_contains_family(shorthand: &str, family: &str) -> bool {
    let escaped = family.replace('\\', "\\\\").replace('\'', "\\'");
    return shorthand.ends_with(&format!("'{escaped}'"));
}

fn source_bytes(source: &FontFaceSource) -> Option<Vec<u8>> {
    let FontFaceSource::Data(data) = source else {
        return None;
    };
    let storage = get_array_buffer_storage(&data.value.buffer);
    let guard = storage
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let end = data.value.byte_offset.checked_add(data.value.byte_length)?;
    return guard.get(data.value.byte_offset..end).map(<[u8]>::to_vec);
}

fn unknown_from_failure(error: TextFailure) -> Unknown {
    return Some(Arc::new(FlightError {
        kind: match error.reason {
            TextHostOperationExplanationReason::UnsupportedFont
            | TextHostOperationExplanationReason::DiscoveryUnavailable => {
                FlightErrorKind::NotSupportedError
            }
            TextHostOperationExplanationReason::InputTooLarge
            | TextHostOperationExplanationReason::FaceIndexOutOfRange
            | TextHostOperationExplanationReason::FaceLimitExceeded
            | TextHostOperationExplanationReason::InvalidSize
            | TextHostOperationExplanationReason::ResourceLimitExceeded => {
                FlightErrorKind::RangeError
            }
            _ => FlightErrorKind::Error,
        },
        message: error.message.to_string(),
    }));
}

fn validate_load_limits(
    state: &TextHostState,
    options: &TextHostOptions,
    bytes: &[u8],
) -> Result<(), TextFailure> {
    if bytes.is_empty() {
        return Err(failure(
            TextHostOperationExplanationReason::EmptyInput,
            "font input is empty",
        ));
    }
    if bytes.len() > options.max_font_bytes {
        return Err(failure(
            TextHostOperationExplanationReason::InputTooLarge,
            "font input exceeds the host byte limit",
        ));
    }
    if read_faces(state).len() >= options.max_faces {
        return Err(failure(
            TextHostOperationExplanationReason::FaceLimitExceeded,
            "font face registry limit was reached",
        ));
    }
    return Ok(());
}

fn write_faces(state: &TextHostState) -> RwLockWriteGuard<'_, Vec<Arc<FontFace>>> {
    return state
        .faces
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
}

impl Drop for TextHost {
    fn drop(&mut self) {
        dispose_text_host(self);
    }
}
