use flight_entity::EntityRuntimeSlot;
use flight_requirement::Requirement;
use flight_requirement_catalog::RequirementCatalogEntryRef;

/// Emission-neutral facts resolved for one backend. A later emitter owns any source-writing choice.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RequirementCodegenPlan {
    pub backend: String,
    pub declined: Vec<RequirementDeclination>,
    pub entries: Vec<RequirementCatalogEntryRef>,
    pub unresolved: Vec<Requirement>,
    runtime: EntityRuntimeSlot,
}

/// One exact requirement a backend deliberately declines, paired with the catalog's reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementDeclination {
    pub reason: String,
    pub requirement: Requirement,
}

flight_entity::impl_entity!(RequirementCodegenPlan);
