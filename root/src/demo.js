const GEOAPIFY_API_KEY = '08450434409749f7910860bb29eb30bc'; // Replace with your actual API key
const DEFAULT_CENTER = [38.6171, -121.6468]; // (lat, lng for Leaflet)
const DEFAULT_ZOOM = 12;

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
const splitByCommaNotInParentheses = (input) => {
    const regex = /,(?![^()]*\))/g;
    return input.split(regex);
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    addBoundaries();
    addBusStops();
    addRoutes();
    setupEventListeners();
});

function initializeMap() {
    // Initialize Leaflet map
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Add Geoapify tile layer with smart retina detection
    const isRetina = L.Browser.retina;
    const baseUrl = `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`;
    const retinaUrl = `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}@2x.png?apiKey=${GEOAPIFY_API_KEY}`;

    L.tileLayer(isRetina ? retinaUrl : baseUrl, {
        attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> contributors',
        maxZoom: 20,
        tileSize: 256,
        zoomOffset: 0,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 2
    }).addTo(map);

    // Add click event listener to the map
    map.on('click', onMapClick);
}

async function addGeoJson(file) {
    console.log("adding geojson: ", file);
    const response = await fetch(file);
    if (!response.ok) {
        console.error(`Error loading GeoJSON file: ${file}, Status: ${response.status}`);
        return;
    }
    let data = await response.json();
    console.log("data: ", data);

    // If data is in EPSG:3857, project it to EPSG:4326 for Leaflet
    if (data.crs && data.crs.properties && (data.crs.properties.name === "EPSG:3857" || data.crs.properties.name === "urn:ogc:def:crs:EPSG::3857")) {
        console.log("Projecting data from EPSG:3857 to EPSG:4326");
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

    // Style and add GeoJSON to map
    return L.geoJson(data, {
        pointToLayer: function (feature, latlng) {
            // Check if this is a POI based on file path or properties
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
            // POI category based on file path
            if (file.includes("Arts_Entertainment")) color = "#9B5DE5";
            else if (file.includes("Education")) color = "#1982C4";
            else if (file.includes("Employment")) color = "#1A535C";
            else if (file.includes("Healthcare")) color = "#FF6B6B";
            else if (file.includes("Public_Social_Services")) color = "#4ECDC4";
            else if (file.includes("Residential")) color = "#FF9F1C";
            else if (file.includes("Retail")) color = "#FFD93D";
            else if (file.includes("Tourism")) color = "#FF595E";
            else if (file.includes("Travel")) color = "#8AC926";
            // Transit routes
            else if (name == "37" || name == "40" || name == "41" || name == "240") color = "purple";
            else if (name == "211" || name == "212") color = "orange";
            else if (name == "42A" || name == "42B") color = "green";
            else if (name == "138EB" || name == "138WB" || name == "215EB" || name == "215WB") color = "black";
            else if (name == "43AM" || name == "43PM" || name == "43RAM" || name == "43RPM" || name == "44AM" || name == "44PM" || name == "230AM" ||                         name == "230PM") color = "red";
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
            if (name) {
                layer.bindPopup(`<strong>${name}</strong><br>${type}`);
            }
            // Show popup on hover
            layer.on('click', function(event){
                onMapClick(event);
            });
            // Show popup on hover
            layer.on('mouseover', function(){
                layer.openPopup();
            });
            // Hide popup on hover out
            layer.on('mouseout', function(){
                layer.closePopup();
            });
        },
    }).addTo(map);
}

function addBoundaries() {
    // // Add popup to polygon
    // polygon.bindPopup("Example Polygon");

    // // Fit map to polygon bounds
    // map.fitBounds(polygon.getBounds());

    // // Zoom to layer once loaded
    // polygonLayer.on('load', function () {
    // map.fitBounds(polygonLayer.getBounds());
    // });

    // Yolo County Boundaries
    var yoloBoundaryLeaflet = addGeoJson("../layers/Yolo County/Boundaries/Yolo County Boundary.geojson");
    var serviceAreaLeaflet = addGeoJson("../layers/Yolo County/Yolobus Service Area.geojson");
}

function addBusStops() {
    async function loadTextFile() {
      try {
        const response = await fetch('../google_transit/stops.txt');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const stops = await response.text(); // Store in variable
        // console.log('Text file content:', stops);
        return stops; // Return for use elsewhere
      } catch (error) {
        console.error('Error loading text file:', error);
      }
    }
    const stops = loadTextFile();

    // Adds Yolobus stops to map
    for (var i = 1; i < stops.length; i++) {
        let stopID = splitByCommaNotInParentheses(stops[i])[0];
        let stopCode = splitByCommaNotInParentheses(stops[i])[1];
        let stopName = splitByCommaNotInParentheses(stops[i])[2];
        let stopDesc = splitByCommaNotInParentheses(stops[i])[3];
        let stopLat = splitByCommaNotInParentheses(stops[i])[4];
        let stopLon = splitByCommaNotInParentheses(stops[i])[5];
        let locationType = splitByCommaNotInParentheses(stops[i])[6];
        let wheelchairBoarding = splitByCommaNotInParentheses(stops[i])[7];

        const busStop = new L.Icon({
            popup: stopName,
            iconUrl: '../assets/icons/bus_stop_icon.png',
            iconSize: [15, 15], // size of the icon
            iconAnchor: [7.5, 7.5], // point of the icon which will correspond to marker's location
            popupAnchor: [0, 0], // point from which the popup should open relative to the iconAnchor
            fillOpacity: 0.6,
            weight: 2
        });

        L.marker([stopLat, stopLon], {
            icon: busStop
        }).addTo(map).bindPopup(stopName);
        console.log("added stop: ", stopName);
    }
}

async function addRoutes() {
    // Routes
    await addGeoJson("../layers/Routes/West Sacramento Local/RT37.geojson");
    await addGeoJson("../layers/Routes/West Sacramento Local/RT40.geojson");
    await addGeoJson("../layers/Routes/West Sacramento Local/RT41.geojson");
    await addGeoJson("../layers/Routes/West Sacramento Local/RT240.geojson");

    await addGeoJson("../layers/Routes/Woodland Local/RT211.geojson");
    await addGeoJson("../layers/Routes/Woodland Local/RT212.geojson");

    await addGeoJson("../layers/Routes/Intercity/RT42A.geojson");
    await addGeoJson("../layers/Routes/Intercity/RT42B.geojson");
    await addGeoJson("../layers/Routes/Intercity/RT138EB.geojson");
    await addGeoJson("../layers/Routes/Intercity/RT138WB.geojson");
    await addGeoJson("../layers/Routes/Intercity/RT215EB.geojson");
    await addGeoJson("../layers/Routes/Intercity/RT215WB.geojson");

    await addGeoJson("../layers/Routes/Davis Express/RT43AM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT43PM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT43RAM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT43RPM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT44AM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT44PM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT230AM.geojson");
    await addGeoJson("../layers/Routes/Davis Express/RT230PM.geojson");

    await addGeoJson("../layers/Routes/Woodland Express/RT45AM.geojson");
    await addGeoJson("../layers/Routes/Woodland Express/RT45PM.geojson");
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

var yoloArtsEntertainment;
var yoloEducation;
var yoloEmployment;
var yoloHealthcare;
var yoloPublicSocialServices;
var yoloResidential;
var yoloRetail;
var yoloTourism;
var yoloTravel;

var sacArtsEntertainment;
var sacEducation;
var sacEmployment;
var sacHealthcare;
var sacPublicSocialServices;
var sacResidential;
var sacRetail;
var sacTourism;
var sacTravel;

async function addPOIsByCounty(county) {
    if (county == 'Yolo') {
        yoloArtsEntertainment = await addGeoJson("../layers/Yolo County/Points of Interest/Arts_Entertainment_New.geojson");
        yoloEducation = await addGeoJson("../layers/Yolo County/Points of Interest/Education_New.geojson");
        yoloEmployment = await addGeoJson("../layers/Yolo County/Points of Interest/Employment_New.geojson");
        yoloHealthcare = await addGeoJson("../layers/Yolo County/Points of Interest/Healthcare_New.geojson");
        yoloPublicSocialServices = await addGeoJson("../layers/Yolo County/Points of Interest/Public_Social_Services_New.geojson");
        yoloResidential = await addGeoJson("../layers/Yolo County/Points of Interest/Residential_New.geojson");
        yoloRetail = await addGeoJson("../layers/Yolo County/Points of Interest/Retail_New.geojson");
        yoloTourism = await addGeoJson("../layers/Yolo County/Points of Interest/Tourism_New.geojson");
        yoloTravel = await addGeoJson("../layers/Yolo County/Points of Interest/Travel_New.geojson");
    } else {
        sacArtsEntertainment = await addGeoJson("../layers/Sacramento County/Arts_Entertainment_New.geojson");
        sacEducation = await addGeoJson("../layers/Sacramento County/Education_New.geojson");
        sacEmployment = await addGeoJson("../layers/Sacramento County/Employment_New.geojson");
        sacHealthcare = await addGeoJson("../layers/Sacramento County/Healthcare_New.geojson");
        sacPublicSocialServices = await addGeoJson("../layers/Sacramento County/Public_Social_Services_New.geojson");
        sacResidential = await addGeoJson("../layers/Sacramento County/Residential_New.geojson");
        sacRetail = await addGeoJson("../layers/Sacramento County/Retail_New.geojson");
        sacTourism = await addGeoJson("../layers/Sacramento County/Tourism_New.geojson");
        sacTravel = await addGeoJson("../layers/Sacramento County/Travel_New.geojson");
    }
}

async function addYoloPOIsByCategory(category) {
    if (category == 'ArtsEntertainment') {
        yoloArtsEntertainment = await addGeoJson("../layers/Yolo County/Points of Interest/Arts_Entertainment_New.geojson");
    } else if (category == 'Education') {
        yoloEducation = await addGeoJson("../layers/Yolo County/Points of Interest/Education_New.geojson");
    } else if (category == 'Employment') {
        yoloEmployment = await addGeoJson("../layers/Yolo County/Points of Interest/Employment_New.geojson");
    } else if (category == 'Healthcare') {
        yoloHealthcare = await addGeoJson("../layers/Yolo County/Points of Interest/Healthcare_New.geojson");
    } else if (category == 'PublicSocialServices') {
        yoloPublicSocialServices = await addGeoJson("../layers/Yolo County/Points of Interest/Public_Social_Services_New.geojson");
    } else if (category == 'Residential') {
        yoloResidential = await addGeoJson("../layers/Yolo County/Points of Interest/Residential_New.geojson");
    } else if (category == 'Retail') {
        yoloRetail = await addGeoJson("../layers/Yolo County/Points of Interest/Retail_New.geojson");
    } else if (category == 'Tourism') {
        yoloTourism = await addGeoJson("../layers/Yolo County/Points of Interest/Tourism_New.geojson");
    } else {
        yoloTravel = await addGeoJson("../layers/Yolo County/Points of Interest/Travel_New.geojson");
    }
}

async function addSacPOIsByCategory(category) {
    if (category == 'ArtsEntertainment') {
        sacArtsEntertainment = await addGeoJson("../layers/Sacramento County/Arts_Entertainment_New.geojson");
    } else if (category == 'Education') {
        sacEducation = await addGeoJson("../layers/Sacramento County/Education_New.geojson");
    } else if (category == 'Employment') {
        sacEmployment = await addGeoJson("../layers/Sacramento County/Employment_New.geojson");
    } else if (category == 'Healthcare') {
        sacHealthcare = await addGeoJson("../layers/Sacramento County/Healthcare_New.geojson");
    } else if (category == 'PublicSocialServices') {
        sacPublicSocialServices = await addGeoJson("../layers/Sacramento County/Public_Social_Services_New.geojson");
    } else if (category == 'Residential') {
        sacResidential = await addGeoJson("../layers/Sacramento County/Residential_New.geojson");
    } else if (category == 'Retail') {
        sacRetail = await addGeoJson("../layers/Sacramento County/Retail_New.geojson");
    } else if (category == 'Tourism') {
        sacTourism = await addGeoJson("../layers/Sacramento County/Tourism_New.geojson");
    } else {
        sacTravel = await addGeoJson("../layers/Sacramento County/Travel_New.geojson");
    }
}

function toggleCounty(checkbox, county) {
    const label = document.querySelector(`label[for="${checkbox.id}"]`);
    var layers = {
        Yolo: [yoloArtsEntertainment, yoloEducation, yoloEmployment, yoloHealthcare, yoloPublicSocialServices, yoloRetail, yoloTourism, yoloTravel],
        Sacramento: [sacArtsEntertainment, sacEducation, sacEmployment, sacHealthcare, sacPublicSocialServices, sacRetail, sacTourism, sacTravel]
    };
    console.log("showing POIs for county: ", county);
    console.log("label: ", label);
    if (checkbox.checked) {
        console.log("checked: ", county);
        addPOIsByCounty(county);
        label.classList.add("selected");
    } else {
        console.log("unchecked: ", county);
        console.log(layers, layers[county]);
        for (const layer of layers[county]) {
            map.removeLayer(layer);
        }
        label.classList.remove("selected");
    }
}

function togglePOIs(checkbox, category) {
    console.log("showing POIs for category: ", category);
    const label = document.querySelector(`label[for="${checkbox.id}"]`);
    const yoloLabel = document.querySelector(`label[for="yolo-county"]`);
    const sacLabel = document.querySelector(`label[for="sacramento-county"]`);
    var layers = {
        ArtsEntertainment: [yoloArtsEntertainment, sacArtsEntertainment],
        Education: [yoloEducation, sacEducation],
        Employment: [yoloEmployment, sacEmployment],
        Healthcare: [yoloHealthcare, sacHealthcare],
        PublicSocialServices: [yoloPublicSocialServices, sacPublicSocialServices],
        Residential: [yoloResidential, sacResidential],
        Retail: [yoloRetail, sacRetail],
        Tourism: [yoloTourism, sacTourism],
        Travel: [yoloTravel, sacTravel]
    };

    if (yoloLabel.classList.contains("selected") || sacLabel.classList.contains("selected")) {
        // !!! doesn't work because unlike the county if statement which calls addPOIsByCounty(), this doesn't call addPOIsByCategory()
        if (checkbox.checked) {
            console.log("checked: ", category);
            label.classList.add("selected");
            if (yoloLabel.classList.contains("selected")) addYoloPOIsByCategory(category);
            else addSacPOIsByCategory(category);
        } else {
            console.log("unchecked: ", category);
            // map.removeLayer(Object.values(layers[category])[index]);
            label.classList.remove("selected");
        }
    } else {
        if (checkbox.checked) {
            console.log("checked: ", category);
            label.classList.add("selected");
            addYoloPOIsByCategory(category);
            addSacPOIsByCategory(category);
        } else {
            console.log("unchecked: ", category);
            label.classList.remove("selected");
            for (const layer of layers[category]) {
                map.removeLayer(layer);
            }
        }
    }
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