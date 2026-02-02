/**
 * EnhancedBackgroundLocationService.ts
 * Production-grade background location tracking
 * Works in foreground, background, and when app is killed
 */

import BackgroundActions from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../apiConfig';
import PersistentOnlineService from './PersistentOnlineService';

interface LocationUpdate {
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  speed: number;
  bearing: number;
  accuracy: number;
  timestamp: string;
  isBackground: boolean;
  isOnline: boolean;
  status: 'online' | 'onRide' | 'offline';
}

class EnhancedBackgroundLocationService {
  private static instance: EnhancedBackgroundLocationService;
  private backgroundSocket: Socket | null = null;
  private isServiceRunning: boolean = false;
  private locationUpdateInterval: number = 10000; // 10 seconds for background
  private foregroundInterval: number = 5000; // 5 seconds for foreground

  static getInstance(): EnhancedBackgroundLocationService {
    if (!EnhancedBackgroundLocationService.instance) {
      EnhancedBackgroundLocationService.instance = new EnhancedBackgroundLocationService();
    }
    return EnhancedBackgroundLocationService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Initialize background socket connection
   * This socket stays alive even when app is backgrounded
   */
  private initializeBackgroundSocket(): Socket {
    if (this.backgroundSocket && this.backgroundSocket.connected) {
      return this.backgroundSocket;
    }

    console.log('🔌 Initializing background socket:', SOCKET_URL);

    this.backgroundSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // ✅ Never give up reconnecting
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: false,
      secure: true,
    });

    // Socket event handlers
    this.backgroundSocket.on('connect', () => {
      console.log('✅ Background socket connected');
      this.registerDriver();
    });

    this.backgroundSocket.on('disconnect', (reason) => {
      console.log('❌ Background socket disconnected:', reason);
    });

    this.backgroundSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Background socket reconnected (attempt ${attemptNumber})`);
      this.registerDriver();
    });

    this.backgroundSocket.on('error', (error) => {
      console.error('❌ Background socket error:', error);
    });

    return this.backgroundSocket;
  }

  /**
   * Register driver on socket connection
   */
  private async registerDriver(): Promise<void> {
    try {
      const [driverId, driverName, vehicleType, location] = await Promise.all([
        AsyncStorage.getItem('driverId'),
        AsyncStorage.getItem('driverName'),
        AsyncStorage.getItem('vehicleType'),
        this.getCurrentLocation(),
      ]);

      if (this.backgroundSocket && driverId && location) {
        const isOnline = await PersistentOnlineService.isOnline();

        if (isOnline) {
          this.backgroundSocket.emit('registerDriver', {
            driverId,
            driverName: driverName || '',
            vehicleType: (vehicleType || 'taxi').toLowerCase(),
            latitude: location.latitude,
            longitude: location.longitude,
            status: 'online',
            timestamp: new Date().toISOString(),
          });

          console.log('✅ Driver registered on background socket:', driverId);
        }
      }
    } catch (error) {
      console.error('❌ Error registering driver:', error);
    }
  }

  /**
   * Get current location (promise-based)
   */
  private getCurrentLocation(): Promise<{
    latitude: number;
    longitude: number;
    speed: number;
    bearing: number;
    accuracy: number;
  }> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed || 0,
            bearing: position.coords.heading || 0,
            accuracy: position.coords.accuracy || 0,
          });
        },
        (error) => {
          console.warn('⚠️ Location error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    });
  }

  /**
   * Emit location update to server
   */
  private async emitLocationUpdate(isBackground: boolean): Promise<void> {
    try {
      // Check if driver is still online
      const isOnline = await PersistentOnlineService.isOnline();
      if (!isOnline) {
        console.log('📴 Driver offline - skipping location update');
        return;
      }

      // Get current location
      const location = await this.getCurrentLocation();

      // Get driver info from storage
      const [driverId, driverName, rideStatus] = await Promise.all([
        AsyncStorage.getItem('driverId'),
        AsyncStorage.getItem('driverName'),
        AsyncStorage.getItem('currentRideStatus'),
      ]);

      if (!driverId) {
        console.warn('⚠️ No driver ID - cannot emit location');
        return;
      }

      const locationUpdate: LocationUpdate = {
        driverId,
        driverName: driverName || '',
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        bearing: location.bearing,
        accuracy: location.accuracy,
        timestamp: new Date().toISOString(),
        isBackground,
        isOnline: true,
        status: rideStatus === 'started' ? 'onRide' : 'online',
      };

      // Emit to socket
      if (this.backgroundSocket && this.backgroundSocket.connected) {
        this.backgroundSocket.emit('driverLocationUpdate', locationUpdate);

        console.log(
          `📍 Location emitted (${isBackground ? 'BG' : 'FG'}):`,
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
          `Speed: ${location.speed.toFixed(1)}m/s`,
          `Bearing: ${location.bearing.toFixed(0)}°`
        );
      } else {
        console.warn('⚠️ Socket not connected - reconnecting...');
        this.initializeBackgroundSocket();
      }
    } catch (error) {
      console.error('❌ Error emitting location:', error);
    }
  }

  /**
   * Background task - runs continuously
   */
  private async backgroundTask(taskData: any): Promise<void> {
    console.log('🔄 Background location task started');

    // Initialize socket
    this.initializeBackgroundSocket();

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (BackgroundActions.isRunning()) {
      try {
        // Check if still online
        const isOnline = await PersistentOnlineService.isOnline();

        if (isOnline) {
          await this.emitLocationUpdate(true);
        } else {
          console.log('📴 Driver went offline - stopping location updates');
          break;
        }

        // Wait for next update
        await sleep(this.locationUpdateInterval);
      } catch (error) {
        console.error('❌ Background task error:', error);
        await sleep(5000); // Wait 5s before retry on error
      }
    }

    console.log('✅ Background location task stopped');
  }

  /**
   * Start background location service
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting background location service...');

      // Check if driver is online
      const isOnline = await PersistentOnlineService.isOnline();
      if (!isOnline) {
        console.log('❌ Driver is offline - cannot start location service');
        return;
      }

      // Stop if already running
      if (this.isServiceRunning) {
        console.log('⚠️ Service already running - stopping first');
        await this.stop();
      }

      const options = {
        taskName: 'DriverLocationTracking',
        taskTitle: 'EAZY GO Driver',
        taskDesc: 'You are Online - Sharing live location',
        taskIcon: {
          name: 'ic_launcher',
          type: 'mipmap',
        },
        color: '#4CAF50',
        linkingURI: 'eazygodriver://ride',
        parameters: {
          delay: this.locationUpdateInterval,
        },
      };

      await BackgroundActions.start(this.backgroundTask.bind(this), options);
      this.isServiceRunning = true;

      console.log('✅ Background location service started');
    } catch (error) {
      console.error('❌ Error starting background location service:', error);
      throw error;
    }
  }

  /**
   * Stop background location service
   */
  async stop(): Promise<void> {
    try {
      console.log('🛑 Stopping background location service...');

      if (BackgroundActions.isRunning()) {
        await BackgroundActions.stop();
      }

      // Disconnect background socket
      if (this.backgroundSocket) {
        this.backgroundSocket.disconnect();
        this.backgroundSocket = null;
      }

      this.isServiceRunning = false;

      console.log('✅ Background location service stopped');
    } catch (error) {
      console.error('❌ Error stopping background location service:', error);
    }
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.isServiceRunning && BackgroundActions.isRunning();
  }

  /**
   * Update location update interval
   */
  setUpdateInterval(foreground: number, background: number): void {
    this.foregroundInterval = foreground;
    this.locationUpdateInterval = background;
    console.log(`⏱️ Update intervals: FG=${foreground}ms, BG=${background}ms`);
  }

  /**
   * Force location update immediately
   */
  async forceUpdate(): Promise<void> {
    try {
      const isOnline = await PersistentOnlineService.isOnline();
      if (isOnline) {
        await this.emitLocationUpdate(false);
      }
    } catch (error) {
      console.error('❌ Error in force update:', error);
    }
  }

  /**
   * Get socket connection status
   */
  isSocketConnected(): boolean {
    return this.backgroundSocket?.connected || false;
  }

  /**
   * Cleanup - stop everything
   */
  async cleanup(): Promise<void> {
    await this.stop();
    console.log('✅ Enhanced background location service cleaned up');
  }
}

export default EnhancedBackgroundLocationService.getInstance();