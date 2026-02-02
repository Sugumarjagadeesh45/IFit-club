/**
 * NativeLocationService.ts
 *
 * React Native wrapper for the native Android BackgroundLocationService.
 * This provides a reliable background location tracking that survives:
 * - App going to background
 * - Screen lock
 * - App being closed
 * - Device reboot (if driver was online)
 *
 * Usage:
 *   import NativeLocationService from './NativeLocationService';
 *
 *   // Start service when driver goes online
 *   await NativeLocationService.start(driverId, driverName, vehicleType, socketUrl);
 *
 *   // Update when ride is accepted/started
 *   await NativeLocationService.updateRideStatus('accepted', rideId);
 *
 *   // Stop when driver goes offline
 *   await NativeLocationService.stop();
 */

import { NativeModules, Platform } from 'react-native';

const { LocationService } = NativeModules;

interface ServiceStatus {
  isRunning: boolean;
  isSocketConnected: boolean;
  lastLatitude?: number;
  lastLongitude?: number;
}

// Helper to prevent infinite hangs if native module doesn't respond
const withTimeout = <T>(promise: Promise<T>, ms: number = 3000): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Native service timeout'));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
};

const NativeLocationService = {
  /**
   * Start the native background location service
   * Call this when driver clicks "ONLINE"
   */
  start: async (
    driverId: string,
    driverName: string,
    vehicleType: string,
    socketUrl: string
  ): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      console.log('NativeLocationService: iOS not supported yet, using JS fallback');
      return false;
    }

    if (!LocationService) {
      console.error('NativeLocationService: Native module not available');
      return false;
    }

    if (!driverId || !socketUrl) {
      console.error('❌ NativeLocationService: Missing driverId or socketUrl');
      return false;
    }

    try {
      console.log('🚀 Starting native location service for driver:', driverId);
      const result = await withTimeout(
        LocationService.startService(
          driverId,
          driverName,
          vehicleType,
          socketUrl
        )
      );
      console.log('✅ Native location service started');
      return result;
    } catch (error) {
      console.error('❌ Error starting native location service:', error);
      return false;
    }
  },

  /**
   * Stop the native background location service
   * Call this when driver clicks "OFFLINE" or "Ride Complete"
   */
  stop: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return false;
    }

    try {
      console.log('🛑 Stopping native location service');
      const result = await withTimeout(LocationService.stopService());
      console.log('✅ Native location service stopped');
      return result;
    } catch (error) {
      console.error('❌ Error stopping native location service:', error);
      return false;
    }
  },

  /**
   * Update ride status in the service
   * Call this when ride is accepted, started, or completed
   *
   * @param status - 'online' | 'accepted' | 'started' | 'completed'
   * @param rideId - Current ride ID (null if no active ride)
   */
  updateRideStatus: async (
    status: 'online' | 'accepted' | 'started' | 'completed',
    rideId: string | null
  ): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return false;
    }

    try {
      console.log('📝 Updating ride status:', status, 'rideId:', rideId);
      // Timeout added to prevent app freeze during OTP verification
      const result = await withTimeout(
        LocationService.updateRideStatus(status, rideId)
      );
      return result;
    } catch (error) {
      console.error('❌ Error updating ride status:', error);
      // Return true to allow app flow to continue even if native service lags
      return true;
    }
  },

  /**
   * Check if the native service is running
   */
  isRunning: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return false;
    }

    try {
      return await LocationService.isServiceRunning();
    } catch (error) {
      return false;
    }
  },

  /**
   * Check if socket is connected (at native level)
   */
  isSocketConnected: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return false;
    }

    try {
      return await LocationService.isSocketConnected();
    } catch (error) {
      return false;
    }
  },

  /**
   * Get full service status
   */
  getStatus: async (): Promise<ServiceStatus> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return { isRunning: false, isSocketConnected: false };
    }

    try {
      return await LocationService.getServiceStatus();
    } catch (error) {
      return { isRunning: false, isSocketConnected: false };
    }
  },

  /**
   * Check if driver was online before app restart/reboot
   * Use this to restore driver state on app launch
   */
  wasDriverOnline: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LocationService) {
      return false;
    }

    try {
      return await LocationService.wasDriverOnline();
    } catch (error) {
      return false;
    }
  },

  /**
   * Check if the native module is available
   */
  isAvailable: (): boolean => {
    return Platform.OS === 'android' && LocationService !== null;
  },
};

export default NativeLocationService;
