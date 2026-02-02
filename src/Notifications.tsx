// src/Notifications.tsx
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType
} from '@notifee/react-native';
import Sound from 'react-native-sound';
import { API_BASE } from './apiConfig';

class NotificationService {
  private static instance: NotificationService;
  private listeners: Map<string, Function[]> = new Map();
  private fcmToken: string | null = null;
  private notificationInitialized = false;
  private notificationSound: Sound | null = null;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private constructor() {
    this.initializeSound();
  }

  // Initialize notification sound
  private initializeSound() {
    try {
      Sound.setCategory('Playback');
      this.notificationSound = new Sound('notification_old.mp3', Sound.MAIN_BUNDLE, (error) => {
        if (error) {
          console.log('Failed to load notification sound:', error);
        } else {
          console.log('✅ Notification sound loaded successfully');
        }
      });
    } catch (error) {
      console.error('Error initializing notification sound:', error);
    }
  }

  // Play notification sound
  private playNotificationSound() {
    try {
      if (this.notificationSound) {
        this.notificationSound.stop(() => {
          this.notificationSound?.play((success) => {
            if (!success) {
              console.log('Sound playback failed');
            }
          });
        });
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }

  async createNotificationChannels() {
    if (Platform.OS === 'android') {
      try {
        // Channel for ride requests
        await notifee.createChannel({
          id: 'ride_requests_high',
          name: 'Ride Requests',
          description: 'High priority ride notifications with sound',
          importance: AndroidImportance.HIGH,
          sound: 'notification_old',
          vibration: true,
          lights: true,
          bypassDnd: true,
          visibility: AndroidVisibility.PUBLIC,
        });

        // Channel for working hours warnings
        await notifee.createChannel({
          id: 'working_hours_warning',
          name: 'Working Hours Warnings',
          description: 'Warnings about working hours expiration',
          importance: AndroidImportance.HIGH,
          sound: 'notification_old',
          vibration: true,
          lights: true,
          bypassDnd: true,
          visibility: AndroidVisibility.PUBLIC,
        });

        console.log('✅ Android notification channels created');
      } catch (error) {
        console.error('❌ Error creating notification channels:', error);
      }
    }
  }

  async initializeNotifications() {
    try {
      console.log('🔔 Initializing notification system...');

      const messagingModule = messaging();

      // Request permissions
      const authStatus = await messagingModule.hasPermission();
      if (!authStatus) {
        const permission = await messagingModule.requestPermission();
        if (!permission) {
          console.log('❌ Notification permission not granted');
          return false;
        }
      }

      // Create notification channels
      await this.createNotificationChannels();

      // Get FCM token
      await this.getFCMToken();

      // Setup handlers
      this.setupForegroundHandler();
      this.setupBackgroundHandler();
      this.setupTokenRefreshHandler();
      this.setupNotificationActionHandlers();

      this.notificationInitialized = true;
      console.log('✅ Notification system initialized');
      return true;
    } catch (error) {
      console.error('❌ Error in notification initialization:', error);
      return false;
    }
  }

  async getFCMToken(): Promise<string | null> {
    try {
      console.log('🔑 Getting FCM token...');

      const messagingModule = messaging();
      const token = await messagingModule.getToken();

      if (token) {
        this.fcmToken = token;
        console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');

        await AsyncStorage.setItem('fcmToken', token);
        return token;
      } else {
        console.log('❌ No FCM token received');
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      return null;
    }
  }

  setupForegroundHandler() {
    try {
      console.log('📱 Setting up foreground message handler...');

      const messagingModule = messaging();

      return messagingModule.onMessage(async remoteMessage => {
        console.log('📱 FOREGROUND FCM message received:', remoteMessage);

        const data = remoteMessage.data || {};
        const notification = remoteMessage.notification || {};

        // Handle ride requests
        if (data.type === 'ride_request') {
          console.log('🎯 RIDE REQUEST in foreground');

          const rideData = {
            ...data,
            notificationTitle: notification.title,
            notificationBody: notification.body,
            timestamp: new Date().toISOString()
          };

          await this.showRideRequestNotification({
            title: notification.title || '🚖 New Ride Request',
            body: notification.body || 'Tap to view ride details',
            data: rideData
          });

          this.emit('rideRequest', rideData);
        }

        // Handle working hours warnings
        if (data.type === 'working_hours_warning') {
          console.log('⚠️ WORKING HOURS WARNING in foreground');

          await this.showWorkingHoursWarning({
            warningNumber: parseInt(String(data.warningNumber || '1')),
            message: String(data.message || ''),
            remainingSeconds: parseInt(String(data.remainingSeconds || '0')),
          });

          this.emit('workingHoursWarning', data);
        }

        // Handle auto-stop
        if (data.type === 'auto_stop') {
          console.log('🛑 AUTO STOP in foreground');

          await this.showAutoStopNotification({
            message: String(data.message || 'Your working hours have expired'),
          });

          this.emit('autoStop', data);
        }
      });

    } catch (error) {
      console.error('❌ Error setting up foreground handler:', error);
    }
  }

  async setupBackgroundHandler() {
    try {
      console.log('📱 Setting up background handler...');

      messaging().setBackgroundMessageHandler(async remoteMessage => {
        console.log('📱 BACKGROUND FCM received:', remoteMessage?.data);

        const data = remoteMessage?.data || {};
        const notification = remoteMessage?.notification || {};

        // Handle different notification types
        if (data.type === 'ride_request') {
          await this.showRideRequestNotification({
            title: notification.title || '🚖 New Ride Request',
            body: notification.body || 'Tap to view ride details',
            data: data
          });
          await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(data));
        } else if (data.type === 'working_hours_warning') {
          await this.showWorkingHoursWarning({
            warningNumber: parseInt(String(data.warningNumber || '1')),
            message: String(data.message || ''),
            remainingSeconds: parseInt(String(data.remainingSeconds || '0')),
          });
        } else if (data.type === 'auto_stop') {
          await this.showAutoStopNotification({
            message: String(data.message || 'Your working hours have expired'),
          });
        }

        return Promise.resolve();
      });

    } catch (error) {
      console.error('❌ Background handler setup failed:', error);
    }
  }

  setupTokenRefreshHandler() {
    try {
      messaging().onTokenRefresh(async (newToken) => {
        console.log('🔄 FCM token refreshed:', newToken.substring(0, 20) + '...');

        try {
          const authToken = await AsyncStorage.getItem("authToken");
          const driverId = await AsyncStorage.getItem("driverId");

          if (authToken && driverId) {
            const response = await fetch(`${API_BASE}/drivers/update-fcm-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                driverId: driverId,
                fcmToken: newToken,
                platform: Platform.OS
              }),
            });

            if (response.ok) {
              console.log('✅ FCM token updated on server');
            } else {
              console.log('❌ Failed to update FCM token:', response.status);
            }
          }
        } catch (error) {
          console.error('❌ Error updating FCM token:', error);
        }

        this.emit('tokenRefresh', newToken);
      });
    } catch (error) {
      console.error('❌ Error setting up token refresh handler:', error);
    }
  }

  setupNotificationActionHandlers() {
    // Handle notification action presses (for working hours warnings)
    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const actionId = detail.pressAction?.id;

        if (actionId === 'continue_working') {
          console.log('User pressed: Continue Working (₹100)');
          this.emit('continueWorking', {});
        } else if (actionId === 'skip_warning') {
          console.log('User pressed: Skip');
          this.emit('skipWarning', {});
        }
      } else if (type === EventType.PRESS && detail.notification) {
        console.log('Notification pressed:', detail.notification);

        const data = detail.notification.data;
        if (data?.type === 'ride_request') {
          this.emit('rideRequest', data);
        }
      }
    });

    // Handle background notification action presses
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const actionId = detail.pressAction?.id;
        const data = detail.notification?.data || {};

        if (actionId === 'continue_working') {
          await AsyncStorage.setItem('pendingAction', JSON.stringify({ action: 'continue_working', data }));
        } else if (actionId === 'skip_warning') {
          await AsyncStorage.setItem('pendingAction', JSON.stringify({ action: 'skip_warning', data }));
        }
      }
    });
  }

  // Show ride request notification
  async showRideRequestNotification(notification: {
    title: string;
    body: string;
    data?: any;
  }) {
    try {
      console.log('🔔 Showing ride request notification');
      this.playNotificationSound();

      await notifee.displayNotification({
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        android: {
          channelId: 'ride_requests_high',
          smallIcon: 'ic_launcher',
          color: '#2ecc71',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          sound: 'notification_old',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          autoCancel: true,
        },
        ios: {
          sound: 'notification_old.mp3',
          critical: true,
          criticalVolume: 1.0,
        },
      });
    } catch (error) {
      console.error('❌ Error showing ride request notification:', error);
    }
  }

  // Show working hours warning notification
  async showWorkingHoursWarning(data: {
    warningNumber: number;
    message: string;
    remainingSeconds: number;
  }) {
    try {
      console.log(`⚠️ Showing working hours warning ${data.warningNumber}/3`);
      this.playNotificationSound();

      const formattedTime = this.formatSeconds(data.remainingSeconds);

      await notifee.displayNotification({
        title: `⚠️ Working Hours Warning ${data.warningNumber}/3`,
        body: data.message || `Time remaining: ${formattedTime}. Continue for ₹100?`,
        data: {
          type: 'working_hours_warning',
          warningNumber: data.warningNumber.toString(),
          remainingSeconds: data.remainingSeconds.toString(),
        },
        android: {
          channelId: 'working_hours_warning',
          smallIcon: 'ic_launcher',
          color: '#f39c12',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          sound: 'notification_old',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          autoCancel: false,
          actions: [
            {
              title: 'Continue (₹100)',
              pressAction: {
                id: 'continue_working',
              },
            },
            {
              title: 'Skip',
              pressAction: {
                id: 'skip_warning',
              },
            },
          ],
        },
        ios: {
          sound: 'notification_old.mp3',
          critical: true,
          criticalVolume: 1.0,
        },
      });
    } catch (error) {
      console.error('❌ Error showing working hours warning:', error);
    }
  }

  // Show auto-stop notification
  async showAutoStopNotification(data: {
    message: string;
  }) {
    try {
      console.log('🛑 Showing auto-stop notification');
      this.playNotificationSound();

      await notifee.displayNotification({
        title: '🛑 Auto-Stop: Working Hours Expired',
        body: data.message,
        data: { type: 'auto_stop' },
        android: {
          channelId: 'working_hours_warning',
          smallIcon: 'ic_launcher',
          color: '#e74c3c',
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          sound: 'notification_old',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          autoCancel: true,
        },
        ios: {
          sound: 'notification_old.mp3',
          critical: true,
          criticalVolume: 1.0,
        },
      });
    } catch (error) {
      console.error('❌ Error showing auto-stop notification:', error);
    }
  }

  // Helper function to format seconds to HH:MM:SS
  private formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Event emitter methods
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    console.log(`✅ Registered listener for: ${event}`);
  }

  off(event: string, callback: Function) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    if (this.listeners.has(event)) {
      console.log(`📢 Emitting event: ${event}`, data);
      this.listeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Check for pending notifications and actions
  async checkPendingNotifications() {
    try {
      console.log('🔍 Checking for pending notifications...');

      // Check for pending ride requests
      const pendingRideRequest = await AsyncStorage.getItem('pendingRideRequest');
      if (pendingRideRequest) {
        console.log('📱 Found pending ride request');
        const rideData = JSON.parse(pendingRideRequest);
        setTimeout(() => {
          this.emit('rideRequest', rideData);
        }, 2000);
        await AsyncStorage.removeItem('pendingRideRequest');
      }

      // Check for pending actions (from notification buttons)
      const pendingAction = await AsyncStorage.getItem('pendingAction');
      if (pendingAction) {
        console.log('📱 Found pending action');
        const actionData = JSON.parse(pendingAction);

        if (actionData.action === 'continue_working') {
          this.emit('continueWorking', actionData.data);
        } else if (actionData.action === 'skip_warning') {
          this.emit('skipWarning', actionData.data);
        }

        await AsyncStorage.removeItem('pendingAction');
      }

      // Check for initial notification
      const initialNotification = await notifee.getInitialNotification();
      if (initialNotification) {
        console.log('📱 App opened from notification:', initialNotification);

        const data = initialNotification.notification.data;
        if (data?.type === 'ride_request') {
          setTimeout(() => {
            this.emit('rideRequest', data);
          }, 3000);
        }
      }

    } catch (error) {
      console.error('❌ Error checking pending notifications:', error);
    }
  }

  // Test notification
  async testNotification() {
    await this.showRideRequestNotification({
      title: '🔊 Test Notification',
      body: 'This is a test notification with sound!',
      data: {
        test: "true",
        type: "test_notification"
      }
    });
  }

  // Cleanup
  cleanup() {
    if (this.notificationSound) {
      this.notificationSound.release();
      this.notificationSound = null;
    }
    this.listeners.clear();
  }
}

export default NotificationService.getInstance();
