/**
 * RouteService.ts
 * Professional route management for driver app
 *
 * Features:
 * - Real-time route fetching from OSRM
 * - Off-route detection
 * - Route slicing and progress tracking
 * - Smooth route interpolation
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coords: LatLng[];
  distance: number; // in km
  duration: number; // in minutes
  distanceText: string;
  durationText: string;
}

export interface RouteSegments {
  travelled: LatLng[];
  remaining: LatLng[];
  progress: number;
  nearestIndex: number;
  distanceToRoute: number;
}

// ============ DISTANCE CALCULATIONS ============

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
export const getDistanceInMeters = (
  a: LatLng,
  b: LatLng
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

/**
 * Calculate total route distance in kilometers
 */
export const calculateRouteDistance = (route: LatLng[]): number => {
  if (route.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < route.length; i++) {
    totalDistance += getDistanceInMeters(route[i - 1], route[i]);
  }
  return totalDistance / 1000; // Convert to km
};

// ============ ROUTE FETCHING ============

/**
 * Fetches a driving route from OSRM (Open Source Routing Machine)
 * Compatible with the OSM map style used in the app.
 *
 * @param start - Driver's current location
 * @param end - Destination (Pickup or Drop)
 * @returns RouteResult with coordinates and distance/duration info
 */
export const getRoutePolyline = async (
  start: LatLng,
  end: LatLng
): Promise<LatLng[]> => {
  try {
    if (!start || !end) return [];

    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    const json = await response.json();

    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      console.warn('RouteService: No route found');
      return [];
    }

    // Convert GeoJSON [lon, lat] to { latitude, longitude }
    return json.routes[0].geometry.coordinates.map((coord: number[]) => ({
      latitude: coord[1],
      longitude: coord[0],
    }));
  } catch (error) {
    console.error('❌ Error fetching route:', error);
    return [];
  }
};

/**
 * Fetches route with full details (distance, duration, etc.)
 */
export const getRouteWithDetails = async (
  start: LatLng,
  end: LatLng
): Promise<RouteResult | null> => {
  try {
    if (!start || !end) return null;

    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url);
    const json = await response.json();

    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      console.warn('RouteService: No route found');
      return null;
    }

    const route = json.routes[0];
    const coords = route.geometry.coordinates.map((coord: number[]) => ({
      latitude: coord[1],
      longitude: coord[0],
    }));

    const distanceKm = route.distance / 1000;
    const durationMin = route.duration / 60;

    return {
      coords,
      distance: distanceKm,
      duration: durationMin,
      distanceText: `${distanceKm.toFixed(2)} km`,
      durationText: `${Math.round(durationMin)} min`,
    };
  } catch (error) {
    console.error('❌ Error fetching route with details:', error);
    return null;
  }
};

// ============ OFF-ROUTE DETECTION ============

/**
 * Find the nearest point on a route to the driver's current position
 * Optimized for performance - searches forward from last known position
 */
export const findNearestPointOnRoute = (
  driverLocation: LatLng,
  route: LatLng[],
  lastKnownIndex: number = 0,
  searchRadius: number = 100 // Number of points to search
): { index: number; distance: number } => {
  if (!route || route.length === 0) {
    return { index: 0, distance: Infinity };
  }

  let minDistance = Infinity;
  let nearestIndex = lastKnownIndex;

  // Search from lastKnownIndex - 5 to lastKnownIndex + searchRadius
  const searchStart = Math.max(0, lastKnownIndex - 5);
  const searchEnd = Math.min(route.length, lastKnownIndex + searchRadius);

  for (let i = searchStart; i < searchEnd; i++) {
    const distance = getDistanceInMeters(driverLocation, route[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  // If at end of search range and still have more points, continue searching
  if (nearestIndex >= searchEnd - 1 && searchEnd < route.length) {
    for (let i = searchEnd; i < route.length; i++) {
      const distance = getDistanceInMeters(driverLocation, route[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
  }

  return { index: nearestIndex, distance: minDistance };
};

/**
 * Check if driver is off-route
 * Returns true if driver is more than threshold meters from the route
 */
export const isDriverOffRoute = (
  driverLocation: LatLng,
  route: LatLng[],
  thresholdMeters: number = 30,
  lastKnownIndex: number = 0
): { isOffRoute: boolean; distance: number; nearestIndex: number } => {
  const { index, distance } = findNearestPointOnRoute(
    driverLocation,
    route,
    lastKnownIndex
  );

  return {
    isOffRoute: distance > thresholdMeters,
    distance,
    nearestIndex: index,
  };
};

// ============ ROUTE SLICING & PROGRESS ============

/**
 * Project a point onto a line segment (for precise route positioning)
 */
const projectPointOnSegment = (
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng
): LatLng => {
  const dx = segEnd.longitude - segStart.longitude;
  const dy = segEnd.latitude - segStart.latitude;

  if (dx === 0 && dy === 0) {
    return segStart;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.longitude - segStart.longitude) * dx +
        (point.latitude - segStart.latitude) * dy) /
        (dx * dx + dy * dy)
    )
  );

  return {
    latitude: segStart.latitude + t * dy,
    longitude: segStart.longitude + t * dx,
  };
};

/**
 * Get the interpolated position on the route closest to driver
 */
export const getInterpolatedDriverPosition = (
  driverLocation: LatLng,
  route: LatLng[],
  nearestIndex: number
): LatLng => {
  if (!route || route.length < 2 || nearestIndex >= route.length) {
    return driverLocation;
  }

  const nextIndex = Math.min(route.length - 1, nearestIndex + 1);
  return projectPointOnSegment(
    driverLocation,
    route[nearestIndex],
    route[nextIndex]
  );
};

/**
 * Split route into travelled and remaining segments
 * Creates the professional "consumed route" effect like Uber/Ola
 */
export const splitRouteAtDriver = (
  driverLocation: LatLng,
  fullRoute: LatLng[],
  lastNearestIndex: number = 0
): RouteSegments => {
  if (!fullRoute || fullRoute.length < 2) {
    return {
      travelled: [],
      remaining: fullRoute || [],
      progress: 0,
      nearestIndex: 0,
      distanceToRoute: 0,
    };
  }

  const { index: nearestIndex, distance: distanceToRoute } = findNearestPointOnRoute(
    driverLocation,
    fullRoute,
    lastNearestIndex
  );

  // Get interpolated position for precise split point
  const interpolatedPosition = getInterpolatedDriverPosition(
    driverLocation,
    fullRoute,
    nearestIndex
  );

  // Build travelled segment (start to driver position)
  const travelled: LatLng[] = [
    ...fullRoute.slice(0, nearestIndex + 1),
    interpolatedPosition,
  ];

  // Build remaining segment (driver position to end)
  const remaining: LatLng[] = [
    interpolatedPosition,
    ...fullRoute.slice(nearestIndex + 1),
  ];

  // Calculate progress percentage
  const progress = (nearestIndex / (fullRoute.length - 1)) * 100;

  return {
    travelled,
    remaining,
    progress: Math.min(100, Math.max(0, progress)),
    nearestIndex,
    distanceToRoute,
  };
};

// ============ ROUTE INTERPOLATION (FOR ANIMATION) ============

/**
 * Interpolate a point between two coordinates
 */
export const interpolatePoint = (
  start: LatLng,
  end: LatLng,
  fraction: number
): LatLng => ({
  latitude: start.latitude + (end.latitude - start.latitude) * fraction,
  longitude: start.longitude + (end.longitude - start.longitude) * fraction,
});

/**
 * Smooth interpolation between two routes (for animated transitions)
 * Useful when route is recalculated
 */
export const interpolateRoutes = (
  oldRoute: LatLng[],
  newRoute: LatLng[],
  progress: number // 0 to 1
): LatLng[] => {
  if (!oldRoute || oldRoute.length === 0) return newRoute;
  if (!newRoute || newRoute.length === 0) return oldRoute;
  if (progress >= 1) return newRoute;
  if (progress <= 0) return oldRoute;

  // Use the longer route as reference
  const referenceRoute = newRoute.length >= oldRoute.length ? newRoute : oldRoute;
  const result: LatLng[] = [];

  for (let i = 0; i < referenceRoute.length; i++) {
    const oldIndex = Math.min(
      Math.floor((i / referenceRoute.length) * oldRoute.length),
      oldRoute.length - 1
    );
    const newIndex = Math.min(i, newRoute.length - 1);

    const oldPoint = oldRoute[oldIndex];
    const newPoint = newRoute[newIndex];

    result.push(interpolatePoint(oldPoint, newPoint, progress));
  }

  return result;
};

// ============ MOVEMENT DETECTION ============

/**
 * Check if location change is significant enough to update route
 * Prevents jitter from GPS noise
 */
export const isSignificantMovement = (
  oldLocation: LatLng | null,
  newLocation: LatLng,
  minDistanceMeters: number = 10
): boolean => {
  if (!oldLocation) return true;
  const distance = getDistanceInMeters(oldLocation, newLocation);
  return distance >= minDistanceMeters;
};

/**
 * Calculate bearing between two points (for direction indicators)
 */
export const calculateBearing = (start: LatLng, end: LatLng): number => {
  const lat1 = (start.latitude * Math.PI) / 180;
  const lat2 = (end.latitude * Math.PI) / 180;
  const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let bearing = Math.atan2(y, x);
  bearing = (bearing * 180) / Math.PI;
  return (bearing + 360) % 360;
};

// ============ ROUTE SIMPLIFICATION ============

/**
 * Calculate perpendicular distance from a point to a line
 */
const perpendicularDistance = (
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng
): number => {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    return getDistanceInMeters(point, lineStart);
  }

  const t =
    ((point.longitude - lineStart.longitude) * dx +
      (point.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy);

  const closestPoint: LatLng = {
    latitude: lineStart.latitude + t * dy,
    longitude: lineStart.longitude + t * dx,
  };

  return getDistanceInMeters(point, closestPoint);
};

/**
 * Simplify route using Douglas-Peucker algorithm
 * Improves rendering performance while maintaining visual quality
 */
export const simplifyRoute = (
  route: LatLng[],
  tolerance: number = 0.00005 // ~5 meters
): LatLng[] => {
  if (route.length <= 2) return route;

  let maxDistance = 0;
  let maxIndex = 0;

  const startPoint = route[0];
  const endPoint = route[route.length - 1];

  for (let i = 1; i < route.length - 1; i++) {
    const distance = perpendicularDistance(route[i], startPoint, endPoint);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyRoute(route.slice(0, maxIndex + 1), tolerance);
    const right = simplifyRoute(route.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [startPoint, endPoint];
};

export default {
  getRoutePolyline,
  getRouteWithDetails,
  getDistanceInMeters,
  calculateRouteDistance,
  findNearestPointOnRoute,
  isDriverOffRoute,
  getInterpolatedDriverPosition,
  splitRouteAtDriver,
  interpolatePoint,
  interpolateRoutes,
  isSignificantMovement,
  calculateBearing,
  simplifyRoute,
};
