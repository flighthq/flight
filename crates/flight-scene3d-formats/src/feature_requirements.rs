use flight_requirement::Requirement;

/// Stable source map entry, retained in insertion order for deterministic requirement expansion.
pub struct Scene3DFormatFeatureRequirements {
    pub feature: String,
    pub requirements: Vec<Requirement>,
}
