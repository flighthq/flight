#if cpp
@:buildXml("<files id='haxe'><compilerflag value='-I@FLIGHT_FFI_INCLUDE@'/><compilerflag value='-include'/><compilerflag value='@FLIGHT_FFI_HEADER@'/></files><target id='haxe'><lib name='-L@FLIGHT_FFI_LIBRARY@'/><lib name='-lflight_ffi'/><flag value='-Wl,-rpath,@FLIGHT_FFI_LIBRARY@'/></target>")
#end
class NativeNodeHandleRuntime {
	static function require(condition:Bool, message:String):Void {
		if (!condition) throw new haxe.Exception(message);
	}

	static function verify(target:String):Void {
		var sprite:flight.FlightNode = flight.Scene2D.createSprite();
		var shape:flight.FlightNode = flight.Shape.createShape();
		var node3d:flight.FlightNode = flight.Particleemitter.createParticleEmitter3d();

		require(!flight.FlightNode.same(null, null), '$target null identity did not use the C sentinel');
		flight.FlightNode.freeNullable(null);
		require(!sprite.equals(shape), '$target distinct nodes compared equal');
		require(sprite.kind != null, '$target concrete producer lost its node kind');
		sprite.name = "typed-node";
		require(sprite.name == "typed-node", '$target node name did not round trip');

		var array = flight.FlightNodeArray.create();
		require(array.length == 0, '$target new node array was not empty');
		require(array.push(sprite), '$target node array rejected a sprite');
		require(array.push(node3d), '$target node array rejected a 3D node');
		require(array.length == 2, '$target node array length was wrong');
		var recovered = array.get(0);
		require(recovered != null && flight.FlightNode.same(sprite, recovered), '$target node array lost identity');
		require(array.get(2) == null, '$target node array missing-index sentinel was not null');
		recovered.free();

		sprite.node2dX = 9.5;
		require(sprite.node2dX == 9.5, '$target Node2D property did not round trip');
		require(node3d.node2dX == 0.0, '$target wrong-kind Node2D getter missed its sentinel');
		require(!node3d.setNode2dBlendMode(0, true), '$target wrong-kind Node2D setter did not fail');
		require(node3d.node2dBlendMode == -1, '$target wrong-kind blend-mode sentinel changed');

		var beforeEnabled = flight.Node.getNodeAppearanceRevision(sprite);
		sprite.enabled = false;
		require(!sprite.enabled, '$target raw enabled property did not write');
		require(flight.Node.getNodeAppearanceRevision(sprite) == beforeEnabled, '$target raw enabled property invalidated appearance');
		require(sprite.setEnabled(true), '$target SDK enabled setter rejected a sprite');
		require(flight.Node.getNodeAppearanceRevision(sprite) != beforeEnabled, '$target SDK enabled setter did not invalidate appearance');

		var before2dAlpha = flight.Node.getNodeAppearanceRevision(sprite);
		var alpha2d:Single = 0.25;
		sprite.node2dAlpha = alpha2d;
		require(sprite.node2dAlpha == alpha2d, '$target raw Node2D alpha did not round trip');
		require(flight.Node.getNodeAppearanceRevision(sprite) == before2dAlpha, '$target raw Node2D alpha invalidated appearance');
		require(sprite.setNode2dClip(null), '$target SDK clip setter rejected a sprite');
		require(flight.Node.getNodeAppearanceRevision(sprite) != before2dAlpha, '$target SDK clip setter did not invalidate appearance');
		require(!node3d.setNode2dClip(null), '$target wrong-kind clip setter did not fail');

		var before3dAlpha = flight.Node.getNodeAppearanceRevision(node3d);
		var rawAlpha3d:Single = 0.4;
		node3d.node3dAlpha = rawAlpha3d;
		require(node3d.node3dAlpha == rawAlpha3d, '$target raw Node3D alpha did not round trip');
		require(flight.Node.getNodeAppearanceRevision(node3d) == before3dAlpha, '$target raw Node3D alpha invalidated appearance');
		var sdkAlpha3d:Single = 0.6;
		require(node3d.setNode3dAlpha(sdkAlpha3d), '$target SDK Node3D alpha setter rejected a 3D node');
		require(flight.Node.getNodeAppearanceRevision(node3d) != before3dAlpha, '$target SDK Node3D alpha setter did not invalidate appearance');

		var parent = flight.Scene2D.createDisplayObject();
		require(flight.Node.getNodeParent(shape) == null, '$target fresh node unexpectedly had a parent');
		var added = flight.Node.addNodeChild(parent, shape);
		require(added.equals(shape), '$target child insertion lost identity');
		var actualParent = flight.Node.getNodeParent(shape);
		require(actualParent != null && actualParent.equals(parent), '$target optional parent did not preserve identity');
		actualParent.free();
		added.free();

		array.clear();
		require(array.length == 0, '$target node array clear failed');
		array.free();
		parent.free();
		sprite.free();
		shape.free();
		node3d.free();
		Sys.println('NATIVE_NODE_HANDLE_RUNTIME_OK target=$target');
	}

	static function main():Void {
		#if hl
		verify("HashLink");
		#elseif cpp
		verify("hxcpp");
		#else
		throw new haxe.Exception("NativeNodeHandleRuntime requires HashLink or hxcpp");
		#end
	}
}
