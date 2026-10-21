use flight_assets::contract::*;
mod get_asset_load_status_string {
    use super::*;
    #[test]
    fn covers_the_complete_exact_closed_status_domain() {
        for (value, name) in [
            (AssetLoadStatus::Freed, "freed"),
            (AssetLoadStatus::Loading, "loading"),
            (AssetLoadStatus::MissingDescriptor, "missing-descriptor"),
            (AssetLoadStatus::MissingLoader, "missing-loader"),
            (AssetLoadStatus::NeverAcquired, "never-acquired"),
            (AssetLoadStatus::Resident, "resident"),
        ] {
            assert_eq!(get_asset_load_status_string(value), name);
        }
    }
}
mod parse_asset_load_status {
    use super::*;
    #[test]
    fn accepts_only_exact_source_status_spellings() {
        for (name, value) in [
            ("freed", AssetLoadStatus::Freed),
            ("loading", AssetLoadStatus::Loading),
            ("missing-descriptor", AssetLoadStatus::MissingDescriptor),
            ("missing-loader", AssetLoadStatus::MissingLoader),
            ("never-acquired", AssetLoadStatus::NeverAcquired),
            ("resident", AssetLoadStatus::Resident),
        ] {
            assert_eq!(parse_asset_load_status(name), Some(value));
        }
        for invalid in [
            "",
            "Resident",
            "never_acquired",
            "missing-loader ",
            "custom",
        ] {
            assert_eq!(parse_asset_load_status(invalid), None);
        }
    }
}
