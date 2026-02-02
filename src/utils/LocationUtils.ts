export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
}

export interface TrackingResult {
  distance: number;
  totalDistance: number;
  totalDistanceKm: number;
  latitude: number;
  longitude: number;
}

// ✅ Validate location data before processing
export const isValidLocation = (lat: any, lng: any): boolean => {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  return true;
};

// ✅ Haversine formula for accurate distance calculation
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// ✅ Class to handle stateful location tracking with smoothing
export class LocationTracker {
  private lastValidLocation: LocationPoint | null = null;
  private totalDistance: number = 0;
  
  // Configuration
  private readonly minDistanceThreshold = 5; // meters - ignore movements smaller than this
  private readonly maxSpeedThreshold = 50; // m/s (~180 km/h) - reject impossible speeds
  private readonly maxAccuracyThreshold = 40; // meters - reject poor accuracy (30-50m recommended)
  private readonly smoothingBufferSize = 3; // Average recent points to reduce jumps
  private locationBuffer: LocationPoint[] = [];

  constructor(initialDistance: number = 0) {
    this.totalDistance = initialDistance;
  }

  processLocation(newLat: number, newLng: number, timestamp: number, accuracy?: number): TrackingResult | null {
    // 1. Basic Validation
    if (!isValidLocation(newLat, newLng)) {
      console.log('⚠️ Invalid location data, skipping update');
      return null;
    }

    // 2. Accuracy Check (New)
    if (accuracy !== undefined && accuracy !== null && accuracy > this.maxAccuracyThreshold) {
      console.log(`⚠️ Poor GPS accuracy: ${accuracy}m (Limit: ${this.maxAccuracyThreshold}m)`);
      return null;
    }

    // 3. Smoothing (New) - Average recent points
    this.locationBuffer.push({ latitude: newLat, longitude: newLng, timestamp, accuracy });
    if (this.locationBuffer.length > this.smoothingBufferSize) {
      this.locationBuffer.shift();
    }

    // Calculate smoothed coordinates
    let smoothedLat = newLat;
    let smoothedLng = newLng;

    if (this.locationBuffer.length > 0) {
      smoothedLat = this.locationBuffer.reduce((sum, p) => sum + p.latitude, 0) / this.locationBuffer.length;
      smoothedLng = this.locationBuffer.reduce((sum, p) => sum + p.longitude, 0) / this.locationBuffer.length;
    }

    // 4. First location initialization
    if (!this.lastValidLocation) {
      this.lastValidLocation = { latitude: smoothedLat, longitude: smoothedLng, timestamp, accuracy };
      return {
        distance: 0,
        totalDistance: this.totalDistance,
        totalDistanceKm: this.totalDistance / 1000,
        latitude: smoothedLat,
        longitude: smoothedLng
      };
    }

    // 5. Calculate distance using SMOOTHED coordinates
    const distance = calculateDistance(
      this.lastValidLocation.latitude,
      this.lastValidLocation.longitude,
      smoothedLat,
      smoothedLng
    );

    // 6. Calculate speed for validation
    const timeDiff = (timestamp - this.lastValidLocation.timestamp) / 1000; // seconds
    const speed = timeDiff > 0 ? distance / timeDiff : 0;

    // ✅ FILTER 1: Ignore movements smaller than threshold (GPS jitter)
    if (distance < this.minDistanceThreshold) {
      return null;
    }

    // ✅ FILTER 2: Reject impossible speeds (GPS glitch)
    if (speed > this.maxSpeedThreshold) {
      console.log(`⚠️ Impossible speed rejected: ${(speed * 3.6).toFixed(1)} km/h`);
      return null;
    }

    // ✅ Valid movement - update state
    this.totalDistance += distance;
    this.lastValidLocation = { latitude: smoothedLat, longitude: smoothedLng, timestamp, accuracy };

    return {
      distance,
      totalDistance: this.totalDistance,
      totalDistanceKm: this.totalDistance / 1000,
      latitude: smoothedLat,
      longitude: smoothedLng
    };
  }

  reset() {
    this.lastValidLocation = null;
    this.totalDistance = 0;
    this.locationBuffer = [];
  }
  
  getCurrentDistance() {
    return this.totalDistance;
  }
}

// ✅ Helper for UI display
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};