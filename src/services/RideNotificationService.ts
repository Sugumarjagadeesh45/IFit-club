/**
 * RideNotificationService.ts
 * Handles ride request notifications with deep linking
 * Works in foreground, background, and killed states
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
  Event,
} from '@notifee/react-native';
import Sound from 'react-native-sound';
import { Linking, AppState, AppStateStatus } from 'react-native';

export interface RideRequestData {
  rideId: string;
  RAID_ID?: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  pickupLocation?: string;
  dropLocation?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  distance?: string;
  fare?: string | number;
  vehicleType?: string;
  timestamp?: string;
  type?: string;
}

class RideNotificationService {
  private static instance: RideNotificationService;
  private notificationSound: Sound | null = null;
  private fcmToken: string | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private appState: AppStateStatus = AppState.currentState;

  static getInstance(): RideNotificationService {
    if (!RideNotificationService.instance) {
      RideNotificationService.instance = new RideNotificationService();
    }
    return RideNotificationService.instance;
  }

  private constructor() {
    this.initializeSound();
    this.setupAppStateListener();
  }

  /**
   * Initialize notification sound
   */
  private initializeSound(): void {
    try {
      Sound.setCategory('Playback');
      this.notificationSound = new Sound(
        'notification_old.mp3',
        Sound.MAIN_BUNDLE,
        (error) => {
          if (error) {
            console.error('❌ Failed to load notification sound:', error);
          } else {
            console.log('✅ Notification sound loaded');
          }
        }
      );
    } catch (error) {
      console.error('❌ Error initializing sound:', error);
    }
  }

  /**
   * Play notification sound
   */
  private playSound(): void {
    try {
      if (this.notificationSound) {
        this.notificationSound.stop(() => {
          this.notificationSound?.play((success) => {
            if (!success) {
              console.warn('⚠️ Sound playback failed');
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ Error playing sound:', error);
    }
  }

  /**
   * Setup app state listener
   */
  private setupAppStateListener(): void {
    AppState.addEventListener('change', (nextAppState) => {
      console.log(`📱 App state changed: ${this.appState} → ${nextAppState}`);
      this.appState = nextAppState;
    });
  }

  /**
   * Initialize FCM and notification channels
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🔔 Initializing ride notification service...');

      // Request permissions
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('❌ Notification permission not granted');
        return false;
      }

      // Create notification channels (Android)
      await this.createNotificationChannels();

      // Get FCM token
      await this.getFCMToken();

      // Setup message handlers
      this.setupForegroundHandler();
      this.setupNotificationActionHandler();
      this.setupTokenRefreshHandler();

      console.log('✅ Ride notification service initialized');
      return true;
    } catch (error) {
      console.error('❌ Error initializing notifications:', error);
      return false;
    }
  }

  /**
   * Create Android notification channels
   */
  private async createNotificationChannels(): Promise<void> {
    try {
      await notifee.createChannel({
        id: 'ride_requests_critical',
        name: 'Ride Requests',
        description: 'Critical ride request notifications',
        importance: AndroidImportance.HIGH,
        sound: 'notification_old',
        vibration: true,
        vibrationPattern: [300, 500, 300, 500, 300, 500],
        lights: true,
        lightColor: '#4CAF50',
        bypassDnd: true,
        visibility: AndroidVisibility.PUBLIC,
      });

      console.log('✅ Notification channels created');
    } catch (error) {
      console.error('❌ Error creating channels:', error);
    }
  }

  /**
   * Get FCM token and save to storage
   */
  private async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      if (token) {
        this.fcmToken = token;
        await AsyncStorage.setItem('fcmToken', token);
        console.log('✅ FCM Token:', token.substring(0, 30) + '...');
        return token;
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Setup foreground message handler
   */
  private setupForegroundHandler(): void {
    messaging().onMessage(async (remoteMessage) => {
      console.log('📱 FOREGROUND FCM message:', remoteMessage);

      const data = remoteMessage.data;

      if (data?.type === 'rideRequest' || data?.rideId) {
        const rideData: RideRequestData = {
          rideId: data.rideId as string,
          RAID_ID: data.RAID_ID as string,
          userId: data.userId as string,
          userName: data.userName as string,
          userPhone: data.userPhone as string,
          pickupLocation: data.pickupLocation as string,
          dropLocation: data.dropLocation as string,
          pickupLat: data.pickupLat ? parseFloat(data.pickupLat as string) : undefined,
          pickupLng: data.pickupLng ? parseFloat(data.pickupLng as string) : undefined,
          dropLat: data.dropLat ? parseFloat(data.dropLat as string) : undefined,
          dropLng: data.dropLng ? parseFloat(data.dropLng as string) : undefined,
          distance: data.distance as string,
          fare: data.fare as string,
          vehicleType: data.vehicleType as string,
          timestamp: new Date().toISOString(),
          type: 'rideRequest',
        };

        // Play sound
        this.playSound();

        // Show notification
        await this.showRideRequestNotification(rideData);

        // Store pending ride
        await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(rideData));

        // Emit event to app
        this.emit('rideRequest', rideData);
      }
    });
  }

  /**
   * Show ride request notification
   */
  private async showRideRequestNotification(
    rideData: RideRequestData
  ): Promise<void> {
    try {
      const notificationId = await notifee.displayNotification({
        id: `ride_${rideData.rideId}`,
        title: '🚗 New Ride Request!',
        body: `Pickup: ${rideData.pickupLocation || 'Unknown'}\nDistance: ${
          rideData.distance || 'N/A'
        }\nFare: ₹${rideData.fare || 'N/A'}`,
        data: {
          ...rideData,
          action: 'rideRequest',
        },
        android: {
          channelId: 'ride_requests_critical',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          pressAction: {
            id: 'open_ride_request',
            launchActivity: 'default',
          },
          fullScreenIntent: {
            id: 'full_screen_ride',
            launchActivity: 'default',
          },
          sound: 'notification_old',
          vibrationPattern: [300, 500, 300, 500, 300, 500],
          autoCancel: false,
          ongoing: true,
          category: 'call',
          actions: [
            {
              title: '✅ Accept Ride',
              pressAction: {
                id: 'accept_ride',
              },
            },
            {
              title: '❌ Reject Ride',
              pressAction: {
                id: 'reject_ride',
              },
            },
          ],
          color: '#4CAF50',
          largeIcon: 'ic_launcher',
          timestamp: Date.now(),
          showTimestamp: true,
        },
      });

      console.log('✅ Ride notification displayed:', notificationId);
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  }

  /**
   * Setup notification action handler (foreground & background)
   */
  private setupNotificationActionHandler(): void {
    // Foreground events
    notifee.onForegroundEvent(async (event: Event) => {
      await this.handleNotificationEvent(event);
    });

    console.log('✅ Notification action handlers setup');
  }

  /**
   * Handle notification events (tap, action press)
   */
  private async handleNotificationEvent(event: Event): Promise<void> {
    const { type, detail } = event;

    console.log('🔔 Notification event:', type, detail);

    try {
      if (type === EventType.PRESS) {
        // User tapped notification - open app to ride request screen
        const rideData = detail.notification?.data as RideRequestData;

        if (rideData?.rideId) {
          console.log('📱 User tapped notification - opening ride:', rideData.rideId);

          // Store intent to open ride request
          await AsyncStorage.setItem('openRideRequest', 'true');
          await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(rideData));

          // Emit event
          this.emit('openRideRequest', rideData);

          // Dismiss notification
          if (detail.notification?.id) {
            await notifee.cancelNotification(detail.notification.id);
          }
        }
      }

      if (type === EventType.ACTION_PRESS) {
        const { pressAction, notification } = detail;
        const rideData = notification?.data as RideRequestData;

        if (pressAction?.id === 'accept_ride' && rideData?.rideId) {
          console.log('✅ User pressed ACCEPT from notification');

          // Store acceptance intent
          await AsyncStorage.setItem(
            'rideActionIntent',
            JSON.stringify({
              action: 'accept',
              rideId: rideData.rideId,
              timestamp: new Date().toISOString(),
            })
          );

          // Emit event
          this.emit('acceptRide', rideData);

          // Dismiss notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        } else if (pressAction?.id === 'reject_ride' && rideData?.rideId) {
          console.log('❌ User pressed REJECT from notification');

          // Store rejection intent
          await AsyncStorage.setItem(
            'rideActionIntent',
            JSON.stringify({
              action: 'reject',
              rideId: rideData.rideId,
              timestamp: new Date().toISOString(),
            })
          );

          // Emit event
          this.emit('rejectRide', rideData);

          // Dismiss notification
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error handling notification event:', error);
    }
  }

  /**
   * Setup FCM token refresh handler
   */
  private setupTokenRefreshHandler(): void {
    messaging().onTokenRefresh(async (token) => {
      console.log('🔄 FCM token refreshed:', token.substring(0, 30) + '...');
      this.fcmToken = token;
      await AsyncStorage.setItem('fcmToken', token);
      this.emit('tokenRefresh', token);
    });
  }

  /**
   * Check for pending ride requests on app launch
   */
  async checkPendingRideRequests(): Promise<RideRequestData | null> {
    try {
      const pendingRide = await AsyncStorage.getItem('pendingRideRequest');
      const openRideIntent = await AsyncStorage.getItem('openRideRequest');

      if (pendingRide && openRideIntent === 'true') {
        const rideData: RideRequestData = JSON.parse(pendingRide);
        console.log('📱 Pending ride request found:', rideData.rideId);

        // Clear intent
        await AsyncStorage.removeItem('openRideRequest');

        return rideData;
      }

      return null;
    } catch (error) {
      console.error('❌ Error checking pending rides:', error);
      return null;
    }
  }

  /**
   * Check for pending ride actions (accept/reject from notification)
   */
  async checkPendingRideAction(): Promise<{
    action: 'accept' | 'reject';
    rideId: string;
  } | null> {
    try {
      const actionIntent = await AsyncStorage.getItem('rideActionIntent');

      if (actionIntent) {
        const action = JSON.parse(actionIntent);
        console.log('🔘 Pending ride action found:', action.action, action.rideId);

        // Clear intent
        await AsyncStorage.removeItem('rideActionIntent');

        return action;
      }

      return null;
    } catch (error) {
      console.error('❌ Error checking pending actions:', error);
      return null;
    }
  }

  /**
   * Get FCM token
   */
  getToken(): string | null {
    return this.fcmToken;
  }

  /**
   * Event emitter
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.notificationSound) {
      this.notificationSound.release();
      this.notificationSound = null;
    }
    this.listeners.clear();
    console.log('✅ Ride notification service cleaned up');
  }
}

export default RideNotificationService.getInstance();