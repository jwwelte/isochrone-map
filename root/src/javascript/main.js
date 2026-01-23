const GEOAPIFY_API_KEY = '08450434409749f7910860bb29eb30bc';
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

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for all async layers to load before initializing map

    // const stopDict = initializeStopList();
    const [
        borders, yolobus, unitrans, yoloPOIs, sacPOIs
    ] = await Promise.all([
        addBoundaries(),
        addTransitData("/yolobus_gtfs.zip", "Yolobus", "../../assets/images/yolobus-bus-stop.png"),
        addTransitData("/unitrans_gtfs.zip", "Unitrans", "../../assets/images/unitrans-bus-stop.png"),
        // addCalEnviroScreen(),
        addYoloPOIs(),
        addSacPOIs()
    ]);

    initializeMap(borders, yolobus, unitrans, yoloPOIs, sacPOIs);
    // document.getElementById("loader").remove();
    document.getElementById("loader").style.display = 'none';
    setupEventListeners();
});

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
        div.innerHTML += '<i style="background: orange;"></i><span>Woodland Local/Express</span><br>';
        div.innerHTML += '<i style="background: green; width: 9px; margin: 0;"></i><i style="background: black; width: 9px;"></i><span>Intercity</span><br>';
        div.innerHTML += '<i style="background: red;"></i><span>Davis Express</span><br>';
        // div.innerHTML += '<i style="background: orange;"></i><span>Woodland Express</span><br>';
        
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
                                    { label: "37", layer: yolobus.customGetLayer('37') },
                                    { label: "40", layer: yolobus.customGetLayer('40') },
                                    { label: "41", layer: yolobus.customGetLayer('41') },
                                    { label: "240", layer: yolobus.customGetLayer('240') }
                                ]
                            }, {
                                label: "Woodland Local",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "211", layer: yolobus.customGetLayer('211') },
                                    { label: "212", layer: yolobus.customGetLayer('212') }
                                ]
                            }, {
                                label: "Intercity",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "42A", layer: yolobus.customGetLayer('42A') },
                                    { label: "42B", layer: yolobus.customGetLayer('42B') },
                                    { label: "138", layer: yolobus.customGetLayer('138') },
                                    { label: "215", layer: yolobus.customGetLayer('215') }
                                ]
                            }, {
                                label: "Davis Express",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "43", layer: yolobus.customGetLayer('43') },
                                    { label: "43R", layer: yolobus.customGetLayer('43R') },
                                    { label: "44", layer: yolobus.customGetLayer('44') },
                                    { label: "230", layer: yolobus.customGetLayer('230') }
                                ]
                            }, {
                                label: "Woodland Express",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "45", layer: yolobus.customGetLayer('45') }
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
                                    { label: "A", layer: unitrans.customGetLayer('A') },
                                    { label: "B", layer: unitrans.customGetLayer('B') },
                                    { label: "E", layer: unitrans.customGetLayer('E') },
                                    { label: "F", layer: unitrans.customGetLayer('F') },
                                    { label: "G", layer: unitrans.customGetLayer('G') },
                                    { label: "K", layer: unitrans.customGetLayer('K') },
                                    { label: "M", layer: unitrans.customGetLayer('M') },
                                    { label: "O", layer: unitrans.customGetLayer('O') },
                                    { label: "P", layer: unitrans.customGetLayer('P') },
                                    { label: "Q", layer: unitrans.customGetLayer('Q') },
                                    { label: "U", layer: unitrans.customGetLayer('U') },
                                    { label: "FMS", layer: unitrans.customGetLayer('FMS') }
                                ]
                            }, {
                                label: "Silo",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "C", layer: unitrans.customGetLayer('C') },
                                    { label: "D", layer: unitrans.customGetLayer('D') },
                                    { label: "J", layer: unitrans.customGetLayer('J') },
                                    { label: "L", layer: unitrans.customGetLayer('L') },
                                    { label: "V", layer: unitrans.customGetLayer('V') },
                                    { label: "VL", layer: unitrans.customGetLayer('VL') },
                                    { label: "VX", layer: unitrans.customGetLayer('VX') },
                                    { label: "W", layer: unitrans.customGetLayer('W') },
                                    { label: "Z", layer: unitrans.customGetLayer('Z') }
                                ]
                            }, {
                                label: "Davis High & Junior High",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "T", layer: unitrans.customGetLayer('T') }
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
                            { label: "Arts & Entertainment", layer: yoloPOIs.customGetLayer('yoloArts_Entertainment') },
                            { label: "Education", layer: yoloPOIs.customGetLayer('yoloEducation') },
                            { label: "Employment", layer: yoloPOIs.customGetLayer('yoloEmployment') },
                            { label: "Healthcare", layer: yoloPOIs.customGetLayer('yoloHealthcare') },
                            { label: "Public & Social Services", layer: yoloPOIs.customGetLayer('yoloPublic_Social_Services') },
                            { label: "Residential", layer: yoloPOIs.customGetLayer('yoloResidential') },
                            { label: "Retail", layer: yoloPOIs.customGetLayer('yoloRetail') },
                            { label: "Tourism", layer: yoloPOIs.customGetLayer('yoloTourism') },
                            { label: "Travel", layer: yoloPOIs.customGetLayer('yoloTravel') }
                        ]
                    }, {
                        label: "Sacramento County",
                        selectAllCheckbox: true,
                        children: [
                            { label: "Arts & Entertainment", layer: sacPOIs.customGetLayer('sacArts_Entertainment') },
                            { label: "Education", layer: sacPOIs.customGetLayer('sacEducation') },
                            { label: "Employment", layer: sacPOIs.customGetLayer('sacEmployment') },
                            { label: "Healthcare", layer: sacPOIs.customGetLayer('sacHealthcare') },
                            { label: "Public & Social Services", layer: sacPOIs.customGetLayer('sacPublic_Social_Services') },
                            { label: "Residential", layer: sacPOIs.customGetLayer('sacResidential') },
                            { label: "Retail", layer: sacPOIs.customGetLayer('sacRetail') },
                            { label: "Tourism", layer: sacPOIs.customGetLayer('sacTourism') },
                            { label: "Travel", layer: sacPOIs.customGetLayer('sacTravel') }
                        ]
                    }
                ]
            // }, {
            //     label: "CalEnviroScreen", layer: calEnviroScreen
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
async function createGeoJson(file, fileName, busStopMarker = "") {
    try {
        let data;

        // If file is a string, fetch it
        if (typeof file === "string") {
            const response = await fetch(file);
            if (!response.ok) {
                console.error(`Error loading GeoJSON file: ${file}, Status: ${response.status}`);
                return L.layerGroup(); // Return empty group instead of undefined
            }
            data = await response.json();
        } else {
            // Otherwise assume it's already a GeoJSON object
            data = file;
        }

        // const lastSlash = location.pathname.lastIndexOf('/');
        // const directoryName = location.pathname.substring(1,lastSlash);
        // if (!directoryName) return;
        // if (directoryName == "shapefiles") {
        //     console.log("directory name: ", directoryName);
        //     const geojson = shp(file);
        //     console.log(geojson);
        //     return L.geoJson(geojson);
        // }
        
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

        const busStopIcon = new L.Icon({
            iconUrl: busStopMarker,
            iconSize: [15, 15],
            iconAnchor: [7.5, 7.5],
            popupAnchor: [0, 0]
        });
        const categoryColors = {
            "Arts_Entertainment": "#9B5DE5",
            "Education": "#1982C4",
            "Employment": "#1A535C",
            "Healthcare": "#FF6B6B",
            "Public_Social_Services": "#4ECDC4",
            "Residential": "#FF9F1C",
            "Retail": "#FFD93D",
            "Tourism": "#FF595E",
            "Travel": "#8AC926"
        }
        const routeTypes = {
            "West Sacramento Local": ["37", "40", "41", "240"],
            "Woodland Local": ["211", "212"],
            "Intercity": ["42A", "42B", "138"],
            "Intercity Cache Creek": ["215"],
            "Davis Express": ["43", "43R", "44", "230"],
            "Woodland Express": "45",
            "Memorial Union": ["A", "B", "E", "F", "G", "K", "M", "O", "P", "Q", "U", "FMS"],
            "Silo": ["C", "D", "J", "L", "V", "VL", "VX", "W", "Z"],
            "Davis High & Junior High": ["T"]
        };
        const routeColors = {
            "West Sacramento Local": "purple", 
            "Woodland Local": "orange", 
            "Intercity": "green", 
            "Intercity Cache Creek": "black",
            "Davis Express": "red", 
            "Woodland Express": "orange", 
            "Memorial Union": "#58BFB9",
            "Silo": "#4375E0",
            "Davis High & Junior High": "#C276C4"
        };

        return L.geoJson(data, {
            pointToLayer: function (feature, latlng) {
                // Bus stops
                if (fileName.includes('Stops')) {
                    const stopName = feature.properties.stop_name || feature.properties.name || "Stop";
                    const marker = L.marker(latlng, { icon: busStopIcon });

                    marker.bindPopup(stopName, { autoPan: false });
                    marker.on('click', event => onMapClick(event));
                    marker.on('mouseover', () => marker.openPopup());
                    marker.on('mouseout', () => marker.closePopup());
                    marker._isBusStop = true;

                    return marker;
                }
                
                // All other points are POIs
                let color = categoryColors[fileName];

                return L.circleMarker(latlng, {
                    radius: 6,
                    fillColor: color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            style: function (feature) {
                let color = "pink";
                var category = fileName.split(" ")[1];
                
                if (fileName == "Yolobus Service Area") color = "lightblue";
                else if (category && (category in categoryColors)) color = categoryColors[category];

                for (const [routeType, routeIds] of Object.entries(routeTypes)) {
                    if (routeIds.includes(fileName)) {
                        color = routeColors[routeType];
                        break;
                    }
                }

                return {
                    color: color,
                    fillColor: color,
                    opacity: 0.8,
                    fillOpacity: 0.3,
                    weight: 3
                };
            },

            onEachFeature: function (feature, layer) {
                if (layer._isBusStop) return;
                if (fileName == 'Yolo County Boundary') return;
                
                const name = feature.properties.name || feature.properties.NAME;
                const type = feature.properties.fclass || feature.properties.type || "";
                const popupContent = name ? `<strong>${name}</strong><br>${type}` : `<strong>${fileName}</strong>`;
            
                layer.bindPopup(popupContent, { autoPan: false });
                layer.on('click', event => onMapClick(event));
                layer.on('mouseover', e => layer.openPopup(e.latlng));
                layer.on('mouseout', () => layer.closePopup());
            }
        });
    } catch (e) {
        console.error("Error creating GeoJSON layer:", e);
        return L.layerGroup();
    }
}

async function addBoundaries() {
    const yoloBoundaryLeaflet = await createGeoJson("../../geojson/Boundary Layers/Yolo County Boundary.geojson", "Yolo County Boundary");
    const serviceAreaLeaflet = await createGeoJson("../../geojson/Boundary Layers/Yolobus Service Area.geojson", "Yolobus Service Area");
    yoloBoundaryLeaflet.id = 'yoloCountyBoundary';
    serviceAreaLeaflet.id = 'yolobusServiceArea';

    var borders = L.layerGroup([yoloBoundaryLeaflet, serviceAreaLeaflet]);
    return borders; 
}


/**
 * Convert a GTFS ZIP File object to GeoJSONs.
 * @param {File|ArrayBuffer} gtfsFile - GTFS ZIP as File or ArrayBuffer
 * @returns {Promise<{stopsGeoJSON: object, routesGeoJSONs: Map<string, object>}>}
 */
async function gtfsZipToGeoJSON(gtfsFile) {
    // Read ArrayBuffer if input is a File
    let data;
    if (typeof gtfsFile === "string") {
        // fetch URL
        const response = await fetch(gtfsFile);
        if (!response.ok) throw new Error(`Failed to fetch GTFS zip: ${gtfsFile}`);
        data = await response.arrayBuffer();
    } else if (gtfsFile instanceof ArrayBuffer) {
        data = gtfsFile;
    } else {
        throw new Error("Input must be a string URL or ArrayBuffer");
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

async function addTransitData(gtfsFile, agencyName, busStopMarker) {
    const { stopsGeoJSON: stops, routesGeoJSONs: routes } = await gtfsZipToGeoJSON(gtfsFile);
    
    var stopsLayer = await createGeoJson(stops, `${agencyName} Stops`, busStopMarker);
    stopsLayer.id = 'stops';

    const routeLayers = [];
    for (const [routeId, route] of routes.entries()) {
        const layer = await createGeoJson(route, routeId);
        // const layer = await createGeoJson(route, `${agencyName} Route ${routeId}`);
        layer.id = routeId;
        routeLayers.push(layer);
    }

    // Combine stops + routes for each agency
    const agencyData = L.layerGroup([stopsLayer, ...routeLayers]);
    
    return agencyData;
}

// Add Disadvantaged Communities layer (shapefile to GeoJSON)
async function addCalEnviroScreen() {
    var calEnviroScreen = await createGeoJson("../../shapefiles/calenviroscreen40shpf2021shp.zip", "CalEnviroScreen");
    // const geojson = shp("../../shapefiles/CalEnviroScreen40-2021shp.zip");
    // console.log(geojson);
    // var calEnviroScreen =  L.geoJson(geojson);

    return calEnviroScreen;
}

// By county
async function addYoloPOIs() {
    const categories = [
        "Arts_Entertainment",
        "Education",
        "Employment",
        "Healthcare",
        "Public_Social_Services",
        "Residential",
        "Retail",
        "Tourism",
        "Travel"
    ];

    const layers = [];

    for (const category of categories) {
        const layer = await createGeoJson(
            `../../geojson/Yolo County Points of Interest/${category}.geojson`,
            `Yolo ${category}`
        );
        layer.id = `yolo${category}`;
        layers.push(layer);
    }
    return L.layerGroup(layers);
}

async function addSacPOIs() {
    const categories = [
        "Arts_Entertainment",
        "Education",
        "Employment",
        "Healthcare",
        "Public_Social_Services",
        "Residential",
        "Retail",
        "Tourism",
        "Travel"
    ];

    const layers = [];

    for (const category of categories) {
        const layer = await createGeoJson(
            `../../geojson/Sacramento County Points of Interest/${category}.geojson`,
            `Sac ${category}`
        );
        layer.id = `sac${category}`;
        layers.push(layer);
    }

    return L.layerGroup(layers);
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