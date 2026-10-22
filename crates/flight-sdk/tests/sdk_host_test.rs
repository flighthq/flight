// TS `sdk/src/sdkHost.test.ts`. Function identity (`toBe`) is checked by function pointer equality.
use flight_sdk::*;

mod sdk_host {
    use super::*;

    #[test]
    fn exposes_compress_deflate_as_the_portable_encoder_slot() {
        let slot = SDK_HOST.compress.deflate.unwrap();
        assert!(std::ptr::fn_addr_eq(
            slot.compress,
            SDK_HOST_COMPRESS_DEFLATE.compress
        ));
    }

    #[test]
    fn exposes_decompress_deflate_as_the_portable_decoder_slot() {
        assert!(SDK_HOST.decompress.deflate.is_some());
    }

    #[test]
    fn exposes_compress_lzma_as_the_portable_encoder_slot() {
        let slot = SDK_HOST.compress.lzma.unwrap();
        assert!(std::ptr::fn_addr_eq(
            slot.compress,
            SDK_HOST_COMPRESS_LZMA.compress
        ));
    }

    #[test]
    fn exposes_decompress_lzma_as_the_portable_decoder_slot() {
        assert!(SDK_HOST.decompress.lzma.is_some());
    }

    #[test]
    fn round_trips_bytes_through_the_aggregate_compress_and_decompress_slots() {
        let bytes = b"aggregate round trip".to_vec();
        let compressed =
            (SDK_HOST.compress.deflate.unwrap().compress)(&bytes, CompressionFraming::Raw);
        let decoder = SDK_HOST.decompress.deflate.clone().unwrap();
        let restored = (decoder.decompress)(&compressed, bytes.len(), CompressionFraming::Raw);
        assert_eq!(restored.as_deref(), Some(&bytes[..]));
    }
}

mod sdk_host_compress {
    use super::*;

    #[test]
    fn carries_the_deflate_and_lzma_slots() {
        assert!(SDK_HOST_COMPRESS.deflate.is_some());
        assert!(SDK_HOST_COMPRESS.lzma.is_some());
    }
}

mod sdk_host_decompress {
    use super::*;

    #[test]
    fn carries_the_deflate_and_lzma_slots() {
        assert!(SDK_HOST_DECOMPRESS.deflate.is_some());
        assert!(SDK_HOST_DECOMPRESS.lzma.is_some());
        assert!(SDK_HOST_DECOMPRESS.brotli.is_none());
    }
}
