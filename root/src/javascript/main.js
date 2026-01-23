const GEOAPIFY_API_KEY = '08450434409749f7910860bb29eb30bc'; // Replace with your actual API key
const DEFAULT_CENTER = [38.66989089069272, -122.00919731791129]; // (lat, lng for Leaflet)
const DEFAULT_ZOOM = 10;

// Color palette for isoline polygons
const COLORS = [
    '#FF6B6B', // Coral Red
    '#4ECDC4', // Medium Turquoise
    '#FFD93D', // Goldenrod
    '#1A535C', // Dark Cyan
    '#FF9F1C', // Bright Orange
    '#6A4C93', // Muted Purple
    '#1982C4', // Vibrant Blue
    '#8AC926', // Bright Lime Green
    '#FF595E', // Warm Red
    '#9B5DE5'  // Soft Violet
];

// Global variables
let map;
let currentColorIndex = 0;
let markerCounter = 0;
let clickedCoordinates = null;
let markers = [];
let isolineLayers = [];
let visibleLayers = [];
const splitByCommaNotInParentheses = (input) => {
    const regex = /,(?![^()]*\))/g;
    return input.split(regex);
};

L.LayerGroup.include({
    customGetLayer: function (id) {
        for (var i in this._layers) {
            if (this._layers[i].id == id) {
               return this._layers[i];
            }
        }
    }
});

async function fetchGTFS(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch GTFS zip: ${url}`);
    return await response.arrayBuffer();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for all async layers to load before initializing map
    
    const yolobusBuffer = await fetchGTFS("/gtfs/yolobus_gtfs.zip");
    const unitransBuffer = await fetchGTFS("/gtfs/unitrans_gtfs.zip");
    
    // const stopDict = initializeStopList();
    const [
        // borders, yolobusStops, unitransStops, routes, calEnviroScreen, yoloPOIs, sacPOIs
        // borders, yolobusStops, unitransStops, routes, yoloPOIs, sacPOIs
        borders, yolobus, unitrans, yoloPOIs, sacPOIs
    ] = await Promise.all([
        addBoundaries(),
        addTransitData(yolobusBuffer),
        addTransitData(unitransBuffer),
        // addBusStops('../../gtfs/Yolobus GTFS/stops.txt', stopDict.yolobusStops, '../../assets/images/yolobus-bus-stop.png'),
        // addBusStops('../../gtfs/Unitrans GTFS/stops.txt', stopDict.unitransStops, '../../assets/images/unitrans-bus-stop.png'),
        // addRoutes(),
        // addCalEnviroScreen(),
        addYoloPOIs(),
        addSacPOIs()
    ]);

    // initializeMap(borders, yolobusStops, unitransStops, routes, calEnviroScreen, yoloPOIs, sacPOIs);
    // initializeMap(borders, yolobus, yolobusStops, unitransStops, routes, yoloPOIs, sacPOIs);
    initializeMap(borders, yolobus, unitrans, yoloPOIs, sacPOIs);
    // document.getElementById("loader").remove();
    document.getElementById("loader").style.display = 'none';
    setupEventListeners();
});

// function initializeMap(borders, yolobusStops, unitransStops, routes, calEnviroScreen, yoloPOIs, sacPOIs) {
function initializeMap(borders, yolobus, unitrans, yoloPOIs, sacPOIs) {
    // Initialize Leaflet map
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Add Geoapify tile layer with smart retina detection
    const isRetina = L.Browser.retina;
    const baseUrl = `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`;
    const retinaUrl = `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}@2x.png?apiKey=${GEOAPIFY_API_KEY}`;

    var geoapify = L.tileLayer(isRetina ? retinaUrl : baseUrl, {
        attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> contributors',
        maxZoom: 20,
        tileSize: 256,
        zoomOffset: 0,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 2
    }).addTo(map);

    // Add scale to map
    L.control.scale({
        maxWidth: 200,
        metric: true,
        imperial: true,
        position: 'bottomright'
    }).addTo(map);

    // Add legend to map
    var legend = L.control({ position: "bottomleft" });
    legend.onAdd = function(map) {
        var div = L.DomUtil.create("div", "legend");
        div.innerHTML += "<h4>Yolobus Routes</h4>";
        div.innerHTML += '<i style="background: purple;"></i><span>West Sacramento Local</span><br>';
        div.innerHTML += '<i style="background: orange;"></i><span>Woodland Local</span><br>';
        div.innerHTML += '<i style="background: green; width: 9px; margin: 0;"></i><i style="background: black; width: 9px;"></i><span>Intercity</span><br>';
        div.innerHTML += '<i style="background: red;"></i><span>Davis Express</span><br>';
        div.innerHTML += '<i style="background: orange;"></i><span>Woodland Express</span><br>';
        // div.innerHTML += '<i style="background: rgba(173,216,230,0.5); opacity: 0.3; border: 3px solid rgba(173,216,230,1); box-sizing: border-box;"></i><span>Yolobus Service Area</span><br>';
        // div.innerHTML += '<i class="icon" style="background-image: url(https://d30y9cdsu7xlg0.cloudfront.net/png/194515-200.png); background-repeat: no-repeat;"></i><span>Yolobus Service Area</span><br>';
        return div;
    };
    legend.addTo(map);

    // Add fullscreen button to map
    map.addControl(new L.Control.FullScreen());

    // json object for layer control basemap
    var baseMap = {
        "Geoapify Base Map": geoapify
    };

    
    var overlaysTree = {
        label: "Layers",
        selectAllCheckbox: "Un/select all",
        children: [
            {
                label: "Borders",
                selectAllCheckbox: "Un/select all",
                children: [
                    { label: "Yolobus Service Area", layer: borders.customGetLayer('yolobusServiceArea') },
                    { label: "Yolo County Border", layer: borders.customGetLayer('yoloCountyBoundary') }
                ]
            }, {
                label: "Stops",
                    selectAllCheckbox: "Un/select all",
                    children: [
                        // { label: "Yolobus", layer: yolobusStops },
                        // { label: "Unitrans", layer: unitransStops }
                        { label: "Yolobus", layer: yolobus.customGetLayer('stops') },
                        { label: "Unitrans", layer: unitrans.customGetLayer('stops') }
                    ]
            }, {
                label: "Routes",
                selectAllCheckbox: "Un/select all",
                children: [
                    {
                        label: "Yolobus",
                        selectAllCheckbox: true,
                        children: [
                            {
                                label: "West Sacramento Local",
                                selectAllCheckbox: true,
                                children: [
                                    // { label: "RT 37", layer: routes.customGetLayer('rt37') },
                                    // { label: "RT 40", layer: routes.customGetLayer('rt40') },
                                    // { label: "RT 41", layer: routes.customGetLayer('rt41') },
                                    // { label: "RT 240", layer: routes.customGetLayer('rt240') }
                                    { label: "RT 37", layer: routes.customGetLayer('37') },
                                    { label: "RT 40", layer: routes.customGetLayer('40') },
                                    { label: "RT 41", layer: routes.customGetLayer('41') },
                                    { label: "RT 240", layer: routes.customGetLayer('240') }
                                ]
                            }, {
                                label: "Woodland Local",
                                selectAllCheckbox: true,
                                children: [
                                    // { label: "RT 211", layer: routes.customGetLayer('rt211') },
                                    // { label: "RT 212", layer: routes.customGetLayer('rt212') }
                                    { label: "RT 211", layer: routes.customGetLayer('211') },
                                    { label: "RT 212", layer: routes.customGetLayer('212') }
                                ]
                            }, {
                                label: "Intercity",
                                selectAllCheckbox: true,
                                children: [
                                    // { label: "RT 42A", layer: routes.customGetLayer('rt42A') },
                                    // { label: "RT 42B", layer: routes.customGetLayer('rt42B') },
                                    // { label: "RT 138EB", layer: routes.customGetLayer('rt138EB') },
                                    // { label: "RT 138WB", layer: routes.customGetLayer('rt138WB') },
                                    // { label: "RT 215EB", layer: routes.customGetLayer('rt215EB') },
                                    // { label: "RT 215WB", layer: routes.customGetLayer('rt215WB') }
                                    { label: "RT 42A", layer: routes.customGetLayer('42A') },
                                    { label: "RT 42B", layer: routes.customGetLayer('42B') },
                                    { label: "RT 138EB", layer: routes.customGetLayer('138') },
                                    { label: "RT 215EB", layer: routes.customGetLayer('215') }
                                ]
                            }, {
                                label: "Davis Express",
                                selectAllCheckbox: true,
                                children: [
                                    // { label: "RT 43AM", layer: routes.customGetLayer('rt43AM') },
                                    // { label: "RT 43PM", layer: routes.customGetLayer('rt43PM') },
                                    // { label: "RT 43RAM", layer: routes.customGetLayer('rt43RAM') },
                                    // { label: "RT 43RPM", layer: routes.customGetLayer('rt43RPM') },
                                    // { label: "RT 44AM", layer: routes.customGetLayer('rt44AM') },
                                    // { label: "RT 44PM", layer: routes.customGetLayer('rt44PM') },
                                    // { label: "RT 230AM", layer: routes.customGetLayer('rt230AM') },
                                    // { label: "RT 230PM", layer: routes.customGetLayer('rt230PM') }
                                    { label: "RT 43AM", layer: routes.customGetLayer('43') },
                                    { label: "RT 43RAM", layer: routes.customGetLayer('43R') },
                                    { label: "RT 44AM", layer: routes.customGetLayer('44') },
                                    { label: "RT 230AM", layer: routes.customGetLayer('230') }
                                ]
                            }, {
                                label: "Woodland Express",
                                selectAllCheckbox: true,
                                children: [
                                    // { label: "RT 45AM", layer: routes.customGetLayer('rt45AM') },
                                    // { label: "RT 45PM", layer: routes.customGetLayer('rt45PM') }
                                    { label: "RT 45AM", layer: routes.customGetLayer('45') }
                                ]
                            }
                        ]
                    }, {
                        label: "Unitrans",
                        selectAllCheckbox: true,
                        children: [
                            {
                                label: "Memorial Union",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "RT A", layer: routes.customGetLayer('A') },
                                    { label: "RT B", layer: routes.customGetLayer('B') },
                                    { label: "RT E", layer: routes.customGetLayer('E') },
                                    { label: "RT F", layer: routes.customGetLayer('F') },
                                    { label: "RT G", layer: routes.customGetLayer('G') },
                                    { label: "RT K", layer: routes.customGetLayer('K') },
                                    { label: "RT M", layer: routes.customGetLayer('M') },
                                    { label: "RT O", layer: routes.customGetLayer('O') },
                                    { label: "RT P", layer: routes.customGetLayer('P') },
                                    { label: "RT Q", layer: routes.customGetLayer('Q') },
                                    { label: "RT U", layer: routes.customGetLayer('U') },
                                    { label: "RT FMS", layer: routes.customGetLayer('FMS') }
                                ]
                            }, {
                                label: "Silo",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "RT C", layer: routes.customGetLayer('C') },
                                    { label: "RT D", layer: routes.customGetLayer('D') },
                                    { label: "RT J", layer: routes.customGetLayer('J') },
                                    { label: "RT L", layer: routes.customGetLayer('L') },
                                    { label: "RT V", layer: routes.customGetLayer('V') },
                                    { label: "RT VL", layer: routes.customGetLayer('VL') },
                                    { label: "RT VX", layer: routes.customGetLayer('VX') },
                                    { label: "RT W", layer: routes.customGetLayer('W') },
                                    { label: "RT Z", layer: routes.customGetLayer('Z') }
                                ]
                            }, {
                                label: "Davis High & Junior High",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "RT T", layer: routes.customGetLayer('T') }
                                ]
                            }
                        ]
                    }
                ]
            }, {
                label: "Points of Interest",
                selectAllCheckbox: "Un/select all",
                children: [
                    {
                        label: "Yolo County",
                        selectAllCheckbox: true,
                        children: [
                            { label: "Arts & Entertainment", layer: yoloPOIs.customGetLayer('yoloArtsEntertainment') },
                            { label: "Education", layer: yoloPOIs.customGetLayer('yoloEducation') },
                            { label: "Employment", layer: yoloPOIs.customGetLayer('yoloEmployment') },
                            { label: "Healthcare", layer: yoloPOIs.customGetLayer('yoloHealthcare') },
                            { label: "Public & Social Services", layer: yoloPOIs.customGetLayer('yoloPublicSocialServices') },
                            { label: "Residential", layer: yoloPOIs.customGetLayer('yoloResidential') },
                            { label: "Retail", layer: yoloPOIs.customGetLayer('yoloRetail') },
                            { label: "Tourism", layer: yoloPOIs.customGetLayer('yoloTourism') },
                            { label: "Travel", layer: yoloPOIs.customGetLayer('yoloTravel') }
                        ]
                    }, {
                        label: "Sacramento County",
                        selectAllCheckbox: true,
                        children: [
                            { label: "Arts & Entertainment", layer: sacPOIs.customGetLayer('sacArtsEntertainment') },
                            { label: "Education", layer: sacPOIs.customGetLayer('sacEducation') },
                            { label: "Employment", layer: sacPOIs.customGetLayer('sacEmployment') },
                            { label: "Healthcare", layer: sacPOIs.customGetLayer('sacHealthcare') },
                            { label: "Public & Social Services", layer: sacPOIs.customGetLayer('sacPublicSocialServices') },
                            { label: "Residential", layer: sacPOIs.customGetLayer('sacResidential') },
                            { label: "Retail", layer: sacPOIs.customGetLayer('sacRetail') },
                            { label: "Tourism", layer: sacPOIs.customGetLayer('sacTourism') },
                            { label: "Travel", layer: sacPOIs.customGetLayer('sacTravel') }
                        ]
                    }
                ]
            }, {
                label: "CalEnviroScreen", layer: calEnviroScreen
            }
        ]
    };

    // Add layer groups to layer control
    var layerControl = L.control.layers.tree(baseMap, overlaysTree, 
                                            {
                                                hideSingleBase: true,
                                                collapseAll: "Collapse all",
                                                expandAll: 'Expand all',
                                            });
    // Collapse all layers by default
    layerControl.addTo(map).collapseTree().expandSelected().collapseTree(true);
    
    // // Get list of active layers
    // var active = layerControl.getActiveOverlayLayers();    // TypeError: layerControl.getActiveOverlayLayers is not a function
    // console.log("active layers from layer control 1: ", active);
    
    // Add click event listener to the map
    map.on('click', onMapClick);

    // // Get list of active layers
    // var active = layerControl.getActiveOverlayLayers();    // TypeError: layerControl.getActiveOverlayLayers is not a function
    // console.log("active layers from layer control 2: ", active);
}

// map.on('overlayadd', function () {
//     setTimeout(function () {
//         console.log(control.getActiveOverlayLayers());
//     }, 1);
// });

// Create GeoJSON layers
async function createGeoJson(file) {
    // console.log("adding geojson: ", file);
    try {
        const lastSlash = location.pathname.lastIndexOf('/');
        const directoryName = location.pathname.substring(1,lastSlash);
        if (!directoryName) return;
        if (directoryName == "shapefiles") {
            console.log("directory name: ", directoryName);
            const geojson = shp(file);
            console.log(geojson);
            return L.geoJson(geojson);
        }
        
        const response = await fetch(file);
        if (!response.ok) {
            console.error(`Error loading GeoJSON file: ${file}, Status: ${response.status}`);
            return L.layerGroup(); // Return empty group instead of undefined
        }
        let data = await response.json();
        
        // If data is in EPSG:3857, project it to EPSG:4326 for Leaflet
        if (data.crs && data.crs.properties && (data.crs.properties.name === "EPSG:3857" || data.crs.properties.name === "urn:ogc:def:crs:EPSG::3857")) {
            // console.log("Projecting data from EPSG:3857 to EPSG:4326");
            const source = "EPSG:3857";
            const dest = "EPSG:4326";
            
            // Helper to transform coordinates recursively
            const transformCoords = (coords) => {
                if (typeof coords[0] === 'number') {
                    return proj4(source, dest, coords);
                }
                return coords.map(transformCoords);
            };

            data.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    feature.geometry.coordinates = transformCoords(feature.geometry.coordinates);
                }
            });
        } else if (data.features && data.features.length > 0 && data.features[0].geometry && data.features[0].geometry.coordinates) {
            // Fallback detection: if coordinates look like EPSG:3857 (very large numbers)
            const firstCoord = data.features[0].geometry.type === 'Point' 
                ? data.features[0].geometry.coordinates 
                : (data.features[0].geometry.type === 'LineString' 
                    ? data.features[0].geometry.coordinates[0] 
                    : (data.features[0].geometry.type === 'Polygon' ? data.features[0].geometry.coordinates[0][0] : null));
            
            if (firstCoord && (Math.abs(firstCoord[0]) > 180 || Math.abs(firstCoord[1]) > 90)) {
                console.log("Detected large coordinates, projecting from EPSG:3857 to EPSG:4326");
                const source = "EPSG:3857";
                const dest = "EPSG:4326";
                const transformCoords = (coords) => {
                    if (typeof coords[0] === 'number') {
                        return proj4(source, dest, coords);
                    }
                    return coords.map(transformCoords);
                };
                data.features.forEach(feature => {
                    if (feature.geometry && feature.geometry.coordinates) {
                        feature.geometry.coordinates = transformCoords(feature.geometry.coordinates);
                    }
                });
            }
        }

        // var counter = 0;
        return L.geoJson(data, {
            pointToLayer: function (feature, latlng) {
                const isPOI = file.includes('Points of Interest');
                if (isPOI) {
                    let color = "blue";
                    if (file.includes("Arts_Entertainment")) color = "#9B5DE5";
                    else if (file.includes("Education")) color = "#1982C4";
                    else if (file.includes("Employment")) color = "#1A535C";
                    else if (file.includes("Healthcare")) color = "#FF6B6B";
                    else if (file.includes("Public_Social_Services")) color = "#4ECDC4";
                    else if (file.includes("Residential")) color = "#FF9F1C";
                    else if (file.includes("Retail")) color = "#FFD93D";
                    else if (file.includes("Tourism")) color = "#FF595E";
                    else if (file.includes("Travel")) color = "#8AC926";

                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: color,
                        color: "#fff",
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                }
                return L.marker(latlng);
            },
            style: function (feature) {
                const name = feature.properties.name || feature.properties.Route || null;
                var color = "pink";

                if (file.includes("Yolobus Service Area")) color = "lightblue";
                if (file.includes("Arts_Entertainment")) color = "#9B5DE5";
                else if (file.includes("Education")) color = "#1982C4";
                else if (file.includes("Employment")) color = "#1A535C";
                else if (file.includes("Healthcare")) color = "#FF6B6B";
                else if (file.includes("Public_Social_Services")) color = "#4ECDC4";
                else if (file.includes("Residential")) color = "#FF9F1C";
                else if (file.includes("Retail")) color = "#FFD93D";
                else if (file.includes("Tourism")) color = "#FF595E";
                else if (file.includes("Travel")) color = "#8AC926";
                else if (name == "37" || name == "40" || name == "41" || name == "240") color = "purple";
                else if (name == "211" || name == "212") color = "orange";
                else if (name == "42A" || name == "42B") color = "green";
                // else if (name == "138EB" || name == "138WB" || name == "215EB" || name == "215WB") color = "black";
                else if (name == "138" || name == "215") color = "black";
                // else if (name == "43AM" || name == "43PM" || name == "43RAM" || name == "43RPM" || name == "44AM" || name == "44PM" || name == "230AM" || name == "230PM") color = "red";
                else if (name == "43" || name == "43R" || name == "44" || name == "230") color = "red";
                // else if (name == "45AM" || name == "45PM") color = "orange";
                else if (name == "45") color = "orange";

                return {
                    color: color,
                    fillColor: color,
                    opacity: 0.8,
                    fillOpacity: 0.3,
                    weight: 3
                };
            },

            onEachFeature: function (feature, layer) {
                const name = feature.properties.name || feature.properties.Route || feature.properties.NAME || null;
                const type = feature.properties.fclass || feature.properties.type || "";
                if (name && !file.includes('Yolo County Boundary')) {
                    layer.bindPopup(`<strong>${name}</strong><br>${type}`, {
                        autoPan: false
                    });
                    layer.on('click', function(event) {
                        onMapClick(event);
                    });
                    layer.on('mouseover', function() {
                        layer.openPopup();
                    });
                    layer.on('mouseout', function() {
                        layer.closePopup();
                    });
                }
                // counter++;
                // console.log("Count: ", counter, " for ", file);
            }
        });
    } catch (e) {
        console.error("Error creating GeoJSON layer:", e);
        return L.layerGroup();
    }
}

async function addBoundaries() {
    const yoloBoundaryLeaflet = await createGeoJson("../../geojson/Boundary Layers/Yolo County Boundary.geojson");
    const serviceAreaLeaflet = await createGeoJson("../../geojson/Boundary Layers/Yolobus Service Area.geojson");
    yoloBoundaryLeaflet.id = 'yoloCountyBoundary';
    serviceAreaLeaflet.id = 'yolobusServiceArea';

    var borders = L.layerGroup([yoloBoundaryLeaflet, serviceAreaLeaflet]);
    return borders; 
}

// function initializeStopList() {
//     let yolobusStops = [];
//     let unitransStops = [];
//     return { yolobusStops, unitransStops };
// }


/**
 * Convert a GTFS ZIP File object to GeoJSONs.
 * @param {File|ArrayBuffer} gtfsFile - GTFS ZIP as File or ArrayBuffer
 * @returns {Promise<{stopsGeoJSON: object, routesGeoJSONs: Map<string, object>}>}
 */
async function gtfsZipToGeoJSON(gtfsFile) {
    // Read ArrayBuffer if input is a File
    let data;
    if (gtfsFile instanceof File) {
        data = await gtfsFile.arrayBuffer();
    } else if (gtfsFile instanceof ArrayBuffer) {
        data = gtfsFile;
    } else {
        throw new Error("Input must be a File or ArrayBuffer");
    }
    
    const zip = await JSZip.loadAsync(data);

    // Helper to parse CSV with PapaParse
    async function parseCSVFromZip(filename) {
        const file = zip.file(filename);
        if (!file) return [];
        const content = await file.async("string");
        return Papa.parse(content, { header: true, skipEmptyLines: true }).data;
    }

    // Parse GTFS files
    const stops = await parseCSVFromZip("stops.txt");
    const routes = await parseCSVFromZip("routes.txt");
    const trips = await parseCSVFromZip("trips.txt");
    const shapes = await parseCSVFromZip("shapes.txt");

    // Stops GeoJSON
    const stopsGeoJSON = {
        type: "FeatureCollection",
        features: stops.map(s => ({
            type: "Feature",
            geometry: { 
                type: "Point", coordinates: [
                    parseFloat(s.stop_lon), parseFloat(s.stop_lat)
                ] 
            },
            properties: { stop_id: s.stop_id, stop_name: s.stop_name }
        }))
    };

    // Routes GeoJSON (Map of route_id → GeoJSON)
    const routesGeoJSONs = new Map();
    routes.forEach(route => {
        const shapeIds = trips.filter(t => t.route_id === route.route_id && t.shape_id).map(t => t.shape_id);
    
    const features = shapeIds.map(shapeId => {
        const points = shapes
            .filter(s => s.shape_id === shapeId)
            .sort((a, b) => parseFloat(a.shape_pt_sequence) - parseFloat(b.shape_pt_sequence))
            .map(s => [parseFloat(s.shape_pt_lon), parseFloat(s.shape_pt_lat)]);
        
        return {
            type: "Feature",
            geometry: { type: "LineString", coordinates: points },
            properties: { shape_id: shapeId, route_id: route.route_id }
        };
    });
    
    routesGeoJSONs.set(route.route_id, { type: "FeatureCollection", features });
    });
    
    return { stopsGeoJSON, routesGeoJSONs };
}

async function addTransitData(gtfsFile) {
    const { stopsGeoJSON: stops, routesGeoJSONs: routes } = await gtfsZipToGeoJSON(gtfsFile);
    
    var stopsLayer = await createGeoJson(stops);
    stopsLayer.id = 'stops';

    const routeLayers = [];
    for (const [routeId, route] of routes.entries()) {
        const layer = await createGeoJson(route);
        layer.id = routeId;
        routeLayers.push(layer);
    }

    // Combine stops + routes for one agency
    const agencyData = L.layerGroup([stopsLayer, ...routeLayers]);
    
    return agencyData;
}

    

// function addBusStops(filePath, busStops, busStopMarker) {
//     return new Promise(async (resolve) => {
//         try {
//             const response = await fetch(filePath);
//             if (!response.ok) {
//                 console.error(`HTTP error! Status: ${response.status}`);
//                 resolve(L.layerGroup());
//                 return;
//             }
//             const text = await response.text();
//             const lines = text.split('\n');

//             // Skip header
//             for (var i = 1; i < lines.length; i++) {
//                 if (!lines[i].trim()) continue;
//                 let parts = splitByCommaNotInParentheses(lines[i]);
//                 if (parts.length < 6) continue;

//                 let stopName = parts[2];
//                 let stopLat = parseFloat(parts[4]);
//                 let stopLon = parseFloat(parts[5]);

//                 if (isNaN(stopLat) || isNaN(stopLon)) continue;

//                 const busStopIcon = new L.Icon({
//                     iconUrl: busStopMarker,
//                     iconSize: [15, 15],
//                     iconAnchor: [7.5, 7.5],
//                     popupAnchor: [0, 0]
//                 });

//                 busStops.push(L.marker([stopLat, stopLon], {
//                     icon: busStopIcon
//                 }).bindPopup(stopName, { autoPan: false }));
//             }

//             var counter = 0;
//             for (let stop of busStops) {
//                 stop.on('click', function(event) {
//                     onMapClick(event);
//                 });
//                 stop.on('mouseover', function() {
//                     stop.openPopup();
//                 });
//                 stop.on('mouseout', function() {
//                     stop.closePopup();
//                 });
//                 counter++;
//             }
//             console.log("Count: ", counter, " for ", filePath);

//             resolve(L.layerGroup(busStops));
//         } catch (error) {
//             console.error('Error loading bus stops:', error);
//             resolve(L.layerGroup());
//         }
//     });
// }

// async function addRoutes() {
//     var rt37 = await createGeoJson("../../geojson/Routes/West Sacramento Local/RT37.geojson");
//     var rt40 = await createGeoJson("../../geojson/Routes/West Sacramento Local/RT40.geojson");
//     var rt41 = await createGeoJson("../../geojson/Routes/West Sacramento Local/RT41.geojson");
//     var rt240 = await createGeoJson("../../geojson/Routes/West Sacramento Local/RT240.geojson");
//     rt37.id = 'rt37';
//     rt40.id = 'rt40';
//     rt41.id = 'rt41';
//     rt240.id = 'rt240';

//     var rt211 = await createGeoJson("../../geojson/Routes/Woodland Local/RT211.geojson");
//     var rt212 = await createGeoJson("../../geojson/Routes/Woodland Local/RT212.geojson");
//     rt211.id = 'rt211';
//     rt212.id = 'rt212';

//     var rt42A = await createGeoJson("../../geojson/Routes/Intercity/RT42A.geojson");
//     var rt42B = await createGeoJson("../../geojson/Routes/Intercity/RT42B.geojson");
//     var rt138EB = await createGeoJson("../../geojson/Routes/Intercity/RT138EB.geojson");
//     var rt138WB = await createGeoJson("../../geojson/Routes/Intercity/RT138WB.geojson");
//     var rt215EB = await createGeoJson("../../geojson/Routes/Intercity/RT215EB.geojson");
//     var rt215WB = await createGeoJson("../../geojson/Routes/Intercity/RT215WB.geojson");
//     rt42A.id = 'rt42A';
//     rt42B.id = 'rt42B';
//     rt138EB.id = 'rt138EB';
//     rt138WB.id = 'rt138WB';
//     rt215EB.id = 'rt215EB';
//     rt215WB.id = 'rt215WB';

//     var rt43AM = await createGeoJson("../../geojson/Routes/Davis Express/RT43AM.geojson");
//     var rt43PM = await createGeoJson("../../geojson/Routes/Davis Express/RT43PM.geojson");
//     var rt43RAM = await createGeoJson("../../geojson/Routes/Davis Express/RT43RAM.geojson");
//     var rt43RPM = await createGeoJson("../../geojson/Routes/Davis Express/RT43RPM.geojson");
//     var rt44AM = await createGeoJson("../../geojson/Routes/Davis Express/RT44AM.geojson");
//     var rt44PM = await createGeoJson("../../geojson/Routes/Davis Express/RT44PM.geojson");
//     var rt230AM = await createGeoJson("../../geojson/Routes/Davis Express/RT230AM.geojson");
//     var rt230PM = await createGeoJson("../../geojson/Routes/Davis Express/RT230PM.geojson");
//     rt43AM.id = 'rt43AM';
//     rt43PM.id = 'rt43PM';
//     rt43RAM.id = 'rt43RAM';
//     rt43RPM.id = 'rt43RPM';
//     rt44AM.id = 'rt44AM';
//     rt44PM.id = 'rt44PM';
//     rt230AM.id = 'rt230AM';
//     rt230PM.id = 'rt230PM';

//     var rt45AM = await createGeoJson("../../geojson/Routes/Woodland Express/RT45AM.geojson");
//     var rt45PM = await createGeoJson("../../geojson/Routes/Woodland Express/RT45PM.geojson");
//     rt45AM.id = 'rt45AM';
//     rt45PM.id = 'rt45PM';

//     var routes = L.layerGroup([rt37, rt40, rt41, rt240, rt211, rt212, rt42A, rt42B, rt138EB, rt138WB, rt215EB, rt215WB, rt43AM, rt43PM, rt43RAM, rt43RPM, rt44AM, rt44PM, rt230AM, rt230PM, rt45AM, rt45PM]);
//     return routes;
// }

// Add Disadvantaged Communities layer (shapefile to GeoJSON)
async function addCalEnviroScreen() {
    var calEnviroScreen = await createGeoJson("../../shapefiles/calenviroscreen40shpf2021shp.zip");
    // const geojson = shp("../../shapefiles/CalEnviroScreen40-2021shp.zip");
    // console.log(geojson);
    // var calEnviroScreen =  L.geoJson(geojson);

    return calEnviroScreen;
}

// By county
async function addYoloPOIs() {
    var yoloArtsEntertainment = await createGeoJson("../../geojson/Yolo County Points of Interest/Arts_Entertainment.geojson");
    var yoloEducation = await createGeoJson("../../geojson/Yolo County Points of Interest/Education.geojson");
    var yoloEmployment = await createGeoJson("../../geojson/Yolo County Points of Interest/Employment.geojson");
    var yoloHealthcare = await createGeoJson("../../geojson/Yolo County Points of Interest/Healthcare.geojson");
    var yoloPublicSocialServices = await createGeoJson("../../geojson/Yolo County Points of Interest/Public_Social_Services.geojson");
    var yoloResidential = await createGeoJson("../../geojson/Yolo County Points of Interest/Residential.geojson");
    var yoloRetail = await createGeoJson("../../geojson/Yolo County Points of Interest/Retail.geojson");
    var yoloTourism = await createGeoJson("../../geojson/Yolo County Points of Interest/Tourism.geojson");
    var yoloTravel = await createGeoJson("../../geojson/Yolo County Points of Interest/Travel.geojson");

    yoloArtsEntertainment.id = 'yoloArtsEntertainment';
    yoloEducation.id = 'yoloEducation';
    yoloEmployment.id = 'yoloEmployment';
    yoloHealthcare.id = 'yoloHealthcare';
    yoloPublicSocialServices.id = 'yoloPublicSocialServices';
    yoloResidential.id = 'yoloResidential';
    yoloRetail.id = 'yoloRetail';
    yoloTourism.id = 'yoloTourism';
    yoloTravel.id = 'yoloTravel';

    var yoloPOIs = L.layerGroup([yoloArtsEntertainment, yoloEducation, yoloEmployment, yoloHealthcare, yoloPublicSocialServices, yoloResidential, yoloRetail, yoloTourism, yoloTravel]);
    return yoloPOIs;
}

async function addSacPOIs() {
    var sacArtsEntertainment = await createGeoJson("../../geojson/Sacramento County Points of Interest/Arts_Entertainment.geojson");
    var sacEducation = await createGeoJson("../../geojson/Sacramento County Points of Interest/Education.geojson");
    var sacEmployment = await createGeoJson("../../geojson/Sacramento County Points of Interest/Employment.geojson");
    var sacHealthcare = await createGeoJson("../../geojson/Sacramento County Points of Interest/Healthcare.geojson");
    var sacPublicSocialServices = await createGeoJson("../../geojson/Sacramento County Points of Interest/Public_Social_Services.geojson");
    var sacResidential = await createGeoJson("../../geojson/Sacramento County Points of Interest/Residential.geojson");
    var sacRetail = await createGeoJson("../../geojson/Sacramento County Points of Interest/Retail.geojson");
    var sacTourism = await createGeoJson("../../geojson/Sacramento County Points of Interest/Tourism.geojson");
    var sacTravel = await createGeoJson("../../geojson/Sacramento County Points of Interest/Travel.geojson");

    sacArtsEntertainment.id = 'sacArtsEntertainment';
    sacEducation.id = 'sacEducation';
    sacEmployment.id = 'sacEmployment';
    sacHealthcare.id = 'sacHealthcare';
    sacPublicSocialServices.id = 'sacPublicSocialServices';
    sacResidential.id = 'sacResidential';
    sacRetail.id = 'sacRetail';
    sacTourism.id = 'sacTourism';
    sacTravel.id = 'sacTravel';

    var sacPOIs = L.layerGroup([sacArtsEntertainment, sacEducation, sacEmployment, sacHealthcare, sacPublicSocialServices, sacResidential, sacRetail, sacTourism, sacTravel]);
    return sacPOIs;
}

function setupEventListeners() {
    // Dialog form submission
    document.getElementById('isoline-form').addEventListener('submit', handleFormSubmit);

    // Cancel button
    document.getElementById('cancel-button').addEventListener('click', hideDialog);

    // Clear all button
    document.getElementById('clear-all-button').addEventListener('click', clearAll);

    // Isoline type change event to update value unit
    document.getElementById('isoline-type').addEventListener('change', updateValueUnit);

    // Dialog overlay click to close
    document.getElementById('isoline-dialog').addEventListener('click', function(e) {
        if (e.target === e.currentTarget) {
            hideDialog();
        }
    });
}

function onMapClick(event) {
    clickedCoordinates = [event.latlng.lng, event.latlng.lat]; // Store as [lng, lat] for API
    showDialog();
}

function showDialog() {
    const dialog = document.getElementById('isoline-dialog');
    dialog.classList.remove('hidden');

    // Focus on the first form element
    setTimeout(() => {
        document.getElementById('travel-mode').focus();
    }, 100);
}

function hideDialog() {
    const dialog = document.getElementById('isoline-dialog');
    dialog.classList.add('hidden');
    clickedCoordinates = null;
}

function updateValueUnit() {
    const isolineType = document.getElementById('isoline-type').value;
    const valueUnit = document.getElementById('value-unit');
    const valueInput = document.getElementById('isoline-value');

    if (isolineType === 'time') {
        valueUnit.textContent = 'minutes';
        valueInput.setAttribute('max', '120');
        valueInput.setAttribute('min', '1');
        valueInput.value = '10';
    } else {
        valueUnit.textContent = 'kilometers';
        valueInput.setAttribute('max', '100');
        valueInput.setAttribute('min', '0.1');
        valueInput.setAttribute('step', '0.1');
        valueInput.value = '1.0';
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();

    if (!clickedCoordinates) {
        alert('No coordinates selected. Please click on the map first.');
        return;
    }

    const formData = new FormData(event.target);
    const travelMode = formData.get('travel-mode');
    const isolineType = formData.get('isoline-type');
    const isolineValue = formData.get('isoline-value');

    // Store coordinates before hiding dialog
    const coordinates = clickedCoordinates;

    // Hide dialog
    hideDialog();

    // Add marker immediately
    const markerId = addMarker(coordinates, travelMode, isolineType, isolineValue);

    // Show loading indicator
    showLoadingIndicator();

    try {
        // Fetch isoline data
        const isolineData = await fetchIsoline(coordinates, travelMode, isolineType, isolineValue);

        // Add isoline to map
        addIsolineToMap(isolineData, markerId);

        markerCounter++;

    } catch (error) {
        console.error('Error fetching isoline:', error);
        alert('Error fetching isoline data. Please check your API key and try again.');

        // Remove the marker if API call failed
        removeMarker(markerId);
    } finally {
        // Hide loading indicator
        hideLoadingIndicator();
    }
}

function getTravelModeIcon(travelMode) {
    const icons = {
        'walk': 'walking',
        'hike': 'person-hiking',
        'scooter': 'motorcycle',
        'motorcycle': 'motorcycle',
        'drive': 'car',
        'truck': 'truck',
        'light_truck': 'truck-pickup',
        'medium_truck': 'truck-moving',
        'truck_dangerous_goods': 'truck-monster',
        'heavy_truck': 'truck-ramp-box',
        'long_truck': 'truck-moving',
        'bicycle': 'person-biking',
        'mountain_bike': 'bicycle',
        'road_bike': 'bicycle',
        'bus': 'bus',
        'drive_shortest': 'car-side',
        'drive_traffic_approximated': 'car-on',
        'truck_traffic_approximated': 'truck-front',
        'transit': 'train-subway',
        'approximated_transit': 'train-tram',
    };

    return icons[travelMode] || 'map-marker';
}

function generateIconUrl(travelMode, color, value) {
    const icon = getTravelModeIcon(travelMode);
    // Remove # from color for URL
    const colorCode = color.replace('#', '');

    return `https://api.geoapify.com/v2/icon/?type=circle&color=%23${colorCode}&size=40&icon=${icon}&iconType=awesome&contentSize=20&contentColor=%23${colorCode}&scaleFactor=2&apiKey=${GEOAPIFY_API_KEY}`;
}

function addMarker(coordinates, travelMode, isolineType, isolineValue) {
    const markerId = `marker-${Date.now()}-${markerCounter}`;
    const currentColor = COLORS[currentColorIndex];

    const iconUrl = generateIconUrl(travelMode, currentColor, isolineValue);

    const markerElement = document.createElement('div');
    markerElement.innerHTML = `
        <div class="custom-marker">
            <img src="${iconUrl}" class="marker-icon" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=&quot;marker-fallback&quot; style=&quot;background: ${currentColor}&quot;>●<div class=&quot;marker-value&quot; style=&quot;background: ${currentColor}&quot;>${isolineValue}</div></div>';" />
            <div class="marker-value" style="background: ${currentColor}">${isolineValue}</div>
        </div>
    `;

    // Create Leaflet marker with custom HTML
    const marker = L.marker([coordinates[1], coordinates[0]], {
        icon: L.divIcon({
            html: markerElement.innerHTML,
            className: 'custom-marker-container',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        })
    }).addTo(map);

    // Store marker reference
    marker._markerId = markerId;
    markers.push(marker);

    return markerId;
}

function removeMarker(markerId) {
    const markerIndex = markers.findIndex(marker => marker._markerId === markerId);
    if (markerIndex !== -1) {
        map.removeLayer(markers[markerIndex]);
        markers.splice(markerIndex, 1);
    }
}

async function fetchIsoline(coordinates, travelMode, isolineType, isolineValue) {
    const [lng, lat] = coordinates;

    // Prepare API parameters
    const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lng.toString(),
        type: isolineType,
        mode: travelMode,
        apiKey: GEOAPIFY_API_KEY
    });

    // Add type-specific parameter
    if (isolineType === 'time') {
        params.append('range', (parseInt(isolineValue) * 60).toString()); // Convert minutes to seconds
    } else {
        params.append('range', (parseFloat(isolineValue) * 1000).toString()); // Convert km to meters
    }

    const url = `https://api.geoapify.com/v1/isoline?${params.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
        throw new Error('No isoline data returned from API');
    }

    return data;
}

function addIsolineToMap(isolineData, markerId) {
    const color = COLORS[currentColorIndex];

    // Create GeoJSON layer for the isoline
    const isolineLayer = L.geoJSON(isolineData, {
        style: function(feature) {
            return {
                fillColor: color,
                fillOpacity: 0.4,
                color: color,
                weight: 2,
                opacity: 0.8
            };
        }
    }).addTo(map);

    // Store layer reference with marker ID
    isolineLayer._markerId = markerId;
    isolineLayers.push(isolineLayer);

    // Move to next color
    currentColorIndex = (currentColorIndex + 1) % COLORS.length;

    // detectLayerOverlap(busStops, isolineLayer);
    // console.log("current active layers: ", active);
    // detectLayerOverlap(L.layerGroup(active), isolineLayer);
}

function detectLayerOverlap(layerGroup, isoline) {
    layerGroup.eachLayer(function (layer) {
        const polygon = layer.toGeoJSON();
        var intersection = turf.intersect(polygon, isoline);
        if (intersection) {
            console.log("Isoline overlaps with layer: ", layer);
            // Display text in sidebar
        }
    })
}

function showLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.classList.remove('hidden');
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.classList.add('hidden');
}

function clearAll() {
    // Clear all markers
    markers.forEach(marker => {
        map.removeLayer(marker);
    });
    markers = [];

    // Clear all isoline layers
    isolineLayers.forEach(layer => {
        map.removeLayer(layer);
    });
    isolineLayers = [];

    // Reset counters
    markerCounter = 0;
    currentColorIndex = 0;
}