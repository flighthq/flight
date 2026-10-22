use std::sync::LazyLock;

use flight_compression::{
    HostCompressCapabilities, HostDecompressCapabilities, SDK_HOST_COMPRESS_DEFLATE, SDK_HOST_COMPRESS_LZMA,
    SDK_HOST_DECOMPRESS_DEFLATE, SDK_HOST_DECOMPRESS_LZMA,
};

/// The SDK's own host (TS `sdkHost`): the capabilities the SDK implements in portable code, with no
/// platform behind them. Like any host-* provider (D26) it carries only the groups it supports, and an
/// app mixes it with other providers.
#[derive(Clone)]
pub struct SdkHost {
    pub compress: HostCompressCapabilities,
    pub decompress: HostDecompressCapabilities,
}

/// The SDK host (TS `sdkHost`).
pub static SDK_HOST: LazyLock<SdkHost> = LazyLock::new(|| {
    return SdkHost {
        compress: SDK_HOST_COMPRESS.clone(),
        decompress: SDK_HOST_DECOMPRESS.clone(),
    };
});

/// The portable compression group (TS `sdkHostCompress`): deflate and lzma encoders.
pub static SDK_HOST_COMPRESS: LazyLock<HostCompressCapabilities> = LazyLock::new(|| {
    return HostCompressCapabilities {
        deflate: Some(*SDK_HOST_COMPRESS_DEFLATE),
        lzma: Some(*SDK_HOST_COMPRESS_LZMA),
    };
});

/// The portable decompression group (TS `sdkHostDecompress`): deflate and lzma decoders; brotli has no
/// SDK decoder.
pub static SDK_HOST_DECOMPRESS: LazyLock<HostDecompressCapabilities> = LazyLock::new(|| {
    return HostDecompressCapabilities {
        brotli: None,
        deflate: Some(SDK_HOST_DECOMPRESS_DEFLATE.clone()),
        lzma: Some(SDK_HOST_DECOMPRESS_LZMA.clone()),
    };
});
