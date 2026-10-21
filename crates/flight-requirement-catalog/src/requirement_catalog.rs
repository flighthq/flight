use std::sync::Arc;

use flight_requirement::contract::get_requirement_facet_string;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_requirement::RequirementFacet;

    fn entry(kind: &str) -> RequirementCatalogEntry {
        return RequirementCatalogEntry {
            backend: "webgl".to_string(),
            content_parser_input_kind: None,
            facet: RequirementFacet::SceneNodeKind,
            family_order: None,
            implementation_import: "@flighthq/scene2d-gl".to_string(),
            implementation_symbol: "glShapeRenderer".to_string(),
            kind: kind.to_string(),
            parser_export: None,
            parser_field: None,
            registrar_import: Some("@flighthq/render".to_string()),
            registrar_symbol: Some("registerNodeRenderer".to_string()),
        };
    }

    #[test]
    fn entries_method_matches_get_requirement_catalog_entries() {
        let catalog = create_requirement_catalog(&[entry("Shape")], &[], &[]);
        assert_eq!(catalog.entries(), get_requirement_catalog_entries(&catalog));
    }

    #[test]
    fn find_entries_method_matches_find_requirement_catalog_entries() {
        let catalog = create_requirement_catalog(&[entry("Shape")], &[], &[]);
        assert_eq!(
            catalog.find_entries("webgl", RequirementFacet::SceneNodeKind, "Shape"),
            find_requirement_catalog_entries(
                &catalog,
                "webgl",
                RequirementFacet::SceneNodeKind,
                "Shape",
            )
        );
    }

    #[test]
    fn new_method_matches_create_requirement_catalog() {
        assert_eq!(
            RequirementCatalog::new(&[entry("Shape")], &[], &[]),
            create_requirement_catalog(&[entry("Shape")], &[], &[])
        );
    }

    #[test]
    fn register_entry_method_matches_register_requirement_catalog_entry() {
        let replacement = entry("Sprite");
        let mut via_method = create_requirement_catalog(&[entry("Shape")], &[], &[]);
        let mut via_free = via_method.clone();
        via_method.register_entry(&replacement);
        register_requirement_catalog_entry(&mut via_free, &replacement);
        assert_eq!(via_method, via_free);
    }

    #[test]
    fn unregister_entry_method_matches_unregister_requirement_catalog_entry() {
        let target = entry("Shape");
        let mut via_method = create_requirement_catalog(&[target.clone()], &[], &[]);
        let mut via_free = via_method.clone();
        assert_eq!(
            via_method.unregister_entry(&target),
            unregister_requirement_catalog_entry(&mut via_free, &target)
        );
        assert_eq!(via_method, via_free);
    }
}

/// Builds an isolated catalog from caller-owned rows, translations, and dispositions.
pub fn create_requirement_catalog(
    entries: &[RequirementCatalogEntry],
    translations: &[RequirementTranslation],
    dispositions: &[RequirementDisposition],
) -> RequirementCatalog {
    return RequirementCatalog {
        backends: None,
        dispositions: Some(dispositions.to_vec()),
        entries: entries.iter().cloned().map(Arc::new).collect(),
        translations: Some(translations.to_vec()),
    };
}

/// Finds matching rows in observable registration order, retaining each catalog row's identity.
pub fn find_requirement_catalog_entries(
    catalog: &RequirementCatalog,
    backend: &str,
    facet: flight_requirement::RequirementFacet,
    kind: &str,
) -> Vec<RequirementCatalogEntryRef> {
    return catalog
        .entries
        .iter()
        .filter(|entry| entry.backend == backend && entry.facet == facet && entry.kind == kind)
        .cloned()
        .collect();
}

/// Returns a new array in observable registration order while retaining each row's identity.
pub fn get_requirement_catalog_entries(
    catalog: &RequirementCatalog,
) -> Vec<RequirementCatalogEntryRef> {
    return catalog.entries.clone();
}

/// Replaces the first identity match in place, or appends a distinct open-registry row.
pub fn register_requirement_catalog_entry(
    catalog: &mut RequirementCatalog,
    entry: &RequirementCatalogEntry,
) {
    let identity = requirement_catalog_entry_identity(entry);
    let index = catalog
        .entries
        .iter()
        .position(|candidate| requirement_catalog_entry_identity(candidate) == identity);
    if let Some(index) = index {
        catalog.entries[index] = Arc::new(entry.clone());
    } else {
        catalog.entries.push(Arc::new(entry.clone()));
    }
}

fn requirement_catalog_entry_identity(entry: &RequirementCatalogEntry) -> String {
    return [
        entry.backend.as_str(),
        get_requirement_facet_string(entry.facet),
        entry.kind.as_str(),
        entry.registrar_import.as_deref().unwrap_or(""),
        entry.registrar_symbol.as_deref().unwrap_or(""),
    ]
    .join("\0");
}

/// Removes only the first row with the source identity and reports whether it existed.
pub fn unregister_requirement_catalog_entry(
    catalog: &mut RequirementCatalog,
    entry: &RequirementCatalogEntry,
) -> bool {
    let identity = requirement_catalog_entry_identity(entry);
    let index = catalog
        .entries
        .iter()
        .position(|candidate| requirement_catalog_entry_identity(candidate) == identity);
    let Some(index) = index else {
        return false;
    };
    catalog.entries.remove(index);
    return true;
}

impl RequirementCatalog {
    pub fn new(
        entries: &[RequirementCatalogEntry],
        translations: &[RequirementTranslation],
        dispositions: &[RequirementDisposition],
    ) -> Self {
        return create_requirement_catalog(entries, translations, dispositions);
    }

    pub fn entries(&self) -> Vec<RequirementCatalogEntryRef> {
        return get_requirement_catalog_entries(self);
    }

    pub fn find_entries(
        &self,
        backend: &str,
        facet: flight_requirement::RequirementFacet,
        kind: &str,
    ) -> Vec<RequirementCatalogEntryRef> {
        return find_requirement_catalog_entries(self, backend, facet, kind);
    }

    pub fn register_entry(&mut self, entry: &RequirementCatalogEntry) {
        register_requirement_catalog_entry(self, entry);
    }

    pub fn unregister_entry(&mut self, entry: &RequirementCatalogEntry) -> bool {
        return unregister_requirement_catalog_entry(self, entry);
    }
}
