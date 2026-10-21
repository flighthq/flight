#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssetLoadStatus {
    Freed,
    Loading,
    MissingDescriptor,
    MissingLoader,
    NeverAcquired,
    Resident,
}

// flight-lint: allow(conform-extra) D9 exact closed source AssetLoadExplanation status table; TS has no conversion helper
pub fn get_asset_load_status_string(value: AssetLoadStatus) -> &'static str {
    return match value {
        AssetLoadStatus::Freed => "freed",
        AssetLoadStatus::Loading => "loading",
        AssetLoadStatus::MissingDescriptor => "missing-descriptor",
        AssetLoadStatus::MissingLoader => "missing-loader",
        AssetLoadStatus::NeverAcquired => "never-acquired",
        AssetLoadStatus::Resident => "resident",
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source AssetLoadExplanation status table; TS has no conversion helper
pub fn parse_asset_load_status(value: &str) -> Option<AssetLoadStatus> {
    return match value {
        "freed" => Some(AssetLoadStatus::Freed),
        "loading" => Some(AssetLoadStatus::Loading),
        "missing-descriptor" => Some(AssetLoadStatus::MissingDescriptor),
        "missing-loader" => Some(AssetLoadStatus::MissingLoader),
        "never-acquired" => Some(AssetLoadStatus::NeverAcquired),
        "resident" => Some(AssetLoadStatus::Resident),
        _ => None,
    };
}
