/*
 * MODIFIED for RCVA (2026-10-23), see NOTICE. Changes:
 *  - create(): every event listener of the widget is registered through listen() and
 *    remembered; the THREEx.DomEvents instance is kept on the widget.
 *  - new PackWidget.prototype.destroy(): removes those listeners, destroys DomEvents and
 *    OrbitControls, disposes geometries and materials, and leaves the shared renderer.
 *  - PackWidgetRenderer: keeps the animation frame id, exposes the WebGL renderer
 *    (for renderer.info), has dispose() (stop loop, release context, remove canvas) and
 *    takes its clear color from PackWidget.rendererBackgroundColor when set.
 */
/**
 * Returns the position of an object with respect to the
 * (0, 0, 0) coordinate of the object.
 * @method positionWithPivot
 * @param x x coordinate of the object
 * @param y y coordinate of the object
 * @param z z coordinate of the object
 * @param width width of the object
 * @param height height of the object
 * @param depth depth of the object
 * @return new position
 **/
function positionWithPivot(x, y, z, width, height, depth) {
  var newPosition = {
    x: x + width/2.0,
    y: y + height/2.0,
    z: z + depth/2.0
  };
  return newPosition;
}

/**
 * Returns the camera distance needed to fit an object to the screen
 * @method fitObjToScreen
 * @param fov Field of view of the camera
 * @param aspect aspect ratio of the camera
 * @param objWidth The width ob the object
 * @param border left and right border in percent
 * @return distance of camera
 */
function fitObjToScreen(fov, aspect, objWidth, border) {
    var safeAspect = parseFloat(aspect);
    var safeObjWidth = parseFloat(objWidth);
    if (!isFinite(safeAspect) || safeAspect <= 0) safeAspect = 1;
    if (!isFinite(safeObjWidth) || safeObjWidth <= 0) safeObjWidth = 1;
    safeAspect = Math.max(safeAspect, 0.35);

    var width = safeObjWidth + (safeObjWidth/100.0)*border*2;
    var distance = width/(2*safeAspect*Math.tan(((Math.PI*fov)/360)));
    var minDistance = Math.max(width * 0.6, 1);
    var maxDistance = Math.max(width * 4, 20);

    if (!isFinite(distance) || distance <= 0) {
      distance = maxDistance;
    }
    distance = Math.max(minDistance, Math.min(maxDistance, distance));
    return distance;
}

/**
 * Returns the total dimensions of multiple bins
 * @method totalSize
 * @param bins array with bin objects
 * @return size object with x, y, z dimensions and center
 */
function totalSize(bins) {
  var size = {};
  var xCoordinates = [];
  var yCoordinates = [];
  var zCoordinates = [];
  bins.forEach(function (bin) {
    xCoordinates.push(parseFloat(bin.x));
    yCoordinates.push(parseFloat(bin.y));
    zCoordinates.push(parseFloat(bin.z));
  });
  size.x = Math.max.apply(Math, xCoordinates);
  size.x += parseFloat(bins[xCoordinates.indexOf(size.x)].width);
  size.y = Math.max.apply(Math, yCoordinates);
  size.y += parseFloat(bins[yCoordinates.indexOf(size.y)].height);
  size.z = Math.max.apply(Math, zCoordinates);
  size.z += parseFloat(bins[zCoordinates.indexOf(size.z)].depth);
  size.center = {};
  size.center.x = size.x/2;
  size.center.y = size.y/2;
  size.center.z = size.z/2;
  return size;
}

/**
 * Calculate the initial position of the camera based on the given options
 * @method initialPosition
 * @param options
 * @param bins Array of Bin objects
 * @return position of camera
 */
function initialPosition(options, bins) {
  options.rotateY = true;
  var camera = new THREE.PerspectiveCamera(
    options.fov, options.width/options.height, 0.1, 10000);
  var distance = 0;
  var position = {};
  var size = totalSize(bins);
  var minLength = Math.min(size.x, size.z);
  var maxLength = Math.max(size.x, size.z);
  var ratio = maxLength/minLength;
  if (ratio < 2) {
      options.rotateY = true;
      if(size.x > size.z) {
          var diag = size.z * Math.sqrt(2);
          distance = fitObjToScreen(options.fov, options.width/options.height, diag, options.border);

          camera.position.x =  size.center.x;
          camera.position.z =  size.center.z + diag/2;
          camera.position.y = size.center.y + size.y/2;
          camera.lookAt(size.center);
          camera.translateZ(distance);
      } else {
          var diag = size.x * Math.sqrt(2);
          distance = fitObjToScreen(options.fov, options.width/options.height, diag, options.border);

          camera.position.x =  - size.center.x + diag/2;
          camera.position.z =   size.center.z;
          camera.position.y = size.center.y ;
          camera.lookAt(size.center);
          camera.translateZ(distance);
      }
  } else {
      if(size.x > size.z) {
          distance = fitObjToScreen(options.fov, options.width/options.height, size.x, options.border);

          camera.position.x =  size.center.x;
          camera.position.z =   size.center.z + size.z/2;
          camera.position.y = size.center.y + size.y/2;
          camera.lookAt(size.center);
          camera.translateZ(distance);
      } else {
          distance = fitObjToScreen(options.fov, options.width/options.height, size.z, options.border);

          camera.position.x =  - size.center.x + size.x/2;
          camera.position.z =  size.center.z;
          camera.position.y = size.center.y ;
          camera.lookAt(size.center);
          camera.translateZ(distance);
      }
  }

  position = camera.position;
  position.center = size.center;
  return position;
}

/**
 * Creates a new item to be used with PackWidget
 * @method Item
 * @param x x coordinate of the item
 * @param y y coordinate of the item
 * @param z z coordinate of the item
 * @param width width of the item
 * @param height height of the item
 * @param depth depth of the item
 * @param holds the data from which the item was created, optional
 */
var Item = function(x, y, z, width, height, depth, color, dataItem) {
  this.x = x;
  this.y = y;
  this.z = z;
  this.width = width;
  this.height = height;
  this.depth = depth;
  this.color = color;
  this.dataItem = dataItem;
  this.visible = true;
  this.data = dataItem;
  this.graphicsItem = 0;
  this.toString = function () {
      return "Position: " + this.x + " " + this.y + " " + this.z +
          "Dimensions: " + this.width + " "
          + this.height + " " + this.depth;
  };
};

/**
 * Creates a new box shaped Bin.
 * @param x x position of the bin
 * @param y y position of the bin
 * @param z z position of the bin
 * @param width width of the bin
 * @param height height of the bin
 * @param depth depth of the bin
 * @param color color of the bin in hex format
 */
var Bin = function (x, y, z, width, height, depth, color) {
  return new BinShaped(x, y, z, dimensionsToPath(width, height), depth, color);
};

function BinShaped(x, y, z, shape, depth, color) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.color = color;
    this.shape = shape;
    this.width = Math.max.apply(null, shape.map(function(point) {
        return point.x;
    }));
    this.height = Math.max.apply(null, shape.map(function(point) {
        return point.y;
    }));
    this.depth = depth;
    this.visible = true; 
}

/** Creates a camera to be used with PackWidget
 * @method Camera
 * @param position position of the camera
 * @param target target the camera looks at
 */
var Camera = function(position, target) {
  this.position = position;
  this.target = target;
  this.toString = function() {
      return "Position: " + position +
             "Target:" + target;
  };
};

/** Creates the Widget object which is shown on the page
 * After initialization create() must be called to actually
 * show it.
 * @method PackWidget
 * @param bins bin objects
 * @param items items of the scene
 * @param userOptions options provided by the user
 */
var PackWidget = function (bins, items, userOptions) {
  this.mouse = new THREE.Vector2();
  // this is a hack: serialize/deserialize userOptions to clone objects
  this.userOptions = JSON.parse(JSON.stringify(userOptions));
  this.bins = JSON.parse(JSON.stringify(bins));
  this.items = JSON.parse(JSON.stringify(items));
  this.itemMap = new Map();
  this.onItemClick = function(item) {};
  this.onItemOver = function(item) {};
  this.onItemOut = function(item) {};
  this.onItemTransform = function(item) {};
  this.editEnabled = false;
}

PackWidget.prototype.setEditMode = function(enabled) {
  this.editEnabled = !!enabled;
  if (!this.scene || !this.scene.userData) return;
  this.scene.userData.editModeEnabled = this.editEnabled;
  var stagingObjects = this.scene.userData.stagingAreaObjects || [];
  for (var i = 0; i < stagingObjects.length; i++) {
    stagingObjects[i].visible = this.editEnabled;
  }
  if (!this.editEnabled && typeof this.scene.userData.forceEndDrag === 'function') {
    this.scene.userData.forceEndDrag();
  }
};


/** Creates sane default options
 * @method createDefaultOptions
 * @param bin the bin object which is used for determining the camera position
 */
PackWidget.prototype.createDefaultOptions = function (bins) {
  var defaultOptions = {
    backgroundColor: 0xfffffff,
    width: 640,
    fov: 30,
    border: 0,
    height: 640,
    //cameraPosition: {x: bin.height * 2, y: bin.height * 2, z: bin.height * 2},
    //cameranTarget: {x: bin.width/2, y: bin.height/2, z: bin.depth/2},
    cameraType: "perspective",
    highlightColor: 0xff0000,
    showTruckDetails: true,
    truckLineColor: 0x000000,
    enableItemDrag: false,
    dragCenterLockToPointer: true,
    dragSnapCm: 1,
    autoJoinDistanceCm: 5,
    stackSlideBoundaryRatio: 0.32,
    stackActivationOverlapRatio: 0.45,
    stackMinSupportCoverageRatio: 0.08,
    stackRequireFullBaseSupport: true,
    stackFullSupportToleranceRatio: 0.03,
    stackSupportClampDistanceCm: 10,
    stackSupportClampMinAxisOverlapCm: 2
  };
  return defaultOptions;
};

/** Creates a rect shaped path based on width and height
 * @param width width of the path
 * @param height height of the path
 * @return path
 */
function dimensionsToPath(width, height) {
return [{x: 0, y: 0}, {x: 0, y:height}, {x: width, y: height}, {x: width, y: 0}];
}

/** Creates the final options based on the default options and the user
 * options.
 * @method createOptions
 * @param defaultOptions the default options
 * @param userOptions the user options
 * @return the final options
 */
PackWidget.prototype.createOptions = function (bins, defaultOptions, userOptions) {
  var options = defaultOptions;
  for (opt in userOptions) {
    options[opt] = userOptions[opt];
  }
  var pos = initialPosition(options, bins);
  options.cameraPosition = pos;
  options.cameraTarget = pos.center;
  return options;
};

/**
 * Creates the camera object for the THREE scene. Not meant to be
 * called by the user.
 * @param options options created by createOptions
 * @return THREE camera object
 */
PackWidget.prototype.createThreeCamera = function(options, bins) {
  var camera;
  if (options.cameraType == "perspective") {
    camera = new THREE.PerspectiveCamera(
      this.options.fov, this.options.width/this.options.height, 0.1, 10000);
      camera.position.x = options.cameraPosition.x;
      camera.position.y = options.cameraPosition.y;
      camera.position.z = options.cameraPosition.z;
  }
  else if (options.cameraType == "orthographic") {
    camera = new THREE.OrthographicCamera(this.options.width/-2,
                this.options.width/2, this.options.height/2,
                this.options.height/-2, 0.1, 10000);
                camera.position.x = options.cameraPosition.x;
                camera.position.y = options.cameraPosition.y;
                camera.position.z = options.cameraPosition.z;
    camera.zoom = 0.5;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(options.cameraTarget.x,
                options.cameraTarget.y,
                options.cameraTarget.z);
 // camera.lookAt(100, 1000, 100);
  camera.updateProjectionMatrix();

  return camera;
};

/**
 * Creates lights for the THREE scene
 * @method createThreeLights
 * @param options created by createOptions
 * @return array with light objects
 */
PackWidget.prototype.createThreeLights = function(options) {
  var lights = [];
  var light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(0.8, 1, 0.7);
  lights.push(light);
  //light = new THREE.DirectionalLight(0xffffff, 1);
  //light.position.set(-0.8, 1, -0.7);
  //lights.push(light);
  return lights;
};

/** Creates a graphics object for a shaped bin
 * @param bin
 * @return bin mesh
 **/
function createShapedTHREEBin(bin) {
    var shape = new THREE.Shape();
    for(var j = 0; j < bin.shape.length; j++) {
    shape.moveTo(bin.shape[j].x,
             bin.shape[j].y);       
    }

    var material = new THREE.MeshBasicMaterial({color: 0xff0000});
    
    var settings = { wireframe: true, amount: bin.depth,
             bevelEnabled: false, bevelSegments: 1,
             steps: 1, bevelSize: 1, bevelThickness: 1 };
    var geometry = new THREE.ExtrudeGeometry(shape, settings);
    var mesh = new THREE.Mesh(geometry, material);
  

    edges = new THREE.EdgesHelper( mesh, bin.color);
    if (edges.material) {
        edges.material.transparent = false;
        edges.material.opacity = 1;
        edges.material.linewidth = 2;
    }
    edges.matrixAutoUpdate = true;

    pos = positionWithPivot(bin.x, bin.y, bin.z,
                bin.width, bin.height, bin.depth);
    edges.position.x = pos.x;
    edges.position.y = pos.y;
    edges.position.z = pos.z;

    bin.graphicsItem = edges;

    return edges;
}

/** Create a non shaped, box like Bin Graphics Object
 * @param bin
 */
function createTHREEBin(bin) {
    var geometry = new THREE.BoxGeometry(
    bin.width,
    bin.height,
    bin.depth
    );

    var material = new THREE.MeshBasicMaterial({color: bin.color});
    var cube = new THREE.Mesh(geometry, material);

    pos = positionWithPivot(bin.x, bin.y, bin.z,
                            bin.width, bin.height, bin.depth);
    cube.position.x = pos.x;
    cube.position.y = pos.y;
    cube.position.z = pos.z;

    var helper = new THREE.BoxHelper(cube);
    helper.material.color.set(bin.color);
    if (helper.material) {
        helper.material.transparent = false;
        helper.material.opacity = 1;
        helper.material.linewidth = 2;
    }
    
    bin.graphicsItem = helper;

    return helper;
}

/**
 * Creates a groundplane graphics object for a given bin.
 * @param bin 
 * @return mesh of the ground plane
 */
function createGroundPlane(bin) {
    var geometry = new THREE.BoxGeometry(bin.width, 5, bin.depth);
    var material = new THREE.MeshBasicMaterial( {color: 0xaaaaaa} );
    applyOpacity(material, 0.2);
    var cube = new THREE.Mesh( geometry, material );
   
	var pos = positionWithPivot(bin.x, bin.y - 5.01, bin.z, bin.width, 5, bin.depth);
    cube.position.x = pos.x;
	cube.position.y = pos.y;
	cube.position.z = pos.z;
    return cube;
}

function getBinExtents(bins) {
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = 0; i < bins.length; i++) {
        var bin = bins[i];
        var bx = parseFloat(bin.x);
        var by = parseFloat(bin.y);
        var bz = parseFloat(bin.z);
        var bw = parseFloat(bin.width);
        var bh = parseFloat(bin.height);
        var bd = parseFloat(bin.depth);
        minX = Math.min(minX, bx);
        minY = Math.min(minY, by);
        minZ = Math.min(minZ, bz);
        maxX = Math.max(maxX, bx + bw);
        maxY = Math.max(maxY, by + bh);
        maxZ = Math.max(maxZ, bz + bd);
    }
    return {
        minX: minX,
        minY: minY,
        minZ: minZ,
        maxX: maxX,
        maxY: maxY,
        maxZ: maxZ,
        sizeX: maxX - minX,
        sizeY: maxY - minY,
        sizeZ: maxZ - minZ
    };
}

function getTruckWheelBottomY(extents) {
    var groundY = extents.minY;
    var chassisHeight = Math.max(4, extents.sizeY * 0.06);
    var wheelR = extents.sizeY * 0.18;
    var chassisY = groundY - chassisHeight / 2 - extents.sizeY * 0.02;
    var wheelY = chassisY + wheelR - extents.sizeY * 0.20;
    return wheelY - wheelR;
}

function createEditStagingArea(extents) {
    var gap = 100;
    var scale = 1.5;
    var wheelBottomY = getTruckWheelBottomY(extents);
    var stagingWidth = Math.max(extents.sizeX * scale, 1);
    var stagingDepth = Math.max(extents.sizeZ * scale, 1);
    var truckCenterX = extents.minX + extents.sizeX / 2;
    var stagingBounds = {
        minX: truckCenterX - stagingWidth / 2,
        maxX: truckCenterX + stagingWidth / 2,
        minY: wheelBottomY,
        maxY: wheelBottomY,
        minZ: extents.maxZ + gap,
        maxZ: extents.maxZ + gap + stagingDepth
    };

    var width = stagingWidth;
    var depth = stagingDepth;
    var thickness = Math.max(0.6, extents.sizeY * 0.01);
    var centerX = (stagingBounds.minX + stagingBounds.maxX) / 2;
    var centerZ = (stagingBounds.minZ + stagingBounds.maxZ) / 2;
    // Keep the top face aligned with the wheel's lower edge.
    var y = wheelBottomY - thickness / 2;

    var surface = createSolidMesh(
        new THREE.BoxGeometry(width, thickness, depth),
        0x4f8bc9,
        { x: centerX, y: y, z: centerZ }
    );
    applyOpacity(surface.material, 0.2);
    surface.visible = false;

    var wireCarrier = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth));
    wireCarrier.position.set(centerX, y, centerZ);
    var outline = new THREE.EdgesHelper(wireCarrier, 0x1f4f7a);
    outline.position.copy(wireCarrier.position);
    outline.rotation.copy(wireCarrier.rotation);
    outline.matrixAutoUpdate = true;
    applyOpacity(outline.material, 0.65);
    outline.visible = false;

    return {
        bounds: stagingBounds,
        objects: [surface, outline]
    };
}

function createEdgeObject(geometry, color, position, rotation) {
    var mesh = new THREE.Mesh(geometry);
    if (rotation) {
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    }
    if (position) {
        mesh.position.set(position.x, position.y, position.z);
    }
    var edges = new THREE.EdgesHelper(mesh, color);
    applyOpacity(edges.material, 0.2);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    edges.matrixAutoUpdate = true;
    return edges;
}

function createSolidMesh(geometry, color, position, rotation) {
    var material = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
    applyOpacity(material, 0.2);
    var mesh = new THREE.Mesh(geometry, material);
    if (rotation) {
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    }
    if (position) {
        mesh.position.set(position.x, position.y, position.z);
    }
    return mesh;
}

function createOutlineMesh(geometry, color, position, scaleFactor, opacity, depthTest) {
    var material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.BackSide
    });
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    if (opacity !== undefined && opacity !== null) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
    }
    if (depthTest === false) {
        material.depthTest = false;
        material.depthWrite = false;
    }
    var mesh = new THREE.Mesh(geometry, material);
    if (position) {
        mesh.position.set(position.x, position.y, position.z);
    }
    if (scaleFactor && scaleFactor !== 1) {
        mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
    return mesh;
}

function createTruckDetails(bins, options) {
    if (!bins || bins.length === 0) return [];
    if (options && options.showTruckDetails === false) return [];

    var ext = getBinExtents(bins);
    var color = (options && options.truckLineColor !== undefined) ? options.truckLineColor : 0x000000;
    var fillColor = 0x000000;
    var windowColor = 0x777777;
    var parts = [];

    var centerZ = ext.minZ + ext.sizeZ / 2;
    var groundY = ext.minY;
    var frontX = ext.minX;
    var rearX = ext.maxX;

    var chassisHeight = Math.max(4, ext.sizeY * 0.06);
    var chassisY = groundY - chassisHeight / 2 - ext.sizeY * 0.02;

    // Cabin (stacked boxes to resemble reference)
    var cabLength = Math.max(ext.sizeX * 0.18, ext.sizeZ * 0.45);
    var cabHeight = ext.sizeY * 0.95;
    var cabWidth = ext.sizeZ;
    var cabGap = Math.max(ext.sizeX * 0.02, cabLength * 0.12);
    var cabX = frontX - (cabLength / 2 + cabGap);
    var cabY = groundY + cabHeight / 2 - ext.sizeY * 0.10;
    parts.push(createEdgeObject(
        new THREE.BoxGeometry(cabLength, cabHeight, cabWidth),
        color,
        { x: cabX, y: cabY, z: centerZ }
    ));
    parts.push(createSolidMesh(
        new THREE.BoxGeometry(cabLength, cabHeight, cabWidth),
        0x333333,
        { x: cabX, y: cabY, z: centerZ }
    ));


    // Cabin inner block removed per request.

    // Cabin window (thin black slab on the front face)
    var windowThickness = cabLength * 0.04;
    var windowHeight = cabHeight * 0.432;
    var windowWidth = cabWidth * 0.864;
    var cabFrontX = cabX - cabLength / 2;
    parts.push(createSolidMesh(
        new THREE.BoxGeometry(windowThickness, windowHeight, windowWidth),
        windowColor,
        { x: cabFrontX - windowThickness * 0.6, y: groundY + cabHeight * 0.55, z: centerZ }
    ));

    // Wheels
    var wheelR = ext.sizeY * 0.18;
    var wheelWidth = ext.sizeZ * 0.14;
    var rimColor = 0x333333;
    var wheelY = chassisY + wheelR - ext.sizeY * 0.20;
    var zOffset = ext.sizeZ / 2 + wheelWidth * 0.6;
    var frontAxleX = cabX + cabLength ;
    var steerAxleX = frontAxleX - wheelR * 4;
    var rearAxle1 = rearX - ext.sizeX * 0.18;
    var rearAxle2 = rearX - ext.sizeX * 0.28;
    var rearAxle3 = rearX - ext.sizeX * 0.38;
    var wheelXs = [frontAxleX, steerAxleX, rearAxle1, rearAxle2, rearAxle3];

    for (var w = 0; w < wheelXs.length; w++) {
        var leftWheel = createEdgeObject(
            new THREE.CylinderGeometry(wheelR, wheelR, wheelWidth, 18, 1, true),
            color,
            { x: wheelXs[w], y: wheelY, z: centerZ - zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        );
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR * 1.02, wheelR * 1.02, wheelWidth * 0.95, 18, 1, false),
            0x000000,
            { x: wheelXs[w], y: wheelY, z: centerZ - zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelWidth * 0.2, 18, 1, false),
            windowColor,
            { x: wheelXs[w], y: wheelY, z: centerZ - zOffset - wheelWidth * 0.55 },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR, wheelR, wheelWidth, 18, 1, true),
            fillColor,
            { x: wheelXs[w], y: wheelY, z: centerZ - zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        var rightWheel = createEdgeObject(
            new THREE.CylinderGeometry(wheelR, wheelR, wheelWidth, 18, 1, true),
            color,
            { x: wheelXs[w], y: wheelY, z: centerZ + zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        );
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR * 1.02, wheelR * 1.02, wheelWidth * 0.95, 18, 1, false),
            0x000000,
            { x: wheelXs[w], y: wheelY, z: centerZ + zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelWidth * 0.2, 18, 1, false),
            windowColor,
            { x: wheelXs[w], y: wheelY, z: centerZ + zOffset + wheelWidth * 0.55 },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(wheelR, wheelR, wheelWidth, 18, 1, true),
            fillColor,
            { x: wheelXs[w], y: wheelY, z: centerZ + zOffset },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
        parts.push(leftWheel);
        parts.push(rightWheel);
    }

    // Axle (dark gray)
    var axleRadius = Math.max(1, wheelR * 0.12);
    var axleLength = zOffset * 2;
    for (var a = 0; a < wheelXs.length; a++) {
        parts.push(createSolidMesh(
            new THREE.CylinderGeometry(axleRadius, axleRadius, axleLength, 12, 1, false),
            rimColor,
            { x: wheelXs[a], y: wheelY, z: centerZ },
            { x: Math.PI / 2, y: 0, z: 0 }
        ));
    }

    // Side block connecting cabin to axles (dark gray)
    var blockStartX = frontX - ext.sizeX * 0.02;
    var blockEndX = rearX - ext.sizeX * 0.05;
    var blockLength = Math.max(ext.sizeX * 0.2, blockEndX - blockStartX);
    parts.push(createSolidMesh(
        new THREE.BoxGeometry(blockLength, ext.sizeY * 0.12, ext.sizeZ * 0.90),
        windowColor,
        { x: (blockStartX + blockEndX) / 2 - 20, y: chassisY + ext.sizeY * 0.04 - 20, z: centerZ }
    ));

    return parts;
}

function applyOpacity(material, opacity) {
    if (!material || opacity === undefined || opacity === null) return;
    var targetOpacity = Math.max(0, Math.min(1, opacity));
    if (Array.isArray(material)) {
        material.forEach(function(mat) { applyOpacity(mat, targetOpacity); });
        return;
    }
    material.transparent = targetOpacity < 1;
    material.opacity = targetOpacity;
}

/**
 * create Bin graphics Objects 
 */
PackWidget.prototype.createThreeBins = function (bins) {
    let binMeshs = [];
    const ground = Math.min.apply(null, bins.map(bin => bin.y));
    for(const i in bins) {
        binMeshs.push(createTHREEBin(bins[i]));
        if (bins[i].y === ground && this.userOptions.showGround) {
            binMeshs.push(createGroundPlane(bins[i]));
        }
    }
    binMeshs = binMeshs.concat(createTruckDetails(bins, this.userOptions));
    return binMeshs;
};

/**
 * Creates the THREE graphics objects (meshes) representing the items for
 * usage with the THREE scene. Not meant to be called by the user.
 * @method createThreeItems
 * @param items to be represented
 * @return graphics objects
 */
PackWidget.prototype.createThreeItems = function(items) {
  var cubes = [];
  var edges = [];
  for (var i = 0; i < items.length; i++) {
    var geometry = new THREE.BoxGeometry(
      items[i].width,
      items[i].height,
      items[i].depth);
    var material = new THREE.MeshPhongMaterial({color:items[i].color});
    var cube = new THREE.Mesh(geometry, material);

    var pos = positionWithPivot(items[i].x, items[i].y, items[i].z,
                                items[i].width, items[i].height, items[i].depth);
    cube.position.x = pos.x;
    cube.position.y = pos.y;
    cube.position.z = pos.z;
    cubes.push(cube);
    items[i].graphicsItem = cube;
    this.itemMap.set(cube, items[i]);

    edge = new THREE.EdgesHelper(cube, 0x000000);
    if (edge.material) {
        edge.material.transparent = false;
        edge.material.opacity = 1;
        edge.material.linewidth = 2;
    }
    edges.push(edge);

  }
  return cubes.concat(edges);
};

/**
 * Creates the renderer for THREE. Not meant to be called by the user.
 * @method createThreeRenderer
 * @param options options created by createOptions
 * @return THREE renderer
 */
PackWidget.prototype.createThreeRenderer = function(options) {
  var renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setClearColor(options.backgroundColor);
  renderer.setSize(this.options.width, this.options.height);
  return renderer;
};

/**
 * Created the THREE Scene of the given bins, items, camera and lights.
 * Not meant to be called by the user.
 * @method createThreeScene
 * @param bins THREE graphics objects representing the bins.
 * @param items THREE graphics objects representing the items.
 * @param camera THREE camera object
 * @param lights THREE light objects
 * @return THREE scene.
 */
PackWidget.prototype.createThreeScene = function(bins, items, camera, lights) {
  var scene = new THREE.Scene();
  for (var i = 0; i < bins.length; i++)
    scene.add(bins[i]);
  for (var i = 0; i < items.length; i++)
    scene.add(items[i]);
  scene.add(camera);
  for (var i = 0; i < lights.length; i++)
    scene.add(lights[i]);
  return scene;
};



/**
 * Creates the widget and appends it to the dom element.
 * @param container dom element
 */
PackWidget.prototype.create = function (container) {
  // RCVA: remember listeners so destroy() can remove them.
  var registeredListeners = [];
  this._listeners = registeredListeners;
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    registeredListeners.push([target, type, handler, options]);
  }

  var containerWidth = container.offsetWidth || container.clientWidth || window.innerWidth;
  var containerHeight = container.offsetHeight || container.clientHeight || window.innerHeight;
  this.userOptions.width = Math.max(containerWidth, 1);
  this.userOptions.height = Math.max(containerHeight, 1);
  this.options = this.createOptions(this.bins,
  this.createDefaultOptions(this.bins), this.userOptions);
  
  var width = this.options.width;
  var height = this.options.height;
  var currentColor;
  var raycaster = new THREE.Raycaster();
  var rect = container.getBoundingClientRect();
  var mouse = new THREE.Vector2();
  var graphicsItems = this.createThreeItems(this.items);
  var graphicsBins = this.createThreeBins(this.bins);
  var camera = this.createThreeCamera(this.options, this.bins);

  var lights = this.createThreeLights();
  this.lights = lights;
  var scene = this.createThreeScene(graphicsBins, graphicsItems, camera, lights);
  scene.userData.element = container;
  scene.userData.camera = camera;
  scene.userData.lights = lights;
  this.scene = scene;
  scene.userData.itemMap = this.itemMap;
  scene.userData.truckBounds = getBinExtents(this.bins);
  var stagingArea = createEditStagingArea(scene.userData.truckBounds);
  scene.userData.stagingBounds = stagingArea.bounds;
  scene.userData.truckFloorY = 0;
  scene.userData.stagingFloorY = scene.userData.stagingBounds.maxY;
  scene.userData.stagingAreaObjects = stagingArea.objects;
  scene.userData.editAreaBounds = {
    minX: Math.min(scene.userData.truckBounds.minX, scene.userData.stagingBounds.minX),
    minY: Math.min(scene.userData.truckBounds.minY, scene.userData.stagingBounds.minY),
    minZ: Math.min(scene.userData.truckBounds.minZ, scene.userData.stagingBounds.minZ),
    maxX: Math.max(scene.userData.truckBounds.maxX, scene.userData.stagingBounds.maxX),
    maxY: Math.max(scene.userData.truckBounds.maxY, scene.userData.stagingBounds.maxY),
    maxZ: Math.max(scene.userData.truckBounds.maxZ, scene.userData.stagingBounds.maxZ)
  };
  scene.userData.editModeEnabled = this.editEnabled === true;
  for (var s = 0; s < stagingArea.objects.length; s++) {
    stagingArea.objects[s].visible = scene.userData.editModeEnabled;
    scene.add(stagingArea.objects[s]);
  }

    // add Threex Event Handlers for items
  var domEvents = new THREEx.DomEvents(camera, scene.userData.element);
  this._domEvents = domEvents; // RCVA: destroyed in destroy()

    var itemClicked = this.onItemClick;
    var itemOver = this.onItemOver;
    var itemOut = this.onItemOut;
    var itemTransformed = this.onItemTransform;

    var lastTouchTime = 0;
    var suppressClickUntil = 0;
    var itemDragEnabled = this.options.enableItemDrag === true;
    var dragCenterLockToPointer = this.options.dragCenterLockToPointer !== false;
    var dragSnapCm = Math.max(1, toNumber(this.options.dragSnapCm, 1));
    var autoJoinDistanceCm = Math.max(0, toNumber(this.options.autoJoinDistanceCm, 5));
    // Stack transition is threshold-based: slide first, then adapt above support.
    var stackMinOverlapRatio = 0.35;
    var stackMinSupportCoverageRatio = clamp(toNumber(this.options.stackMinSupportCoverageRatio, 0.08), 0, 0.6);
    var stackRequireFullBaseSupport = this.options.stackRequireFullBaseSupport !== false;
    var stackFullSupportToleranceRatio = clamp(toNumber(this.options.stackFullSupportToleranceRatio, 0.03), 0, 0.05);
    var stackSupportClampDistanceCm = Math.max(0, toNumber(this.options.stackSupportClampDistanceCm, 10));
    var stackSupportClampMinAxisOverlapCm = Math.max(0, toNumber(this.options.stackSupportClampMinAxisOverlapCm, 2));
    var stackCenterMarginCm = 2;
    var stackSlideBoundaryRatio = clamp(toNumber(this.options.stackSlideBoundaryRatio, 0.32), 0.05, 0.95);
    var stackActivationOverlapRatio = clamp(toNumber(this.options.stackActivationOverlapRatio, 0.45), 0.05, 0.98);
    var supportTopToleranceCm = 0.6;
    var dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var dragHitPoint = new THREE.Vector3();
    var dragOffset = new THREE.Vector3();
    var dragState = {
      active: false,
      blocked: false,
      moved: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      fixedY: 0,
      mesh: null,
      item: null,
      lastValidPosition: new THREE.Vector3()
    };
    var mobilePanHold = {
      active: false,
      touchId: null,
      lastTapTime: 0,
      lastTapX: 0,
      lastTapY: 0,
      lastX: 0,
      lastY: 0,
      moved: false
    };
    var mobilePanDoubleTapMaxDelayMs = 320;
    var mobilePanDoubleTapMaxDistancePx = 28;
    var activeTouchPointers = Object.create(null);
    scene.userData.isDragging = false;

    // Touch support and drag use mesh pick targets only.
    var pickTargets = graphicsItems.filter(function(obj) {
      return obj && (obj.isMesh || obj.type === 'Mesh');
    });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function toNumber(value, fallback) {
      var parsed = parseFloat(value);
      return isFinite(parsed) ? parsed : fallback;
    }

    function snapToGrid(value) {
      if (!isFinite(value)) return value;
      return Math.round(value / dragSnapCm) * dragSnapCm;
    }

    function isEditEnabled() {
      return scene.userData.editModeEnabled === true;
    }

    function isPointInsideBoundsXZ(point, bounds) {
      if (!point || !bounds) return false;
      return point.x >= bounds.minX && point.x <= bounds.maxX &&
             point.z >= bounds.minZ && point.z <= bounds.maxZ;
    }

    function getActiveBounds(pointerPoint) {
      if (!isEditEnabled()) return scene.userData.truckBounds;
      if (isPointInsideBoundsXZ(pointerPoint, scene.userData.stagingBounds)) {
        return scene.userData.stagingBounds;
      }
      return scene.userData.truckBounds;
    }

    function getItemCenterYForBounds(item, bounds, fallbackY) {
      if (!item || !bounds) return fallbackY;
      var halfHeight = Math.max(0, toNumber(item.height, 0)) / 2;
      // Cargo area floor is fixed to Y=0.
      if (bounds === scene.userData.truckBounds) {
        return toNumber(scene.userData.truckFloorY, 0) + halfHeight;
      }
      // Items moved to staging must rest on staging plane.
      if (bounds === scene.userData.stagingBounds) {
        return toNumber(scene.userData.stagingFloorY, bounds.maxY) + halfHeight;
      }
      return fallbackY;
    }

    function getClampedCenter(value, min, max) {
      if (min > max) {
        return (min + max) / 2;
      }
      return clamp(value, min, max);
    }

    function getTouchByIdentifier(touches, identifier) {
      if (!touches || !isFinite(identifier)) return null;
      for (var t = 0; t < touches.length; t++) {
        if (touches[t].identifier === identifier) return touches[t];
      }
      return null;
    }

    function panCameraTargetBy(deltaX, deltaY) {
      var controls = scene.userData.controls;
      if (!controls || !controls.constraint || typeof controls.constraint.pan !== "function") return;
      var element = controls.domElement === document ? controls.domElement.body : controls.domElement;
      controls.constraint.pan(deltaX, deltaY, element.clientWidth, element.clientHeight);
      controls.update();
    }

    function beginMobilePanHold(touch) {
      if (!touch) return false;
      mobilePanHold.active = true;
      mobilePanHold.touchId = touch.identifier;
      mobilePanHold.lastX = touch.clientX;
      mobilePanHold.lastY = touch.clientY;
      mobilePanHold.moved = false;
      if (scene.userData.controls) {
        scene.userData.controls.enabled = false;
      }
      return true;
    }

    function endMobilePanHold() {
      if (!mobilePanHold.active) return;
      mobilePanHold.active = false;
      mobilePanHold.touchId = null;
      if (mobilePanHold.moved) {
        suppressClickUntil = Date.now() + 260;
      }
      if (scene.userData.controls && !dragState.active) {
        scene.userData.controls.enabled = true;
      }
    }

    function handleMobilePanHoldStart(e) {
      if (!e || !e.touches || e.touches.length !== 1) {
        return false;
      }
      if (dragState.active || mobilePanHold.active) {
        return false;
      }

      var touch = e.touches[0];
      var now = Date.now();
      var elapsed = now - mobilePanHold.lastTapTime;
      var dx = touch.clientX - mobilePanHold.lastTapX;
      var dy = touch.clientY - mobilePanHold.lastTapY;
      var distanceSq = dx * dx + dy * dy;
      var maxDistanceSq = mobilePanDoubleTapMaxDistancePx * mobilePanDoubleTapMaxDistancePx;
      var isDoubleTap = elapsed > 0 && elapsed <= mobilePanDoubleTapMaxDelayMs && distanceSq <= maxDistanceSq;

      mobilePanHold.lastTapTime = now;
      mobilePanHold.lastTapX = touch.clientX;
      mobilePanHold.lastTapY = touch.clientY;

      if (!isDoubleTap) return false;

      beginMobilePanHold(touch);
      if (window.pwLastPointer) {
        window.pwLastPointer.x = touch.clientX;
        window.pwLastPointer.y = touch.clientY;
      }
      return true;
    }

    function refreshRect() {
      rect = container.getBoundingClientRect();
      width = Math.max(rect.width || container.clientWidth || 1, 1);
      height = Math.max(rect.height || container.clientHeight || 1, 1);
    }

    function setPointerCoords(clientX, clientY) {
      refreshRect();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      mouse.x = ((clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
    }

    function getMappedObjectForHit(object) {
      var current = object;
      while (current) {
        if (scene.userData.itemMap.has(current)) return current;
        current = current.parent;
      }
      return null;
    }

    function pickHit(clientX, clientY) {
      setPointerCoords(clientX, clientY);
      var hits = raycaster.intersectObjects(pickTargets, true);
      if (!hits || hits.length === 0) return null;
      for (var h = 0; h < hits.length; h++) {
        var mappedObject = getMappedObjectForHit(hits[h].object);
        if (!mappedObject) continue;
        hits[h].itemObject = mappedObject;
        hits[h].item = scene.userData.itemMap.get(mappedObject) || null;
        if (hits[h].item) return hits[h];
      }
      return null;
    }

    function pickItem(clientX, clientY) {
      var hit = pickHit(clientX, clientY);
      if (!hit) return null;
      return hit.item || null;
    }

    function getHoveredSupportHit(targetItem) {
      if (!targetItem) return null;
      var hits = raycaster.intersectObjects(pickTargets, true);
      if (!hits || hits.length === 0) return null;

      for (var h = 0; h < hits.length; h++) {
        var hit = hits[h];
        var mappedObject = getMappedObjectForHit(hit.object);
        if (!mappedObject) continue;
        var supportItem = scene.userData.itemMap.get(mappedObject);
        if (!supportItem) continue;
        if (supportItem === targetItem || mappedObject === targetItem.graphicsItem) continue;

        if (hit.face && hit.object && hit.object.matrixWorld) {
          var worldNormal = hit.face.normal.clone();
          worldNormal.transformDirection(hit.object.matrixWorld);
          // Ignore near-vertical faces so fit works on the top support surface.
          if (worldNormal.y < 0.2) continue;
        }

        return {
          item: supportItem,
          mesh: mappedObject,
          point: hit.point ? hit.point.clone() : null
        };
      }

      return null;
    }

    function syncItemPosition(item, meshPosition) {
      var itemWidth = toNumber(item.width, 0);
      var itemHeight = toNumber(item.height, 0);
      var itemDepth = toNumber(item.depth, 0);

      item.x = meshPosition.x - itemWidth / 2;
      item.y = meshPosition.y - itemHeight / 2;
      item.z = meshPosition.z - itemDepth / 2;

      if (item.dataItem && typeof item.dataItem === 'object') {
        if (item.dataItem.position_cm && typeof item.dataItem.position_cm === 'object') {
          item.dataItem.position_cm.x = item.x;
          // Viewer axes are X,Y,Z while API payload uses X,Y,Z where Z is vertical.
          item.dataItem.position_cm.y = item.z;
          item.dataItem.position_cm.z = item.y;
        }
        if (item.dataItem.x !== undefined) item.dataItem.x = item.x;
        if (item.dataItem.y !== undefined) item.dataItem.y = item.y;
        if (item.dataItem.z !== undefined) item.dataItem.z = item.z;
        if (item.dataItem.loading_meter !== undefined) {
          item.dataItem.loading_meter = item.x + itemWidth;
        }
      }
    }

    function syncItemDimensions(item) {
      if (!item || !item.dataItem || typeof item.dataItem !== 'object') return;
      var itemWidth = toNumber(item.width, 0);
      var itemHeight = toNumber(item.height, 0);
      var itemDepth = toNumber(item.depth, 0);

      if (item.dataItem.display_dimensions_cm && typeof item.dataItem.display_dimensions_cm === 'object') {
        item.dataItem.display_dimensions_cm.length = itemWidth;
        item.dataItem.display_dimensions_cm.width = itemDepth;
        item.dataItem.display_dimensions_cm.height = itemHeight;
      }
      if (item.dataItem.dimensions_cm && typeof item.dataItem.dimensions_cm === 'object') {
        item.dataItem.dimensions_cm.length = itemWidth;
        item.dataItem.dimensions_cm.width = itemDepth;
        item.dataItem.dimensions_cm.height = itemHeight;
      }
      if (item.dataItem.rotation && typeof item.dataItem.rotation === 'object' &&
          item.dataItem.rotation.is_rotated !== undefined) {
        item.dataItem.rotation.is_rotated = !item.dataItem.rotation.is_rotated;
      } else if (typeof item.dataItem.rotation === 'boolean') {
        item.dataItem.rotation = !item.dataItem.rotation;
      }
    }

    function clampItemCenterToBounds(item, position, bounds) {
      var itemWidth = Math.max(0, toNumber(item.width, 0));
      var itemDepth = Math.max(0, toNumber(item.depth, 0));
      var minCenterX = bounds.minX + itemWidth / 2;
      var maxCenterX = bounds.maxX - itemWidth / 2;
      var minCenterZ = bounds.minZ + itemDepth / 2;
      var maxCenterZ = bounds.maxZ - itemDepth / 2;

      if (minCenterX > maxCenterX) {
        var centerX = (bounds.minX + bounds.maxX) / 2;
        minCenterX = centerX;
        maxCenterX = centerX;
      }
      if (minCenterZ > maxCenterZ) {
        var centerZ = (bounds.minZ + bounds.maxZ) / 2;
        minCenterZ = centerZ;
        maxCenterZ = centerZ;
      }

      position.x = getClampedCenter(snapToGrid(position.x), minCenterX, maxCenterX);
      position.z = getClampedCenter(snapToGrid(position.z), minCenterZ, maxCenterZ);
    }

    function buildItemAabb(item, center) {
      var halfX = Math.max(0, toNumber(item.width, 0)) / 2;
      var halfY = Math.max(0, toNumber(item.height, 0)) / 2;
      var halfZ = Math.max(0, toNumber(item.depth, 0)) / 2;
      return {
        minX: center.x - halfX,
        maxX: center.x + halfX,
        minY: center.y - halfY,
        maxY: center.y + halfY,
        minZ: center.z - halfZ,
        maxZ: center.z + halfZ
      };
    }

    function rangesOverlap(minA, maxA, minB, maxB) {
      var epsilon = 0.001;
      return Math.min(maxA, maxB) - Math.max(minA, minB) > epsilon;
    }

    function getOverlapLength(minA, maxA, minB, maxB) {
      return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
    }

    function getUnionIntervalLength(intervals) {
      if (!intervals || intervals.length === 0) return 0;
      var normalized = [];
      for (var i = 0; i < intervals.length; i++) {
        var interval = intervals[i];
        if (!interval) continue;
        var start = Math.min(interval.start, interval.end);
        var end = Math.max(interval.start, interval.end);
        if (!isFinite(start) || !isFinite(end) || end <= start) continue;
        normalized.push({ start: start, end: end });
      }
      if (normalized.length === 0) return 0;
      normalized.sort(function(a, b) { return a.start - b.start; });

      var total = 0;
      var currentStart = normalized[0].start;
      var currentEnd = normalized[0].end;
      for (var n = 1; n < normalized.length; n++) {
        var next = normalized[n];
        if (next.start <= currentEnd + 0.001) {
          currentEnd = Math.max(currentEnd, next.end);
        } else {
          total += currentEnd - currentStart;
          currentStart = next.start;
          currentEnd = next.end;
        }
      }
      total += currentEnd - currentStart;
      return total;
    }

    function getProjectedCoverageLength(rects, axis) {
      if (!rects || rects.length === 0) return 0;
      var intervals = [];
      var startKey = axis === "x" ? "minX" : "minZ";
      var endKey = axis === "x" ? "maxX" : "maxZ";
      for (var i = 0; i < rects.length; i++) {
        var rect = rects[i];
        intervals.push({
          start: rect[startKey],
          end: rect[endKey]
        });
      }
      return getUnionIntervalLength(intervals);
    }

    function getRectanglesUnionArea(rects) {
      if (!rects || rects.length === 0) return 0;
      var xBreaks = [];
      for (var i = 0; i < rects.length; i++) {
        var rect = rects[i];
        if (!rect) continue;
        if (!isFinite(rect.minX) || !isFinite(rect.maxX) || !isFinite(rect.minZ) || !isFinite(rect.maxZ)) continue;
        if (rect.maxX <= rect.minX || rect.maxZ <= rect.minZ) continue;
        xBreaks.push(rect.minX);
        xBreaks.push(rect.maxX);
      }
      if (xBreaks.length < 2) return 0;
      xBreaks.sort(function(a, b) { return a - b; });

      var area = 0;
      for (var xb = 0; xb < xBreaks.length - 1; xb++) {
        var x1 = xBreaks[xb];
        var x2 = xBreaks[xb + 1];
        var stripWidth = x2 - x1;
        if (stripWidth <= 0.001) continue;

        var zIntervals = [];
        for (var r = 0; r < rects.length; r++) {
          var currentRect = rects[r];
          if (!currentRect) continue;
          if (currentRect.minX >= x2 - 0.001 || currentRect.maxX <= x1 + 0.001) continue;
          zIntervals.push({ start: currentRect.minZ, end: currentRect.maxZ });
        }

        var coveredZ = getUnionIntervalLength(zIntervals);
        if (coveredZ > 0) {
          area += stripWidth * coveredZ;
        }
      }
      return area;
    }

    function findBestSnapX(targetItem, targetAabb) {
      var bestDistance = Infinity;
      var bestCenter = null;
      var halfWidth = (targetAabb.maxX - targetAabb.minX) / 2;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var overlapY = rangesOverlap(targetAabb.minY, targetAabb.maxY, otherAabb.minY, otherAabb.maxY);
        var overlapZ = rangesOverlap(targetAabb.minZ, targetAabb.maxZ, otherAabb.minZ, otherAabb.maxZ);
        if (!(overlapY && overlapZ)) return;

        var gapToLeft = targetAabb.minX - otherAabb.maxX;
        if (gapToLeft >= 0 && gapToLeft <= autoJoinDistanceCm && gapToLeft < bestDistance) {
          bestDistance = gapToLeft;
          bestCenter = otherAabb.maxX + halfWidth;
        }

        var gapToRight = otherAabb.minX - targetAabb.maxX;
        if (gapToRight >= 0 && gapToRight <= autoJoinDistanceCm && gapToRight < bestDistance) {
          bestDistance = gapToRight;
          bestCenter = otherAabb.minX - halfWidth;
        }
      });

      return bestCenter;
    }

    function findBestSnapZ(targetItem, targetAabb) {
      var bestDistance = Infinity;
      var bestCenter = null;
      var halfDepth = (targetAabb.maxZ - targetAabb.minZ) / 2;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var overlapY = rangesOverlap(targetAabb.minY, targetAabb.maxY, otherAabb.minY, otherAabb.maxY);
        var overlapX = rangesOverlap(targetAabb.minX, targetAabb.maxX, otherAabb.minX, otherAabb.maxX);
        if (!(overlapY && overlapX)) return;

        var gapToBack = targetAabb.minZ - otherAabb.maxZ;
        if (gapToBack >= 0 && gapToBack <= autoJoinDistanceCm && gapToBack < bestDistance) {
          bestDistance = gapToBack;
          bestCenter = otherAabb.maxZ + halfDepth;
        }

        var gapToFront = otherAabb.minZ - targetAabb.maxZ;
        if (gapToFront >= 0 && gapToFront <= autoJoinDistanceCm && gapToFront < bestDistance) {
          bestDistance = gapToFront;
          bestCenter = otherAabb.minZ - halfDepth;
        }
      });

      return bestCenter;
    }

    function applyAutoJoinSnap(targetItem, basePosition) {
      var snappedPosition = basePosition.clone();
      if (autoJoinDistanceCm <= 0) return snappedPosition;

      var aabbX = buildItemAabb(targetItem, snappedPosition);
      var snappedX = findBestSnapX(targetItem, aabbX);
      if (snappedX !== null) {
        snappedPosition.x = snappedX;
      }

      var aabbZ = buildItemAabb(targetItem, snappedPosition);
      var snappedZ = findBestSnapZ(targetItem, aabbZ);
      if (snappedZ !== null) {
        snappedPosition.z = snappedZ;
      }

      return snappedPosition;
    }

    function itemsOverlapByAabb(itemA, centerA, itemB, centerB) {
      var epsilon = 0.001;
      var halfAx = Math.max(0, toNumber(itemA.width, 0)) / 2;
      var halfAy = Math.max(0, toNumber(itemA.height, 0)) / 2;
      var halfAz = Math.max(0, toNumber(itemA.depth, 0)) / 2;
      var halfBx = Math.max(0, toNumber(itemB.width, 0)) / 2;
      var halfBy = Math.max(0, toNumber(itemB.height, 0)) / 2;
      var halfBz = Math.max(0, toNumber(itemB.depth, 0)) / 2;

      var overlapX = Math.abs(centerA.x - centerB.x) < (halfAx + halfBx - epsilon);
      var overlapY = Math.abs(centerA.y - centerB.y) < (halfAy + halfBy - epsilon);
      var overlapZ = Math.abs(centerA.z - centerB.z) < (halfAz + halfBz - epsilon);
      return overlapX && overlapY && overlapZ;
    }

    function hasItemCollision(targetItem, targetCenter) {
      var collided = false;
      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (collided) return;
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (itemsOverlapByAabb(targetItem, targetCenter, otherItem, otherMesh.position)) {
          collided = true;
        }
      });
      return collided;
    }

    function collectSupportTopLevels(targetItem, bounds) {
      var levels = [];
      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;

        var supportTop = otherMesh.position.y + Math.max(0, toNumber(otherItem.height, 0)) / 2;
        if (!isFinite(supportTop)) return;

        for (var i = 0; i < levels.length; i++) {
          if (Math.abs(levels[i] - supportTop) <= supportTopToleranceCm) {
            return;
          }
        }
        levels.push(supportTop);
      });

      levels.sort(function(a, b) { return b - a; });
      return levels;
    }

    function findNearestSupportClampedProbe(targetItem, probe, bounds, supportTop, options) {
      options = options || {};
      if (stackSupportClampDistanceCm <= 0) return null;
      var halfWidth = Math.max(0, toNumber(targetItem.width, 0)) / 2;
      var halfDepth = Math.max(0, toNumber(targetItem.depth, 0)) / 2;
      var bestProbe = null;
      var bestDistance = Infinity;
      var maxSnapDistanceCm = Math.max(0, toNumber(options.maxSnapDistanceCm, stackSupportClampDistanceCm));
      var maxSnapDistanceSq = maxSnapDistanceCm * maxSnapDistanceCm;
      var supportMeshSet = options.supportMeshSet || null;
      var requireNearEdge = options.requireNearEdge !== false;
      var edgeThresholdCm = Math.max(0, toNumber(options.edgeThresholdCm, stackSupportClampMinAxisOverlapCm));
      var unlimitedDistance = options.unlimitedDistance === true;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (supportMeshSet && !supportMeshSet.has(otherMesh)) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;

        var otherHeight = Math.max(0, toNumber(otherItem.height, 0));
        var otherTop = otherMesh.position.y + otherHeight / 2;
        if (Math.abs(otherTop - supportTop) > supportTopToleranceCm) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var minCenterX = otherAabb.minX + halfWidth;
        var maxCenterX = otherAabb.maxX - halfWidth;
        var minCenterZ = otherAabb.minZ + halfDepth;
        var maxCenterZ = otherAabb.maxZ - halfDepth;
        if (minCenterX > maxCenterX || minCenterZ > maxCenterZ) return;

        var gapToRangeX = probe.x < minCenterX ? (minCenterX - probe.x) :
                          (probe.x > maxCenterX ? probe.x - maxCenterX : 0);
        var gapToRangeZ = probe.z < minCenterZ ? (minCenterZ - probe.z) :
                          (probe.z > maxCenterZ ? probe.z - maxCenterZ : 0);
        // Allow edge stick when pointer crosses slightly outside support bounds.
        if (requireNearEdge &&
            gapToRangeX > edgeThresholdCm &&
            gapToRangeZ > edgeThresholdCm) {
          return;
        }

        var clampedX = clamp(probe.x, minCenterX, maxCenterX);
        var clampedZ = clamp(probe.z, minCenterZ, maxCenterZ);
        var dx = clampedX - probe.x;
        var dz = clampedZ - probe.z;
        var dist = dx * dx + dz * dz;
        if (!unlimitedDistance && dist > maxSnapDistanceSq + 0.001) return;

        if (dist < bestDistance) {
          bestDistance = dist;
          bestProbe = new THREE.Vector3(clampedX, probe.y, clampedZ);
        }
      });

      return bestProbe;
    }

    function analyzeCombinedSupportSurface(targetItem, targetAabb, probe, bounds, supportTop, supportMeshSet) {
      var targetWidth = Math.max(0.001, targetAabb.maxX - targetAabb.minX);
      var targetDepth = Math.max(0.001, targetAabb.maxZ - targetAabb.minZ);
      var targetFootArea = Math.max(0.001, targetWidth * targetDepth);
      var overlapRects = [];
      var centerInsideSupport = false;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (supportMeshSet && !supportMeshSet.has(otherMesh)) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;

        var otherHeight = Math.max(0, toNumber(otherItem.height, 0));
        var otherTop = otherMesh.position.y + otherHeight / 2;
        if (Math.abs(otherTop - supportTop) > supportTopToleranceCm) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var overlapX = getOverlapLength(targetAabb.minX, targetAabb.maxX, otherAabb.minX, otherAabb.maxX);
        var overlapZ = getOverlapLength(targetAabb.minZ, targetAabb.maxZ, otherAabb.minZ, otherAabb.maxZ);
        if (overlapX <= 0.5 || overlapZ <= 0.5) return;

        overlapRects.push({
          minX: Math.max(targetAabb.minX, otherAabb.minX),
          maxX: Math.min(targetAabb.maxX, otherAabb.maxX),
          minZ: Math.max(targetAabb.minZ, otherAabb.minZ),
          maxZ: Math.min(targetAabb.maxZ, otherAabb.maxZ)
        });

        var supportWidth = Math.max(0.001, otherAabb.maxX - otherAabb.minX);
        var supportDepth = Math.max(0.001, otherAabb.maxZ - otherAabb.minZ);
        var centerMarginX = Math.min(stackCenterMarginCm, Math.max(0, supportWidth * 0.2));
        var centerMarginZ = Math.min(stackCenterMarginCm, Math.max(0, supportDepth * 0.2));
        if (probe.x >= otherAabb.minX + centerMarginX &&
            probe.x <= otherAabb.maxX - centerMarginX &&
            probe.z >= otherAabb.minZ + centerMarginZ &&
            probe.z <= otherAabb.maxZ - centerMarginZ) {
          centerInsideSupport = true;
        }
      });

      if (overlapRects.length === 0) return null;

      var overlapArea = getRectanglesUnionArea(overlapRects);
      if (overlapArea <= 0) return null;
      var overlapRatioTarget = overlapArea / targetFootArea;
      if (stackRequireFullBaseSupport) {
        var minFullCoverageRatio = Math.max(0, 1 - stackFullSupportToleranceRatio);
        // Disallow stacking if any relevant part of the footprint would overhang.
        if (overlapRatioTarget < minFullCoverageRatio) return null;
      } else {
        var requiredCoverageRatio = Math.max(stackMinSupportCoverageRatio, stackMinOverlapRatio);
        if (overlapRatioTarget < requiredCoverageRatio) return null;
      }

      var overlapCoverageX = getProjectedCoverageLength(overlapRects, "x");
      var overlapCoverageZ = getProjectedCoverageLength(overlapRects, "z");
      var penetrationXRatio = overlapCoverageX / targetWidth;
      var penetrationZRatio = overlapCoverageZ / targetDepth;

      return {
        overlapRatioTarget: overlapRatioTarget,
        penetrationXRatio: penetrationXRatio,
        penetrationZRatio: penetrationZRatio,
        centerInsideSupport: centerInsideSupport
      };
    }

    function isItemSupportingOthers(baseItem) {
      if (!baseItem || !baseItem.graphicsItem || !baseItem.graphicsItem.position) return false;
      var baseMesh = baseItem.graphicsItem;
      var baseTop = baseMesh.position.y + Math.max(0, toNumber(baseItem.height, 0)) / 2;
      var baseAabb = buildItemAabb(baseItem, baseMesh.position);
      var hasDependentItems = false;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (hasDependentItems) return;
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === baseItem || otherMesh === baseMesh) return;

        var otherBottom = otherMesh.position.y - Math.max(0, toNumber(otherItem.height, 0)) / 2;
        if (Math.abs(otherBottom - baseTop) > supportTopToleranceCm) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var overlapX = getOverlapLength(baseAabb.minX, baseAabb.maxX, otherAabb.minX, otherAabb.maxX);
        var overlapZ = getOverlapLength(baseAabb.minZ, baseAabb.maxZ, otherAabb.minZ, otherAabb.maxZ);
        if (overlapX > 0.5 && overlapZ > 0.5) {
          hasDependentItems = true;
        }
      });

      return hasDependentItems;
    }

    function collectSupportMeshesForCenter(targetItem, center, bounds, supportTop) {
      var supportMeshSet = new Set();
      if (!targetItem || !center || !bounds || !isFinite(supportTop)) return supportMeshSet;
      var targetAabb = buildItemAabb(targetItem, center);

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;

        var otherTop = otherMesh.position.y + Math.max(0, toNumber(otherItem.height, 0)) / 2;
        if (Math.abs(otherTop - supportTop) > supportTopToleranceCm) return;

        var otherAabb = buildItemAabb(otherItem, otherMesh.position);
        var overlapX = getOverlapLength(targetAabb.minX, targetAabb.maxX, otherAabb.minX, otherAabb.maxX);
        var overlapZ = getOverlapLength(targetAabb.minZ, targetAabb.maxZ, otherAabb.minZ, otherAabb.maxZ);
        if (overlapX > 0.5 && overlapZ > 0.5) {
          supportMeshSet.add(otherMesh);
        }
      });

      return supportMeshSet;
    }

    function collectSupportMeshesForTop(targetItem, bounds, supportTop) {
      var supportMeshSet = new Set();
      if (!targetItem || !bounds || !isFinite(supportTop)) return supportMeshSet;

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;

        var otherTop = otherMesh.position.y + Math.max(0, toNumber(otherItem.height, 0)) / 2;
        if (Math.abs(otherTop - supportTop) > supportTopToleranceCm) return;
        supportMeshSet.add(otherMesh);
      });

      return supportMeshSet;
    }

    function areSupportMeshesConnectedForGroup(meshA, meshB) {
      if (!meshA || !meshB || meshA === meshB) return false;
      var itemA = scene.userData.itemMap.get(meshA);
      var itemB = scene.userData.itemMap.get(meshB);
      if (!itemA || !itemB) return false;
      var aabbA = buildItemAabb(itemA, meshA.position);
      var aabbB = buildItemAabb(itemB, meshB.position);
      var overlapX = getOverlapLength(aabbA.minX, aabbA.maxX, aabbB.minX, aabbB.maxX);
      var overlapZ = getOverlapLength(aabbA.minZ, aabbA.maxZ, aabbB.minZ, aabbB.maxZ);
      if (overlapX > 0.5 && overlapZ > 0.5) return true;

      var neighborGapCm = Math.max(0.5, Math.min(2.5, autoJoinDistanceCm));
      var gapX = overlapX > 0 ? 0 : Math.min(Math.abs(aabbA.maxX - aabbB.minX), Math.abs(aabbB.maxX - aabbA.minX));
      var gapZ = overlapZ > 0 ? 0 : Math.min(Math.abs(aabbA.maxZ - aabbB.minZ), Math.abs(aabbB.maxZ - aabbA.minZ));
      var connectedByX = overlapX > 0.5 && gapZ <= neighborGapCm;
      var connectedByZ = overlapZ > 0.5 && gapX <= neighborGapCm;
      return connectedByX || connectedByZ;
    }

    function collectConnectedSupportMeshesFromSeed(targetItem, bounds, supportTop, seedMesh) {
      var connectedSet = new Set();
      if (!seedMesh) return connectedSet;
      var levelMeshes = [];

      scene.userData.itemMap.forEach(function(otherItem, otherMesh) {
        if (!otherItem || !otherMesh || !otherMesh.position) return;
        if (otherItem === targetItem || otherMesh === targetItem.graphicsItem) return;
        if (!isPointInsideBoundsXZ(otherMesh.position, bounds)) return;
        var otherTop = otherMesh.position.y + Math.max(0, toNumber(otherItem.height, 0)) / 2;
        if (Math.abs(otherTop - supportTop) > supportTopToleranceCm) return;
        levelMeshes.push(otherMesh);
      });

      if (levelMeshes.length === 0) return connectedSet;
      if (levelMeshes.indexOf(seedMesh) === -1) {
        levelMeshes.push(seedMesh);
      }

      var queue = [seedMesh];
      connectedSet.add(seedMesh);
      while (queue.length > 0) {
        var current = queue.shift();
        for (var i = 0; i < levelMeshes.length; i++) {
          var candidate = levelMeshes[i];
          if (!candidate || connectedSet.has(candidate)) continue;
          if (!areSupportMeshesConnectedForGroup(current, candidate)) continue;
          connectedSet.add(candidate);
          queue.push(candidate);
        }
      }

      return connectedSet;
    }

    function getSupportCenterEnvelope(targetItem, supportMeshSet) {
      if (!targetItem || !supportMeshSet || supportMeshSet.size === 0) return null;
      var halfWidth = Math.max(0, toNumber(targetItem.width, 0)) / 2;
      var halfDepth = Math.max(0, toNumber(targetItem.depth, 0)) / 2;
      var minCenterX = Infinity;
      var maxCenterX = -Infinity;
      var minCenterZ = Infinity;
      var maxCenterZ = -Infinity;

      supportMeshSet.forEach(function(mesh) {
        if (!mesh || !mesh.position) return;
        var supportItem = scene.userData.itemMap.get(mesh);
        if (!supportItem) return;
        var supportAabb = buildItemAabb(supportItem, mesh.position);
        minCenterX = Math.min(minCenterX, supportAabb.minX + halfWidth);
        maxCenterX = Math.max(maxCenterX, supportAabb.maxX - halfWidth);
        minCenterZ = Math.min(minCenterZ, supportAabb.minZ + halfDepth);
        maxCenterZ = Math.max(maxCenterZ, supportAabb.maxZ - halfDepth);
      });

      if (!isFinite(minCenterX) || !isFinite(maxCenterX) ||
          !isFinite(minCenterZ) || !isFinite(maxCenterZ)) {
        return null;
      }
      if (minCenterX > maxCenterX || minCenterZ > maxCenterZ) return null;

      return {
        minCenterX: minCenterX,
        maxCenterX: maxCenterX,
        minCenterZ: minCenterZ,
        maxCenterZ: maxCenterZ
      };
    }

    function resolveStackingPosition(targetItem, desiredPosition, bounds, forcedSupportTop) {
      // Staging area is a flat parking plane; no stacking there.
      if (bounds === scene.userData.stagingBounds) return null;

      var probe = desiredPosition.clone();
      clampItemCenterToBounds(targetItem, probe, bounds);

      var targetHeight = Math.max(0, toNumber(targetItem.height, 0));
      var supportTopLevels = collectSupportTopLevels(targetItem, bounds);
      if (!supportTopLevels || supportTopLevels.length === 0) return null;
      if (isFinite(forcedSupportTop)) {
        var bestTopMatch = null;
        var bestTopDelta = Infinity;
        for (var topIndex = 0; topIndex < supportTopLevels.length; topIndex++) {
          var topLevel = supportTopLevels[topIndex];
          var topDelta = Math.abs(topLevel - forcedSupportTop);
          if (topDelta < bestTopDelta) {
            bestTopDelta = topDelta;
            bestTopMatch = topLevel;
          }
        }
        if (bestTopMatch === null || bestTopDelta > supportTopToleranceCm) return null;
        supportTopLevels = [bestTopMatch];
      }

      var bestStacked = null;
      var bestSupportTop = -Infinity;
      var bestProbeDistanceSq = Infinity;

      for (var levelIndex = 0; levelIndex < supportTopLevels.length; levelIndex++) {
        var supportTop = supportTopLevels[levelIndex];
        var levelProbes = [probe];
        if (stackRequireFullBaseSupport) {
          var clampedProbe = findNearestSupportClampedProbe(targetItem, probe, bounds, supportTop);
          if (!clampedProbe) {
            // Fallback without strict edge intent so stacking works consistently
            // when approaching the same support from different directions.
            var adaptiveClampDistanceCm = Math.max(
              stackSupportClampDistanceCm,
              Math.max(0, toNumber(targetItem.width, 0)) / 2,
              Math.max(0, toNumber(targetItem.depth, 0)) / 2
            );
            clampedProbe = findNearestSupportClampedProbe(targetItem, probe, bounds, supportTop, {
              requireNearEdge: false,
              maxSnapDistanceCm: adaptiveClampDistanceCm
            });
          }
          if (clampedProbe) {
            var clampedDx = Math.abs(clampedProbe.x - probe.x);
            var clampedDz = Math.abs(clampedProbe.z - probe.z);
            if (clampedDx > 0.001 || clampedDz > 0.001) {
              levelProbes.push(clampedProbe);
            }
          }
        }

        for (var probeIndex = 0; probeIndex < levelProbes.length; probeIndex++) {
          var levelProbe = levelProbes[probeIndex];
          var targetAabb = buildItemAabb(targetItem, levelProbe);
          var supportAnalysis = analyzeCombinedSupportSurface(targetItem, targetAabb, levelProbe, bounds, supportTop);
          if (!supportAnalysis) continue;
          var fullSupportGateRatio = Math.max(0, 1 - stackFullSupportToleranceRatio);
          var nearFullSupport = supportAnalysis.overlapRatioTarget >= fullSupportGateRatio;
          var skipActivationGates = stackRequireFullBaseSupport && nearFullSupport;

          // Use symmetric penetration signal to avoid directional stacking bias.
          var penetrationRatio = Math.max(
            supportAnalysis.penetrationXRatio,
            supportAnalysis.penetrationZRatio
          );
          if (!skipActivationGates &&
              penetrationRatio < stackSlideBoundaryRatio &&
              supportAnalysis.overlapRatioTarget < stackActivationOverlapRatio) {
            continue;
          }

          // Require center intent unless support overlap is already strong.
          if (!skipActivationGates &&
              !supportAnalysis.centerInsideSupport &&
              supportAnalysis.overlapRatioTarget < stackActivationOverlapRatio) {
            continue;
          }

          var stackedCenterY = supportTop + targetHeight / 2;
          var stackedPosition = new THREE.Vector3(levelProbe.x, stackedCenterY, levelProbe.z);

          // Keep inside truck height when stacking in cargo area.
          var stackedTop = stackedCenterY + targetHeight / 2;
          if (bounds === scene.userData.truckBounds && stackedTop > scene.userData.truckBounds.maxY + 0.001) continue;
          if (hasItemCollision(targetItem, stackedPosition)) continue;

          var probeDx = levelProbe.x - probe.x;
          var probeDz = levelProbe.z - probe.z;
          var probeDistanceSq = probeDx * probeDx + probeDz * probeDz;

          if (!bestStacked ||
              probeDistanceSq + 0.001 < bestProbeDistanceSq ||
              (Math.abs(probeDistanceSq - bestProbeDistanceSq) <= 0.001 && supportTop > bestSupportTop)) {
            bestSupportTop = supportTop;
            bestProbeDistanceSq = probeDistanceSq;
            bestStacked = stackedPosition;
          }
        }
      }

      return bestStacked;
    }

    function resolveEdgeLockedSlideOnCurrentSupport(targetItem, desiredPosition, bounds) {
      if (!targetItem || !dragState.lastValidPosition) return null;
      if (bounds === scene.userData.stagingBounds) return null;

      var floorCenterY = getItemCenterYForBounds(targetItem, bounds, dragState.fixedY);
      if (dragState.lastValidPosition.y <= floorCenterY + 0.01) return null;

      var targetHeight = Math.max(0, toNumber(targetItem.height, 0));
      var supportTop = dragState.lastValidPosition.y - targetHeight / 2;
      if (!isFinite(supportTop)) return null;

      var supportMeshSet = collectSupportMeshesForCenter(targetItem, dragState.lastValidPosition, bounds, supportTop);
      if (!supportMeshSet || supportMeshSet.size === 0) return null;
      var supportEnvelope = getSupportCenterEnvelope(targetItem, supportMeshSet);
      if (!supportEnvelope) return null;

      var probe = desiredPosition.clone();
      clampItemCenterToBounds(targetItem, probe, bounds);
      var edgeLockMaxGapCm = Math.max(stackSupportClampDistanceCm, stackSupportClampMinAxisOverlapCm);
      var gapToRangeX = probe.x < supportEnvelope.minCenterX ? (supportEnvelope.minCenterX - probe.x) :
                        (probe.x > supportEnvelope.maxCenterX ? probe.x - supportEnvelope.maxCenterX : 0);
      var gapToRangeZ = probe.z < supportEnvelope.minCenterZ ? (supportEnvelope.minCenterZ - probe.z) :
                        (probe.z > supportEnvelope.maxCenterZ ? probe.z - supportEnvelope.maxCenterZ : 0);
      var gapDistanceSq = gapToRangeX * gapToRangeX + gapToRangeZ * gapToRangeZ;
      // Keep edge-lock only while pointer remains reasonably close to current support.
      if (gapDistanceSq > edgeLockMaxGapCm * edgeLockMaxGapCm + 0.001) {
        return null;
      }

      var envelopeProbe = new THREE.Vector3(
        clamp(probe.x, supportEnvelope.minCenterX, supportEnvelope.maxCenterX),
        probe.y,
        clamp(probe.z, supportEnvelope.minCenterZ, supportEnvelope.maxCenterZ)
      );
      var activeProbe = envelopeProbe;

      var supportAnalysis = analyzeCombinedSupportSurface(
        targetItem,
        buildItemAabb(targetItem, activeProbe),
        activeProbe,
        bounds,
        supportTop,
        supportMeshSet
      );

      if (!supportAnalysis) {
        activeProbe = findNearestSupportClampedProbe(targetItem, probe, bounds, supportTop, {
        supportMeshSet: supportMeshSet,
        requireNearEdge: false,
        edgeThresholdCm: edgeLockMaxGapCm,
        unlimitedDistance: true
      });
        if (!activeProbe) return null;
        supportAnalysis = analyzeCombinedSupportSurface(
          targetItem,
          buildItemAabb(targetItem, activeProbe),
          activeProbe,
          bounds,
          supportTop,
          supportMeshSet
        );
        if (!supportAnalysis) return null;
      }

      var stackedCenterY = supportTop + targetHeight / 2;
      var stackedPosition = new THREE.Vector3(activeProbe.x, stackedCenterY, activeProbe.z);
      var stackedTop = stackedCenterY + targetHeight / 2;
      if (bounds === scene.userData.truckBounds && stackedTop > scene.userData.truckBounds.maxY + 0.001) return null;
      if (hasItemCollision(targetItem, stackedPosition)) return null;

      return stackedPosition;
    }

    function resolveHoverFitPosition(targetItem, bounds) {
      if (!targetItem || !targetItem.graphicsItem) return null;
      if (bounds === scene.userData.stagingBounds) return null;

      var hoveredSupport = getHoveredSupportHit(targetItem);
      if (!hoveredSupport || !hoveredSupport.item || !hoveredSupport.mesh || !hoveredSupport.point) return null;
      if (!isPointInsideBoundsXZ(hoveredSupport.mesh.position, bounds)) return null;

      var supportTop = hoveredSupport.mesh.position.y + Math.max(0, toNumber(hoveredSupport.item.height, 0)) / 2;
      var targetHeight = Math.max(0, toNumber(targetItem.height, 0));
      var pointerProbe = new THREE.Vector3(
        hoveredSupport.point.x,
        targetItem.graphicsItem.position.y,
        hoveredSupport.point.z
      );
      clampItemCenterToBounds(targetItem, pointerProbe, bounds);

      var supportMeshSet = collectConnectedSupportMeshesFromSeed(
        targetItem, bounds, supportTop, hoveredSupport.mesh
      );
      if (!supportMeshSet || supportMeshSet.size === 0) {
        supportMeshSet = new Set([hoveredSupport.mesh]);
      }
      if (!supportMeshSet || supportMeshSet.size === 0) return null;

      var probeCandidates = [];
      var supportEnvelope = getSupportCenterEnvelope(targetItem, supportMeshSet);
      if (supportEnvelope) {
        probeCandidates.push(new THREE.Vector3(
          clamp(pointerProbe.x, supportEnvelope.minCenterX, supportEnvelope.maxCenterX),
          pointerProbe.y,
          clamp(pointerProbe.z, supportEnvelope.minCenterZ, supportEnvelope.maxCenterZ)
        ));
      }

      var clampedProbe = findNearestSupportClampedProbe(targetItem, pointerProbe, bounds, supportTop, {
        supportMeshSet: supportMeshSet,
        requireNearEdge: false
      });
      if (clampedProbe) {
        probeCandidates.push(clampedProbe);
      }
      if (probeCandidates.length === 0) return null;

      var bestFittedPosition = null;
      var bestProbeDistanceSq = Infinity;
      for (var candidateIndex = 0; candidateIndex < probeCandidates.length; candidateIndex++) {
        var candidateProbe = probeCandidates[candidateIndex];
        if (!candidateProbe) continue;
        var targetAabb = buildItemAabb(targetItem, candidateProbe);
        var supportAnalysis = analyzeCombinedSupportSurface(
          targetItem, targetAabb, candidateProbe, bounds, supportTop, supportMeshSet
        );
        if (!supportAnalysis) continue;

        var fittedCenterY = supportTop + targetHeight / 2;
        var fittedPosition = new THREE.Vector3(candidateProbe.x, fittedCenterY, candidateProbe.z);
        var fittedTop = fittedCenterY + targetHeight / 2;
        if (bounds === scene.userData.truckBounds && fittedTop > scene.userData.truckBounds.maxY + 0.001) continue;
        if (hasItemCollision(targetItem, fittedPosition)) continue;

        var probeDx = candidateProbe.x - pointerProbe.x;
        var probeDz = candidateProbe.z - pointerProbe.z;
        var probeDistanceSq = probeDx * probeDx + probeDz * probeDz;
        if (!bestFittedPosition || probeDistanceSq < bestProbeDistanceSq) {
          bestProbeDistanceSq = probeDistanceSq;
          bestFittedPosition = fittedPosition;
        }
      }

      return bestFittedPosition;
    }

    function resolveValidDragPosition(targetItem, basePosition, withAutoJoin, bounds) {
      var resolved = basePosition.clone();
      clampItemCenterToBounds(targetItem, resolved, bounds);
      if (withAutoJoin) {
        resolved = applyAutoJoinSnap(targetItem, resolved);
        clampItemCenterToBounds(targetItem, resolved, bounds);
      }
      if (hasItemCollision(targetItem, resolved)) return null;
      return resolved;
    }

    function pickClosestPosition(targetPosition, candidates) {
      var best = null;
      var bestDistance = Infinity;
      for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        if (!candidate) continue;
        var dx = candidate.x - targetPosition.x;
        var dz = candidate.z - targetPosition.z;
        var dist = dx * dx + dz * dz;
        if (dist < bestDistance) {
          bestDistance = dist;
          best = candidate;
        }
      }
      return best;
    }

    function resolveSlidingPosition(targetItem, candidatePosition, bounds) {
      var lastPosition = dragState.lastValidPosition;
      var baseAlongX = new THREE.Vector3(candidatePosition.x, candidatePosition.y, lastPosition.z);
      var baseAlongZ = new THREE.Vector3(lastPosition.x, candidatePosition.y, candidatePosition.z);

      var slideCandidates = [
        resolveValidDragPosition(targetItem, baseAlongX, true, bounds),
        resolveValidDragPosition(targetItem, baseAlongX, false, bounds),
        resolveValidDragPosition(targetItem, baseAlongZ, true, bounds),
        resolveValidDragPosition(targetItem, baseAlongZ, false, bounds)
      ];
      return pickClosestPosition(candidatePosition, slideCandidates);
    }

    function buildRotationProbeCenters(center, prevWidth, prevDepth, nextWidth, nextDepth) {
      var epsilon = 0.001;
      var prevHalfWidth = Math.max(0, prevWidth) / 2;
      var prevHalfDepth = Math.max(0, prevDepth) / 2;
      var nextHalfWidth = Math.max(0, nextWidth) / 2;
      var nextHalfDepth = Math.max(0, nextDepth) / 2;

      var oldLeft = center.x - prevHalfWidth;
      var oldRight = center.x + prevHalfWidth;
      var oldBack = center.z - prevHalfDepth;
      var oldFront = center.z + prevHalfDepth;

      var probeXs = [center.x, oldLeft + nextHalfWidth, oldRight - nextHalfWidth];
      var probeZs = [center.z, oldBack + nextHalfDepth, oldFront - nextHalfDepth];
      var probes = [];

      function pushProbe(x, z) {
        for (var i = 0; i < probes.length; i++) {
          if (Math.abs(probes[i].x - x) <= epsilon && Math.abs(probes[i].z - z) <= epsilon) {
            return;
          }
        }
        probes.push(new THREE.Vector3(x, center.y, z));
      }

      for (var px = 0; px < probeXs.length; px++) {
        for (var pz = 0; pz < probeZs.length; pz++) {
          pushProbe(probeXs[px], probeZs[pz]);
        }
      }

      return probes;
    }

    function rotateItemHorizontally(item) {
      if (!item || !item.graphicsItem) return;
      if (isItemSupportingOthers(item)) return;

      var mesh = item.graphicsItem;
      var prevRotationY = mesh.rotation.y;
      var prevPosition = mesh.position.clone();
      var prevWidth = toNumber(item.width, 0);
      var prevDepth = toNumber(item.depth, 0);

      mesh.rotation.y += Math.PI / 2;
      item.width = prevDepth;
      item.depth = prevWidth;

      var itemBounds = getActiveBounds(mesh.position);
      var probeCenters = buildRotationProbeCenters(prevPosition, prevWidth, prevDepth, item.width, item.depth);
      var rotationCandidates = [];

      for (var i = 0; i < probeCenters.length; i++) {
        var candidateWithoutJoin = resolveValidDragPosition(item, probeCenters[i], false, itemBounds);
        if (candidateWithoutJoin) {
          rotationCandidates.push(candidateWithoutJoin);
        }
        var candidateWithJoin = resolveValidDragPosition(item, probeCenters[i], true, itemBounds);
        if (candidateWithJoin) {
          rotationCandidates.push(candidateWithJoin);
        }
      }

      var bestPosition = pickClosestPosition(prevPosition, rotationCandidates);
      if (!bestPosition) {
        mesh.rotation.y = prevRotationY;
        mesh.position.copy(prevPosition);
        item.width = prevWidth;
        item.depth = prevDepth;
        return;
      }

      mesh.position.copy(bestPosition);
      syncItemDimensions(item);
      syncItemPosition(item, mesh.position);
      itemTransformed(item);
    }

    function beginItemDrag(clientX, clientY) {
      if (!itemDragEnabled || !isEditEnabled()) return false;
      if (mobilePanHold.active) return false;
      var hit = pickHit(clientX, clientY);
      if (!hit) return false;

      var draggedMesh = hit.itemObject || hit.object;
      var draggedItem = hit.item || scene.userData.itemMap.get(draggedMesh);
      if (!draggedItem) return false;
      var blockedBySupport = isItemSupportingOthers(draggedItem);
      if (typeof removeTooltip === 'function') {
        removeTooltip();
      }

      dragState.active = true;
      dragState.blocked = blockedBySupport;
      scene.userData.isDragging = true;
      dragState.moved = false;
      dragState.startX = clientX;
      dragState.startY = clientY;
      dragState.fixedY = draggedMesh.position.y;
      dragState.mesh = draggedMesh;
      dragState.item = draggedItem;
      dragState.lastValidPosition.copy(draggedMesh.position);

      if (blockedBySupport) {
        if (typeof highlightItem === 'function') {
          highlightItem(draggedItem, "#F00");
        }
        dragOffset.set(0, 0, 0);
      } else {
        dragPlane.set(new THREE.Vector3(0, 1, 0), -dragState.fixedY);
        if (dragCenterLockToPointer) {
          dragOffset.set(0, 0, 0);
        } else if (raycaster.ray.intersectPlane(dragPlane, dragHitPoint)) {
          dragOffset.copy(draggedMesh.position).sub(dragHitPoint);
        } else {
          dragOffset.set(0, 0, 0);
        }
      }

      if (scene.userData.controls) {
        scene.userData.controls.enabled = false;
      }
      return true;
    }

    function moveItemDrag(clientX, clientY) {
      if (!dragState.active || !dragState.mesh || !dragState.item) return;

      if (dragState.blocked) {
        dragState.mesh.position.copy(dragState.lastValidPosition);
        if (Math.abs(clientX - dragState.startX) > 3 || Math.abs(clientY - dragState.startY) > 3) {
          dragState.moved = true;
        }
        if (window.pwLastPointer) {
          window.pwLastPointer.x = clientX;
          window.pwLastPointer.y = clientY;
        }
        return;
      }

      setPointerCoords(clientX, clientY);
      var hasPlaneHit = !!raycaster.ray.intersectPlane(dragPlane, dragHitPoint);
      var activeBounds = hasPlaneHit ? getActiveBounds(dragHitPoint) : getActiveBounds(dragState.lastValidPosition);
      var hoverFittedPosition = resolveHoverFitPosition(dragState.item, activeBounds);

      var floorCenterY = getItemCenterYForBounds(dragState.item, activeBounds, dragState.fixedY);
      var isCurrentlyStacked = dragState.lastValidPosition.y > floorCenterY + 0.01;
      var candidateHitPoint = hasPlaneHit ? dragHitPoint.clone() : null;
      if (isCurrentlyStacked && !hoverFittedPosition) {
        var floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorCenterY);
        var floorHitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, floorHitPoint)) {
          candidateHitPoint = floorHitPoint;
          activeBounds = getActiveBounds(candidateHitPoint);
          floorCenterY = getItemCenterYForBounds(dragState.item, activeBounds, dragState.fixedY);
          isCurrentlyStacked = dragState.lastValidPosition.y > floorCenterY + 0.01;
        }
      }

      if (!candidateHitPoint && !hoverFittedPosition) return;

      var nextX = candidateHitPoint ? candidateHitPoint.x + dragOffset.x : dragState.lastValidPosition.x;
      var nextZ = candidateHitPoint ? candidateHitPoint.z + dragOffset.z : dragState.lastValidPosition.z;
      var centerY = floorCenterY;
      var candidatePosition = new THREE.Vector3(nextX, centerY, nextZ);
      var floorResolvedPosition = resolveValidDragPosition(dragState.item, candidatePosition, true, activeBounds) ||
                                  resolveValidDragPosition(dragState.item, candidatePosition, false, activeBounds) ||
                                  resolveSlidingPosition(dragState.item, candidatePosition, activeBounds);
      var resolvedPosition = isCurrentlyStacked ?
                             (floorResolvedPosition ||
                              hoverFittedPosition ||
                              resolveEdgeLockedSlideOnCurrentSupport(dragState.item, candidatePosition, activeBounds)) :
                             (hoverFittedPosition ||
                              floorResolvedPosition ||
                              resolveStackingPosition(dragState.item, candidatePosition, activeBounds));

      if (resolvedPosition) {
        dragState.mesh.position.copy(resolvedPosition);
        dragState.lastValidPosition.copy(resolvedPosition);
        syncItemPosition(dragState.item, dragState.mesh.position);
        itemTransformed(dragState.item);
      } else {
        dragState.mesh.position.copy(dragState.lastValidPosition);
      }

      if (Math.abs(clientX - dragState.startX) > 3 || Math.abs(clientY - dragState.startY) > 3) {
        dragState.moved = true;
      }
      if (window.pwLastPointer) {
        window.pwLastPointer.x = clientX;
        window.pwLastPointer.y = clientY;
      }
    }

    function endItemDrag(triggerTapSelection) {
      if (!dragState.active) return;
      var draggedItem = dragState.item;
      var draggedMoved = dragState.moved;
      var blockedDrag = dragState.blocked;

      if (scene.userData.controls) {
        scene.userData.controls.enabled = true;
      }
      if (draggedMoved) {
        suppressClickUntil = Date.now() + 250;
      }

      dragState.active = false;
      dragState.blocked = false;
      scene.userData.isDragging = false;
      dragState.pointerId = null;
      dragState.mesh = null;
      dragState.item = null;

      if (blockedDrag && draggedItem) {
        if (typeof itemOut === 'function') {
          itemOut(draggedItem);
        } else if (typeof unhighlightItem === 'function') {
          unhighlightItem(draggedItem);
        }
      }

      if (triggerTapSelection && !draggedMoved && draggedItem) {
        lastTouchTime = Date.now();
        itemClicked(draggedItem);
      }
    }

    function registerTouchPointer(pointerId) {
      if (pointerId === undefined || pointerId === null) return;
      activeTouchPointers[String(pointerId)] = true;
    }

    function unregisterTouchPointer(pointerId) {
      if (pointerId === undefined || pointerId === null) return;
      delete activeTouchPointers[String(pointerId)];
    }

    function getActiveTouchPointerCount() {
      var count = 0;
      for (var key in activeTouchPointers) {
        if (Object.prototype.hasOwnProperty.call(activeTouchPointers, key) && activeTouchPointers[key]) {
          count += 1;
        }
      }
      return count;
    }

    function cancelDragForPinchGesture() {
      if (!dragState.active) return;
      if (scene.userData.element.releasePointerCapture && dragState.pointerId !== null) {
        try { scene.userData.element.releasePointerCapture(dragState.pointerId); } catch (err) {}
      }
      endItemDrag(false);
      suppressClickUntil = Date.now() + 260;
    }
    scene.userData.forceEndDrag = function() {
      endItemDrag(false);
    };

    var onMobilePanHoldTouchStart = function(e) {
      if (!handleMobilePanHoldStart(e)) return;
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      } else {
        e.stopPropagation();
      }
    };

    var onMobilePanHoldTouchMove = function(e) {
      if (!mobilePanHold.active) return;
      var activeTouch = getTouchByIdentifier(e.touches, mobilePanHold.touchId);
      if (!activeTouch) return;

      var deltaX = activeTouch.clientX - mobilePanHold.lastX;
      var deltaY = activeTouch.clientY - mobilePanHold.lastY;
      mobilePanHold.lastX = activeTouch.clientX;
      mobilePanHold.lastY = activeTouch.clientY;

      if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
        mobilePanHold.moved = true;
      }
      panCameraTargetBy(deltaX, deltaY);

      if (window.pwLastPointer) {
        window.pwLastPointer.x = activeTouch.clientX;
        window.pwLastPointer.y = activeTouch.clientY;
      }
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      } else {
        e.stopPropagation();
      }
    };

    var onMobilePanHoldTouchEnd = function(e) {
      if (!mobilePanHold.active) return;
      var stillPresent = getTouchByIdentifier(e.touches, mobilePanHold.touchId);
      if (stillPresent) return;
      endMobilePanHold();
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      } else {
        e.stopPropagation();
      }
    };

    listen(scene.userData.element, 'touchstart', onMobilePanHoldTouchStart, { passive: false });
    listen(scene.userData.element, 'touchmove', onMobilePanHoldTouchMove, { passive: false });
    listen(scene.userData.element, 'touchend', onMobilePanHoldTouchEnd, { passive: false });
    listen(scene.userData.element, 'touchcancel', onMobilePanHoldTouchEnd, { passive: false });

    for (var i = 0; i < graphicsItems.length; i++) {
      domEvents.bind(graphicsItems[i], 'click', function(item) {
          if (dragState.active || Date.now() < suppressClickUntil) return;
          if (Date.now() - lastTouchTime < 500) return;
          itemClicked(scene.userData.itemMap.get(item.target));}, false);

      domEvents.bind(graphicsItems[i], 'mouseover', function(item) {
          if (dragState.active) return;
          itemOver(scene.userData.itemMap.get(item.target));}, false);

    itemOut = this.onItemOut;
      domEvents.bind(graphicsItems[i], 'mouseout', function(item) {
          if (dragState.active) return;
          itemOut(scene.userData.itemMap.get(item.target));}, false);
    }

    var supportsPointerEvents = typeof window !== 'undefined' && !!window.PointerEvent;
    if (supportsPointerEvents) {
      listen(scene.userData.element, 'pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.pointerType === 'touch') {
          registerTouchPointer(e.pointerId);
          if (getActiveTouchPointerCount() >= 2) {
            cancelDragForPinchGesture();
            return;
          }
        }
        if (dragState.active) return;
        if (beginItemDrag(e.clientX, e.clientY)) {
          dragState.pointerId = e.pointerId;
          if (scene.userData.element.setPointerCapture) {
            try { scene.userData.element.setPointerCapture(e.pointerId); } catch (err) {}
          }
          e.preventDefault();
        }
      }, false);

      listen(scene.userData.element, 'pointermove', function(e) {
        if (e.pointerType === 'touch' && getActiveTouchPointerCount() >= 2) {
          cancelDragForPinchGesture();
          return;
        }
        if (!dragState.active || dragState.pointerId !== e.pointerId) return;
        moveItemDrag(e.clientX, e.clientY);
        e.preventDefault();
      }, false);

      var endPointerDrag = function(e) {
        if (e.pointerType === 'touch') {
          unregisterTouchPointer(e.pointerId);
        }
        if (!dragState.active || dragState.pointerId !== e.pointerId) return;
        if (window.pwLastPointer) {
          window.pwLastPointer.x = e.clientX;
          window.pwLastPointer.y = e.clientY;
        }
        var tapSelect = e.pointerType === 'touch';
        if (scene.userData.element.releasePointerCapture) {
          try { scene.userData.element.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        endItemDrag(tapSelect);
        e.preventDefault();
      };
      listen(scene.userData.element, 'pointerup', endPointerDrag, false);
      listen(scene.userData.element, 'pointercancel', endPointerDrag, false);
    } else {
      listen(scene.userData.element, 'mousedown', function(e) {
        if (e.button !== 0) return;
        if (dragState.active) return;
        if (beginItemDrag(e.clientX, e.clientY)) {
          dragState.pointerId = 'mouse';
          e.preventDefault();
        }
      }, false);

      listen(window, 'mousemove', function(e) {
        if (!dragState.active || dragState.pointerId !== 'mouse') return;
        moveItemDrag(e.clientX, e.clientY);
      }, false);

      listen(window, 'mouseup', function() {
        if (!dragState.active || dragState.pointerId !== 'mouse') return;
        endItemDrag(false);
      }, false);

      listen(scene.userData.element, 'touchstart', function(e) {
        if (e.touches && e.touches.length > 1) {
          cancelDragForPinchGesture();
          return;
        }
        if (!e.touches || e.touches.length !== 1) return;
        if (dragState.active) return;
        var touch = e.touches[0];
        if (beginItemDrag(touch.clientX, touch.clientY)) {
          dragState.pointerId = 'touch';
          e.preventDefault();
        }
      }, { passive: false });

      listen(scene.userData.element, 'touchmove', function(e) {
        if (e.touches && e.touches.length > 1) {
          cancelDragForPinchGesture();
          return;
        }
        if (!dragState.active || dragState.pointerId !== 'touch') return;
        if (!e.touches || e.touches.length === 0) return;
        var touch = e.touches[0];
        moveItemDrag(touch.clientX, touch.clientY);
        e.preventDefault();
      }, { passive: false });

      var endTouchDrag = function(e) {
        if (!dragState.active || dragState.pointerId !== 'touch') return;
        var touch = e && e.changedTouches && e.changedTouches[0];
        if (touch && window.pwLastPointer) {
          window.pwLastPointer.x = touch.clientX;
          window.pwLastPointer.y = touch.clientY;
        }
        endItemDrag(true);
      };
      listen(scene.userData.element, 'touchend', endTouchDrag, false);
      listen(scene.userData.element, 'touchcancel', endTouchDrag, false);
    }

    listen(scene.userData.element, 'dblclick', function(e) {
      if (dragState.active) return;
      if (!isEditEnabled()) return;
      var hit = pickHit(e.clientX, e.clientY);
      if (!hit) return;
      var item = hit.item || null;
      if (!item) return;
      rotateItemHorizontally(item);
      suppressClickUntil = Date.now() + 250;
      if (window.pwLastPointer) {
        window.pwLastPointer.x = e.clientX;
        window.pwLastPointer.y = e.clientY;
      }
      e.preventDefault();
    }, false);

    listen(scene.userData.element, 'touchstart', function(e) {
      if (dragState.active || Date.now() < suppressClickUntil) return;
      if (mobilePanHold.active) return;
      if (!e.touches || e.touches.length !== 1) return;
      lastTouchTime = Date.now();
      var touch = e.touches[0];
      if (window.pwLastPointer) {
        window.pwLastPointer.x = touch.clientX;
        window.pwLastPointer.y = touch.clientY;
      }
      var hit = pickItem(touch.clientX, touch.clientY);
      if (hit) {
        itemClicked(hit);
      } else {
        itemClicked(null);
        if (typeof removeTooltip === 'function') {
          removeTooltip();
        }
      }
    }, { passive: true });

    listen(scene.userData.element, 'click', function(e) {
      if (dragState.active || Date.now() < suppressClickUntil) return;
      if (Date.now() - lastTouchTime < 500) return;
      var hit = pickItem(e.clientX, e.clientY);
      if (!hit) {
        itemClicked(null);
        if (typeof removeTooltip === 'function') {
          removeTooltip();
        }
      }
    }, false);


  scene.userData.controls = new THREE.OrbitControls(scene.userData.camera, scene.userData.element);
  scene.userData.controls.target = this.options.cameraTarget;
  var sceneBounds = totalSize(this.bins);
  var maxSpan = Math.max(sceneBounds.x, sceneBounds.y, sceneBounds.z);
  scene.userData.controls.minDistance = Math.max(maxSpan * 0.5, 10);
  scene.userData.controls.maxDistance = Math.max(maxSpan * 6, 100);

	var angle;
  // if options.rotateY = true, look from a 45 degree angle
  if (this.options.rotateY === true) {
      angle = Math.PI/4;
      scene.userData.controls.minAzimuthAngle = angle;
      scene.userData.controls.maxAzimuthAngle = angle;
      scene.userData.controls.update();
      
      scene.userData.controls.minAzimuthAngle = -Infinity;
      scene.userData.controls.maxAzimuthAngle = Infinity;
      scene.userData.controls.update();
  }
  
  // camera looks down from a 45 degree angle
  angle = Math.PI/3;
  scene.userData.controls.minPolarAngle = angle;
  scene.userData.controls.maxPolarAngle = angle;
  scene.userData.controls.update();
  scene.userData.controls.minPolarAngle = -Math.PI;
  scene.userData.controls.maxPolarAngle = Math.PI;

  // lock Rotation if options is set
  if(this.options.verticalRotation === false) {
    scene.userData.controls.maxAzimuthAngle = scene.userData.controls.getAzimuthAngle();
    scene.userData.controls.minAzimuthAngle = scene.userData.controls.getAzimuthAngle();
  }
  if(this.options.horizontalRotation === false) {
    scene.userData.controls.maxPolarAngle = scene.userData.controls.getPolarAngle();
    scene.userData.controls.minPolarAngle = scene.userData.controls.getPolarAngle();
  }


  listen(scene.userData.element, 'mousemove', onDocumentMouseMove, false);
  listen(window, 'resize', refreshRect, false);
  listen(window, 'orientationchange', refreshRect, false);

  function onDocumentMouseMove (event) {
    event.preventDefault();
    refreshRect();
    mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
			mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  // if it's the first widget create the renderer, if not just add it to the widgets
  if(!this.widgetRenderer)
      PackWidget.prototype.widgetRenderer = new PackWidgetRenderer();
  this.widgetRenderer.widgets.push(this);
};

/**
 * RCVA: releases everything create() set up. Safe to call more than once.
 */
PackWidget.prototype.destroy = function () {
  var listeners = this._listeners || [];
  for (var i = 0; i < listeners.length; i++) {
    listeners[i][0].removeEventListener(listeners[i][1], listeners[i][2], listeners[i][3]);
  }
  this._listeners = [];
  if (this._domEvents) {
    this._domEvents.destroy();
    this._domEvents = null;
  }
  var scene = this.scene;
  if (scene) {
    if (scene.userData.controls) scene.userData.controls.dispose();
    scene.traverse(function (object) {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        var materials = object.material.materials || [object.material];
        for (var m = 0; m < materials.length; m++) materials[m].dispose();
      }
    });
    scene.userData = {};
    this.scene = null;
  }
  this.itemMap.clear();
  var shared = PackWidget.prototype.widgetRenderer;
  if (shared) {
    var index = shared.widgets.indexOf(this);
    if (index >= 0) shared.widgets.splice(index, 1);
    if (shared.widgets.length === 0) {
      shared.dispose();
      PackWidget.prototype.widgetRenderer = null;
    }
  }
};

/**
 * Renderer for the Packwidgets
 */
function PackWidgetRenderer() {
    var visualizerBackgroundColor = PackWidget.rendererBackgroundColor !== undefined ? PackWidget.rendererBackgroundColor : 0xfff2e0; // RCVA
    var canvas = document.createElement("canvas");
    canvas.style.position = 'fixed';
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = -1;
    document.body.appendChild(canvas);

    var widgets = [];
    this.widgets = widgets;
    var renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});
    renderer.setClearColor(visualizerBackgroundColor, 1);
    renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer = renderer; // RCVA: renderer.info for leak checks
    var frameId = null; // RCVA


	// update size of the canvas element in case it was resized
    function updateSize() {
        var width = canvas.clientWidth;
        var height = canvas.clientHeight;
        if(canvas.width !== width || canvas.height !== height) {
            renderer.setSize(width, height, false);
        }
    }
    
    var animate = function() {

        render();
        
        frameId = requestAnimationFrame(animate); // RCVA: kept for dispose()
    };

    this.animate = animate;

    // RCVA: stop the loop, release the WebGL context and remove the canvas.
    this.dispose = function () {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        renderer.dispose();
        renderer.forceContextLoss();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

		// render canvas
    function render() {
        updateSize();
        renderer.setClearColor(visualizerBackgroundColor);
        renderer.enableScissorTest(false);
        renderer.clear();

        renderer.setClearColor(visualizerBackgroundColor);
        renderer.enableScissorTest(true);

        widgets.forEach(function(widget) {

            // get viewport
            var element = widget.scene.userData.element;
            var rect = element.getBoundingClientRect();

            var width = rect.right - rect.left;
            var height = rect.bottom - rect.top;
            var left = rect.left;
            var bottom = renderer.domElement.clientHeight - rect.bottom;
            if (width <= 0 || height <= 0) {
                return;
            }

            // check if it's offscreen. If so skip it
            if ( rect.bottom < 0 || rect.top  > renderer.domElement.clientHeight ||
                 rect.right  < 0 || rect.left > renderer.domElement.clientWidth ) {
                    return;
						}
	                
            renderer.setViewport(left, bottom, width, height);
            renderer.setScissor(left, bottom, width, height);
            
            widget.scene.userData.camera.aspect = width / height;
            widget.scene.userData.camera.updateProjectionMatrix();
	    
            widget.scene.userData.controls.update();
            widget.scene.userData.lights[0].position.set(widget.scene.userData.camera.position.x -
                                                         widget.scene.userData.controls.target.x,
                                                         widget.scene.userData.camera.position.y -
                                                         widget.scene.userData.controls.target.y,
                                                         widget.scene.userData.camera.position.z -
                                                         widget.scene.userData.controls.target.z);

	    
            renderer.render(widget.scene, widget.scene.userData.camera);
        });

    };
    animate();
}
