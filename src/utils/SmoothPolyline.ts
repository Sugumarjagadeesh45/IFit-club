/**
 * SmoothPolyline.ts
 * Professional polyline animation utilities for smooth route rendering
 * Provides industry-standard (Uber/Ola/Google Maps) polyline transitions
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteSegments {
  travelled: Coordinate[];
  remaining: Coordinate[];
  progress: number;
  nearestIndex: number;
}

/**
 * Calculate Haversine distance between two coordinates (in meters)
 */
export const getDistance = (a: Coordinate, b: Coordinate): number => {
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
 * Find the nearest point on a route to a given location
 * Returns the index of the nearest point and the distance to it
 */
export const findNearestPointIndex = (
  location: Coordinate,
  route: Coordinate[],
  startIndex: number = 0
): { index: number; distance: number } => {
  if (!route || route.length === 0) {
    return { index: 0, distance: Infinity };
  }

  let minDistance = Infinity;
  let nearestIndex = startIndex;

  // Search from startIndex to improve performance (driver usually moves forward)
  const searchStart = Math.max(0, startIndex - 5);
  const searchEnd = Math.min(route.length, startIndex + 50);

  for (let i = searchStart; i < searchEnd; i++) {
    const distance = getDistance(location, route[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  // If we're at the end of search range, check remaining points
  if (nearestIndex >= searchEnd - 1 && searchEnd < route.length) {
    for (let i = searchEnd; i < route.length; i++) {
      const distance = getDistance(location, route[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
  }

  return { index: nearestIndex, distance: minDistance };
};

/**
 * Interpolate a point between two coordinates
 */
export const interpolatePoint = (
  start: Coordinate,
  end: Coordinate,
  fraction: number
): Coordinate => {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    longitude: start.longitude + (end.longitude - start.longitude) * fraction,
  };
};

/**
 * Find the exact interpolated point on a route segment closest to driver
 */
export const getInterpolatedDriverPosition = (
  driverLocation: Coordinate,
  route: Coordinate[],
  nearestIndex: number
): Coordinate => {
  if (!route || route.length < 2 || nearestIndex >= route.length) {
    return driverLocation;
  }

  // Check distance to both previous and next segments
  const prevIndex = Math.max(0, nearestIndex - 1);
  const nextIndex = Math.min(route.length - 1, nearestIndex + 1);

  // Get perpendicular projection onto the segment
  const pointOnSegment = projectPointOnSegment(
    driverLocation,
    route[nearestIndex],
    route[nextIndex]
  );

  return pointOnSegment;
};

/**
 * Project a point onto a line segment (find closest point on segment)
 */
export const projectPointOnSegment = (
  point: Coordinate,
  segStart: Coordinate,
  segEnd: Coordinate
): Coordinate => {
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
 * Split route into travelled and remaining segments based on driver position
 * This creates the "consumed route" effect like Uber/Ola
 */
export const splitRouteAtDriver = (
  driverLocation: Coordinate,
  fullRoute: Coordinate[],
  lastNearestIndex: number = 0
): RouteSegments => {
  if (!fullRoute || fullRoute.length < 2) {
    return {
      travelled: [],
      remaining: fullRoute || [],
      progress: 0,
      nearestIndex: 0,
    };
  }

  // Find nearest point on route
  const { index: nearestIndex } = findNearestPointIndex(
    driverLocation,
    fullRoute,
    lastNearestIndex
  );

  // Get the interpolated position on the route
  const interpolatedPosition = getInterpolatedDriverPosition(
    driverLocation,
    fullRoute,
    nearestIndex
  );

  // Build travelled segment (start to driver position)
  const travelled: Coordinate[] = [
    ...fullRoute.slice(0, nearestIndex + 1),
    interpolatedPosition,
  ];

  // Build remaining segment (driver position to end)
  const remaining: Coordinate[] = [
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
  };
};

/**
 * Smooth interpolation between two routes (for animated transitions)
 * Useful when route is recalculated from OSRM
 */
export const interpolateRoute = (
  oldRoute: Coordinate[],
  newRoute: Coordinate[],
  progress: number // 0 to 1
): Coordinate[] => {
  if (!oldRoute || oldRoute.length === 0) return newRoute;
  if (!newRoute || newRoute.length === 0) return oldRoute;
  if (progress >= 1) return newRoute;
  if (progress <= 0) return oldRoute;

  // Use the longer route as reference
  const referenceRoute = newRoute.length >= oldRoute.length ? newRoute : oldRoute;
  const result: Coordinate[] = [];

  for (let i = 0; i < referenceRoute.length; i++) {
    // Get corresponding points from both routes
    const oldIndex = Math.min(
      Math.floor((i / referenceRoute.length) * oldRoute.length),
      oldRoute.length - 1
    );
    const newIndex = Math.min(i, newRoute.length - 1);

    const oldPoint = oldRoute[oldIndex];
    const newPoint = newRoute[newIndex];

    // Interpolate between old and new positions
    result.push(interpolatePoint(oldPoint, newPoint, progress));
  }

  return result;
};

/**
 * Simplify route by removing redundant points (Douglas-Peucker algorithm)
 * Improves rendering performance while maintaining visual quality
 */
export const simplifyRoute = (
  route: Coordinate[],
  tolerance: number = 0.00005 // ~5 meters
): Coordinate[] => {
  if (route.length <= 2) return route;

  // Find the point with maximum distance from the line
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

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = simplifyRoute(route.slice(0, maxIndex + 1), tolerance);
    const right = simplifyRoute(route.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [startPoint, endPoint];
};

/**
 * Calculate perpendicular distance from a point to a line
 */
const perpendicularDistance = (
  point: Coordinate,
  lineStart: Coordinate,
  lineEnd: Coordinate
): number => {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    return getDistance(point, lineStart);
  }

  const t =
    ((point.longitude - lineStart.longitude) * dx +
      (point.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy);

  const closestPoint: Coordinate = {
    latitude: lineStart.latitude + t * dy,
    longitude: lineStart.longitude + t * dx,
  };

  return getDistance(point, closestPoint);
};

/**
 * Check if location change is significant enough to update route
 * Prevents jitter from GPS noise
 */
export const isSignificantMovement = (
  oldLocation: Coordinate | null,
  newLocation: Coordinate,
  minDistance: number = 10 // 10 meters default
): boolean => {
  if (!oldLocation) return true;
  const distance = getDistance(oldLocation, newLocation);
  return distance >= minDistance;
};

/**
 * Create smooth dashed pattern coordinates for remaining route
 * This creates the dotted/dashed effect for "route ahead"
 */
export const createDashedRoute = (
  route: Coordinate[],
  dashLength: number = 20, // meters
  gapLength: number = 10 // meters
): Coordinate[][] => {
  if (!route || route.length < 2) return [];

  const segments: Coordinate[][] = [];
  let currentSegment: Coordinate[] = [];
  let distanceInCurrentDash = 0;
  let isDash = true;

  currentSegment.push(route[0]);

  for (let i = 1; i < route.length; i++) {
    const segmentDistance = getDistance(route[i - 1], route[i]);
    let remainingDistance = segmentDistance;
    let lastPoint = route[i - 1];

    while (remainingDistance > 0) {
      const targetLength = isDash ? dashLength : gapLength;
      const distanceToComplete = targetLength - distanceInCurrentDash;

      if (remainingDistance >= distanceToComplete) {
        // Complete current dash/gap
        const fraction = distanceToComplete / segmentDistance;
        const newPoint = interpolatePoint(
          route[i - 1],
          route[i],
          1 - remainingDistance / segmentDistance + fraction
        );

        if (isDash) {
          currentSegment.push(newPoint);
          segments.push(currentSegment);
          currentSegment = [];
        }

        remainingDistance -= distanceToComplete;
        distanceInCurrentDash = 0;
        isDash = !isDash;
        lastPoint = newPoint;

        if (isDash && remainingDistance > 0) {
          currentSegment.push(lastPoint);
        }
      } else {
        // Add remaining distance to current dash/gap
        if (isDash) {
          currentSegment.push(route[i]);
        }
        distanceInCurrentDash += remainingDistance;
        remainingDistance = 0;
      }
    }
  }

  // Add final segment if it's a dash
  if (isDash && currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
};

/**
 * Calculate bearing between two points (for arrow/direction indicators)
 */
export const calculateBearing = (start: Coordinate, end: Coordinate): number => {
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

export default {
  getDistance,
  findNearestPointIndex,
  interpolatePoint,
  getInterpolatedDriverPosition,
  projectPointOnSegment,
  splitRouteAtDriver,
  interpolateRoute,
  simplifyRoute,
  isSignificantMovement,
  createDashedRoute,
  calculateBearing,
};
