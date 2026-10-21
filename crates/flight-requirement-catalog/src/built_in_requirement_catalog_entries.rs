use std::sync::LazyLock;

use flight_requirement::contract::parse_requirement_facet;
use flight_requirement::{Requirement, RequirementFacet};

use crate::types::*;

fn parse_backends(source: &str) -> Vec<RequirementBackend> {
    return source
        .lines()
        .map(|line| {
            let mut fields = line.split('\t');
            return RequirementBackend {
                infrastructure_import: fields.next().unwrap().to_string(),
                infrastructure_symbol: fields.next().unwrap().to_string(),
                name: fields.next().unwrap().to_string(),
            };
        })
        .collect();
}

fn parse_content_parser_input_kind(value: &str) -> Option<ContentParserInputKind> {
    return match value {
        "" => None,
        "bytes" => Some(ContentParserInputKind::Bytes),
        "string" => Some(ContentParserInputKind::String),
        _ => panic!("unknown built-in content parser input kind: {value}"),
    };
}

fn parse_dispositions(source: &str) -> Vec<RequirementDisposition> {
    return source
        .lines()
        .map(|line| {
            let mut fields = line.split('\t');
            return RequirementDisposition {
                backend: fields.next().unwrap().to_string(),
                facet: parse_facet(fields.next().unwrap()),
                kind: fields.next().unwrap().to_string(),
                reason: fields.next().unwrap().to_string(),
            };
        })
        .collect();
}

fn parse_entries(source: &str) -> Vec<RequirementCatalogEntry> {
    return source
        .lines()
        .map(|line| {
            let mut fields = line.split('\t');
            let backend = fields.next().unwrap().to_string();
            let facet = parse_facet(fields.next().unwrap());
            let implementation_import = fields.next().unwrap().to_string();
            let implementation_symbol = fields.next().unwrap().to_string();
            let kind = fields.next().unwrap().to_string();
            let family_order = parse_optional_usize(fields.next().unwrap());
            let parser_field = parse_optional_string(fields.next().unwrap());
            let parser_export = parse_optional_string(fields.next().unwrap());
            let content_parser_input_kind = parse_content_parser_input_kind(fields.next().unwrap());
            let registrar_import = parse_optional_string(fields.next().unwrap());
            let registrar_symbol = parse_optional_string(fields.next().unwrap());
            return RequirementCatalogEntry {
                backend,
                facet,
                implementation_import,
                implementation_symbol,
                kind,
                family_order,
                parser_field,
                parser_export,
                content_parser_input_kind,
                registrar_import,
                registrar_symbol,
            };
        })
        .collect();
}

fn parse_facet(value: &str) -> RequirementFacet {
    return parse_requirement_facet(value).unwrap();
}

fn parse_optional_string(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    return Some(value.to_string());
}

fn parse_optional_usize(value: &str) -> Option<usize> {
    if value.is_empty() {
        return None;
    }
    return Some(value.parse::<usize>().unwrap());
}

fn parse_translations(source: &str) -> Vec<RequirementTranslation> {
    return source
        .lines()
        .map(|line| {
            let mut fields = line.split('\t');
            let from = Requirement {
                facet: parse_facet(fields.next().unwrap()),
                key: fields.next().unwrap().to_string(),
            };
            let mut to = Vec::new();
            while let Some(facet) = fields.next() {
                to.push(Requirement {
                    facet: parse_facet(facet),
                    key: fields.next().unwrap().to_string(),
                });
            }
            return RequirementTranslation { from, to };
        })
        .collect();
}

/// Generated factual ownership rows in pinned source order.
pub static BUILT_IN_REQUIREMENT_CATALOG_ENTRIES: LazyLock<Vec<RequirementCatalogEntry>> =
    LazyLock::new(|| parse_entries(include_str!("built_in_requirement_catalog_entries.tsv")));

/// Generated format-to-render implications in pinned source order.
pub static BUILT_IN_REQUIREMENT_TRANSLATIONS: LazyLock<Vec<RequirementTranslation>> =
    LazyLock::new(|| parse_translations(include_str!("built_in_requirement_translations.tsv")));

/// Generated backend infrastructure names. The names remain data and are never executed here.
pub static BUILT_IN_REQUIREMENT_BACKENDS: LazyLock<Vec<RequirementBackend>> =
    LazyLock::new(|| parse_backends(include_str!("built_in_requirement_backends.tsv")));

/// Generated exact backend declines and their source reasons.
pub static BUILT_IN_REQUIREMENT_DISPOSITIONS: LazyLock<Vec<RequirementDisposition>> =
    LazyLock::new(|| parse_dispositions(include_str!("built_in_requirement_dispositions.tsv")));
