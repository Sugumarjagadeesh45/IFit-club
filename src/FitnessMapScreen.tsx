/**
 * FitnessMapScreen - Main Map Screen for Fitness App
 * Features:
 * - Map view with live location tracking
 * - Smooth animations as user moves
 * - 1-second location updates
 * - Socket emission to backend every second
 * - Works in background, when screen is locked, or other apps are open
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  Dimensions,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from "react-native";

import MapLibreGL from '@maplibre/maplibre-react-native';
import { getLightMapStyleString } from './mapStyle';
import Geolocation from "@react-native-community/geolocation";
import {
  startBackgroundLocationService,
  setLocationCallback,
} from './BackgroundLocationService';
import { connectSocket, isSocketConnected, emitLocationUpdate } from './socket';

const { width, height } = Dimensions.get("window");

type LocationType = {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  accuracy?: number;
  timestamp?: number;
};

MapLibreGL.setAccessToken(null); // No token needed for OSM

// Memoize map style to prevent re-renders
const MAP_STYLE = getLightMapStyleString();

// ============ PROFESSIONAL BLUE DOT COMPONENT ============
// Animated blue dot like Google Maps for user location
const UserLocationDot = React.memo(() => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 2.5,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={blueDotStyles.container}>
      {/* Animated pulse ring */}
      <Animated.View
        style={[
          blueDotStyles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      {/* Outer white border */}
      <View style={blueDotStyles.outerRing} />
      {/* Inner blue dot */}
      <View style={blueDotStyles.innerDot} />
    </View>
  );
});

// Blue dot styles
const blueDotStyles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
  },
  outerRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  innerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4285F4',
  },
});

// ============ MAP UTILITIES ============

// Helper function for linear interpolation
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

// Distance Calculation (Haversine Formula)
const calculateDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  return distanceKm * 1000; // Convert to meters
};

const FitnessMapScreen = () => {
  // Location states
  const [location, setLocation] = useState<LocationType | null>(null);
  const [displayedLocation, setDisplayedLocation] = useState<LocationType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracking states
  const [routeCoords, setRouteCoords] = useState<LocationType[]>([]);
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  // Map refs
  const mapRef = useRef<MapLibreGL.MapView | null>(null);
  const cameraRef = useRef<MapLibreGL.Camera | null>(null);
  const isMountedRef = useRef(true);
  const lastCameraUpdate = useRef(0);

  // Animation refs
  const animationFrameRef = useRef<number | null>(null);
  const displayedLocationRef = useRef<LocationType | null>(null);
  const locationRef = useRef<LocationType | null>(null);

  // Update refs when state changes
  useEffect(() => {
    displayedLocationRef.current = displayedLocation;
  }, [displayedLocation]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // ============ APP STATE HANDLING ============
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('📱 App state changed:', appState, '->', nextAppState);
      setAppState(nextAppState);

      // When app comes to foreground, check socket connection
      if (nextAppState === 'active') {
        if (!isSocketConnected()) {
          console.log('🔌 Reconnecting socket...');
          connectSocket();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appState]);

  // ============ LOCATION PERMISSIONS ============
  const requestLocationPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        // Request fine location permission
        const fineLocation = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "This app needs access to your location to track your fitness activities.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );

        if (fineLocation !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("❌ Fine location permission denied");
          return false;
        }

        // Request background location permission (Android 10+)
        if (Platform.Version >= 29) {
          const backgroundLocation = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
              title: "Background Location Permission",
              message: "This app needs background location access to track your fitness activities even when the app is in the background or your screen is locked.",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK"
            }
          );

          if (backgroundLocation !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log("⚠️ Background location permission denied - tracking may not work in background");
            Alert.alert(
              "Background Location Required",
              "For continuous tracking, please enable 'Allow all the time' in app settings.",
              [{ text: "OK" }]
            );
          } else {
            console.log("✅ Background location permission granted");
          }
        }

        console.log("✅ Location permissions granted");
        return true;
      } catch (err) {
        console.warn("Error requesting location permission:", err);
        return false;
      }
    }
    return true; // iOS handles permissions differently
  };

  // ============ SMOOTH LOCATION ANIMATION ============
  const animateToNewLocation = useCallback((newLocation: LocationType) => {
    if (!isMountedRef.current) return;

    const currentDisplayed = displayedLocationRef.current;

    if (!currentDisplayed) {
      // First location - set immediately
      setDisplayedLocation(newLocation);
      return;
    }

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startLat = currentDisplayed.latitude;
    const startLng = currentDisplayed.longitude;
    const endLat = newLocation.latitude;
    const endLng = newLocation.longitude;
    const duration = 900; // Slightly less than 1 second for smooth continuous movement
    const startTime = Date.now();

    const animate = () => {
      if (!isMountedRef.current) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const interpolatedLat = lerp(startLat, endLat, easeProgress);
      const interpolatedLng = lerp(startLng, endLng, easeProgress);

      setDisplayedLocation({
        latitude: interpolatedLat,
        longitude: interpolatedLng,
      });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animate();
  }, []);

  // ============ CAMERA FOLLOWING ============
  const animateMapToLocation = useCallback((targetLocation: LocationType) => {
    if (!cameraRef.current || !isMountedRef.current) return;

    const now = Date.now();
    // Throttle camera updates (max once per 2 seconds)
    if (now - lastCameraUpdate.current < 2000) return;
    lastCameraUpdate.current = now;

    cameraRef.current.setCamera({
      centerCoordinate: [targetLocation.longitude, targetLocation.latitude],
      zoomLevel: 16,
      animationDuration: 2000,
    });
  }, []);

  // Follow location changes
  useEffect(() => {
    if (location) {
      animateMapToLocation(location);
    }
  }, [location, animateMapToLocation]);

  // ============ LOCATION UPDATE HANDLER ============
  const handleLocationUpdate = useCallback((locationData: LocationType) => {
    if (!isMountedRef.current) return;

    console.log('📍 Location update:', locationData.latitude.toFixed(6), locationData.longitude.toFixed(6));

    // Update state
    setLocation(locationData);

    // Animate marker to new location (smooth movement)
    animateToNewLocation(locationData);

    // Emit to backend via socket (already handled by BackgroundLocationService)
    // But also emit here for redundancy when in foreground
    if (appState === 'active' && isSocketConnected()) {
      emitLocationUpdate({
        ...locationData,
        timestamp: locationData.timestamp || Date.now(),
      });
    }
  }, [animateToNewLocation, appState]);

  // ============ START BACKGROUND TRACKING ============
  const startTracking = useCallback(async () => {
    console.log('🚀 Starting continuous location tracking...');

    // Connect socket first
    connectSocket();
    setSocketConnected(isSocketConnected());

    // Set location callback for UI updates
    setLocationCallback(handleLocationUpdate);

    // Start background location service
    const started = await startBackgroundLocationService(handleLocationUpdate);

    if (started) {
      setIsTrackingActive(true);
      console.log('✅ Background location tracking started');
    } else {
      console.log('❌ Failed to start background tracking, using foreground only');
      // Fallback to foreground tracking
      startForegroundTracking();
    }
  }, [handleLocationUpdate]);

  // ============ FOREGROUND TRACKING (FALLBACK) ============
  const startForegroundTracking = useCallback(() => {
    console.log('📍 Starting foreground location tracking...');

    // Get initial position
    Geolocation.getCurrentPosition(
      (position) => {
        const locationData: LocationType = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined,
          altitude: position.coords.altitude ?? undefined,
          accuracy: position.coords.accuracy ?? undefined,
          timestamp: position.timestamp,
        };

        console.log("✅ Initial location:", locationData.latitude, locationData.longitude);
        handleLocationUpdate(locationData);
        setIsLoading(false);
      },
      (error) => {
        console.error("❌ Error getting initial location:", error);
        setError("Unable to get your location. Please enable GPS.");
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    // Watch position with 1-second interval
    const watchId = Geolocation.watchPosition(
      (position) => {
        const locationData: LocationType = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined,
          altitude: position.coords.altitude ?? undefined,
          accuracy: position.coords.accuracy ?? undefined,
          timestamp: position.timestamp,
        };

        handleLocationUpdate(locationData);

        // Emit to socket every second
        emitLocationUpdate({
          ...locationData,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        console.error("❌ Location watch error:", error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0, // Get updates even if position hasn't changed
        interval: 1000, // 1 second interval
        fastestInterval: 1000,
      }
    );

    setIsTrackingActive(true);

    return () => {
      Geolocation.clearWatch(watchId);
    };
  }, [handleLocationUpdate]);

  // ============ INITIALIZATION ============
  useEffect(() => {
    isMountedRef.current = true;

    const initialize = async () => {
      console.log('🎯 Initializing Fitness Map...');

      // Request permissions
      const hasPermission = await requestLocationPermissions();

      if (!hasPermission) {
        setError("Location permission is required to use this app.");
        setIsLoading(false);
        return;
      }

      // Get initial location quickly
      Geolocation.getCurrentPosition(
        (position) => {
          const initialLocation: LocationType = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp,
          };

          console.log("✅ Initial location acquired:", initialLocation.latitude, initialLocation.longitude);
          setLocation(initialLocation);
          setDisplayedLocation(initialLocation);
          setIsLoading(false);

          // Start continuous tracking after initial location
          startTracking();
        },
        (error) => {
          console.error("❌ Error getting initial location:", error);
          setError("Unable to get your location. Please enable GPS.");
          setIsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    };

    initialize();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up FitnessMapScreen...');
      isMountedRef.current = false;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Note: We don't stop background service on unmount
      // because we want it to continue running
    };
  }, [startTracking]);

  // ============ CHECK SOCKET STATUS PERIODICALLY ============
  useEffect(() => {
    const checkSocket = setInterval(() => {
      const connected = isSocketConnected();
      setSocketConnected(connected);

      if (!connected && appState === 'active') {
        console.log('🔌 Socket disconnected, attempting reconnect...');
        connectSocket();
      }
    }, 5000);

    return () => clearInterval(checkSocket);
  }, [appState]);

  // ============ RENDER ============

  // Loading screen
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  // Error screen
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // Default location fallback
  const currentLocation = location || { latitude: 12.9716, longitude: 77.5946 };

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={true}
        zoomEnabled={true}
        scrollEnabled={true}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
            zoomLevel: 16,
          }}
          followUserLocation={false}
        />

        {/* User Location - Animated Blue Dot */}
        {displayedLocation && (
          <MapLibreGL.PointAnnotation
            id="user-location"
            coordinate={[displayedLocation.longitude, displayedLocation.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <UserLocationDot />
          </MapLibreGL.PointAnnotation>
        )}

        {/* Route Polyline - Shadow Layer */}
        {routeCoords.length >= 2 && (
          <MapLibreGL.ShapeSource
            id="route-shadow-source"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: routeCoords.map(c => [c.longitude, c.latitude]),
              },
            }}
          >
            <MapLibreGL.LineLayer
              id="route-shadow-layer"
              style={{
                lineColor: '#1565C0',
                lineWidth: 8,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.4,
                lineBlur: 3,
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Route Polyline - Main Layer */}
        {routeCoords.length >= 2 && (
          <MapLibreGL.ShapeSource
            id="route-source"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: routeCoords.map(c => [c.longitude, c.latitude]),
              },
            }}
          >
            <MapLibreGL.LineLayer
              id="route-layer"
              style={{
                lineColor: '#4285F4',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: isTrackingActive ? '#4CAF50' : '#FF9800' }]} />
          <Text style={styles.statusText}>
            {isTrackingActive ? 'GPS Active' : 'Starting...'}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: socketConnected ? '#4CAF50' : '#f44336' }]} />
          <Text style={styles.statusText}>
            {socketConnected ? 'Connected' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Location Info (Debug) */}
      {location && (
        <View style={styles.locationInfo}>
          <Text style={styles.locationText}>
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  map: {
    flex: 1,
    width: width,
    height: height,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  statusBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statusDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#ddd',
    marginHorizontal: 16,
  },
  locationInfo: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  locationText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default FitnessMapScreen;
