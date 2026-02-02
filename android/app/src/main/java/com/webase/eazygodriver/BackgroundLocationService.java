package com.webase.eazygodriver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.URISyntaxException;
import java.util.Collections;
import java.util.Date;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

/**
 * BackgroundLocationService - Foreground Service for continuous location tracking
 *
 * Features:
 * - Runs as Foreground Service (survives background/screen lock)
 * - Tracks GPS location every 1 second
 * - Manages Socket.IO connection at service level
 * - Auto-reconnects socket on disconnection
 * - Emits location to backend continuously
 * - Survives app restart via SharedPreferences
 */
public class BackgroundLocationService extends Service {
    private static final String TAG = "BackgroundLocationSvc";
    private static final int NOTIFICATION_ID = 1001;
    private static final String CHANNEL_ID = "driver_location_channel";
    private static final String PREFS_NAME = "DriverServicePrefs";

    // Location tracking
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private Location lastLocation;
    private float lastBearing = 0f;

    // Socket management
    private Socket socket;
    private boolean isSocketConnected = false;
    private Handler socketReconnectHandler;
    private Runnable socketReconnectRunnable;
    private int reconnectAttempts = 0;
    private static final int MAX_RECONNECT_ATTEMPTS = 20;
    private static final long RECONNECT_INTERVAL = 7000; // 7 seconds

    // Heartbeat
    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private static final long HEARTBEAT_INTERVAL = 7000; // 7 seconds

    // Wake lock
    private PowerManager.WakeLock wakeLock;

    // Driver data
    private String driverId;
    private String driverName;
    private String vehicleType;
    private String socketUrl;
    private String rideId;
    private String rideStatus; // "online", "accepted", "started"

    // Service state
    private boolean isRunning = false;
    private final IBinder binder = new LocalBinder();

    public class LocalBinder extends Binder {
        public BackgroundLocationService getService() {
            return BackgroundLocationService.this;
        }
    }

    // ============ LIFECYCLE ============

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "🚀 Service onCreate");

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        socketReconnectHandler = new Handler(Looper.getMainLooper());
        heartbeatHandler = new Handler(Looper.getMainLooper());

        createNotificationChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "🚀 Service onStartCommand");

        if (intent != null) {
            String action = intent.getAction();

            if ("STOP_SERVICE".equals(action)) {
                Log.d(TAG, "🛑 Stop service action received");
                stopSelf();
                return START_NOT_STICKY;
            }

            // Extract driver data from intent
            driverId = intent.getStringExtra("driverId");
            driverName = intent.getStringExtra("driverName");
            vehicleType = intent.getStringExtra("vehicleType");
            socketUrl = intent.getStringExtra("socketUrl");
            rideId = intent.getStringExtra("rideId");
            rideStatus = intent.getStringExtra("rideStatus");

            if (rideStatus == null) rideStatus = "online";

            // Save to SharedPreferences for boot recovery
            saveDriverState();
        } else {
            // Service restarted by system - restore from SharedPreferences
            restoreDriverState();
        }

        // Start foreground notification
        startForeground(NOTIFICATION_ID, createNotification());

        // Initialize socket and location
        if (driverId != null && socketUrl != null) {
            initializeSocket();
            startLocationUpdates();
            startHeartbeat();
            isRunning = true;
            Log.d(TAG, "✅ Service fully started for driver: " + driverId);
        } else {
            Log.e(TAG, "❌ Missing required data, stopping service");
            stopSelf();
            return START_NOT_STICKY;
        }

        return START_STICKY; // Restart if killed
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "🛑 Service onDestroy");

        isRunning = false;

        // Stop location updates
        stopLocationUpdates();

        // Stop heartbeat
        stopHeartbeat();

        // Disconnect socket
        disconnectSocket();

        // Release wake lock
        releaseWakeLock();

        // Clear saved state (driver explicitly went offline)
        clearDriverState();

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    // ============ NOTIFICATION ============

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Driver Location Service",
                NotificationManager.IMPORTANCE_LOW // LOW = no sound, shows in status bar
            );
            channel.setDescription("Tracks driver location for ride requests");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String statusText = "Online - Ready for ride requests";
        if ("accepted".equals(rideStatus)) {
            statusText = "🚗 On the way to pickup";
        } else if ("started".equals(rideStatus)) {
            statusText = "🚗 Ride in progress";
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚖 Eazygo Driver")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build();
    }

    private void updateNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification());
        }
    }

    // ============ SOCKET MANAGEMENT ============

    private void initializeSocket() {
        if (socketUrl == null || socketUrl.isEmpty()) {
            Log.e(TAG, "❌ Socket URL is null or empty");
            return;
        }

        Log.d(TAG, "🔌 Initializing socket: " + socketUrl);

        try {
            IO.Options options = new IO.Options();
            options.transports = new String[]{"websocket"};
            options.reconnection = true;
            options.reconnectionAttempts = MAX_RECONNECT_ATTEMPTS;
            options.reconnectionDelay = 2000;
            options.timeout = 20000;
            options.forceNew = true;

            socket = IO.socket(socketUrl, options);

            // Socket event listeners
            socket.on(Socket.EVENT_CONNECT, args -> {
                Log.d(TAG, "✅ Socket connected");
                isSocketConnected = true;
                reconnectAttempts = 0;
                registerDriver();
            });

            socket.on(Socket.EVENT_DISCONNECT, args -> {
                Log.w(TAG, "⚠️ Socket disconnected");
                isSocketConnected = false;
                scheduleReconnect();
            });

            socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
                Log.e(TAG, "❌ Socket connection error");
                isSocketConnected = false;
                scheduleReconnect();
            });

            socket.on("rideRequest", args -> {
                Log.d(TAG, "🚗 Ride request received via native socket");
                // Forward to React Native via broadcast or EventEmitter
            });

            socket.connect();

        } catch (URISyntaxException e) {
            Log.e(TAG, "❌ Invalid socket URL", e);
        }
    }

    private void registerDriver() {
        if (socket == null || !socket.connected()) return;

        try {
            JSONObject data = new JSONObject();
            data.put("driverId", driverId);
            data.put("driverName", driverName);
            data.put("vehicleType", vehicleType);
            data.put("status", "accepted".equals(rideStatus) || "started".equals(rideStatus) ? "onRide" : "Live");

            if (rideId != null) {
                data.put("rideId", rideId);
            }

            if (lastLocation != null) {
                data.put("latitude", lastLocation.getLatitude());
                data.put("longitude", lastLocation.getLongitude());
            }

            socket.emit("registerDriver", data);
            Log.d(TAG, "📝 Driver registered with socket");

        } catch (JSONException e) {
            Log.e(TAG, "❌ Error registering driver", e);
        }
    }

    private void scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.e(TAG, "❌ Max reconnect attempts reached");
            reconnectAttempts = 0; // Reset for next cycle
            return;
        }

        reconnectAttempts++;
        Log.d(TAG, "🔄 Scheduling reconnect attempt " + reconnectAttempts);

        socketReconnectHandler.postDelayed(() -> {
            if (!isSocketConnected && isRunning) {
                Log.d(TAG, "🔄 Attempting socket reconnect...");
                if (socket != null) {
                    socket.connect();
                } else {
                    initializeSocket();
                }
            }
        }, RECONNECT_INTERVAL);
    }

    private void disconnectSocket() {
        if (socket != null) {
            socket.off();
            socket.disconnect();
            socket = null;
        }
        isSocketConnected = false;
        socketReconnectHandler.removeCallbacksAndMessages(null);
    }

    // ============ LOCATION TRACKING ============

    private void startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "❌ Location permission not granted");
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(1000) // 1 second interval
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMinUpdateIntervalMillis(1000)
            .setMaxUpdateDelayMillis(2000)
            .setMinUpdateDistanceMeters(5f) // 5 meters
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                Location location = locationResult.getLastLocation();
                if (location != null) {
                    processLocationUpdate(location);
                }
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            );
            Log.d(TAG, "✅ Location updates started");
        } catch (Exception e) {
            Log.e(TAG, "❌ Error starting location updates", e);
        }
    }

    private void stopLocationUpdates() {
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            Log.d(TAG, "🛑 Location updates stopped");
        }
    }

    private void processLocationUpdate(Location location) {
        // Calculate bearing
        if (lastLocation != null) {
            lastBearing = lastLocation.bearingTo(location);
        }
        lastLocation = location;

        // Emit to socket
        emitLocationToSocket(location);

        Log.d(TAG, String.format("📍 Location: %.6f, %.6f (bearing: %.1f)",
            location.getLatitude(), location.getLongitude(), lastBearing));
    }

    private void emitLocationToSocket(Location location) {
        if (socket == null || !socket.connected()) {
            Log.w(TAG, "⚠️ Socket not connected, skipping location emit");
            return;
        }

        try {
            JSONObject data = new JSONObject();
            data.put("driverId", driverId);
            data.put("driverName", driverName);
            data.put("latitude", location.getLatitude());
            data.put("longitude", location.getLongitude());
            data.put("bearing", lastBearing);
            data.put("speed", location.getSpeed());
            data.put("vehicleType", vehicleType);
            data.put("status", "accepted".equals(rideStatus) || "started".equals(rideStatus) ? "onRide" : "Live");
            data.put("timestamp", new Date().toString());

            if (rideId != null) {
                data.put("rideId", rideId);
            }

            String phase = "idle";
            if ("accepted".equals(rideStatus)) {
                phase = "pickup_navigation";
            } else if ("started".equals(rideStatus)) {
                phase = "dropoff_navigation";
            }
            data.put("phase", phase);

            socket.emit("driverLocationUpdate", data);

        } catch (JSONException e) {
            Log.e(TAG, "❌ Error emitting location", e);
        }
    }

    // ============ HEARTBEAT ============

    private void startHeartbeat() {
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                if (isRunning) {
                    sendHeartbeat();
                    heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL);
                }
            }
        };
        heartbeatHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL);
        Log.d(TAG, "💓 Heartbeat started");
    }

    private void stopHeartbeat() {
        if (heartbeatHandler != null && heartbeatRunnable != null) {
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
        }
        Log.d(TAG, "💓 Heartbeat stopped");
    }

    private void sendHeartbeat() {
        // Check and reconnect socket if needed
        if (!isSocketConnected && socket != null) {
            Log.d(TAG, "💓 Heartbeat: Socket disconnected, reconnecting...");
            socket.connect();
        }

        // Emit heartbeat
        if (socket != null && socket.connected()) {
            try {
                JSONObject data = new JSONObject();
                data.put("driverId", driverId);
                data.put("status", "accepted".equals(rideStatus) || "started".equals(rideStatus) ? "onRide" : "Live");
                data.put("timestamp", new Date().toString());

                if (rideId != null) {
                    data.put("rideId", rideId);
                }

                socket.emit("heartbeat", data);
                Log.d(TAG, "💓 Heartbeat sent");

            } catch (JSONException e) {
                Log.e(TAG, "❌ Error sending heartbeat", e);
            }
        }
    }

    // ============ WAKE LOCK ============

    private void acquireWakeLock() {
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "EazygoDriver:LocationWakeLock"
            );
            wakeLock.acquire(10 * 60 * 60 * 1000L); // 10 hours max
            Log.d(TAG, "🔋 Wake lock acquired");
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "🔋 Wake lock released");
        }
    }

    // ============ STATE PERSISTENCE ============

    private void saveDriverState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
            .putString("driverId", driverId)
            .putString("driverName", driverName)
            .putString("vehicleType", vehicleType)
            .putString("socketUrl", socketUrl)
            .putString("rideId", rideId)
            .putString("rideStatus", rideStatus)
            .putBoolean("wasOnline", true)
            .apply();
        Log.d(TAG, "💾 Driver state saved");
    }

    private void restoreDriverState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        driverId = prefs.getString("driverId", null);
        driverName = prefs.getString("driverName", null);
        vehicleType = prefs.getString("vehicleType", null);
        socketUrl = prefs.getString("socketUrl", null);
        rideId = prefs.getString("rideId", null);
        rideStatus = prefs.getString("rideStatus", "online");
        Log.d(TAG, "📂 Driver state restored: " + driverId);
    }

    private void clearDriverState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
            .putBoolean("wasOnline", false)
            .remove("rideId")
            .remove("rideStatus")
            .apply();
        Log.d(TAG, "🗑️ Driver state cleared");
    }

    // ============ PUBLIC API (called from React Native) ============

    public void updateRideStatus(String status, String newRideId) {
        this.rideStatus = status;
        this.rideId = newRideId;
        saveDriverState();
        updateNotification();
        Log.d(TAG, "📝 Ride status updated: " + status + ", rideId: " + newRideId);
    }

    public boolean isServiceRunning() {
        return isRunning;
    }

    public boolean isSocketConnected() {
        return isSocketConnected;
    }

    public Location getLastLocation() {
        return lastLocation;
    }

    // ============ STATIC HELPER ============

    public static boolean wasDriverOnline(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getBoolean("wasOnline", false);
    }
}
