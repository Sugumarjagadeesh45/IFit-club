package com.webase.eazygodriver;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * LocationServiceModule - React Native Bridge for BackgroundLocationService
 *
 * Provides JavaScript API to:
 * - Start/stop location service
 * - Update ride status
 * - Check service status
 */
public class LocationServiceModule extends ReactContextBaseJavaModule {
    private static final String TAG = "LocationServiceModule";
    private static final String MODULE_NAME = "LocationService";

    private final ReactApplicationContext reactContext;
    private BackgroundLocationService boundService;
    private boolean isBound = false;

    // Service connection
    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            BackgroundLocationService.LocalBinder binder = (BackgroundLocationService.LocalBinder) service;
            boundService = binder.getService();
            isBound = true;
            Log.d(TAG, "✅ Service bound");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            boundService = null;
            isBound = false;
            Log.d(TAG, "⚠️ Service unbound");
        }
    };

    public LocationServiceModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Start the background location service
     *
     * @param driverId Driver's unique ID
     * @param driverName Driver's name
     * @param vehicleType Vehicle type (taxi, bike, port)
     * @param socketUrl Socket.IO server URL
     * @param promise JS Promise
     */
    @ReactMethod
    public void startService(String driverId, String driverName, String vehicleType,
                            String socketUrl, Promise promise) {
        try {
            Log.d(TAG, "🚀 Starting location service for driver: " + driverId);

            Intent serviceIntent = new Intent(reactContext, BackgroundLocationService.class);
            serviceIntent.putExtra("driverId", driverId);
            serviceIntent.putExtra("driverName", driverName);
            serviceIntent.putExtra("vehicleType", vehicleType);
            serviceIntent.putExtra("socketUrl", socketUrl);
            serviceIntent.putExtra("rideStatus", "online");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }

            // Bind to service
            reactContext.bindService(serviceIntent, serviceConnection, Context.BIND_AUTO_CREATE);

            promise.resolve(true);
            Log.d(TAG, "✅ Location service started");

        } catch (Exception e) {
            Log.e(TAG, "❌ Error starting service", e);
            promise.reject("SERVICE_START_ERROR", e.getMessage());
        }
    }

    /**
     * Stop the background location service
     *
     * @param promise JS Promise
     */
    @ReactMethod
    public void stopService(Promise promise) {
        try {
            Log.d(TAG, "🛑 Stopping location service");

            // Unbind first
            if (isBound) {
                reactContext.unbindService(serviceConnection);
                isBound = false;
            }

            // Stop service
            Intent serviceIntent = new Intent(reactContext, BackgroundLocationService.class);
            serviceIntent.setAction("STOP_SERVICE");
            reactContext.startService(serviceIntent);

            // Also explicitly stop
            reactContext.stopService(new Intent(reactContext, BackgroundLocationService.class));

            boundService = null;

            promise.resolve(true);
            Log.d(TAG, "✅ Location service stopped");

        } catch (Exception e) {
            Log.e(TAG, "❌ Error stopping service", e);
            promise.reject("SERVICE_STOP_ERROR", e.getMessage());
        }
    }

    /**
     * Update ride status in the service
     *
     * @param status Ride status: "online", "accepted", "started"
     * @param rideId Current ride ID (can be null)
     * @param promise JS Promise
     */
    @ReactMethod
    public void updateRideStatus(String status, String rideId, Promise promise) {
        try {
            Log.d(TAG, "📝 Updating ride status: " + status + ", rideId: " + rideId);

            if (isBound && boundService != null) {
                boundService.updateRideStatus(status, rideId);
                promise.resolve(true);
            } else {
                // Service not bound, start it with updated status
                Intent serviceIntent = new Intent(reactContext, BackgroundLocationService.class);
                serviceIntent.putExtra("rideStatus", status);
                serviceIntent.putExtra("rideId", rideId);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    reactContext.startForegroundService(serviceIntent);
                } else {
                    reactContext.startService(serviceIntent);
                }

                promise.resolve(true);
            }

            Log.d(TAG, "✅ Ride status updated");

        } catch (Exception e) {
            Log.e(TAG, "❌ Error updating ride status", e);
            promise.reject("UPDATE_STATUS_ERROR", e.getMessage());
        }
    }

    /**
     * Check if the service is running
     *
     * @param promise JS Promise
     */
    @ReactMethod
    public void isServiceRunning(Promise promise) {
        try {
            boolean running = isBound && boundService != null && boundService.isServiceRunning();
            promise.resolve(running);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Check if socket is connected
     *
     * @param promise JS Promise
     */
    @ReactMethod
    public void isSocketConnected(Promise promise) {
        try {
            boolean connected = isBound && boundService != null && boundService.isSocketConnected();
            promise.resolve(connected);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Get current service status
     *
     * @param promise JS Promise with status object
     */
    @ReactMethod
    public void getServiceStatus(Promise promise) {
        try {
            WritableMap status = Arguments.createMap();

            if (isBound && boundService != null) {
                status.putBoolean("isRunning", boundService.isServiceRunning());
                status.putBoolean("isSocketConnected", boundService.isSocketConnected());

                if (boundService.getLastLocation() != null) {
                    status.putDouble("lastLatitude", boundService.getLastLocation().getLatitude());
                    status.putDouble("lastLongitude", boundService.getLastLocation().getLongitude());
                }
            } else {
                status.putBoolean("isRunning", false);
                status.putBoolean("isSocketConnected", false);
            }

            promise.resolve(status);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error getting service status", e);
            promise.reject("STATUS_ERROR", e.getMessage());
        }
    }

    /**
     * Check if driver was online before (for app restart)
     *
     * @param promise JS Promise
     */
    @ReactMethod
    public void wasDriverOnline(Promise promise) {
        try {
            boolean wasOnline = BackgroundLocationService.wasDriverOnline(reactContext);
            promise.resolve(wasOnline);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    // Send event to JavaScript
    private void sendEvent(String eventName, WritableMap params) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }
}
