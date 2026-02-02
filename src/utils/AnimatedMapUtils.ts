/**
 * AnimatedMapUtils.ts
 * Professional-grade map animation utilities for smooth location tracking
 * Matches industry standards (Uber, Ola, Rapido)
 */

import { Animated, Easing } from 'react-native';

export interface LocationType {
  latitude: number;
  longitude: number;
}

export interface AnimatedLocation extends LocationType {
  bearing?: number;
  speed?: number;
}

/**
 * Calculate bearing (direction) between two coordinates
 * Returns angle in degrees (0-360)
 */
export const calculateBearing = (start: LocationType, end: LocationType): number => {
  const lat1 = (start.latitude * Math.PI) / 180;
  const lat2 = (end.latitude * Math.PI) / 180;
  const lon1 = (start.longitude * Math.PI) / 180;
  const lon2 = (end.longitude * Math.PI) / 180;

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  let bearing = Math.atan2(y, x);
  bearing = (bearing * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  return bearing;
};

/**
 * Calculate distance between two coordinates in meters
 * Uses Haversine formula
 */
export const haversineDistance = (start: LocationType, end: LocationType): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((end.latitude - start.latitude) * Math.PI) / 180;
  const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((start.latitude * Math.PI) / 180) *
      Math.cos((end.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Smooth animation duration calculation based on distance and speed
 * Returns duration in milliseconds
 */
export const calculateAnimationDuration = (
  distance: number,
  speed?: number
): number => {
  // Default speed: 30 km/h = 8.33 m/s
  const defaultSpeed = 8.33;
  const actualSpeed = speed && speed > 0 ? speed : defaultSpeed;

  // Calculate time to travel distance at current speed
  const timeSeconds = distance / actualSpeed;

  // Convert to milliseconds with min/max bounds
  const duration = Math.max(300, Math.min(timeSeconds * 1000, 2000));

  return duration;
};

/**
 * Interpolate between two locations for smooth animation
 */
export const interpolateLocation = (
  start: LocationType,
  end: LocationType,
  progress: number
): LocationType => {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
  };
};

/**
 * Smooth bearing rotation (handles 360-0 wrap)
 */
export const interpolateBearing = (
  start: number,
  end: number,
  progress: number
): number => {
  // Normalize bearings to 0-360
  start = ((start % 360) + 360) % 360;
  end = ((end % 360) + 360) % 360;

  // Calculate shortest rotation
  let diff = end - start;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  const bearing = start + diff * progress;
  return ((bearing % 360) + 360) % 360;
};

/**
 * Animate marker position smoothly
 */
export const animateMarkerToCoordinate = (
  animatedLatitude: Animated.Value,
  animatedLongitude: Animated.Value,
  currentLocation: LocationType,
  newLocation: LocationType,
  speed?: number,
  onComplete?: () => void
): void => {
  const distance = haversineDistance(currentLocation, newLocation);
  const duration = calculateAnimationDuration(distance, speed);

  Animated.parallel([
    Animated.timing(animatedLatitude, {
      toValue: newLocation.latitude,
      duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }),
    Animated.timing(animatedLongitude, {
      toValue: newLocation.longitude,
      duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }),
  ]).start(onComplete);
};

/**
 * Animate marker rotation smoothly
 */
export const animateMarkerRotation = (
  animatedBearing: Animated.Value,
  currentBearing: number,
  newBearing: number,
  duration: number = 500,
  onComplete?: () => void
): void => {
  // Normalize bearings
  currentBearing = ((currentBearing % 360) + 360) % 360;
  newBearing = ((newBearing % 360) + 360) % 360;

  // Calculate shortest rotation
  let diff = newBearing - currentBearing;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  const targetBearing = currentBearing + diff;

  Animated.timing(animatedBearing, {
    toValue: targetBearing,
    duration,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  }).start(onComplete);
};

/**
 * Animate camera to follow driver with bearing
 */
export const animateCameraToRegion = (
  mapRef: any,
  location: LocationType,
  bearing: number = 0,
  duration: number = 1000
): void => {
  if (!mapRef || !mapRef.current) return;

  const camera = {
    center: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    heading: bearing,
    pitch: 45, // Slight 3D tilt for professional look
    zoom: 17, // ~500m view
    altitude: 500,
  };

  mapRef.current.animateCamera(camera, { duration });
};

/**
 * Calculate camera region with zoom constraints (3km to 30km)
 */
export const calculateCameraRegion = (
  location: LocationType,
  zoomLevel: 'close' | 'medium' | 'far' = 'close'
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} => {
  // Zoom constraints: 3km (close) to 30km (far)
  const deltaMap = {
    close: 0.027, // ~3km view
    medium: 0.09, // ~10km view
    far: 0.27, // ~30km view
  };

  const delta = deltaMap[zoomLevel];

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
};

/**
 * Find nearest point on polyline route
 */
export const findNearestPointOnRoute = (
  location: LocationType,
  route: LocationType[]
): { index: number; distance: number } | null => {
  if (!route || route.length === 0) return null;

  let minDistance = Infinity;
  let nearestIndex = 0;

  for (let i = 0; i < route.length; i++) {
    const distance = haversineDistance(location, route[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  return { index: nearestIndex, distance: minDistance };
};

/**
 * Progressive route update - returns travelled and remaining portions
 */
export const getProgressiveRoute = (
  currentLocation: LocationType,
  fullRoute: LocationType[]
): {
  travelled: LocationType[];
  remaining: LocationType[];
  progress: number;
} => {
  if (!fullRoute || fullRoute.length === 0) {
    return { travelled: [], remaining: [], progress: 0 };
  }

  const nearest = findNearestPointOnRoute(currentLocation, fullRoute);
  if (!nearest) {
    return { travelled: [], remaining: fullRoute, progress: 0 };
  }

  const travelledRoute = fullRoute.slice(0, nearest.index + 1);
  const remainingRoute = fullRoute.slice(nearest.index);
  const progress = (nearest.index / fullRoute.length) * 100;

  return {
    travelled: travelledRoute,
    remaining: remainingRoute,
    progress,
  };
};

/**
 * Smooth polyline animation using opacity transition
 */
export const animatePolylineUpdate = (
  animatedOpacity: Animated.Value,
  onUpdate: () => void
): void => {
  Animated.sequence([
    Animated.timing(animatedOpacity, {
      toValue: 0.5,
      duration: 150,
      easing: Easing.ease,
      useNativeDriver: true,
    }),
    Animated.timing(animatedOpacity, {
      toValue: 1,
      duration: 150,
      easing: Easing.ease,
      useNativeDriver: true,
    }),
  ]).start(() => {
    onUpdate();
  });
};

/**
 * Debounce function for throttling rapid updates
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function for limiting update frequency
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Check if location update is significant enough to animate
 * Prevents jitter from GPS noise
 */
export const isSignificantLocationChange = (
  oldLocation: LocationType,
  newLocation: LocationType,
  minDistance: number = 5 // 5 meters minimum
): boolean => {
  const distance = haversineDistance(oldLocation, newLocation);
  return distance >= minDistance;
};

export default {
  calculateBearing,
  haversineDistance,
  calculateAnimationDuration,
  interpolateLocation,
  interpolateBearing,
  animateMarkerToCoordinate,
  animateMarkerRotation,
  animateCameraToRegion,
  calculateCameraRegion,
  findNearestPointOnRoute,
  getProgressiveRoute,
  animatePolylineUpdate,
  debounce,
  throttle,
  isSignificantLocationChange,
};
