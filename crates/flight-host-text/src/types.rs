use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};

use flight_font::{FontFace, HostFontCapabilities, HostGlyphCapabilities};
use flight_textshaper::HostTextShaperCapabilities;

/// One caller-owned Rust text service. It owns no module or process-global mutable state.
pub struct TextHost {
    pub(crate) fonts: HostFontCapabilities,
    pub(crate) glyphs: HostGlyphCapabilities,
    pub(crate) options: TextHostOptions,
    pub(crate) shapers: HostTextShaperCapabilities,
    pub(crate) state: Arc<TextHostState>,
}

/// Plain limits and discovery roots used by a text host.
#[derive(Clone, Debug, PartialEq)]
pub struct TextHostOptions {
    pub font_directories: Vec<String>,
    pub max_discovery_files: usize,
    pub max_faces: usize,
    pub max_font_bytes: usize,
    pub max_font_size: f32,
    pub max_glyph_pixels: usize,
}

/// Selection within a font collection. Variations remain per-operation Flight `FontVariation`s.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TextHostFaceOptions {
    pub face_index: u32,
}

/// Why an operation returned its sentinel, or `Ready` when the same bounded probe succeeds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum TextHostOperationExplanationReason {
    Ready = 0,
    Disposed = 1,
    EmptyInput = 2,
    InputTooLarge = 3,
    MalformedFont = 4,
    UnsupportedFont = 5,
    FaceIndexOutOfRange = 6,
    FaceLimitExceeded = 7,
    FontFamilyNotLoaded = 8,
    DiscoveryUnavailable = 9,
    FontNotFound = 10,
    InvalidCodePoint = 11,
    GlyphNotFound = 12,
    InvalidSize = 13,
    ResourceLimitExceeded = 14,
    UnsupportedDirection = 15,
    InvalidFeature = 16,
    BackendPanicked = 17,
}

/// Plain-data explanation for a host sentinel. It never reads a last-error slot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextHostOperationExplanation {
    pub message: String,
    pub reason: TextHostOperationExplanationReason,
}

pub(crate) struct TextHostState {
    pub(crate) alive: AtomicBool,
    pub(crate) faces: RwLock<Vec<Arc<FontFace>>>,
}
