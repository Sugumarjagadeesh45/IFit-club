/**
 * Background Location Service
 * Provides continuous location tracking even when app is in background or screen is locked
 * Updates location every 1 second and emits to backend via socket
 */

import BackgroundService from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import { emitLocationUpdate, connectSocket, isSocketConnected } from './socket';

// Types
type LocationType = {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
};

type LocationCallback = (location: LocationType) => void;

// State
let locationCallback: LocationCallback | null = null;
let isRunning = false;
let userId: string | null = null;

// Configuration
const LOCATION_UPDATE_INTERVAL = 1000; // 1 second

/**
 * Background task that runs continuously
 */
const backgroundLocationTask = async (taskData: any) => {
  console.log('🚀 Background location task started');

  // Ensure socket is connected
  if (!isSocketConnected()) {
    connectSocket();
  }

  // Keep the task running indefinitely
  await new Promise<void>(async (resolve) => {
    // Start watching position
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

        console.log('📍 Background location update:', locationData.latitude.toFixed(6), locationData.longitude.toFixed(6));

        // Emit to backend via socket
        emitLocationUpdate({
          ...locationData,
          userId: userId ?? undefined,
        });

        // Notify the callback (for UI updates)
        if (locationCallback) {
          locationCallback(locationData);
        }
      },
      (error) => {
        console.error('❌ Background location error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0, // Get updates even if position hasn't changed
        interval: LOCATION_UPDATE_INTERVAL, // Android only
        fastestInterval: LOCATION_UPDATE_INTERVAL, // Android only
      }
    );

    // The task will keep running until explicitly stopped
    // This is handled by react-native-background-actions
  });
};

/**
 * Background service options
 */
const backgroundOptions = {
  taskName: 'FitnessLocationTracking',
  taskTitle: 'Fitness Tracking Active',
  taskDesc: 'Tracking your location for fitness activity',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#4285F4',
  linkingURI: 'fitnessfit://home',
  parameters: {
    delay: LOCATION_UPDATE_INTERVAL,
  },
};

/**
 * Start background location tracking
 */
export const startBackgroundLocationService = async (
  callback?: LocationCallback,
  userIdentifier?: string
): Promise<boolean> => {
  try {
    if (isRunning) {
      console.log('⚠️ Background service already running');
      return true;
    }

    // Store callback and user ID
    locationCallback = callback || null;
    userId = userIdentifier || null;

    // Connect socket before starting
    connectSocket();

    // Start background service
    await BackgroundService.start(backgroundLocationTask, backgroundOptions);
    isRunning = true;

    console.log('✅ Background location service started');
    return true;
  } catch (error) {
    console.error('❌ Failed to start background location service:', error);
    return false;
  }
};

/**
 * Stop background location tracking
 */
export const stopBackgroundLocationService = async (): Promise<void> => {
  try {
    if (!isRunning) {
      console.log('⚠️ Background service not running');
      return;
    }

    await BackgroundService.stop();
    isRunning = false;
    locationCallback = null;

    console.log('✅ Background location service stopped');
  } catch (error) {
    console.error('❌ Failed to stop background location service:', error);
  }
};

/**
 * Check if background service is running
 */
export const isBackgroundServiceRunning = (): boolean => {
  return BackgroundService.isRunning();
};

/**
 * Update the location callback
 */
export const setLocationCallback = (callback: LocationCallback | null): void => {
  locationCallback = callback;
};

/**
 * Update user identifier
 */
export const setUserId = (id: string): void => {
  userId = id;
};

export default {
  start: startBackgroundLocationService,
  stop: stopBackgroundLocationService,
  isRunning: isBackgroundServiceRunning,
  setCallback: setLocationCallback,
  setUserId,
};
