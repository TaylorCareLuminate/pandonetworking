# Market Share Map - Implementation Guide

## Overview

The Market Share Map (`market_share_map.html`) is an interactive visualization tool that allows users to explore healthcare market share data across US states. It provides:

- **State Selection**: Choose any US state to analyze
- **Bulk Zip Code Selection**: Select multiple zip codes at once using click, rectangle selection, or "select all in view"
- **Health System Filtering**: Multi-select health systems to include in the analysis
- **Interactive Map**: Visual representation with color-coded zip codes by dominant health system
- **Market Share Analytics**: Population-weighted market share calculations displayed in charts
- **Hospital Locations**: Markers showing hospital locations with facility details
- **Coverage Analysis**: Orange highlighting for zip codes without hospitals within 10 miles
- **Saved Views**: Save and share specific views with other users

## Data Sources

The page reads from three Firebase Realtime Database paths:

1. **`kba/marketshare/[state_chunk_key]`** - Market share data per zip/health system
2. **`kba/hospitals/[state_chunk_key]`** - Hospital locations and facility details  
3. **`kba/mapviews/[view_id]`** - Saved user views (public/shared)

## Current Implementation Status

### ✅ Implemented Features

- State selection dropdown with all 50 US states
- Firebase Realtime Database integration
- Market share data loading and filtering
- Hospital data loading and visualization
- Health system multi-select with color coding
- Population-weighted market share calculations
- Interactive charts (Chart.js)
- Save/load views functionality
- Bulk zip selection tools:
  - Click individual zips
  - Rectangle selection mode
  - Select all zips in current map view
  - Clear selection
- Hospital proximity detection (10-mile radius)
- Responsive layout with sidebar controls and metrics

### ⚠️ Partial Implementation (Requires Enhancement)

**Zip Boundary Data**: Currently uses **placeholder geometry**. The app generates approximate lat/lon coordinates for demonstration purposes. For production use, you need to integrate actual zip code boundary GeoJSON data.

## Adding Real Zip Boundary Data

### Option 1: Static GeoJSON Files

Create zip boundary GeoJSON files per state and load them:

```javascript
async function loadZipGeometry(state) {
  try {
    const response = await fetch(`/data/zip-boundaries/${state}.geojson`);
    const geojson = await response.json();
    
    zipGeometryData = {};
    
    geojson.features.forEach(feature => {
      const zipCode = feature.properties.ZCTA5CE10; // Adjust property name as needed
      zipGeometryData[zipCode] = {
        zip_code: zipCode,
        state: state,
        population: feature.properties.population || 0,
        lat: feature.properties.INTPTLAT || 0,
        lon: feature.properties.INTPTLON || 0,
        geometry: feature.geometry
      };
    });
  } catch (error) {
    console.error('Error loading zip geometry:', error);
  }
}
```

### Option 2: Firebase Storage

Store zip boundary GeoJSON in Firebase Storage:

```javascript
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';

async function loadZipGeometry(state) {
  const storage = getStorage();
  const zipBoundaryRef = storageRef(storage, `zip-boundaries/${state}.geojson`);
  
  try {
    const url = await getDownloadURL(zipBoundaryRef);
    const response = await fetch(url);
    const geojson = await response.json();
    
    // Process GeoJSON...
  } catch (error) {
    console.error('Error loading zip geometry:', error);
  }
}
```

### Option 3: Firebase Realtime Database

Store simplified zip data (centroids + bounds) in Firebase:

```javascript
async function loadZipGeometry(state) {
  const zipRef = ref(db, `kba/zipcodes/${state}`);
  const snapshot = await get(zipRef);
  
  if (snapshot.exists()) {
    zipGeometryData = snapshot.val();
  }
}
```

Expected structure:
```json
{
  "kba": {
    "zipcodes": {
      "IN": {
        "46530": {
          "zip_code": "46530",
          "state": "IN",
          "population": 18423,
          "lat": 41.6764,
          "lon": -86.2520,
          "bounds": {
            "north": 41.7,
            "south": 41.65,
            "east": -86.2,
            "west": -86.3
          }
        }
      }
    }
  }
}
```

### Rendering Zip Polygons with Real Geometry

Update the `renderZipCodes()` function to render actual polygons:

```javascript
function renderZipCodes() {
  Object.keys(zipGeometryData).forEach(zipCode => {
    const zipInfo = zipGeometryData[zipCode];
    
    // Determine color based on market share...
    const color = determineZipColor(zipCode);
    
    let layer;
    
    if (zipInfo.geometry) {
      // Render actual polygon
      layer = L.geoJSON(zipInfo.geometry, {
        style: {
          color: color,
          fillColor: color,
          fillOpacity: selectedZips.has(zipCode) ? 0.7 : 0.4,
          weight: selectedZips.has(zipCode) ? 2 : 1
        }
      });
    } else {
      // Fallback to circle marker
      layer = L.circle([zipInfo.lat, zipInfo.lon], {
        color: color,
        fillColor: color,
        fillOpacity: selectedZips.has(zipCode) ? 0.7 : 0.4,
        radius: 5000,
        weight: selectedZips.has(zipCode) ? 2 : 1
      });
    }
    
    // Add popup and click handler...
    layer.bindPopup(createPopupContent(zipCode));
    layer.on('click', () => toggleZipSelection(zipCode));
    layer.addTo(map);
    
    zipLayers[zipCode] = layer;
  });
}
```

## Data Sources for Zip Boundaries

### Recommended Sources

1. **US Census Bureau TIGER/Line Shapefiles**
   - URL: https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
   - Download ZCTA (ZIP Code Tabulation Areas) shapefiles
   - Convert to GeoJSON using tools like `ogr2ogr` or QGIS

2. **OpenDataSoft**
   - Provides pre-processed GeoJSON for US zip codes
   - URL: https://public.opendatasoft.com/

3. **Census Reporter**
   - API access to zip code boundaries
   - URL: https://censusreporter.org/

### Processing Pipeline

1. Download TIGER/Line shapefiles for ZCTA
2. Convert to GeoJSON:
   ```bash
   ogr2ogr -f GeoJSON output.geojson input.shp
   ```
3. Simplify geometry to reduce file size:
   ```bash
   mapshaper input.geojson -simplify 10% -o output-simplified.geojson
   ```
4. Split by state and upload to Firebase Storage or include in app

## Key Features Explained

### Market Share Calculation

The app calculates **population-weighted market share**:

```
Market Share (System H) = Σ(Population_zip × MarketShare_zip,H) / Σ(Population_zip)
```

This gives a more accurate representation than simple averages because it weights by population.

### Hospital Proximity Detection

For each zip code, the app:
1. Calculates distance to all hospitals using the Haversine formula
2. Finds the minimum distance
3. Highlights zip codes orange if nearest hospital > 10 miles

### View Persistence

Saved views are stored in `kba/mapviews/[view_id]` and include:
- Selected state
- Selected zip codes (array)
- Selected health systems (array)  
- Map center and zoom level
- View name and description
- Timestamp

Views are **public and shared** across all users (no authentication required).

## Customization

### Color Scheme

Health system colors are generated using the golden angle (137.5°) for optimal distribution:

```javascript
function generateColorForHealthSystem(healthSystem, index) {
  const hue = (index * 137.5) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}
```

To use custom colors, create a color mapping:

```javascript
const CUSTOM_COLORS = {
  'ABC Health': '#3C98B1',
  'XYZ Health System': '#28b258',
  // etc...
};
```

### Map Tiles

Currently uses OpenStreetMap. To switch to Mapbox or other providers:

```javascript
L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
  attribution: '© Mapbox',
  maxZoom: 18,
  id: 'mapbox/streets-v11',
  accessToken: 'YOUR_MAPBOX_TOKEN'
}).addTo(map);
```

## Troubleshooting

### Issue: "No data loaded for state"

**Cause**: State chunk keys in Firebase may not match state abbreviation (they're encrypted)

**Solution**: The current implementation iterates through all chunks and filters by `state` field. Ensure your market share data includes a `state` field.

### Issue: Zip codes not displaying

**Cause**: Missing or invalid lat/lon coordinates

**Solution**: Check that zip geometry data includes valid `lat` and `lon` fields. Add logging:

```javascript
console.log('Zip geometry sample:', Object.values(zipGeometryData)[0]);
```

### Issue: Chart not updating

**Cause**: Chart.js not initialized or data format incorrect

**Solution**: Check browser console for errors. Ensure Chart.js is loaded before initialization:

```javascript
if (typeof Chart === 'undefined') {
  console.error('Chart.js not loaded');
}
```

## Performance Considerations

### Large States

For states with many zip codes (e.g., CA, TX), consider:

1. **Lazy loading**: Only load data when panning/zooming
2. **Clustering**: Use Leaflet.markercluster for hospital markers
3. **Simplification**: Reduce polygon complexity
4. **Caching**: Store processed data in localStorage

### Firebase Read Limits

To minimize Firebase reads:
- Cache data in memory after first load
- Use `once()` instead of `onValue()` for one-time reads
- Consider Firebase caching strategies

## Future Enhancements

Potential additions:

1. **Export functionality**: Download selected area data as CSV/Excel
2. **Time series**: Show market share changes over time
3. **Comparison mode**: Compare two health systems side-by-side
4. **Demographic overlays**: Population density, income levels, etc.
5. **Drive time analysis**: Replace straight-line distance with drive time
6. **Mobile optimization**: Touch-friendly controls and responsive design
7. **Print/PDF export**: Generate reports from current view
8. **Advanced filters**: Filter by hospital bed count, system size, etc.

## Support

For questions or issues with the Market Share Map, contact the development team or refer to:
- Firebase documentation: https://firebase.google.com/docs/database
- Leaflet documentation: https://leafletjs.com/
- Chart.js documentation: https://www.chartjs.org/

---

**Last Updated**: November 19, 2025  
**Version**: 1.0.0













