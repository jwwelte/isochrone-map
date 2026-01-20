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

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for all async layers to load before initializing map
    const [
        borders, busStops, routes, yoloPOIs, sacPOIs, 
        artsEntertainment, education, employment, healthcare, 
        publicSocialServices, residential, retail, tourism, travel
    ] = await Promise.all([
        addBoundaries(),
        addBusStops(),
        addRoutes(),
        addYoloPOIs(),
        addSacPOIs(),
        addArtsEntertainment(),
        addEducation(),
        addEmployment(),
        addHealthcare(),
        addPublicSocialServices(),
        addResidential(),
        addRetail(),
        addTourism(),
        addTravel()
    ]);

    initializeMap(borders, busStops, routes, yoloPOIs, sacPOIs, artsEntertainment, education, employment, healthcare, publicSocialServices, residential, retail, tourism, travel);
    // document.getElementById("loader").remove();
    document.getElementById("loader").style.display = 'none';
    setupEventListeners();
});

function initializeMap(borders, busStops, routes, yoloPOIs, sacPOIs, artsEntertainment, education, employment, healthcare, publicSocialServices, residential, retail, tourism, travel) {
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
        div.innerHTML += '<i class="icon" style="background-image: url(https://d30y9cdsu7xlg0.cloudfront.net/png/194515-200.png); background-repeat: no-repeat;"></i><span>Yolobus Service Area</span><br>';
        return div;
    };
    legend.addTo(map);

    // json object for layer switcher control basemaps
    var baseMaps = {
        "Geoapify": geoapify
    };

    var overlayMaps = {
        "Borders": borders,
        "Stops": busStops,
        "Routes": routes,
        "Arts & Entertainment": artsEntertainment,
        "Education": education,
        "Employment": employment,
        "Healthcare": healthcare,
        "Public & Social Services": publicSocialServices,
        "Residential": residential,
        "Retail": retail,
        "Tourism": tourism,
        "Travel": travel
    };
    // Add layer groups to layer switcher control
    var layerControl = L.control.layers(baseMaps, overlayMaps).addTo(map);
    console.log(layerControl);
    
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
                else if (name == "138EB" || name == "138WB" || name == "215EB" || name == "215WB") color = "black";
                else if (name == "43AM" || name == "43PM" || name == "43RAM" || name == "43RPM" || name == "44AM" || name == "44PM" || name == "230AM" || name == "230PM") color = "red";
                else if (name == "45AM" || name == "45PM") color = "orange";

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
            }
        });
    } catch (e) {
        console.error("Error creating GeoJSON layer:", e);
        return L.layerGroup();
    }
}

function addBoundaries() {
    return new Promise(async (resolve) => {
        const yoloBoundaryLeaflet = await createGeoJson("../geojson/Boundary Layers/Yolo County Boundary.geojson");
        const serviceAreaLeaflet = await createGeoJson("../geojson/Boundary Layers/Yolobus Service Area.geojson");
        resolve(L.layerGroup([yoloBoundaryLeaflet, serviceAreaLeaflet]));
    });
}

function addBusStops() {
    return new Promise(async (resolve) => {
        try {
            const response = await fetch('../gtfs/Yolobus GTFS/stops.txt');
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status}`);
                resolve(L.layerGroup());
                return;
            }
            const text = await response.text();
            const lines = text.split('\n');
            let busStops = [];

            // Skip header
            for (var i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                let parts = splitByCommaNotInParentheses(lines[i]);
                if (parts.length < 6) continue;

                let stopName = parts[2];
                let stopLat = parseFloat(parts[4]);
                let stopLon = parseFloat(parts[5]);

                if (isNaN(stopLat) || isNaN(stopLon)) continue;

                const busStopIcon = new L.Icon({
                    iconUrl: '../assets/images/yolobus-bus-stop.png',
                    iconSize: [15, 15],
                    iconAnchor: [7.5, 7.5],
                    popupAnchor: [0, 0]
                });

                busStops.push(L.marker([stopLat, stopLon], {
                    icon: busStopIcon
                }).bindPopup(stopName, { autoPan: false }));
            }
            for (let stop of busStops) {
                stop.on('click', function(event) {
                    onMapClick(event);
                });
                stop.on('mouseover', function() {
                    stop.openPopup();
                });
                stop.on('mouseout', function() {
                    stop.closePopup();
                });
            }

            resolve(L.layerGroup(busStops));
        } catch (error) {
            console.error('Error loading bus stops:', error);
            resolve(L.layerGroup());
        }
    });
}

async function addRoutes() {
    var rt37 = await createGeoJson("../geojson/Routes/West Sacramento Local/RT37.geojson");
    var rt40 = await createGeoJson("../geojson/Routes/West Sacramento Local/RT40.geojson");
    var rt41 = await createGeoJson("../geojson/Routes/West Sacramento Local/RT41.geojson");
    var rt240 = await createGeoJson("../geojson/Routes/West Sacramento Local/RT240.geojson");

    var rt211 = await createGeoJson("../geojson/Routes/Woodland Local/RT211.geojson");
    var rt212 = await createGeoJson("../geojson/Routes/Woodland Local/RT212.geojson");

    var rt42A = await createGeoJson("../geojson/Routes/Intercity/RT42A.geojson");
    var rt42B = await createGeoJson("../geojson/Routes/Intercity/RT42B.geojson");
    var rt138EB = await createGeoJson("../geojson/Routes/Intercity/RT138EB.geojson");
    var rt138WB = await createGeoJson("../geojson/Routes/Intercity/RT138WB.geojson");
    var rt215EB = await createGeoJson("../geojson/Routes/Intercity/RT215EB.geojson");
    var rt215WB = await createGeoJson("../geojson/Routes/Intercity/RT215WB.geojson");

    var rt43AM = await createGeoJson("../geojson/Routes/Davis Express/RT43AM.geojson");
    var rt43PM = await createGeoJson("../geojson/Routes/Davis Express/RT43PM.geojson");
    var rt43RAM = await createGeoJson("../geojson/Routes/Davis Express/RT43RAM.geojson");
    var rt43RPM = await createGeoJson("../geojson/Routes/Davis Express/RT43RPM.geojson");
    var rt44AM = await createGeoJson("../geojson/Routes/Davis Express/RT44AM.geojson");
    var rt44PM = await createGeoJson("../geojson/Routes/Davis Express/RT44PM.geojson");
    var rt230AM = await createGeoJson("../geojson/Routes/Davis Express/RT230AM.geojson");
    var rt230PM = await createGeoJson("../geojson/Routes/Davis Express/RT230PM.geojson");

    var rt45AM = await createGeoJson("../geojson/Routes/Woodland Express/RT45AM.geojson");
    var rt45PM = await createGeoJson("../geojson/Routes/Woodland Express/RT45PM.geojson");

    var routes = L.layerGroup([rt37, rt40, rt41, rt240, rt211, rt212, rt42A, rt42B, rt138EB, rt138WB, rt215EB, rt215WB, rt43AM, rt43PM, rt43RAM, rt43RPM, rt44AM, rt44PM, rt230AM, rt230PM, rt45AM, rt45PM]);
    return routes;
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

// By county
async function addYoloPOIs() {
    var yoloArtsEntertainment = await createGeoJson("../geojson/Yolo County Points of Interest/Arts_Entertainment.geojson");
    var yoloEducation = await createGeoJson("../geojson/Yolo County Points of Interest/Education.geojson");
    var yoloEmployment = await createGeoJson("../geojson/Yolo County Points of Interest/Employment.geojson");
    var yoloHealthcare = await createGeoJson("../geojson/Yolo County Points of Interest/Healthcare.geojson");
    var yoloPublicSocialServices = await createGeoJson("../geojson/Yolo County Points of Interest/Public_Social_Services.geojson");
    var yoloResidential = await createGeoJson("../geojson/Yolo County Points of Interest/Residential.geojson");
    var yoloRetail = await createGeoJson("../geojson/Yolo County Points of Interest/Retail.geojson");
    var yoloTourism = await createGeoJson("../geojson/Yolo County Points of Interest/Tourism.geojson");
    var yoloTravel = await createGeoJson("../geojson/Yolo County Points of Interest/Travel.geojson");
    var yoloPOIs = L.layerGroup([yoloArtsEntertainment, yoloEducation, yoloEmployment, yoloHealthcare, yoloPublicSocialServices, yoloResidential, yoloRetail, yoloTourism, yoloTravel]);
    return yoloPOIs;
}

async function addSacPOIs() {
    var sacArtsEntertainment = await createGeoJson("../geojson/Sacramento County Points of Interest/Arts_Entertainment.geojson");
    var sacEducation = await createGeoJson("../geojson/Sacramento County Points of Interest/Education.geojson");
    var sacEmployment = await createGeoJson("../geojson/Sacramento County Points of Interest/Employment.geojson");
    var sacHealthcare = await createGeoJson("../geojson/Sacramento County Points of Interest/Healthcare.geojson");
    var sacPublicSocialServices = await createGeoJson("../geojson/Sacramento County Points of Interest/Public_Social_Services.geojson");
    var sacResidential = await createGeoJson("../geojson/Sacramento County Points of Interest/Residential.geojson");
    var sacRetail = await createGeoJson("../geojson/Sacramento County Points of Interest/Retail.geojson");
    var sacTourism = await createGeoJson("../geojson/Sacramento County Points of Interest/Tourism.geojson");
    var sacTravel = await createGeoJson("../geojson/Sacramento County Points of Interest/Travel.geojson");
    var sacPOIs = L.layerGroup([sacArtsEntertainment, sacEducation, sacEmployment, sacHealthcare, sacPublicSocialServices, sacResidential, sacRetail, sacTourism, sacTravel]);
    return sacPOIs;
}

// By category
async function addArtsEntertainment() {
    var yoloArtsEntertainment = await createGeoJson("../geojson/Yolo County Points of Interest/Arts_Entertainment.geojson");
    var sacArtsEntertainment = await createGeoJson("../geojson/Sacramento County Points of Interest/Arts_Entertainment.geojson");
    var artsEntertainment = L.layerGroup([yoloArtsEntertainment, sacArtsEntertainment]);
    return artsEntertainment;
}

async function addEducation() {
    var yoloEducation = await createGeoJson("../geojson/Yolo County Points of Interest/Education.geojson");
    var sacEducation = await createGeoJson("../geojson/Sacramento County Points of Interest/Education.geojson");
    var education = L.layerGroup([yoloEducation, sacEducation]);
    return education;
}

async function addEmployment() {
    var yoloEmployment = await createGeoJson("../geojson/Yolo County Points of Interest/Employment.geojson");
    var sacEmployment = await createGeoJson("../geojson/Sacramento County Points of Interest/Employment.geojson");
    var employment = L.layerGroup([yoloEmployment, sacEmployment]);
    return employment;
}

async function addHealthcare() {
    var yoloHealthcare = await createGeoJson("../geojson/Yolo County Points of Interest/Healthcare.geojson");
    var sacHealthcare = await createGeoJson("../geojson/Sacramento County Points of Interest/Healthcare.geojson");
    var healthcare = L.layerGroup([yoloHealthcare, sacHealthcare]);
    return healthcare;
}

async function addPublicSocialServices() {
    var yoloPublicSocialServices = await createGeoJson("../geojson/Yolo County Points of Interest/Public_Social_Services.geojson");
    var sacPublicSocialServices = await createGeoJson("../geojson/Sacramento County Points of Interest/Public_Social_Services.geojson");
    var publicSocialServices = L.layerGroup([yoloPublicSocialServices, sacPublicSocialServices]);
    return publicSocialServices;
}

async function addResidential() {
    var yoloResidential = await createGeoJson("../geojson/Yolo County Points of Interest/Residential.geojson");
    var sacResidential = await createGeoJson("../geojson/Sacramento County Points of Interest/Residential.geojson");
    var residential = L.layerGroup([yoloResidential, sacResidential]);
    return residential;
}

async function addRetail() {
    var yoloRetail = await createGeoJson("../geojson/Yolo County Points of Interest/Retail.geojson");
    var sacRetail = await createGeoJson("../geojson/Sacramento County Points of Interest/Retail.geojson");
    var retail = L.layerGroup([yoloRetail, sacRetail]);
    return retail;
}

async function addTourism() {
    var yoloTourism = await createGeoJson("../geojson/Yolo County Points of Interest/Tourism.geojson");
    var sacTourism = await createGeoJson("../geojson/Sacramento County Points of Interest/Tourism.geojson");
    var tourism = L.layerGroup([yoloTourism, sacTourism]);
    return tourism;
}
    
async function addTravel() {
    var yoloTravel = await createGeoJson("../geojson/Yolo County Points of Interest/Travel.geojson");
    var sacTravel = await createGeoJson("../geojson/Sacramento County Points of Interest/Travel.geojson");
    var travel = L.layerGroup([yoloTravel, sacTravel]);
    return travel;
}


// function toggleCounty(checkbox, county) {
//     const label = document.querySelector(`label[for="${checkbox.id}"]`);
//     var layers = {
//         Yolo: [yoloArtsEntertainment, yoloEducation, yoloEmployment, yoloHealthcare, yoloPublicSocialServices, yoloResidential, yoloRetail, yoloTourism, yoloTravel],
//         Sacramento: [sacArtsEntertainment, sacEducation, sacEmployment, sacHealthcare, sacPublicSocialServices, sacResidential, sacRetail, sacTourism, sacTravel]
//     };
//     console.log("showing POIs for county: ", county);
//     console.log("label: ", label);
//     if (checkbox.checked) {
//         console.log("checked: ", county, checkbox.checked);
//         addPOIsByCounty(county);
//         label.classList.add("selected");
//     } else {
//         console.log("unchecked: ", county, checkbox.checked);
//         console.log(layers, layers[county]);
//         for (const layer of layers[county]) {
//             // map.removeLayer(layer);
//             layer.properties.hide();
//         }
//         label.classList.remove("selected");
//     }
// }

// function togglePOIs(checkbox, category) {
//     console.log("showing POIs for category: ", category);
//     const label = document.querySelector(`label[for="${checkbox.id}"]`);
//     const yoloLabel = document.querySelector(`label[for="yolo-county"]`);
//     const sacLabel = document.querySelector(`label[for="sacramento-county"]`);
//     var layers = {
//         ArtsEntertainment: [yoloArtsEntertainment, sacArtsEntertainment],
//         Education: [yoloEducation, sacEducation],
//         Employment: [yoloEmployment, sacEmployment],
//         Healthcare: [yoloHealthcare, sacHealthcare],
//         PublicSocialServices: [yoloPublicSocialServices, sacPublicSocialServices],
//         Residential: [yoloResidential, sacResidential],
//         Retail: [yoloRetail, sacRetail],
//         Tourism: [yoloTourism, sacTourism],
//         Travel: [yoloTravel, sacTravel]
//     };

//     if (yoloLabel.classList.contains("selected") || sacLabel.classList.contains("selected")) {
//         if (checkbox.checked) {
//             console.log("checked: ", category, checkbox.checked);
//             label.classList.add("selected");
//             if (yoloLabel.classList.contains("selected")) addYoloPOIsByCategory(category);
//             else addSacPOIsByCategory(category);
//         } else {
//             console.log("unchecked: ", category, checkbox.checked);
//             for (const layer of layers[category]) {
//                 // map.removeLayer(layer);
//                 layer.hide();
//             }
//             label.classList.remove("selected");
//         }
//     } else {
//         if (checkbox.checked) {
//             console.log("checked: ", category, checkbox.checked);
//             label.classList.add("selected");
//             addYoloPOIsByCategory(category);
//             addSacPOIsByCategory(category);
//         } else {
//             console.log("unchecked: ", category, checkbox.checked);
//             label.classList.remove("selected");
//             for (const layer of layers[category]) {
//                 // map.removeLayer(layer);
//                 layer.hide();
//             }
//         }
//     }
// }

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

function detectLayerOverlap(layerGroup, isochrone) {
    layerGroup.eachLayer(function (layer) {
        const polygon = layer.toGeoJSON();
        var intersection = turf.intersect(polygon, isochrone);
        if (intersection) {
            console.log("Isochrone overlaps with layer: ", layer);
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


// // second arcGIS map
// require([
//   "esri/Map",
//   "esri/views/MapView",
//   "dojo/domReady!"
// ], function(Map, MapView) {
//   // ESRI JavaScript API Map
//   const esriMap = new Map({
//     basemap: "streets"
//   });

//   const esriMapView = new MapView({
//     container: "map1",
//     map: esriMap,
//     zoom: 10,
//     center: [-118.2437, 34.0522]
//   });

//   // Leaflet Map
//   const leafletMap = L.map('map2').setView([34.0522, -118.2437], 10);
//   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);

//   // Create a linked map event
//   esriMapView.watch("extent", (newExtent) => {
//     const newCenter = esriMapView.center;
//     const newZoom = esriMapView.zoom;
//     leafletMap.setView([newCenter.latitude, newCenter.longitude], newZoom);
//   });

//   leafletMap.on("moveend", () => {
//     const newCenter = leafletMap.getCenter();
//     const newZoom = leafletMap.getZoom();
//     esriMapView.center = [newCenter.lat, newCenter.lng];
//     esriMapView.zoom = newZoom;
//   });
// });

// // Search bar
// const searchControl = L.esri.Geocoding.geosearch({
//     position: "topright",
//     placeholder: "Enter an address or place e.g. 1 York St",
//     useMapBounds: false,

//     // Add provider
//     providers: [
//         L.esri.Geocoding.arcgisOnlineProvider({
//             apikey: apiKey,
//             nearby: {
//                 lat: 0.3556,
//                 lng: 37.5833
//             }
//         })
//     ]

// }).addTo(map);

// searchControl.on("results", (data) => {
//     results.clearLayers();

//     for (let i = data.results.length - 1; i >= 0; i--) {
//         const marker = L.marker(data.results[i].latlng);
//         const lngLatString = `${Math.round(data.results[i].latlng.lng * 100000) / 100000}, ${
//             Math.round(data.results[i].latlng.lat * 100000) / 100000
//         }`;
//         marker.bindPopup(`<b>${lngLatString}</b><p>${data.results[i].properties.LongLabel}</p>`);
//         results.addLayer(marker);
//         marker.openPopup();
//     }

// });