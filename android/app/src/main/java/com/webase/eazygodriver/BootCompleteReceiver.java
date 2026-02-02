package com.webase.eazygodriver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * BootCompleteReceiver - Restarts driver service after device reboot
 *
 * This receiver checks if the driver was ONLINE before the device reboot.
 * If yes, it automatically restarts the BackgroundLocationService.
 *
 * Handles:
 * - Normal device boot
 * - Quick boot (HTC and other OEMs)
 * - App update
 */
public class BootCompleteReceiver extends BroadcastReceiver {
    private static final String TAG = "BootCompleteReceiver";
    private static final String PREFS_NAME = "DriverServicePrefs";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "📱 Received broadcast: " + action);

        if (action == null) return;

        // Handle boot completed actions
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "com.htc.intent.action.QUICKBOOT_POWERON".equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {

            Log.d(TAG, "🔄 Device boot/update completed");

            // Check if driver was online before reboot
            if (wasDriverOnline(context)) {
                Log.d(TAG, "✅ Driver was online before reboot, restarting service...");
                startLocationService(context);
            } else {
                Log.d(TAG, "ℹ️ Driver was not online before reboot, skipping service start");
            }
        }
    }

    /**
     * Check if driver was online before the reboot
     */
    private boolean wasDriverOnline(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean wasOnline = prefs.getBoolean("wasOnline", false);
            String driverId = prefs.getString("driverId", null);

            Log.d(TAG, "📂 Checking saved state - wasOnline: " + wasOnline + ", driverId: " + driverId);

            // Must have both wasOnline=true AND valid driverId
            return wasOnline && driverId != null && !driverId.isEmpty();

        } catch (Exception e) {
            Log.e(TAG, "❌ Error checking driver state", e);
            return false;
        }
    }

    /**
     * Start the BackgroundLocationService
     */
    private void startLocationService(Context context) {
        try {
            // Get saved driver data
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String driverId = prefs.getString("driverId", null);
            String driverName = prefs.getString("driverName", "Driver");
            String vehicleType = prefs.getString("vehicleType", null);
            String socketUrl = prefs.getString("socketUrl", null);
            String rideId = prefs.getString("rideId", null);
            String rideStatus = prefs.getString("rideStatus", "online");

            if (driverId == null || socketUrl == null) {
                Log.e(TAG, "❌ Missing required data for service restart");
                return;
            }

            // Create service intent with saved data
            Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
            serviceIntent.putExtra("driverId", driverId);
            serviceIntent.putExtra("driverName", driverName);
            serviceIntent.putExtra("vehicleType", vehicleType);
            serviceIntent.putExtra("socketUrl", socketUrl);
            serviceIntent.putExtra("rideId", rideId);
            serviceIntent.putExtra("rideStatus", rideStatus);

            // Start as foreground service
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            Log.d(TAG, "✅ BackgroundLocationService started after boot for driver: " + driverId);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error starting service after boot", e);
        }
    }
}
