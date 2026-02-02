/**
 * useDriverPolylineAnimation.ts
 * Professional polyline animation hook for driver app
 * Replicates smooth animation behavior from user app
 *
 * Features:
 * - Smooth polyline increase/decrease animation
 * - Auto re-fetch when driver goes off-route
 * - Synchronized driver icon + polyline animation
 * - Professional easing functions
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface LocationType {
  latitude: number;
  longitude: number;
}

export interface RouteAnimationState {
  smoothRoute: LocationType[];
  displayedDriverLocation: LocationType | null;
  isAnimating: boolean;
  routeProgress: number;
  isOffRoute: boolean;
  distanceToRoute: number;
}

interface UseDriverPolylineAnimationProps {
  driverLocation: LocationType | null;
  destination: LocationType | null;
  isActive: boolean; // Whether animation should be active (ride in progress)
  offRouteThreshold?: number; // Meters before considered off-route (default: 30m)
  routeUpdateInterval?: number; // Minimum ms between route updates (default: 3000ms)
}

interface RouteData {
  coords: LocationType[];
  distance: string;
  time: number;
}

/**
 * Calculate distance in meters between two coordinates (Haversine formula)
 */
const calculateDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Linear interpolation for smooth animation
 */
const lerp = (start: number, end: number, factor: number): number =>
  start + (end - start) * factor;

/**
 * Ease-out cubic easing function for professional animation
 */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Find the closest point on route to the driver's position
 */
const findClosestPointOnRoute = (
  driverPos: LocationType,
  route: LocationType[],
  searchLimit: number = 100
): { index: number; distance: number } => {
  let minDistance = Infinity;
  let closestIndex = 0;

  const limit = Math.min(route.length, searchLimit);
  for (let i = 0; i < limit; i++) {
    const dist = calculateDistanceInMeters(
      driverPos.latitude,
      driverPos.longitude,
      route[i].latitude,
      route[i].longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return { index: closestIndex, distance: minDistance };
};

/**
 * Interpolate between two routes for smooth animation
 */
const interpolateRoutes = (
  oldRoute: LocationType[],
  newRoute: LocationType[],
  progress: number
): LocationType[] => {
  if (oldRoute.length === 0) return newRoute;
  if (newRoute.length === 0) return oldRoute;

  return newRoute.map((newPoint, index) => {
    const oldPoint = oldRoute[index] || oldRoute[oldRoute.length - 1] || newPoint;
    return {
      latitude: lerp(oldPoint.latitude, newPoint.latitude, progress),
      longitude: lerp(oldPoint.longitude, newPoint.longitude, progress),
    };
  });
};

export const useDriverPolylineAnimation = ({
  driverLocation,
  destination,
  isActive,
  offRouteThreshold = 30,
  routeUpdateInterval = 3000,
}: UseDriverPolylineAnimationProps) => {
  // State
  const [smoothRoute, setSmoothRoute] = useState<LocationType[]>([]);
  const [displayedDriverLocation, setDisplayedDriverLocation] = useState<LocationType | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [distanceToRoute, setDistanceToRoute] = useState(0);

  // Refs for animation control
  const routeCoordsRef = useRef<LocationType[]>([]);
  const smoothRouteCoordsRef = useRef<LocationType[]>([]);
  const displayedDriverLocationRef = useRef<LocationType | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const routeUpdateInProgressRef = useRef(false);
  const lastRouteUpdateTimeRef = useRef<number>(0);
  const lastLocationUpdateTimeRef = useRef<number>(0);
  const previousRouteRef = useRef<LocationType[]>([]);

  // Animation state for smooth driver movement
  const animationState = useRef({
    startLat: 0,
    startLng: 0,
    endLat: 0,
    endLng: 0,
    startTime: 0,
    duration: 2000,
  });

  /**
   * Fetch route from OSRM
   */
  const fetchRealTimeRoute = useCallback(
    async (from: LocationType, to: LocationType): Promise<RouteData | null> => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(
            ([lng, lat]: number[]) => ({
              latitude: lat,
              longitude: lng,
            })
          );

          console.log(`✅ Route Calculated (OSRM)`);
          console.log(`📏 Distance: ${(data.routes[0].distance / 1000).toFixed(2)} km`);
          console.log(`📊 Route Points: ${coords.length}`);

          return {
            coords,
            distance: (data.routes[0].distance / 1000).toFixed(2),
            time: Math.round(data.routes[0].duration / 60),
          };
        } else {
          console.error(`❌ OSRM routing failed`);
        }
      } catch (error) {
        console.error('❌ Real-time route calculation failed:', error);
      }
      return null;
    },
    []
  );

  /**
   * Animate driver marker with continuous smooth movement
   */
  const animateDriverPosition = useCallback(
    (newLat: number, newLng: number, duration: number = 2000) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const startLat = displayedDriverLocationRef.current?.latitude || newLat;
      const startLng = displayedDriverLocationRef.current?.longitude || newLng;

      animationState.current = {
        startLat,
        startLng,
        endLat: newLat,
        endLng: newLng,
        startTime: Date.now(),
        duration,
      };

      const animate = () => {
        const now = Date.now();
        const elapsed = now - animationState.current.startTime;
        const progress = Math.min(elapsed / animationState.current.duration, 1);
        const easeProgress = easeOutCubic(progress);

        const currentLat = lerp(
          animationState.current.startLat,
          animationState.current.endLat,
          easeProgress
        );
        const currentLng = lerp(
          animationState.current.startLng,
          animationState.current.endLng,
          easeProgress
        );

        const newPos = { latitude: currentLat, longitude: currentLng };
        setDisplayedDriverLocation(newPos);
        displayedDriverLocationRef.current = newPos;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    []
  );

  /**
   * Smooth polyline animation - transition between old and new routes
   */
  const animateRouteTransition = useCallback((newRoute: LocationType[]) => {
    if (newRoute.length === 0) {
      setSmoothRoute([]);
      smoothRouteCoordsRef.current = [];
      return;
    }

    const currentSmooth = smoothRouteCoordsRef.current;
    if (currentSmooth.length === 0) {
      setSmoothRoute(newRoute);
      smoothRouteCoordsRef.current = newRoute;
      return;
    }

    setIsAnimating(true);
    const animationSteps = 30; // 30 frames for smooth animation
    let step = 0;

    const animateRoute = () => {
      step++;
      const progress = step / animationSteps;
      const easedProgress = easeOutCubic(progress);

      const interpolatedRoute = interpolateRoutes(currentSmooth, newRoute, easedProgress);

      setSmoothRoute(interpolatedRoute);
      smoothRouteCoordsRef.current = interpolatedRoute;

      if (step < animationSteps) {
        requestAnimationFrame(animateRoute);
      } else {
        // Final snap to exact route
        setSmoothRoute(newRoute);
        smoothRouteCoordsRef.current = newRoute;
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animateRoute);
  }, []);

  /**
   * Update route based on driver's current position
   * - Slices route to show only remaining portion
   * - Detects if driver is off-route
   * - Triggers re-fetch if needed
   */
  const updateRouteWithDriverPosition = useCallback(
    async (driverPos: LocationType) => {
      if (!destination || !isActive) return;

      const currentRoute = routeCoordsRef.current;

      if (currentRoute && currentRoute.length > 0) {
        const { index: closestIndex, distance: minDistance } = findClosestPointOnRoute(
          driverPos,
          currentRoute
        );

        setDistanceToRoute(minDistance);

        // Check if driver is off-route
        if (minDistance > offRouteThreshold && !routeUpdateInProgressRef.current) {
          console.log(
            `⚠️ Driver off route (${minDistance.toFixed(1)}m), recalculating...`
          );
          setIsOffRoute(true);

          routeUpdateInProgressRef.current = true;
          const routeData = await fetchRealTimeRoute(driverPos, destination);
          if (routeData) {
            routeCoordsRef.current = routeData.coords;
            animateRouteTransition(routeData.coords);
          }
          routeUpdateInProgressRef.current = false;
          setIsOffRoute(false);
        } else if (closestIndex > 0) {
          setIsOffRoute(false);
          // Slice route to show only remaining portion (smooth decrease animation)
          const remainingRoute = currentRoute.slice(closestIndex);

          // Calculate progress
          const progress = (closestIndex / (currentRoute.length - 1)) * 100;
          setRouteProgress(Math.min(100, Math.max(0, progress)));

          // Animate the route slice
          animateRouteTransition(remainingRoute);
        }
      } else {
        // No route yet, fetch it
        if (!routeUpdateInProgressRef.current) {
          routeUpdateInProgressRef.current = true;
          const routeData = await fetchRealTimeRoute(driverPos, destination);
          if (routeData) {
            routeCoordsRef.current = routeData.coords;
            animateRouteTransition(routeData.coords);
          }
          routeUpdateInProgressRef.current = false;
        }
      }
    },
    [destination, isActive, offRouteThreshold, fetchRealTimeRoute, animateRouteTransition]
  );

  /**
   * Main driver location update handler
   */
  const handleDriverLocationUpdate = useCallback(
    (newDriverLocation: LocationType) => {
      if (!isActive) return;

      // Calculate adaptive animation duration based on update frequency
      const now = Date.now();
      const lastTime = lastLocationUpdateTimeRef.current;
      let animationDuration = 2000; // Default fallback

      if (lastTime > 0) {
        const timeDiff = now - lastTime;
        // Adapt duration with 20% buffer for smooth movement
        if (timeDiff > 500 && timeDiff < 15000) {
          animationDuration = timeDiff * 1.2;
        }
      }
      lastLocationUpdateTimeRef.current = now;

      // Animate driver marker with continuous movement
      animateDriverPosition(
        newDriverLocation.latitude,
        newDriverLocation.longitude,
        animationDuration
      );

      // Update route (with throttling)
      const timeSinceLastRouteUpdate = now - lastRouteUpdateTimeRef.current;
      if (timeSinceLastRouteUpdate >= routeUpdateInterval) {
        lastRouteUpdateTimeRef.current = now;
        updateRouteWithDriverPosition(newDriverLocation);
      }

      console.log(
        `📍 Driver location animated: [${newDriverLocation.latitude.toFixed(5)}, ${newDriverLocation.longitude.toFixed(5)}]`
      );
    },
    [isActive, animateDriverPosition, updateRouteWithDriverPosition, routeUpdateInterval]
  );

  /**
   * Force fetch new route (useful when destination changes)
   */
  const fetchNewRoute = useCallback(
    async (from: LocationType, to: LocationType): Promise<LocationType[] | null> => {
      routeUpdateInProgressRef.current = true;
      previousRouteRef.current = routeCoordsRef.current;

      const routeData = await fetchRealTimeRoute(from, to);
      if (routeData) {
        routeCoordsRef.current = routeData.coords;
        animateRouteTransition(routeData.coords);
        routeUpdateInProgressRef.current = false;
        return routeData.coords;
      }

      routeUpdateInProgressRef.current = false;
      return null;
    },
    [fetchRealTimeRoute, animateRouteTransition]
  );

  /**
   * Reset animation state (useful when ride ends)
   */
  const resetAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setSmoothRoute([]);
    setDisplayedDriverLocation(null);
    setIsAnimating(false);
    setRouteProgress(0);
    setIsOffRoute(false);
    setDistanceToRoute(0);

    routeCoordsRef.current = [];
    smoothRouteCoordsRef.current = [];
    displayedDriverLocationRef.current = null;
    previousRouteRef.current = [];
    routeUpdateInProgressRef.current = false;
    lastRouteUpdateTimeRef.current = 0;
    lastLocationUpdateTimeRef.current = 0;
  }, []);

  // Effect: Handle driver location changes
  useEffect(() => {
    if (driverLocation && isActive) {
      const distanceMoved = displayedDriverLocationRef.current
        ? calculateDistanceInMeters(
            displayedDriverLocationRef.current.latitude,
            displayedDriverLocationRef.current.longitude,
            driverLocation.latitude,
            driverLocation.longitude
          )
        : Infinity;

      // Only animate if moved more than 1 meter
      if (distanceMoved > 1) {
        handleDriverLocationUpdate(driverLocation);
      }
    }
  }, [driverLocation, isActive, handleDriverLocationUpdate]);

  // Effect: Initialize route when destination is set
  useEffect(() => {
    if (driverLocation && destination && isActive && !routeUpdateInProgressRef.current) {
      console.log('🚀 Initial route fetch');
      fetchNewRoute(driverLocation, destination).then((coords) => {
        if (coords) {
          setDisplayedDriverLocation(driverLocation);
          displayedDriverLocationRef.current = driverLocation;
        }
      });
    }
  }, [destination, isActive]); // Intentionally not including driverLocation to avoid infinite loop

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    // Animated route for rendering
    smoothRoute,
    // Displayed driver location (animated)
    displayedDriverLocation,
    // Animation status
    isAnimating,
    // Progress percentage (0-100)
    routeProgress,
    // Off-route status
    isOffRoute,
    // Distance to nearest point on route
    distanceToRoute,
    // Manual route fetch
    fetchNewRoute,
    // Reset everything
    resetAnimation,
    // Process location update
    handleDriverLocationUpdate,
  };
};

export default useDriverPolylineAnimation;
