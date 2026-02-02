// src/mapStyle.ts - FREE OpenStreetMap style for MapLibre

// Use a stable style string (memoized) to prevent re-renders
const LIGHT_STYLE = JSON.stringify({
  version: 8,
  name: 'EazyGo Light',
  sources: {
    'carto-light': {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© CARTO © OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'carto-light-layer',
      type: 'raster',
      source: 'carto-light',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
});

// Return cached style string to prevent re-renders
export const getLightMapStyleString = (): string => LIGHT_STYLE;

// Alternative OSM style
const OSM_STYLE = JSON.stringify({
  version: 8,
  name: 'OpenStreetMap',
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
});

export const getMapStyleString = (): string => OSM_STYLE;
