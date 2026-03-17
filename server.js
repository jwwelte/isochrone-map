const path = require('path');
const express = require('express');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

// Tile URL endpoint
app.get('/tile-url', (req, res) => {
  res.json({
    base: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`,
    retina: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}@2x.png?apiKey=${GEOAPIFY_API_KEY}`
  });
});

// GTFS-RT → GeoJSON endpoint
app.get('/vehicles', async (req, res) => {
  try {
    console.log('Fetching GTFS feed from:', process.env.GTFS_RT_URL);
    const response = await fetch(process.env.GTFS_RT_URL);
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    const geojson = {
      type: 'FeatureCollection',
      features: feed.entity
        .filter(e => e.vehicle && e.vehicle.position)
        .map(e => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              e.vehicle.position.longitude,
              e.vehicle.position.latitude
            ]
          },
          properties: {
            tripId: e.vehicle.trip.tripId,
            routeId: e.vehicle.trip.routeId,
            speed: e.vehicle.position.speed,
            heading: e.vehicle.position.heading
          }
        }))
    };
    res.json(geojson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GTFS-RT feed' });
  }
});

// Catch-all route for SPA
app.get(/^(?!\/(vehicles|tile-url)).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));