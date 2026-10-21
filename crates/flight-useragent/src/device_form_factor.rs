/// Device form-factor identifier (TS `DeviceFormFactor`): the physical class of device a host runs
/// on. An OPEN string domain, as in TS: the seven constants below are the known values, and a
/// custom form factor uses a vendor-prefixed string (e.g. "acme.Console").
pub type DeviceFormFactor = String;

/// TS `DeviceFormFactorCar`.
pub const DEVICE_FORM_FACTOR_CAR: &str = "Car";

/// TS `DeviceFormFactorDesktop`.
pub const DEVICE_FORM_FACTOR_DESKTOP: &str = "Desktop";

/// TS `DeviceFormFactorPhone`.
pub const DEVICE_FORM_FACTOR_PHONE: &str = "Phone";

/// TS `DeviceFormFactorTablet`.
pub const DEVICE_FORM_FACTOR_TABLET: &str = "Tablet";

/// TS `DeviceFormFactorTV`.
pub const DEVICE_FORM_FACTOR_TV: &str = "TV";

/// TS `DeviceFormFactorUnknown`.
pub const DEVICE_FORM_FACTOR_UNKNOWN: &str = "Unknown";

/// TS `DeviceFormFactorWatch`.
pub const DEVICE_FORM_FACTOR_WATCH: &str = "Watch";
