//! `flighthq-particles-formats` — import and export particle emitter configs
//! from industry-standard formats.
//!
//! Three format families are supported:
//! - **Particle Designer** (`particle_designer`) — Apple plist XML as exported
//!   by the 71Squared Particle Designer 3.x tool and cocos2d.
//! - **Spine** (`spine`) — Esoteric Software Spine 4.x particle-effect JSON.
//! - **Unity** (`unity`) — Unity Shuriken particle system JSON as exported by
//!   `JsonUtility` or common third-party tools.
//!
//! Each sub-module exposes:
//! - A fast, single-pass parser that returns only a `ParticleEmitterConfig`.
//! - A round-trip parser that also returns the full document struct, enabling
//!   lossless re-serialisation of fields that don't map into the config.
//! - A serialiser that writes back a config (optionally merged with a
//!   previously parsed document) to the native format string.

mod json;

pub mod particle_designer;
pub mod spine;
pub mod unity;

pub use particle_designer::{
    ParticleDesignerDocument, ParticleDesignerEmitterType, ParticleDesignerParseOptions,
    ParticleDesignerParsed, ParticleDesignerSerializeOptions, parse_particle_designer_plist,
    parse_particle_designer_plist_document, serialize_particle_designer_plist,
};
pub use spine::{
    SpineAlphaKeyframe, SpineBlendMode, SpineParsed, SpineParticleDocument, SpineRangeValue,
    SpineSpawnShape, SpineTintKeyframe, parse_spine_particle, parse_spine_particle_document,
    serialize_spine_particle,
};
pub use unity::{
    UnityAnimationCurve, UnityBurst, UnityColor, UnityColorOverLifetime, UnityColorRgb,
    UnityEmission, UnityGradient, UnityGradientAlphaKey, UnityGradientColorKey, UnityMinMaxMode,
    UnityMinMaxValue, UnityParseOptions, UnityParsed, UnityParticleDocument,
    UnityParticleShapeType, UnityRotationOverLifetime, UnitySerializeOptions, UnityShape,
    UnitySizeOverLifetime, UnityVec3, parse_unity_particle, parse_unity_particle_document,
    serialize_unity_particle,
};
