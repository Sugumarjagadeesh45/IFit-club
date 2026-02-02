/**
 * SmoothMapAnimations.ts
 * Production-grade map animations for ride-hailing apps
 * Uber/Ola/Rapido level smoothness
 */

import { Animated, Easing } from 'react-native';
import MapView, { AnimatedRegion, Camera } from 'react-native-maps';

export interface LocationType {
  latitude: number;
  longitude: number;
}

export interface AnimatedMarkerState {
  latitude: Animated.Value;
  longitude: Animated.Value;
  bearing: Animated.Value;
}

/**
 * Calculate bearing between two points (0-360 degrees)
 */
export const calculateBearing = (
  start: LocationType,
  end: LocationType
): number => {
  const lat1 = (start.latitude * Math.PI) / 180;
  const lat2 = (end.latitude * Math.PI) / 180;
  const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = Math.atan2(y, x);
  const degrees = (bearing * 180) / Math.PI;

  return (degrees + 360) % 360;
};

/**
 * Calculate distance between two points (Haversine formula)
 * Returns distance in meters
 */
export const calculateDistance = (
  point1: LocationType,
  point2: LocationType
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const dLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.latitude * Math.PI) / 180) *
      Math.cos((point2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Smooth driver marker animation
 * Animates position AND rotation simultaneously
 */
export const animateDriverMarker = (
  animatedState: AnimatedMarkerState,
  newLocation: LocationType,
  currentLocation: LocationType,
  duration?: number
): Promise<void> => {
  return new Promise((resolve) => {
    const distance = calculateDistance(currentLocation, newLocation);

    // Skip animation for very small movements (GPS jitter)
    if (distance < 3) {
      resolve();
      return;
    }

    // Calculate bearing for rotation
    const newBearing = calculateBearing(currentLocation, newLocation);

    // Dynamic duration based on distance and speed
    // Faster for short distances, slower for long distances
    const animDuration = duration || Math.min(Math.max(distance * 30, 500), 2000);

    console.log(`🚗 Animating driver: ${distance.toFixed(1)}m in ${animDuration}ms, bearing ${newBearing.toFixed(0)}°`);

    Animated.parallel([
      Animated.timing(animatedState.latitude, {
        toValue: newLocation.latitude,
        duration: animDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedState.longitude, {
        toValue: newLocation.longitude,
        duration: animDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatedState.bearing, {
        toValue: newBearing,
        duration: animDuration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => resolve());
  });
};

/**
 * Smooth camera follow with bearing
 * Professional 3D perspective like Uber
 */
export const animateCameraToDriver = (
  mapRef: React.RefObject<MapView>,
  location: LocationType,
  bearing: number = 0,
  zoomLevel: 'close' | 'medium' | 'far' = 'close',
  duration: number = 1000
): void => {
  if (!mapRef.current) return;

  const zoomSettings = {
    close: { zoom: 17, altitude: 500, pitch: 50 },   // Navigation view
    medium: { zoom: 15, altitude: 1500, pitch: 45 }, // Overview
    far: { zoom: 13, altitude: 3000, pitch: 30 },    // Wide view
  };

  const settings = zoomSettings[zoomLevel];

  const camera: Camera = {
    center: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    heading: bearing,
    pitch: settings.pitch,
    zoom: settings.zoom,
    altitude: settings.altitude,
  };

  mapRef.current.animateCamera(camera, { duration });
};

/**
 * Progressive polyline rendering
 * Smoothly reduces polyline as driver travels
 */
export const getProgressivePolyline = (
  driverLocation: LocationType,
  fullRoute: LocationType[]
): {
  travelled: LocationType[];
  remaining: LocationType[];
  nearestIndex: number;
  progress: number;
} => {
  if (!fullRoute || fullRoute.length === 0) {
    return {
      travelled: [],
      remaining: [],
      nearestIndex: 0,
      progress: 0,
    };
  }

  // Find nearest point on route
  let minDistance = Infinity;
  let nearestIndex = 0;

  for (let i = 0; i < fullRoute.length; i++) {
    const distance = calculateDistance(driverLocation, fullRoute[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  // Look ahead 5 points to smooth out GPS jitter
  const lookAheadIndex = Math.min(nearestIndex + 5, fullRoute.length - 1);

  const travelledRoute = [driverLocation, ...fullRoute.slice(0, lookAheadIndex)];
  const remainingRoute = [driverLocation, ...fullRoute.slice(lookAheadIndex)];
  const progress = (lookAheadIndex / fullRoute.length) * 100;

  return {
    travelled: travelledRoute,
    remaining: remainingRoute,
    nearestIndex: lookAheadIndex,
    progress,
  };
};

/**
 * Smooth polyline transition animation
 * Prevents flickering during updates
 */
export const animatePolylineTransition = (
  opacityValue: Animated.Value,
  onUpdate: () => void
): void => {
  Animated.sequence([
    // Fade out slightly
    Animated.timing(opacityValue, {
      toValue: 0.7,
      duration: 100,
      easing: Easing.ease,
      useNativeDriver: true,
    }),
    // Update polyline (callback)
    Animated.timing(opacityValue, {
      toValue: 0.7,
      duration: 0,
      useNativeDriver: true,
    }),
    // Fade back in
    Animated.timing(opacityValue, {
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
 * Interpolate between route points for ultra-smooth movement
 * Creates intermediate points for fluid animation
 */
export const interpolateRoutePoints = (
  start: LocationType,
  end: LocationType,
  steps: number = 10
): LocationType[] => {
  const points: LocationType[] = [];

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    points.push({
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
    });
  }

  return points;
};

/**
 * Check if location change is significant enough to animate
 * Prevents jittery animations from GPS noise
 */
export const isSignificantMove = (
  oldLocation: LocationType,
  newLocation: LocationType,
  threshold: number = 5 // 5 meters minimum
): boolean => {
  const distance = calculateDistance(oldLocation, newLocation);
  return distance >= threshold;
};

/**
 * Fit map to show entire route with padding
 */
export const fitMapToRoute = (
  mapRef: React.RefObject<MapView>,
  coordinates: LocationType[],
  edgePadding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } = { top: 100, right: 100, bottom: 300, left: 100 },
  animated: boolean = true
): void => {
  if (!mapRef.current || !coordinates || coordinates.length === 0) return;

  mapRef.current.fitToCoordinates(coordinates, {
    edgePadding,
    animated,
  });
};

/**
 * Calculate optimal camera position to show both driver and destination
 */
export const getCameraForTwoPoints = (
  point1: LocationType,
  point2: LocationType
): {
  center: LocationType;
  zoom: number;
  bearing: number;
} => {
  const centerLat = (point1.latitude + point2.latitude) / 2;
  const centerLon = (point1.longitude + point2.longitude) / 2;

  const distance = calculateDistance(point1, point2);
  const bearing = calculateBearing(point1, point2);

  // Calculate appropriate zoom based on distance
  // 1000m = zoom 14, 5000m = zoom 12, 10000m = zoom 11
  let zoom = 14;
  if (distance > 10000) zoom = 11;
  else if (distance > 5000) zoom = 12;
  else if (distance > 2000) zoom = 13;

  return {
    center: {
      latitude: centerLat,
      longitude: centerLon,
    },
    zoom,
    bearing,
  };
};

/**
 * Throttle function to limit update frequency
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;
  let lastResult: ReturnType<T>;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      lastResult = func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    return lastResult;
  };
};

/**
 * Debounce function for delaying updates
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

export default {
  calculateBearing,
  calculateDistance,
  animateDriverMarker,
  animateCameraToDriver,
  getProgressivePolyline,
  animatePolylineTransition,
  interpolateRoutePoints,
  isSignificantMove,
  fitMapToRoute,
  getCameraForTwoPoints,
  throttle,
  debounce,
};