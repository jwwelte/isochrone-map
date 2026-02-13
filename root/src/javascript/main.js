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
const activeLayers = [];
const splitByCommaNotInParentheses = (input) => {
    const regex = /,(?![^()]*\))/g;
    return input.split(regex);
};
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
let info;
let calLegend;
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
};
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
    "Memorial Union": "#4CC8F2",
    "Silo": "#2E3092",
    "Davis High & Junior High": "#C276C4"
};

// Add custom method to L.LayerGroup to get layer by ID
L.LayerGroup.include({
    customGetLayer: function (id) {
        for (var i in this._layers) {
            if (this._layers[i].id === id) {
               return this._layers[i];
            }
        }
    }
});

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for all async layers to load before initializing map
    const [
        borders, yolobus, unitrans, calEnviroScreen, yoloPOIs, sacPOIs
    ] = await Promise.all([
        addBoundaries(),
        addTransitData("/yolobus_gtfs.zip", "Yolobus", "../../assets/images/yolobus-bus-stop.png"),
        addTransitData("/unitrans_gtfs.zip", "Unitrans", "../../assets/images/unitrans-bus-stop.png"),
        addCalEnviroScreen(),
        addYoloPOIs(),
        addSacPOIs()
    ]);

    initializeMap(borders, yolobus, unitrans, calEnviroScreen, yoloPOIs, sacPOIs);
    document.getElementById("loader").style.display = 'none';
    // console.log(map.hasLayer(calEnviroScreen));
    // console.log("CES bounds valid:", calEnviroScreen.getBounds().isValid());
    // console.log("CES bounds:", calEnviroScreen.getBounds());

    setupEventListeners();
});

function initializeMap(borders, yolobus, unitrans, calEnviroScreen, yoloPOIs, sacPOIs) {
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

    map.createPane('calEnviroPane');
    // Set the z-index of the pane to below the default pane
    map.getPane('calEnviroPane').style.zIndex = 400;
    // Allow mouse events on the pane
    map.getPane('calEnviroPane').style.pointerEvents = 'auto';
    map.createPane('topPane');
    // Set the z-index of the pane to above CalEnviroScreen
    map.getPane('topPane').style.zIndex = 450;
    map.getPane('topPane').style.pointerEvents = 'auto';
    

    // Add scale to map
    L.control.scale({
        maxWidth: 200,
        metric: true,
        imperial: true,
        position: 'bottomright'
    }).addTo(map);

    // Add legend to map
    yolobusLegend = L.control({ position: "bottomleft" });
    yolobusLegend.onAdd = function(map) {
        var div = L.DomUtil.create("div", "legend");
        div.innerHTML += "<h4>Yolobus Routes</h4>";
        div.innerHTML += '<i style="background: purple;"></i><span>West Sacramento Local</span><br>';
        div.innerHTML += '<i style="background: orange;"></i><span>Woodland Local/Express</span><br>';
        div.innerHTML += '<i style="background: green; width: 9px; margin: 0;"></i><i style="background: black; width: 9px;"></i><span>Intercity</span><br>';
        div.innerHTML += '<i style="background: red;"></i><span>Davis Express</span><br>';
        // Allow scrolling inside legend on mobile
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
    };

    const unitransLegend = L.control({ position: 'bottomleft' });
    unitransLegend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML += "<h4>Unitrans Routes</h4>";
        div.innerHTML += '<i style="background: #4CC8F2;"></i><span>Memorial Union</span><br>';
        div.innerHTML += '<i style="background: #2E3092;"></i><span>Silo</span><br>';
        div.innerHTML += '<i style="background: #C276C4;"></i><span>Davis High & Junior High</span><br>';
        // Allow scrolling inside legend on mobile
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
    };

    const agencyLegends = {
        yolobus: yolobusLegend,
        unitrans: unitransLegend
    };

    // Check if any routes from an agency are active
    function anyAgencyRoutesActive(agency) {
        // agency.routes is an array of route layers
        return agency.routes.some(layer => map.hasLayer(layer));
    }

    // Update agency legend based on layer visibility
    function updateAgencyLegend(agency, legend) {
        if (anyAgencyRoutesActive(agency)) {
            legend.addTo(map);
        } else {
            map.removeControl(legend);
        }
    }

    // Listen for layer changes
    map.on('overlayadd overlayremove', function () {
        updateAgencyLegend(yolobus, agencyLegends.yolobus);
        updateAgencyLegend(unitrans, agencyLegends.unitrans);
    });

    // Initial legend visibility
    updateAgencyLegend(yolobus, agencyLegends.yolobus);
    updateAgencyLegend(unitrans, agencyLegends.unitrans);

    // CalEnviroScreen legend
    calLegend = L.control(
        { opacity: 1,
         fillOpacity: 1,
         position: 'bottomright' }
    );
    calLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'legend'),
            labels = [">90 - 100 (Highest Scores)", ">80 - 90", ">70 - 80", ">60 - 70", ">50 - 60", ">40 - 50", ">30 - 40", ">20 - 30", ">10 - 20", "0 - 10 (Lowest Scores)"];
            colors = ['#F06F5C', '#F29262', '#F4B169', '#F8CD71', '#FDF07B', '#E9F079', '#BFD26E', '#99B863', '#7B9F5A', '#5E8751'];
        div.style.width = '200px';
        div.innerHTML = `<h4>CalEnviroScreen Percentile</h4>`;
        // loop through intervals and generate a label with a colored square for each interval
        for (var i = 0; i < labels.length; i++) {
            div.innerHTML += `<i style="background: ${colors[i]};"></i><span>${labels[i]}</span><br>`;
        }
        // Allow scrolling inside legend on mobile
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
    };

    // Add fullscreen button to map
    map.addControl(new L.Control.FullScreen());

    info = L.control({ position: 'topleft' });
    info.onAdd = function(map) {
        this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
        this.update();
        return this._div;
    };
    // method that we will use to update the control based on feature properties passed
    info.update = function(props) {
        this._div.innerHTML = `
            <h4>CalEnviroScreen</h4>
            ${props
                ? `<b>Tract:</b> ${props.Tract}<br/>
                   <b>Population:</b> ${props.TotPop19?.toLocaleString()}<br/>
                   <b>Percentile:</b> ${props.CIscoreP?.toFixed(1)}`
                : 'Hover over a census tract'}
        `;
    };

    map.on('overlayadd', function (e) {
        if (e.layer === calEnviroScreen) {
            info.addTo(map);
            calLegend.addTo(map);
            layerControl.getContainer().classList.add('legend-open');
        }
        listActiveLayers(e.layer);
    });

    map.on('overlayremove', function (e) {
        if (e.layer === calEnviroScreen) {
            map.removeControl(info);
            map.removeControl(calLegend);
            layerControl.getContainer.classList.remove('legend-open');
        }
        removeInactiveLayers(e.layer);
        if (activeLayers.length == 0) {
            hideTable();
        }
    });

    function getRouteLayer(agency, id) {
        return agency.routes.find(r => r.id === id);
    }
    
    // JSON object for layer control basemap
    var baseMap = {
        "Geoapify Base Map": geoapify
    };
    
    var overlaysTree = {
        label: "LAYERS",
        selectAllCheckbox: "Un/select all",
        children: [
            {
                label: "BORDERS",
                selectAllCheckbox: "Un/select all",
                children: [
                    { label: "Yolobus Service Area", layer: borders.customGetLayer('yolobusServiceArea') },
                    { label: "Yolo County Border", layer: borders.customGetLayer('yoloCountyBoundary') }
                ]
            }, {
                label: "STOPS",
                    selectAllCheckbox: "Un/select all",
                    children: [
                        { label: "Yolobus", layer: yolobus.stops },
                        { label: "Unitrans", layer: unitrans.stops }
                    ]
            }, {
                label: "ROUTES",
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
                                    { label: "37", layer: getRouteLayer(yolobus, '37') },
                                    { label: "40", layer: getRouteLayer(yolobus, '40') },
                                    { label: "41", layer: getRouteLayer(yolobus, '41') },
                                    { label: "240", layer: getRouteLayer(yolobus, '240') }
                                ]
                            }, {
                                label: "Woodland Local",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "211", layer: getRouteLayer(yolobus, '211') },
                                    { label: "212", layer: getRouteLayer(yolobus, '212') }
                                ]
                            }, {
                                label: "Intercity",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "42A", layer: getRouteLayer(yolobus, '42A') },
                                    { label: "42B", layer: getRouteLayer(yolobus, '42B') },
                                    { label: "138", layer: getRouteLayer(yolobus, '138') },
                                    { label: "215", layer: getRouteLayer(yolobus, '215') }
                                ]
                            }, {
                                label: "Davis Express",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "43", layer: getRouteLayer(yolobus, '43') },
                                    { label: "43R", layer: getRouteLayer(yolobus, '43R') },
                                    { label: "44", layer: getRouteLayer(yolobus, '44') },
                                    { label: "230", layer: getRouteLayer(yolobus, '230') }
                                ]
                            }, {
                                label: "Woodland Express",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "45", layer: getRouteLayer(yolobus, '45') }
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
                                    { label: "A", layer: getRouteLayer(unitrans, 'A') },
                                    { label: "B", layer: getRouteLayer(unitrans, 'B') },
                                    { label: "E", layer: getRouteLayer(unitrans, 'E') },
                                    { label: "F", layer: getRouteLayer(unitrans, 'F') },
                                    { label: "G", layer: getRouteLayer(unitrans, 'G') },
                                    { label: "K", layer: getRouteLayer(unitrans, 'K') },
                                    { label: "M", layer: getRouteLayer(unitrans, 'M') },
                                    { label: "O", layer: getRouteLayer(unitrans, 'O') },
                                    { label: "P", layer: getRouteLayer(unitrans, 'P') },
                                    { label: "Q", layer: getRouteLayer(unitrans, 'Q') },
                                    { label: "U", layer: getRouteLayer(unitrans, 'U') },
                                    { label: "FMS", layer: getRouteLayer(unitrans, 'FMS') }
                                ]
                            }, {
                                label: "Silo",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "C", layer: getRouteLayer(unitrans, 'C') },
                                    { label: "D", layer: getRouteLayer(unitrans, 'D') },
                                    { label: "J", layer: getRouteLayer(unitrans, 'J') },
                                    { label: "L", layer: getRouteLayer(unitrans, 'L') },
                                    { label: "V", layer: getRouteLayer(unitrans, 'V') },
                                    { label: "VL", layer: getRouteLayer(unitrans, 'VL') },
                                    { label: "VX", layer: getRouteLayer(unitrans, 'VX') },
                                    { label: "W", layer: getRouteLayer(unitrans, 'W') },
                                    { label: "Z", layer: getRouteLayer(unitrans, 'Z') }
                                ]
                            }, {
                                label: "Davis High & Junior High",
                                selectAllCheckbox: true,
                                children: [
                                    { label: "T", layer: getRouteLayer(unitrans, 'T') }
                                ]
                            }
                        ]
                    }
                ]
            }, {
                label: "POINTS OF INTEREST",
                selectAllCheckbox: "Un/select all",
                children: [
                    {
                        label: "Yolo County",
                        selectAllCheckbox: true,
                        children: [
                            { label: "Arts & Entertainment", 
                             layer: yoloPOIs.customGetLayer('yoloArts_Entertainment') },
                            { label: "Education", layer: yoloPOIs.customGetLayer('yoloEducation') },
                            { label: "Employment", layer: yoloPOIs.customGetLayer('yoloEmployment') },
                            { label: "Healthcare", layer: yoloPOIs.customGetLayer('yoloHealthcare') },
                            { label: "Public & Social Services", 
                             layer: yoloPOIs.customGetLayer('yoloPublic_Social_Services') },
                            { label: "Residential", layer: yoloPOIs.customGetLayer('yoloResidential') },
                            { label: "Retail", layer: yoloPOIs.customGetLayer('yoloRetail') },
                            { label: "Tourism", layer: yoloPOIs.customGetLayer('yoloTourism') },
                            { label: "Travel", layer: yoloPOIs.customGetLayer('yoloTravel') }
                        ]
                    }, {
                        label: "Sacramento County",
                        selectAllCheckbox: true,
                        children: [
                            { label: "Arts & Entertainment", 
                             layer: sacPOIs.customGetLayer('sacArts_Entertainment') },
                            { label: "Education", layer: sacPOIs.customGetLayer('sacEducation') },
                            { label: "Employment", layer: sacPOIs.customGetLayer('sacEmployment') },
                            { label: "Healthcare", layer: sacPOIs.customGetLayer('sacHealthcare') },
                            { label: "Public & Social Services", 
                             layer: sacPOIs.customGetLayer('sacPublic_Social_Services') },
                            { label: "Residential", layer: sacPOIs.customGetLayer('sacResidential') },
                            { label: "Retail", layer: sacPOIs.customGetLayer('sacRetail') },
                            { label: "Tourism", layer: sacPOIs.customGetLayer('sacTourism') },
                            { label: "Travel", layer: sacPOIs.customGetLayer('sacTravel') }
                        ]
                    }
                ]
            }, { label: "CalEnviroScreen", layer: calEnviroScreen }
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

    // Set max-height dynamically
    function adjustLayersControlHeight() {
        const controlPanel = document.querySelector('.leaflet-control-layers-list');
        if (!controlPanel) return;
        const legendVisible = calEnviroScreen && map.hasLayer(calEnviroScreen);
        if (window.innerWidth <= 768) {
            controlPanel.style.maxHeight = legendVisible ? '200px' : '300px';
        } else {
            controlPanel.style.height = legendVisible ? '320px' : 'auto';
            controlPanel.style.maxHeight = legendVisible ? '320px' : '640px';
            controlPanel.style.overflowY = 'auto';
        }
    }
    window.addEventListener('resize', adjustLayersControlHeight);
    // Call after expanding/collapsing layers
    map.on('overlayadd overlayremove', adjustLayersControlHeight);
    map.on('layeradd layerremove', adjustLayersControlHeight);
    adjustLayersControlHeight();
    
    // Add click event listener to the map
    map.on('click', onMapClick);
}

// Create GeoJSON layers
async function createGeoJson(file, fileName, busStopMarker = "", agencyName = null) {
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


        if (fileName !== "CalEnviroScreen" && fileName !== "Yolobus Service Area") {
            // Detect Web Mercator (meters, not degrees)
            const looksLike3857 = (coord) =>
                Array.isArray(coord) &&
                (Math.abs(coord[0]) > 200000 || Math.abs(coord[1]) > 200000);

            // Safely get first coordinate (works for MultiPolygon)
            const getFirstCoord = (geom) => {
                let c = geom.coordinates;
                while (Array.isArray(c[0])) c = c[0];
                return c;
            };

            const firstFeature = data.features?.[0];
            const firstCoord = firstFeature?.geometry ? getFirstCoord(firstFeature.geometry) : null;

            if (firstCoord && looksLike3857(firstCoord)) {
                console.log(`Reprojecting ${fileName} from EPSG:3857 → EPSG:4326`);

                const transformCoords = (coords) => {
                    if (typeof coords[0] === 'number') {
                        return proj4("EPSG:3857", "EPSG:4326", coords);
                    }
                    return coords.map(transformCoords);
                };

                data.features.forEach(feature => {
                    if (feature.geometry?.coordinates) {
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

        let layerGroup;
        layerGroup = L.geoJson(data, {
            pane: fileName === "CalEnviroScreen" ? 'calEnviroPane' : 'topPane',
            pointToLayer: function (feature, latlng) {
                // Bus stops
                if (fileName.includes('Stops')) {
                    const stopName = feature.properties.stop_name || feature.properties.name;
                    const popupContent = (stopName && agencyName) ? 
                        `<strong>${agencyName}: ${stopName}</strong>` : 
                        agencyName ? `<strong>${agencyName} Stop</strong>` : 
                        `<strong>${stopName}</strong>`;
                    const marker = L.marker(latlng, { icon: busStopIcon });

                    marker.bindPopup(popupContent, { autoPan: false });
                    marker.on('click', event => onMapClick(event));
                    marker.on('mouseover', () => marker.openPopup());
                    marker.on('mouseout', () => marker.closePopup());
                    marker._isBusStop = true;

                    return marker;
                }
                
                // All other points are POIs
                // Set color property based on category
                let color = categoryColors[fileName.split(" ")[1]];
                feature.properties.color = color;
                // Set category property
                if (fileName.split(" ")[1] === "Arts_Entertainment") {
                    feature.properties.category = "Arts & Entertainment";
                } else if (fileName.split(" ")[1] === "Public_Social_Services") {
                    feature.properties.category = "Public & Social Services";
                } else {
                    feature.properties.category = fileName.split(" ")[1];
                }

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
                let opacity = 0.8;
                let fillOpacity = 0.3;
                var category = fileName.split(" ")[1];
                
                if (fileName == "Yolobus Service Area") color = "lightblue";
                else if (category && (category in categoryColors)) color = categoryColors[category];

                for (const [routeType, routeIds] of Object.entries(routeTypes)) {
                    if (routeIds.includes(fileName)) {
                        color = routeColors[routeType];
                        break;
                    }
                }
                if (fileName == "CalEnviroScreen") {
                    // Set color based on CI score percentile value
                    color =
                        feature.properties.CIscoreP > 90 ? '#F06F5C' :
                        feature.properties.CIscoreP > 80 ? '#F29262' :
                        feature.properties.CIscoreP > 70 ? '#F4B169' :
                        feature.properties.CIscoreP > 60 ? '#F8CD71' :
                        feature.properties.CIscoreP > 50 ? '#FDF07B' :
                        feature.properties.CIscoreP > 40 ? '#E9F079' :
                        feature.properties.CIscoreP > 30 ? '#BFD26E' :
                        feature.properties.CIscoreP > 20 ? '#99B863' :
                        feature.properties.CIscoreP > 10 ? '#7B9F5A' : '#5E8751';
                    opacity = 0.9;
                    fillOpacity = 0.6;
                }
                
                return {
                    color: color,
                    fillColor: color,
                    opacity: opacity,
                    fillOpacity: fillOpacity,
                    weight: 3
                };
            },
            onEachFeature: function(feature, layer) {
                if (layer._isBusStop) return;

                // CalEnviroScreen highlight
                if (fileName === "CalEnviroScreen") {
                    layer.on('mouseover', function() {
                        layer.setStyle({ weight: 3, color: '#666', fillOpacity: 0.7 });
                        layer.bringToFront();
                        info.update(layer.feature.properties);
                    });
                    layer.on('mouseout', function() {
                        layerGroup.resetStyle(layer);
                        info.update();
                    });
                    return;
                }

                // Route popup
                if (layer._layerType === 'route' && agencyName) {
                    const routeId = feature.properties.route_id || fileName;
                    const popupContent = `<strong>${agencyName}: ${routeId}</strong>`;
                    layer.bindPopup(popupContent, { autoPan: false });
                    layer.on('click', event => onMapClick(event));
                    layer.on('mouseover', e => layer.openPopup(e.latlng));
                    layer.on('mouseout', () => layer.closePopup());
                    return;
                }

                // Default polygon/POI popup
                const name = feature.properties.name || feature.properties.NAME || fileName;
                const popupContent = `<strong>${name}</strong>`;
                layer.bindPopup(popupContent, { autoPan: false });
                layer.on('click', event => onMapClick(event));
                layer.on('mouseover', e => layer.openPopup(e.latlng));
                layer.on('mouseout', () => layer.closePopup());

                // Set color property based on category
                let color = categoryColors[fileName.split(" ")[1]];
                feature.properties.color = color;
                // Set category property
                if (fileName.split(" ")[1] === "Arts_Entertainment") {
                    feature.properties.category = "Arts & Entertainment";
                } else if (fileName.split(" ")[1] === "Public_Social_Services") {
                    feature.properties.category = "Public & Social Services";
                } else {
                    feature.properties.category = fileName.split(" ")[1];
                }
            }
        });
        return layerGroup;
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
    
    var stopsLayer = await createGeoJson(stops, `${agencyName} Stops`, busStopMarker, agencyName);
    stopsLayer.id = 'stops';
    stopsLayer._agency = agencyName;
    stopsLayer._layerType = 'stops';

    // Create a layer for each route
    const routeLayers = [];
    for (const [routeId, route] of routes.entries()) {
        const layer = await createGeoJson(route, routeId, "", agencyName);
        layer.id = routeId;
        layer._agency = agencyName;
        layer._layerType = 'route';
        routeLayers.push(layer);
    }

    // Combine stops + routes for each agency
    const agencyData = L.layerGroup([stopsLayer, ...routeLayers]);
    
    return {
        group: agencyData,
        stops: stopsLayer,
        routes: routeLayers
    };
}

// Add Disadvantaged Communities layer (shapefile to GeoJSON)
async function addCalEnviroScreen() {
    var calEnviroScreen = await createGeoJson(
        "../../geojson/CalEnviroScreen/CES4 Final Shapefile.json", "CalEnviroScreen"
    );
    return calEnviroScreen;
}

// By county
async function addYoloPOIs() {
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

function hideTable() {
    const activeFeatures = document.getElementById('active-features');
    const table = document.getElementById('table');
    activeFeatures.classList.add('hide');
    table.classList.add('hide');
}

function removeInactiveLayers(layer) {
    const index = activeLayers.indexOf(layer);
    console.log(index);
    if (index > -1) { // Only splice array when item is found
      activeLayers.splice(index, 1); // 2nd parameter means remove one item only
    }
    console.log("active layers: ", activeLayers);
}

function listActiveLayers(layer) {
    // Add layer to active layers array if layer is a POI category
    let active = false;
    for (i = 0; i < categories.length; i++) {
        console.log(layer.id);
        console.log(categories[i]);
        if (layer.id.includes(categories[i])) {
            active = true;
        }
    }
    if (!active) return;
    activeLayers.push(layer);
    console.log("pushed active layers: ", activeLayers);
    
    const activeFeatures = document.getElementById('active-features');
    // Remove all existing rows from table
    const table = document.getElementById('table');
    while (table.children.length > 1) {
        table.removeChild(table.lastElementChild);
    }
    activeFeatures.classList.remove('hide');
    table.classList.remove('hide');

    // Add rows for each active layer
    for (activeLayer of activeLayers) {
        for (feature of Object.values(activeLayer._layers)) {
            const row = document.createElement('tr');
            console.log(feature.feature.properties.color);
            row.style.backgroundColor = `${feature.feature.properties.color}30`;
            const featureName = document.createElement('td');
            const name = feature.feature.properties.name ? feature.feature.properties.name : '-';
            featureName.innerHTML = name;
            const city = document.createElement('td');
            city.innerHTML = feature.feature.properties?.['addr:city'] ? feature.feature.properties['addr:city'] : '-';
            const category = document.createElement('td');
            category.innerHTML = feature.feature.properties.category;
            row.appendChild(featureName);
            row.appendChild(city);
            row.appendChild(category);
            table.appendChild(row);
        }
    }
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