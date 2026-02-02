# Driver App – Fast Movement & Distance Difference Explanation

When the driver is travelling at higher speeds (bike, taxi, auto, or goods vehicle), small variations in distance calculation are expected due to real-world GPS behavior.

This is normal and unavoidable to a certain extent.

## Why Distance Can Differ During Fast Movement

When a driver moves quickly:

1.  **GPS sampling happens at intervals**: Location is captured every few seconds, not continuously. At higher speed, the distance between two GPS points naturally becomes larger.
2.  **GPS accuracy fluctuates**: Speed, buildings, traffic, and signal strength affect accuracy. Even correct GPS readings may shift slightly.
3.  **Straight-line vs actual road path**: GPS calculates straight-line distance between points. Actual road movement includes curves, turns, and stops.

Because of this, minor distance differences are expected during fast movement.

## What Is Acceptable vs What Is Not

### ✅ Acceptable (Normal Behavior)
*   Small variations in distance (a few meters).
*   Slight differences between frontend and backend distance.
*   Minor GPS drift during fast movement.

### ❌ Not Acceptable (The Issue We Fixed)
*   1 meter of real movement recorded as 50–100 meters.
*   Sudden large distance jumps without actual movement.
*   Distance increasing while the vehicle is stationary.
*   GPS coordinates becoming undefined.

## Required Driver App Behavior (Implemented)

To handle fast movement correctly, the driver app now implements the following logic in `LocationUtils.ts`:

### 1. Validate GPS data before sending
*   Latitude and longitude must always exist.
*   Ignore invalid or undefined values.

### 2. Check GPS accuracy
*   **Logic**: Discard readings with poor accuracy (> 40 meters).
*   **Reason**: Prevents "blue circle" jumps where the phone thinks it's 100m away due to poor signal.

### 3. Apply distance threshold
*   **Logic**: Only calculate distance when movement exceeds a minimum threshold (5 meters).
*   **Reason**: Prevents distance accumulation when the driver is stuck in traffic (GPS drift).

### 4. Smooth GPS readings
*   **Logic**: A moving average buffer (size 3) is used to smooth out coordinate jumps before calculating distance.
*   **Formula**: `smoothedLat = average(last 3 latitudes)`

### 5. Speed Validity Check
*   **Logic**: Impossible speeds (> 50m/s or ~180km/h) are rejected as GPS glitches.

## Backend Payload Update

The driver app now sends the following data in the `driverLocationUpdate` socket event. The backend should expect **smoothed** coordinates and distance in **meters**.

```json
{
  "driverId": "DRIVER_123",
  "latitude": 12.9716,  // Smoothed Latitude
  "longitude": 77.5946, // Smoothed Longitude
  "status": "Live",
  "distance": 150.5     // Total Distance in METERS (Accumulated)
}
```

**Note for Backend**:
*   Ensure `distance` is treated as **Meters**.
*   If the backend calculates fare based on this, convert to KM if necessary (`distance / 1000`).

## Conclusion

While small distance differences are expected when the driver moves fast, the previous behavior—where very small movements were recorded as large distance jumps—was a GPS handling issue.

The new validation, smoothing, and filtering in the driver app ensures:
*   Accurate distance tracking
*   Fair billing
*   Stable user experience