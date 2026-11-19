#if cpp
@:buildXml("<files id='haxe'><compilerflag value='-I@FLIGHT_FFI_INCLUDE@'/><compilerflag value='-include'/><compilerflag value='@FLIGHT_FFI_HEADER@'/></files><target id='haxe'><lib name='-L@FLIGHT_FFI_LIBRARY@'/><lib name='-lflight_ffi'/><flag value='-Wl,-rpath,@FLIGHT_FFI_LIBRARY@'/></target>")
#end
class NativeByteResultRuntime {
	static function require(condition:Bool, message:String):Void {
		if (!condition) throw new haxe.Exception(message);
	}

	static function rejects(action:Void->Void):Bool {
		try {
			action();
		} catch (_:Dynamic) {
			return true;
		}
		return false;
	}

	static function verify(result:flight.ByteResult, target:String):Void {
		require(result.length > 0, '$target result was empty');
		var originalLength = result.length;
		var copied = result.toBytes();
		require(copied.length == originalLength, '$target copy length changed');
		for (index in 0...originalLength) {
			require(result.get(index) == copied.get(index), '$target get/toBytes mismatch[$index]');
		}

		result.free();
		require(result.length == 0, '$target free did not clear length');
		result.free();
		require(rejects(function() {
			result.get(0);
		}), '$target get after free was not rejected');
		require(rejects(function() {
			result.toBytes();
		}), '$target toBytes after free was not rejected');
		Sys.println('NATIVE_BYTE_RESULT_RUNTIME_OK target=$target bytes=$originalLength');
	}

	static function main():Void {
		#if hl
		var input = haxe.io.Bytes.ofString("native-byte-result-native-byte-result");
		var nativeInput:hl.Bytes = input.getData();
		verify(flight.Compression.compressDeflate(nativeInput, input.length), "HashLink");
		#elseif cpp
		verify(flight.Encoding.encodeUtf8("native-byte-result"), "hxcpp");
		#else
		throw new haxe.Exception("NativeByteResultRuntime requires HashLink or hxcpp");
		#end
	}
}
