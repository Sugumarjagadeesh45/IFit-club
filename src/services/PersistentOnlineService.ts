/**
 * PersistentOnlineService.ts
 * Manages persistent ONLINE state across app lifecycle
 * Ensures driver stays online even when app is backgrounded/killed
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundTimer from 'react-native-background-timer';

export interface OnlineState {
  isOnline: boolean;
  onlineSince: string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleType: string | null;
  workingHoursStartTime: string | null;
  workingHoursDuration: number; // in seconds
  remainingSeconds: number;
}

class PersistentOnlineService {
  private static instance: PersistentOnlineService;
  private onlineCheckInterval: number | null = null;
  private listeners: Map<string, Function[]> = new Map();

  static getInstance(): PersistentOnlineService {
    if (!PersistentOnlineService.instance) {
      PersistentOnlineService.instance = new PersistentOnlineService();
    }
    return PersistentOnlineService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Set driver online - persists state to AsyncStorage
   */
  async setOnline(
    driverId: string,
    driverName: string,
    vehicleType: string,
    workingHoursDuration: number
  ): Promise<void> {
    try {
      const onlineState: OnlineState = {
        isOnline: true,
        onlineSince: new Date().toISOString(),
        driverId,
        driverName,
        vehicleType,
        workingHoursStartTime: new Date().toISOString(),
        workingHoursDuration,
        remainingSeconds: workingHoursDuration,
      };

      await AsyncStorage.setItem('driverOnlineState', JSON.stringify(onlineState));
      await AsyncStorage.setItem('isDriverOnline', 'true');
      await AsyncStorage.setItem('driverId', driverId);
      await AsyncStorage.setItem('driverName', driverName);
      await AsyncStorage.setItem('vehicleType', vehicleType);

      console.log('✅ Driver set ONLINE:', {
        driverId,
        driverName,
        vehicleType,
        workingHours: workingHoursDuration / 3600 + 'h',
      });

      // Start timer monitoring
      this.startTimerMonitoring();

      // Emit online event
      this.emit('onlineStateChanged', { isOnline: true, ...onlineState });
    } catch (error) {
      console.error('❌ Error setting driver online:', error);
      throw error;
    }
  }

  /**
   * Set driver offline - clears persisted state
   */
  async setOffline(): Promise<void> {
    try {
      const currentState = await this.getOnlineState();

      const offlineState: OnlineState = {
        isOnline: false,
        onlineSince: null,
        driverId: currentState?.driverId || null,
        driverName: currentState?.driverName || null,
        vehicleType: currentState?.vehicleType || null,
        workingHoursStartTime: null,
        workingHoursDuration: 0,
        remainingSeconds: 0,
      };

      await AsyncStorage.setItem('driverOnlineState', JSON.stringify(offlineState));
      await AsyncStorage.setItem('isDriverOnline', 'false');

      console.log('✅ Driver set OFFLINE');

      // Stop timer monitoring
      this.stopTimerMonitoring();

      // Emit offline event
      this.emit('onlineStateChanged', { isOnline: false, ...offlineState });
    } catch (error) {
      console.error('❌ Error setting driver offline:', error);
      throw error;
    }
  }

  /**
   * Get current online state
   */
  async getOnlineState(): Promise<OnlineState | null> {
    try {
      const stateJson = await AsyncStorage.getItem('driverOnlineState');
      if (stateJson) {
        return JSON.parse(stateJson);
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting online state:', error);
      return null;
    }
  }

  /**
   * Check if driver is currently online
   */
  async isOnline(): Promise<boolean> {
    try {
      const state = await this.getOnlineState();
      return state?.isOnline || false;
    } catch (error) {
      console.error('❌ Error checking online status:', error);
      return false;
    }
  }

  /**
   * Update remaining working hours
   */
  async updateRemainingTime(remainingSeconds: number): Promise<void> {
    try {
      const state = await this.getOnlineState();
      if (state) {
        state.remainingSeconds = remainingSeconds;
        await AsyncStorage.setItem('driverOnlineState', JSON.stringify(state));

        // Emit timer update
        this.emit('timerUpdate', { remainingSeconds });
      }
    } catch (error) {
      console.error('❌ Error updating remaining time:', error);
    }
  }

  /**
   * Start background timer monitoring
   * Runs even when app is killed
   */
  private startTimerMonitoring(): void {
    if (this.onlineCheckInterval) {
      BackgroundTimer.clearInterval(this.onlineCheckInterval);
    }

    this.onlineCheckInterval = BackgroundTimer.setInterval(async () => {
      try {
        const state = await this.getOnlineState();
        if (state && state.isOnline && state.workingHoursStartTime) {
          const startTime = new Date(state.workingHoursStartTime).getTime();
          const now = Date.now();
          const elapsedSeconds = Math.floor((now - startTime) / 1000);
          const remaining = state.workingHoursDuration - elapsedSeconds;

          if (remaining <= 0) {
            // Working hours expired - auto offline
            console.log('⏰ Working hours expired - auto offline');
            await this.setOffline();
            this.emit('workingHoursExpired', {});
          } else {
            // Update remaining time
            await this.updateRemainingTime(remaining);
          }
        }
      } catch (error) {
        console.error('❌ Error in timer monitoring:', error);
      }
    }, 1000); // Check every second

    console.log('✅ Background timer monitoring started');
  }

  /**
   * Stop background timer monitoring
   */
  private stopTimerMonitoring(): void {
    if (this.onlineCheckInterval) {
      BackgroundTimer.clearInterval(this.onlineCheckInterval);
      this.onlineCheckInterval = null;
      console.log('✅ Background timer monitoring stopped');
    }
  }

  /**
   * Restore online state on app restart
   * Returns true if driver was previously online
   */
  async restoreOnlineState(): Promise<boolean> {
    try {
      const state = await this.getOnlineState();

      if (state && state.isOnline) {
        console.log('🔄 Restoring online state:', {
          driverId: state.driverId,
          onlineSince: state.onlineSince,
        });

        // Restart timer monitoring
        this.startTimerMonitoring();

        // Emit restored event
        this.emit('onlineStateRestored', state);

        return true;
      }

      console.log('📴 Driver was offline - no state to restore');
      return false;
    } catch (error) {
      console.error('❌ Error restoring online state:', error);
      return false;
    }
  }

  /**
   * Event emitter for state changes
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Get formatted time remaining
   */
  async getFormattedTimeRemaining(): Promise<string> {
    try {
      const state = await this.getOnlineState();
      if (!state || !state.isOnline) {
        return '00:00:00';
      }

      const hours = Math.floor(state.remainingSeconds / 3600);
      const minutes = Math.floor((state.remainingSeconds % 3600) / 60);
      const seconds = state.remainingSeconds % 60;

      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('❌ Error getting formatted time:', error);
      return '00:00:00';
    }
  }

  /**
   * Cleanup - stop all background tasks
   */
  cleanup(): void {
    this.stopTimerMonitoring();
    this.listeners.clear();
    console.log('✅ PersistentOnlineService cleaned up');
  }
}

export default PersistentOnlineService.getInstance();