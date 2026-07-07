//! `flighthq-lighting` — light descriptors and image-based environment.
//!
//! Ports the TypeScript `@flighthq/lighting` package. The light header types
//! ([`AmbientLight`], [`DirectionalLight`], [`Environment`], etc.) live in
//! `flighthq-types`; this crate owns their constructors. Light variant kinds are
//! defined here, at the owning crate.
//!
//! Each light has a `create_*` constructor that takes an `*Options` struct (the
//! Rust expression of the TS optional-fields object; use `..Default::default()`
//! to omit fields) and a `clone_*` that produces an independent copy.

pub mod ambient_light;
pub mod area_light;
pub mod color_from_kelvin;
pub mod directional_light;
pub mod environment;
pub mod hemisphere_light;
pub mod light_analysis;
pub mod point_light;
pub mod spot_light;

pub use ambient_light::{
    AmbientLightOptions, clone_ambient_light, create_ambient_light, get_ambient_light_kind,
};
pub use area_light::{AreaLightOptions, clone_area_light, create_area_light, get_area_light_kind};
pub use color_from_kelvin::create_color_from_kelvin;
pub use directional_light::{
    DirectionalLightOptions, clone_directional_light, create_directional_light,
    get_directional_light_kind,
};
pub use environment::{
    EnvironmentOptions, clone_environment, create_environment, get_environment_kind,
};
pub use hemisphere_light::{
    HemisphereLightOptions, clone_hemisphere_light, create_hemisphere_light,
    get_hemisphere_light_kind,
};
pub use light_analysis::{
    get_light_influence_bounds, get_light_luminance, has_light_influence_on_bounds,
    is_light_shadow_casting,
};
pub use point_light::{
    PointLightOptions, clone_point_light, create_point_light, get_point_light_kind,
};
pub use spot_light::{
    SpotLightOptions, clone_spot_light, create_spot_light, get_spot_light_kind, set_spot_light_cone,
};
