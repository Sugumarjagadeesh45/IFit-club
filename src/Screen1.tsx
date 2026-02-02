import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  AppState,
  Linking,
  Animated,
  Easing,
  ScrollView,
  Image,
} from "react-native";


import MapLibreGL from '@maplibre/maplibre-react-native';
import { getLightMapStyleString } from './mapStyle';



import Geolocation from "@react-native-community/geolocation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./apiConfig";
import api from "../utils/api";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import FontAwesome from "react-native-vector-icons/FontAwesome";
import BackgroundTimer from 'react-native-background-timer';
import NotificationService from './Notifications';
import notifee, { AndroidImportance } from '@notifee/react-native';
import socket, { connectSocket, disconnectSocket, reconnectSocket, isSocketConnected, enableAutoReconnect } from './socket';
import BackgroundService from 'react-native-background-actions';
import backgroundLocationTask from './BackgroundLocationService';
import NativeLocationService from './NativeLocationService';
import {
  splitRouteAtDriver,
  isSignificantMovement,
  interpolateRoute,
} from './utils/SmoothPolyline';
import {
  isDriverOffRoute,
  getRouteWithDetails,
  interpolateRoutes,
} from './utils/RouteService';
import { SOCKET_URL } from './apiConfig';

// Helper functions for background service
const startBackgroundService = async () => {
  const options = {
    taskName: 'Location Tracking',
    taskTitle: 'EazyGo Driver',
    taskDesc: 'Tracking location in background',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#4caf50',
    parameters: {
      delay: 1000,
    },
  };
  if (!BackgroundService.isRunning()) {
    await BackgroundService.start(options, backgroundLocationTask);
  }
};

const stopBackgroundService = async () => {
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
  }
};

const isBackgroundServiceRunning = () => {
  return BackgroundService.isRunning();
};

const { width, height } = Dimensions.get("window");

type LocationType = { latitude: number; longitude: number };
type RideType = {
  rideId: string;
  RAID_ID?: string;
  otp?: string;
  pickup: LocationType & { address?: string };
  drop: LocationType & { address?: string };
  routeCoords?: LocationType[];
  fare?: number;
  distance?: string;
  vehicleType?: string;
  userName?: string;
  userMobile?: string;
  pricePerKm?: number;
  farePerKm?: number;
};
type UserDataType = {
  name: string;
  mobile: string;
  location: LocationType;
  userId?: string;
  rating?: number;
};
MapLibreGL.setAccessToken(null); // No token needed for OSM

// Memoize map style to prevent re-renders
const MAP_STYLE = getLightMapStyleString();

// ============ PROFESSIONAL BLUE DOT COMPONENT ============
// Animated blue dot like Google Maps for driver location
const DriverLocationDot = React.memo(() => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 2.5,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={blueDotStyles.container}>
      {/* Animated pulse ring */}
      <Animated.View
        style={[
          blueDotStyles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      {/* Outer white border */}
      <View style={blueDotStyles.outerRing} />
      {/* Inner blue dot */}
      <View style={blueDotStyles.innerDot} />
    </View>
  );
});

// Blue dot styles (outside component for performance)
const blueDotStyles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
  },
  outerRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  innerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4285F4',
  },
});

// ============ MAP UTILITIES ============

// Helper function for linear interpolation
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

// Distance Calculation (Haversine Formula)
const calculateDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  return distanceKm * 1000; // Convert to meters
};

// Latitude/Longitude Validation
const isValidLatLng = (lat: any, lng: any) => {
  return typeof lat === 'number' && typeof lng === 'number' &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180;
};

// Logo image import
const logoImage = require('./assets/taxi.png');

const DriverScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const [location, setLocation] = useState<LocationType | null>(
    route.params?.latitude && route.params?.longitude
      ? { latitude: route.params.latitude, longitude: route.params.longitude }
      : null
  );
  const [ride, setRide] = useState<RideType | null>(null);
  const [userData, setUserData] = useState<UserDataType | null>(null);
  const [userLocation, setUserLocation] = useState<LocationType | null>(null);
  const [travelledKm, setTravelledKm] = useState(0);
  const [lastCoord, setLastCoord] = useState<LocationType | null>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [rideStatus, setRideStatus] = useState<
    "idle" | "onTheWay" | "accepted" | "started" | "completed"
  >("idle");
  const [isRegistered, setIsRegistered] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [driverStatus, setDriverStatus] = useState<
    "offline" | "online" | "onRide"
  >("offline");
  const [isLoading, setIsLoading] = useState(false);
const mapRef = useRef<MapLibreGL.MapView | null>(null);
const cameraRef = useRef<MapLibreGL.Camera | null>(null);

  const [driverId, setDriverId] = useState<string>(route.params?.driverId || "");
  const [driverName, setDriverName] = useState<string>(
    route.params?.driverName || ""
  );
  const [error, setError] = useState<string | null>(null);
  const [driverVehicleType, setDriverVehicleType] = useState<string | null>(null);
 
  // Route handling states
  const [fullRouteCoords, setFullRouteCoords] = useState<LocationType[]>([]);
  const [visibleRouteCoords, setVisibleRouteCoords] = useState<LocationType[]>([]);
  const [nearestPointIndex, setNearestPointIndex] = useState(0);
  // mapRegion removed - using MapLibre camera API instead

  // ============ SMOOTH POLYLINE STATES ============
  // Dual-layer route for professional "consumed route" effect
  const [travelledRoute, setTravelledRoute] = useState<LocationType[]>([]);
  const [remainingRoute, setRemainingRoute] = useState<LocationType[]>([]);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isAnimatingRoute, setIsAnimatingRoute] = useState(false);

  // Refs for smooth polyline animation
  const lastRouteUpdateLocation = useRef<LocationType | null>(null);
  const routeAnimationFrame = useRef<number | null>(null);
  const previousRouteRef = useRef<LocationType[]>([]);

  // ============ PROFESSIONAL POLYLINE ANIMATION STATES ============
  // Refs for animation state
  const animationFrameRef = useRef<number | null>(null);
  const animationState = useRef({
    startLat: 0, startLng: 0, endLat: 0, endLng: 0, startTime: 0, duration: 2000
  });
  // Off-route detection and auto re-fetch
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [distanceToRoute, setDistanceToRoute] = useState(0);
  const offRouteReFetchInProgress = useRef(false);
  const lastOffRouteCheckTime = useRef(0);
  const smoothRouteAnimationRef = useRef<number | null>(null);
  const OFF_ROUTE_THRESHOLD = 30; // meters - re-fetch route if driver is more than 30m off

  // App state management
  const [isAppActive, setIsAppActive] = useState(true);

  // New states for verification and bill
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billDetails, setBillDetails] = useState<{
    distance: string;
    travelTime: string;
    charge: number;
    userName: string;
    userMobile: string;
    baseFare: number;
    timeCharge: number;
    tax: number;
    pricePerKm?: number;
    calculation?: string;
    driverShare?: number;
    companyShare?: number;
    pickupAddress?: string;
    dropoffAddress?: string;
  }>({
    distance: '0 km',
    travelTime: '0 mins',
    charge: 0,
    userName: '',
    userMobile: '',
    baseFare: 0,
    timeCharge: 0,
    tax: 0
  });
  const [verificationDetails, setVerificationDetails] = useState({
    pickup: '',
    dropoff: '',
    time: '',
    speed: 0,
    distance: 0,
  });
  const [otpSharedTime, setOtpSharedTime] = useState<Date | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  

    // Add these new state variables:
  const [isAccepting, setIsAccepting] = useState(false); // Tracks if we are currently processing an acceptance
  const [pendingAcceptRideId, setPendingAcceptRideId] = useState<string | null>(null); // Tracks which rideId we have a pending request for



  // Online/Offline toggle state
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);

  // FCM Notification states
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);

  // Wallet balance state
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Track if wallet deduction has been done for current online session
  const [hasDeductedForSession, setHasDeductedForSession] = useState(false);

  // Offline verification modal states
  const [showOfflineVerificationModal, setShowOfflineVerificationModal] = useState(false);
  const [driverIdVerification, setDriverIdVerification] = useState('');

  // Animation values
  const driverMarkerAnimation = useRef(new Animated.Value(1)).current;
  const polylineAnimation = useRef(new Animated.Value(0)).current;
  
  // Enhanced UI states - DEFAULT TO MAXIMIZED
  const [riderDetailsVisible, setRiderDetailsVisible] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current; // Start at 0 for maximized
  const fadeAnim = useRef(new Animated.Value(1)).current;  // Start at 1 for maximized
  
  // Refs for optimization
  const isMounted = useRef(true);
  const locationUpdateCount = useRef(0);
  const mapAnimationInProgress = useRef(false);
  const navigationInterval = useRef<NodeJS.Timeout | null>(null);
  const lastLocationUpdate = useRef<LocationType | null>(null);
  const routeUpdateThrottle = useRef<NodeJS.Timeout | null>(null);
  const distanceSinceOtp = useRef(0);
  const lastLocationBeforeOtp = useRef<LocationType | null>(null);
  const geolocationWatchId = useRef<number | null>(null);
  const backgroundLocationInterval = useRef<NodeJS.Timeout | null>(null);
  const driverMarkerRef = useRef<any>(null);

  // ✅ Ref to hold saveLocationToDatabase function (to avoid circular dependency)
  const saveLocationToDatabaseRef = useRef<((location: LocationType) => void) | null>(null);
  
  // ✅ Refs for frequently changing state to prevent useEffect re-runs
  const rideRef = useRef(ride);
  const locationRef = useRef(location);
  const lastCoordRef = useRef(lastCoord);
  const currentSpeedRef = useRef(currentSpeed);
  const driverVehicleTypeRef = useRef(driverVehicleType);
  const driverIdRef = useRef(driverId);
  const driverNameRef = useRef(driverName);
  const isDriverOnlineRef = useRef(isDriverOnline);
  
  // Store OTP verification location
  const [otpVerificationLocation, setOtpVerificationLocation] = useState<LocationType | null>(null);

  // Alert for ride already taken
  const [showRideTakenAlert, setShowRideTakenAlert] = useState(false);
  const rideTakenAlertTimeout = useRef<NodeJS.Timeout | null>(null);
  const [alertProgress, setAlertProgress] = useState(new Animated.Value(1));

  // ============ ENHANCED RIDE FLOW STATES ============
  // OTP verification states
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Location history for distance verification
  const [locationHistory, setLocationHistory] = useState<LocationType[]>([]);

  // Trip start location (captured after OTP verification)
  const [tripStartLocation, setTripStartLocation] = useState<LocationType | null>(null);

  // Live distance during trip (calculated from location history)
  const [liveTripDistance, setLiveTripDistance] = useState(0);

  // Price per km from admin config
  const [pricePerKm, setPricePerKm] = useState(0);

  // Accept button disabled state (prevent double-tap)
  const [acceptButtonDisabled, setAcceptButtonDisabled] = useState(false);

  // ============ PROFESSIONAL MAP STATES ============
  // This state holds the smoothly interpolated location for the marker
  const [displayedDriverLocation, setDisplayedDriverLocation] = useState<LocationType | null>(null);
  const displayedDriverLocationRef = useRef<LocationType | null>(null);
  useEffect(() => { displayedDriverLocationRef.current = displayedDriverLocation; }, [displayedDriverLocation]);

  const [mapZoomLevel, setMapZoomLevel] = useState(0.036); // Default 4km zoom
  const [currentMapRegion, setCurrentMapRegion] = useState<Region | null>(null);
  const [lastPolylineUpdateLocation, setLastPolylineUpdateLocation] = useState<LocationType | null>(null);
  const [pulseAnimation] = useState(new Animated.Value(1));
  const [mapRefreshKey, setMapRefreshKey] = useState(0); // Force map refresh

  // Refs for real-time updates (prevent stale closures)
  const isMountedRef = useRef(true); // Already defined
  const rideStatusRef = useRef(rideStatus);
  const visibleRouteCoordsRef = useRef<LocationType[]>([]);
  // Add refs for state used in the animation loop to keep it stable
  const fullRouteCoordsRef = useRef<LocationType[]>([]);
  const nearestPointIndexRef = useRef(0);
  const lastPolylineUpdateLocationRef = useRef<LocationType | null>(null);

  useEffect(() => {
    rideStatusRef.current = rideStatus;
  }, [rideStatus]);
  
  // Sync refs with state
  useEffect(() => { rideRef.current = ride; }, [ride]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { fullRouteCoordsRef.current = fullRouteCoords; }, [fullRouteCoords]);
  useEffect(() => { nearestPointIndexRef.current = nearestPointIndex; }, [nearestPointIndex]);
  useEffect(() => { lastCoordRef.current = lastCoord; }, [lastCoord]);
  useEffect(() => { currentSpeedRef.current = currentSpeed; }, [currentSpeed]);
  useEffect(() => { driverVehicleTypeRef.current = driverVehicleType; }, [driverVehicleType]);
  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);
  useEffect(() => { driverNameRef.current = driverName; }, [driverName]);
  useEffect(() => { isDriverOnlineRef.current = isDriverOnline; }, [isDriverOnline]);

  useEffect(() => {
    visibleRouteCoordsRef.current = visibleRouteCoords;
  }, [visibleRouteCoords]);

  useEffect(() => {
    lastPolylineUpdateLocationRef.current = lastPolylineUpdateLocation;
  }, [lastPolylineUpdateLocation]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Socket is now imported at the top of the file
  // Using: import socket, { connectSocket, disconnectSocket, reconnectSocket, isSocketConnected } from './socket';
  
  // ============ PASSENGER DATA FUNCTIONS ============
  
  // Fetch passenger data function
  const fetchPassengerData = useCallback((rideData: RideType): UserDataType => {

    const userDataWithId: UserDataType = {
      name: rideData.userName || "Passenger",
      mobile: rideData.userMobile || "N/A",
      location: rideData.pickup,
      userId: rideData.rideId,
      rating: 4.8,
    };

    return userDataWithId;
  }, []);

  // Calculate initials for avatar
  const calculateInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Call passenger function
  const handleCallPassenger = () => {
    if (userData?.mobile) {
      Linking.openURL(`tel:${userData.mobile}`)
        .catch(err => console.error('Error opening phone dialer:', err));
    } else {
      Alert.alert("Error", "Passenger mobile number not available");
    }
  };

  // ============ PROFESSIONAL MAP & ANIMATION FUNCTIONS ============

  // Message passenger function
  const handleMessagePassenger = () => {
    if (userData?.mobile) {
      Linking.openURL(`sms:${userData.mobile}`)
        .catch(err => console.error('Error opening message app:', err));
    } else {
      Alert.alert("Error", "Passenger mobile number not available");
    }
  };

  // Animation functions for rider details
  const showRiderDetails = () => {
    setRiderDetailsVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  };

  const hideRiderDetails = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400, // Slide down completely
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setRiderDetailsVisible(false);
    });
  };

  const toggleRiderDetails = () => {
    if (riderDetailsVisible) {
      hideRiderDetails();
    } else {
      showRiderDetails();
    }
  };
  
  // Haversine distance function
  const haversine = (start: LocationType, end: LocationType) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (end.latitude - start.latitude) * Math.PI / 180;
    const dLon = (end.longitude - start.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  };
  
  // Save ride state to AsyncStorage for persistence
  const saveRideState = useCallback(async () => {
    try {
      const rideState = {
        ride,
        userData,
        rideStatus,
        driverStatus,
        travelledKm,
        distanceSinceOtp: distanceSinceOtp.current,
        lastLocationBeforeOtp: lastLocationBeforeOtp.current,
        otpVerificationLocation,
        fullRouteCoords,
        visibleRouteCoords,
        userLocation,
        lastCoord,
        riderDetailsVisible // Save UI state
      };
      
      await AsyncStorage.setItem('rideState', JSON.stringify(rideState));
      console.log('✅ Ride state saved to AsyncStorage');
    } catch (error) {
      console.error('❌ Error saving ride state:', error);
    }
  }, [ride, userData, rideStatus, driverStatus, travelledKm, otpVerificationLocation, 
      fullRouteCoords, visibleRouteCoords, userLocation, lastCoord, riderDetailsVisible]);

      
const restoreRideState = useCallback(async () => {
  try {
    const savedState = await AsyncStorage.getItem('rideState');
    const token = await AsyncStorage.getItem('authToken');

    if (savedState) {
      const rideState = JSON.parse(savedState);

      // ✅ FIX: If ride already completed, clear and exit
      if (rideState.rideStatus === 'completed') {
        console.log('🔄 Found completed ride from previous session, clearing...');
        await clearRideState();
        return false;
      }

      // ✅ Restore only ACTIVE rides
      if (
        rideState.ride &&
        (rideState.rideStatus === 'accepted' ||
          rideState.rideStatus === 'started')
      ) {
        // ✅ NEW: Verify ride status with backend before restoring
        if (token && rideState.ride?.rideId) {
          try {
            console.log(`🔍 Verifying ride ${rideState.ride.rideId} status with backend...`);
            const response = await fetch(`${API_BASE}/rides/${rideState.ride.rideId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true'
              }
            });

            if (response.ok) {
              const data = await response.json();
              const backendStatus = data.ride?.status?.toLowerCase();
              console.log(`📋 Backend status for restored ride: ${backendStatus}`);

              const invalidStatuses = ['cancelled', 'canceled', 'completed', 'expired', 'rejected'];
              if (invalidStatuses.includes(backendStatus)) {
                console.log(`❌ Ride is ${backendStatus}. Clearing state.`);
                await clearRideState();
                return false;
              }
            } else if (response.status === 404) {
              console.log('❌ Ride not found on backend. Clearing state.');
              await clearRideState();
              return false;
            }
          } catch (err) {
            console.warn("⚠️ Could not verify ride status (offline?), proceeding with restore.");
          }
        }

        console.log('🔄 Restoring ride state from AsyncStorage');

        // --- Core ride data ---
        setRide(rideState.ride);
        setUserData(rideState.userData); // ✅ Passenger data
        setRideStatus(rideState.rideStatus);
        setDriverStatus(rideState.driverStatus);
        setTravelledKm(rideState.travelledKm || 0);

        // --- OTP & distance ---
        distanceSinceOtp.current = rideState.distanceSinceOtp || 0;
        lastLocationBeforeOtp.current = rideState.lastLocationBeforeOtp;
        setOtpVerificationLocation(rideState.otpVerificationLocation);

        // --- Route & map ---
        setFullRouteCoords(rideState.fullRouteCoords || []);
        setVisibleRouteCoords(rideState.visibleRouteCoords || []);
        setUserLocation(rideState.userLocation);
        setLastCoord(rideState.lastCoord);

        // ✅ FORCE SHOW RIDER DETAILS IF PASSENGER DATA EXISTS
        if (rideState.userData) {
          setRiderDetailsVisible(true);
          slideAnim.setValue(0);   // maximized
          fadeAnim.setValue(1);
          console.log('✅ Passenger data restored:', rideState.userData);
        } else {
          // fallback (should not normally happen)
          setRiderDetailsVisible(false);
          slideAnim.setValue(400);
          fadeAnim.setValue(0);
        }

        console.log('✅ Ride state restored successfully');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('❌ Error restoring ride state:', error);
    return false;
  }
}, []);


  
  // Clear ride state from AsyncStorage
  const clearRideState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('rideState');
      console.log('✅ Ride state cleared from AsyncStorage');
    } catch (error) {
      console.error('❌ Error clearing ride state:', error);
    }
  }, []);
  const checkBackendTimerStatus = useCallback(async (driverId: string) => {
  try {
    const token = await AsyncStorage.getItem("authToken");
    if (!token) return;

    const timestamp = new Date().getTime();
    const response = await fetch(`${API_BASE}/drivers/working-hours/status/${driverId}?t=${timestamp}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      // Sync UI with Backend Timer State
      if (data.success && data.timerActive) {
        // ✅ FIX: Do not override 'onRide' status. Only set to 'online' if idle.
        if (rideStatusRef.current !== 'accepted' && rideStatusRef.current !== 'started') {
          setIsDriverOnline(true);
          setDriverStatus("online");
          await AsyncStorage.setItem("driverOnlineStatus", "online");
        }

        // ✅ Start background service for 1-second updates
        if (!isBackgroundServiceRunning()) {
          enableAutoReconnect();
          startBackgroundService();
        }

        // Ensure socket is connected (uses heartbeat for reliability)
       if (!socket || !socket.connected) {
  connectSocket();
}
      }
    }
  } catch (error) {
    console.error('❌ Error checking backend timer status:', error);
  }
}, [socket]);



useEffect(() => {
  if (driverId) {
    checkBackendTimerStatus(driverId).catch(error => {
      console.error('❌ Timer check failed:', error);
      // Don't block the app if timer check fails
    });
  }
}, [driverId, checkBackendTimerStatus]);



  // Fetch wallet balance on mount and when driver goes online
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const driverInfoStr = await AsyncStorage.getItem('driverInfo');
        const token = await AsyncStorage.getItem('authToken');
        if (driverInfoStr) {
          const timestamp = new Date().getTime();
          const driverInfo = JSON.parse(driverInfoStr);
          const response = await fetch(
            `${API_BASE}/drivers/wallet/balance/${driverInfo.driverId}?t=${timestamp}`,
            {
              method: 'GET',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
            }
          );
          
          if (!response.ok) {
            console.log('❌ Wallet balance fetch failed:', response.status);
            return;
          }
          
          const result = await response.json();
          if (result.success) {
            setWalletBalance(result.balance || 0);
            console.log('✅ Wallet balance fetched:', result.balance);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching wallet balance:', error);
        setWalletBalance(0);
      }
    };

    if (driverId) {
      fetchWalletBalance();
    }
  }, [driverId, isDriverOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (navigationInterval.current) {
        clearInterval(navigationInterval.current);
      }
      if (routeUpdateThrottle.current) {
        clearTimeout(routeUpdateThrottle.current);
      }
      if (geolocationWatchId.current) {
        Geolocation.clearWatch(geolocationWatchId.current);
      }
      if (backgroundLocationInterval.current) {
        clearInterval(backgroundLocationInterval.current);
      }
      if (rideTakenAlertTimeout.current) {
        clearTimeout(rideTakenAlertTimeout.current);
      }
      // Clean up notification listeners
      NotificationService.off('rideRequest', handleNotificationRideRequest);
      NotificationService.off('tokenRefresh', () => {});
    };
  }, []);
  
  // ============ ROBUST APP STATE MANAGEMENT ============
  // Handles background/foreground transitions with proper state persistence
  const appStateRef = useRef(AppState.currentState);
  const wasInBackgroundRef = useRef(false);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;


      // ============ GOING TO BACKGROUND ============
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setIsAppActive(false);
        wasInBackgroundRef.current = true;

        // ✅ CRITICAL: Always save state when going to background during active ride
        if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
          console.log("💾 Saving ride state before background...");
          await saveRideState();

          // ✅ Keep socket connected - emit a "going background" signal
          if (socket && socket.connected) {
            socket.emit("driverGoingBackground", {
              driverId,
              rideId: ride.rideId,
              status: rideStatus,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // ============ COMING TO FOREGROUND ============
      if (nextAppState === 'active' && wasInBackgroundRef.current) {
        setIsAppActive(true);
        wasInBackgroundRef.current = false;

        console.log("🔄 App resumed from background");

        // ✅ CRITICAL: Always attempt to restore ride state on resume
        // This handles the case where ride was null due to app restart
        const rideRestored = await restoreRideState();

        if (rideRestored) {
          console.log("✅ Ride state restored after resume");

          // ✅ Reconnect socket if needed
          if (!socket || !socket.connected) {
            console.log("🔌 Reconnecting socket after resume...");
            reconnectSocket();
          }

          // ✅ Re-register driver with current ride
          setTimeout(() => {
            if (socket && socket.connected && driverId && location) {
              socket.emit("driverResumedRide", {
                driverId,
                driverName,
                rideId: ride?.rideId,
                latitude: location.latitude,
                longitude: location.longitude,
                vehicleType: driverVehicleType,
                status: "onRide",
              });
              console.log("📡 Re-registered driver after resume");
            }
          }, 500);

          // ✅ Restart location tracking if needed
          // Note: Location tracking is handled by the Geolocation.watchPosition hook
        } else if (!ride) {
          // No active ride - check if driver was online
          console.log("ℹ️ No active ride to restore");

          // Reconnect socket if driver is online
          if (isDriverOnline && (!socket || !socket.connected)) {
            reconnectSocket();
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [ride, rideStatus, saveRideState, restoreRideState, driverId, driverName, location, driverVehicleType, isDriverOnline, backgroundTrackingActive]);

  // ============ PERIODIC STATE SAVE DURING ACTIVE RIDE ============
  // Saves state every 10 seconds to ensure persistence even if app crashes
  useEffect(() => {
    if (rideStatus === "accepted" || rideStatus === "started") {

      const stateSaveInterval = setInterval(() => {
        if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
          saveRideState();
        }
      }, 10000); // Every 10 seconds

      return () => {
        clearInterval(stateSaveInterval);
      };
    }
  }, [rideStatus, ride, saveRideState]);
  
  // Stop background location tracking
  const stopBackgroundLocationTracking = useCallback(() => {
    console.log("🛑 Stopping background location tracking");
   
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }
   
    if (backgroundLocationInterval.current) {
      clearInterval(backgroundLocationInterval.current);
      backgroundLocationInterval.current = null;
    }
   
    setBackgroundTrackingActive(false);
  }, []);
  
  // FCM: Initialize notification system
   // FCM: Initialize notification system
  useEffect(() => {
    const initializeNotificationSystem = async () => {
      try {
        console.log('🔔 Setting up complete notification system...');
       
        // Initialize the notification service
        const initialized = await NotificationService.initializeNotifications();
       
        if (initialized) {
          console.log('✅ Notification system initialized successfully');
         
          // Get FCM token and send to server
          const token = await NotificationService.getFCMToken();
          if (token && driverId) {
            await sendFCMTokenToServer(token);
          }
         
          // Listen for ride requests
          NotificationService.on('rideRequest', handleNotificationRideRequest);
         
          // Listen for token refresh
          NotificationService.on('tokenRefresh', async (newToken) => {
            console.log('🔄 FCM token refreshed, updating server...');
            if (driverId) {
              await sendFCMTokenToServer(newToken);
            }
          });
         
          setHasNotificationPermission(true);
        } else {
          console.log('❌ Notification system initialization failed');
          setHasNotificationPermission(false);
        }
      } catch (error) {
        console.error('❌ Error in notification system initialization:', error);
        // Don't block app if notifications fail
        setHasNotificationPermission(false);
      }
    };
    
    // Initialize when driver goes online
    if ((driverStatus === 'online' || driverStatus === 'onRide') && !hasNotificationPermission) {
      initializeNotificationSystem();
    }
    
    return () => {
      // Cleanup
      NotificationService.off('rideRequest', handleNotificationRideRequest);
    };
  }, [driverStatus, driverId, hasNotificationPermission]);
  



  
  const sendFCMTokenToServer = async (token: string): Promise<boolean> => {
  try {
    console.log('📤 Sending FCM token to server for driver:', driverId);
    const authToken = await AsyncStorage.getItem("authToken");

    // ✅ Use the correct endpoint that matches your server
    const response = await fetch(`${API_BASE}/drivers/update-fcm-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        driverId: driverId,
        fcmToken: token,
        platform: Platform.OS
      }),
    });
    
    console.log('📡 FCM token update response:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ FCM token updated on server:', result);
      return true;
    } else {
      console.error('❌ FCM endpoint failed:', response.status);
      
      // Try alternative endpoint
      try {
        const altResponse = await fetch(`${API_BASE}/drivers/simple-fcm-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ driverId, fcmToken: token })
        });
        
        if (altResponse.ok) {
          console.log('✅ FCM token updated via alternative endpoint');
          return true;
        }
      } catch (altError) {
        console.error('❌ Alternative FCM endpoint also failed:', altError);
      }
      
      // Store locally as fallback
      await AsyncStorage.setItem('fcmToken', token);
      console.log('💾 FCM token stored locally as fallback');
      return false;
    }
    
  } catch (error: any) {
    console.error('❌ Network error sending FCM token:', error);
    await AsyncStorage.setItem('fcmToken', token);
    return false;
  }
};


  


const handleNotificationRideRequest = useCallback(async (data: any) => {
  if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

  console.log('🔔 Processing notification ride request:', data.rideId);

  // ✅ FIX: Normalize both types to UPPERCASE for comparison
  const myDriverType = (driverVehicleType || "").toLowerCase(); 
  const requestVehicleType = (data.vehicleType || "").trim().toLowerCase();

  console.log(`🔍 Type Check (FCM): Me=[${myDriverType}] vs Ride=[${requestVehicleType}]`);

  // Only ignore if the types are definitely different
  if (requestVehicleType && myDriverType && myDriverType !== requestVehicleType) {
      console.log(`🚫 Ignoring notification: Driver is ${myDriverType}, ride requires ${requestVehicleType}`);
      return;
  }

  // ✅ NEW: Verify ride status with backend to prevent zombie requests
  try {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      const response = await fetch(`${API_BASE}/rides/${data.rideId}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        }
      });
      if (response.ok) {
        const resData = await response.json();
        const status = resData.ride?.status?.toLowerCase();
        // If it's not searching/requested, it's invalid for a new request
        if (status && status !== 'searching' && status !== 'requested' && status !== 'pending') {
          console.log(`🚫 Ignoring notification for ride with status: ${status}`);
          return;
        }
      }
    }
  } catch (e) {
    console.log("⚠️ Could not verify notification ride status, showing anyway");
  }
  
  // Use the same logic as the socket ride request handler
  try {
    let pickupLocation, dropLocation;
    
    try {
      if (typeof data.pickup === 'string') {
        pickupLocation = JSON.parse(data.pickup);
      } else {
        pickupLocation = data.pickup;
      }
      
      if (typeof data.drop === 'string') {
        dropLocation = JSON.parse(data.drop);
      } else {
        dropLocation = data.drop;
      }
    } catch (error) {
      console.error('Error parsing notification location data:', error);
      return;
    }
    
    const rideData: RideType = {
      rideId: data.rideId,
      RAID_ID: data.RAID_ID || "N/A",
      otp: data.otp || "0000",
      pickup: {
        latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
        longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
        address: pickupLocation?.address || "Unknown location",
      },
      drop: {
        latitude: dropLocation?.lat || dropLocation?.latitude || 0,
        longitude: dropLocation?.lng || dropLocation?.longitude || 0,
        address: dropLocation?.address || "Unknown location",
      },
      fare: parseFloat(data.fare) || 0,
      distance: data.distance || "0 km",
      vehicleType: data.vehicleType,
      userName: data.userName || "Customer",
      userMobile: data.userMobile || "N/A",
    };
    
    // ✅ SET RIDE FIRST
    setRide(rideData);
    setRideStatus("onTheWay");
    
    // ✅ CRITICAL: SET PASSENGER DATA IMMEDIATELY FROM RIDE DATA
    const passengerData: UserDataType = {
      name: rideData.userName || "Passenger",
      mobile: rideData.userMobile || "N/A",
      location: rideData.pickup,
      userId: rideData.rideId,
      rating: 4.8,
    };
    
    setUserData(passengerData);
    
    // ✅ SHOW RIDER DETAILS IMMEDIATELY
    setRiderDetailsVisible(true);
    slideAnim.setValue(0);
    fadeAnim.setValue(1);

    // ✅ PLAY CUSTOM SOUND via Notification (Foreground)
    try {
      notifee.displayNotification({
        title: '🚖 New Ride Request!',
        body: `Pickup: ${rideData.pickup.address}`,
        android: {
          channelId: 'ride_requests_v4', // Must match channel created in App.tsx
          sound: 'notification',
          importance: AndroidImportance.HIGH,
          pressAction: { id: 'default' },
        },
      });
    } catch (err) {
      console.error("❌ Failed to play notification sound:", err);
    }
    
    Alert.alert(
      "🚖 New Ride Request!",
      `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}`,
      [
        {
          text: "❌ Reject",
          onPress: () => rejectRide(rideData.rideId),
          style: "destructive",
        },
        {
          text: "✅ Accept",
          onPress: () => acceptRide(rideData.rideId),
        },
      ],
      { cancelable: false }
    );
  } catch (error) {
    console.error("❌ Error processing notification ride request:", error);
    Alert.alert("Error", "Could not process ride request. Please try again.");
  }
}, [isDriverOnline, driverVehicleType]);



const goOfflineNormally = useCallback(async () => {
  try {
    console.log('🔴 Going offline...');

    // Call backend to stop working hours timer (NO wallet deduction)
    const response = await fetch(`${API_BASE}/drivers/working-hours/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await AsyncStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({ driverId: driverId }),
    });

    const result = await response.json();

    if (!result.success) {
      Alert.alert("Error", result.message || "Failed to stop working hours. Please try again.");
      return;
    }

    // Update wallet balance from backend response
    if (result.walletBalance !== undefined) {
      setWalletBalance(result.walletBalance);
      console.log(`💰 Wallet balance updated: ₹${result.walletBalance}`);
    }

    // Go offline
    setIsDriverOnline(false);
    setDriverStatus("offline");
    stopBackgroundLocationTracking();

    // ✅ Stop background service (stops 1-second location updates)
    stopBackgroundService();

    // ✅ Stop native Android foreground service
    if (NativeLocationService.isAvailable()) {
      await NativeLocationService.stop();
      console.log('✅ Native location service stopped');
    }

    // Emit offline status to socket
    if (socket && socket.connected) {
      socket.emit("driverOffline", { driverId });
    }

    await AsyncStorage.setItem("driverOnlineStatus", "offline");
    console.log("🔴 Driver is now offline (background service stopped)");

    // Show professional message
    Alert.alert(
      "You're Offline",
      "You have successfully gone offline. Your availability status has been updated.",
      [{ text: "OK" }]
    );
  } catch (error) {
    console.error("❌ Error going offline:", error);
    Alert.alert("Error", "Failed to go offline. Please try again.");
  }
}, [driverId, socket, stopBackgroundLocationTracking]);

// Function to verify driver ID and go offline
const verifyDriverIdAndGoOffline = useCallback(async () => {
  const last4Digits = driverId.slice(-4);

  if (driverIdVerification !== last4Digits) {
    Alert.alert(
      'Verification Failed',
      'The last 4 digits you entered do not match your Driver ID. Please try again.',
      [{ text: "OK" }]
    );
    return;
  }

  // Close modal
  setShowOfflineVerificationModal(false);
  setDriverIdVerification('');

  // Go offline (no wallet deduction)
  await goOfflineNormally();
}, [driverId, driverIdVerification, goOfflineNormally]);

const toggleOnlineStatus = useCallback(async () => {
  if (isDriverOnline) {
    setShowOfflineVerificationModal(true);
    // STOP TIMER HERE
    BackgroundTimer.stopBackgroundTimer();
  } else {
    // STARTING ONLINE
    // Going online - check location permission first
    if (!location) {
      Alert.alert("Location Required", "Please enable location services to go online.");
      return;
    }

    try {
      // Call backend to start working hours timer (backend auto-deducts ₹100)
      const response = await fetch(`${API_BASE}/drivers/working-hours/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ driverId: driverId }),
      });

      const result = await response.json();

      if (!result.success) {
        Alert.alert("Cannot Go Online", result.message || "Failed to start working hours. Please try again.");
        return;
      }

      // Update wallet balance from backend response
      if (result.walletBalance !== undefined) {
        setWalletBalance(result.walletBalance);
        console.log(`💰 Wallet balance updated: ₹${result.walletBalance}`);
      }

      // Now go online
      setIsDriverOnline(true);
      setDriverStatus("online");

      // ✅ Start NATIVE background service for reliable location tracking
      // This survives app background, screen lock, and even app close
      enableAutoReconnect();
      startBackgroundService();

      // ✅ Start native Android foreground service (most reliable)
      if (NativeLocationService.isAvailable()) {
        await NativeLocationService.start(
          driverId,
          driverName || 'Driver',
          driverVehicleType || 'taxi',
          SOCKET_URL
        );
        console.log('✅ Native location service started');
      }

      // Register with socket (uses heartbeat for reliability)
      if (!socket || !socket.connected) {
  Alert.alert("Connection Error", "Reconnecting to server...");
  reconnectSocket();
}

      await AsyncStorage.setItem("driverOnlineStatus", "online");
      console.log("🟢 Driver is now online (background service started)");

      // Show success message with deduction info
      if (result.amountDeducted && result.amountDeducted > 0) {
        Alert.alert(
          "You're Online!",
          `₹${result.amountDeducted} deducted from your wallet.\nCurrent Balance: ₹${result.walletBalance}`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("You're Online!", "You can now receive ride requests.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("❌ Error starting working hours:", error);
      Alert.alert("Error", "Failed to go online. Please try again.");
    }
  }
}, [isDriverOnline, location, driverId, socket]);



// Add this function to fetch and update vehicle type from server
const fetchAndUpdateVehicleType = useCallback(async () => {
  try {
    
    const response = await fetch(`${API_BASE}/drivers/get-vehicle-type/${driverId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await AsyncStorage.getItem("authToken")}`,
      },
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.vehicleType) {
        const normalizedType = result.vehicleType.toLowerCase();
        
        // Update both state and AsyncStorage
        setDriverVehicleType(normalizedType);
        await AsyncStorage.setItem("driverVehicleType", normalizedType);
        
        // Re-register with socket with correct vehicle type
        if (socket && socket.connected && locationRef.current && isDriverOnlineRef.current) {
          socket.emit("registerDriver", {
            driverId,
            driverName,
            latitude: locationRef.current.latitude,
            longitude: locationRef.current.longitude,
            vehicleType: normalizedType,
          });
        }
        
        return normalizedType;
      }
    }
  } catch (error) {
    console.error('❌ Error fetching vehicle type:', error);
  }
  return null;
}, [driverId, driverName, socket]); // ✅ Removed location/isDriverOnline to prevent loop

// Add this useEffect to load vehicle type on mount
useEffect(() => {
  const loadVehicleType = async () => {
    if (driverId) {
      // First try to get from AsyncStorage
      const storedType = await AsyncStorage.getItem("driverVehicleType");
      
      if (storedType) {
        const normalizedType = storedType.toLowerCase();
        setDriverVehicleType(normalizedType);
      } else {
        // Fetch from server if not in storage
        await fetchAndUpdateVehicleType();
      }
    }
  };
  
  if (driverId) {
    loadVehicleType();
  }
  // Also check timer status
  if (driverId) {
    checkBackendTimerStatus(driverId);
  }
}, [driverId, fetchAndUpdateVehicleType, checkBackendTimerStatus]);

  // Load driver info and verify token on mount - COMPLETELY NON-BLOCKING
  useEffect(() => {
    const loadDriverInfo = async () => {
      try {
        console.log("🔍 Loading driver info from AsyncStorage...");

        // Load all data in parallel for speed
        const [
          storedDriverId,
          storedDriverName,
          storedVehicleType,
          token,
          savedOnlineStatus
        ] = await Promise.all([
          AsyncStorage.getItem("driverId"),
          AsyncStorage.getItem("driverName"),
          AsyncStorage.getItem("driverVehicleType"),
          AsyncStorage.getItem("authToken"),
          AsyncStorage.getItem("driverOnlineStatus")
        ]);

        if (storedDriverId && storedDriverName && token) {
          console.log("✅ Driver data found:", storedDriverId);

          // CRITICAL: Set driver data IMMEDIATELY to unblock render
          setDriverId(storedDriverId);
          setDriverName(storedDriverName);

          if (storedVehicleType) {
            const normalizedType = storedVehicleType.toLowerCase();
            setDriverVehicleType(normalizedType);
            console.log(`🚗 Vehicle type: ${normalizedType}`);
          }

          // Get location IMMEDIATELY (don't wait for it)
          Geolocation.getCurrentPosition(
            (pos) => {
              setLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
              setLastCoord({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
              console.log("✅ Location obtained");
            },
            (locationError) => {
              console.error("❌ Location error, using default");
              // Set default location so map can render
              setLocation({ latitude: 12.9716, longitude: 77.5946 });
              setLastCoord({ latitude: 12.9716, longitude: 77.5946 });
            },
            {
              enableHighAccuracy: false, // Faster, less accurate initially
              timeout: 5000,
              maximumAge: 10000
            }
          );

          // ✅ CRITICAL FIX: Restore ride state BEFORE setting online status to prevent race conditions.
          const rideRestored = await restoreRideState();
          if (rideRestored) {
            console.log("✅ Active ride restored from previous session.");
            // If a ride is restored, the driver is definitely "online" and "onRide".
            // `restoreRideState` sets the status, now we ensure services are running.
            setIsDriverOnline(true); // This will trigger socket connection with correct 'onRide' status
            if (!isBackgroundServiceRunning()) {
              enableAutoReconnect();
              startBackgroundService();
            }
            if (NativeLocationService.isAvailable() && storedDriverId && storedDriverName) {
              await NativeLocationService.start(storedDriverId, storedDriverName, storedVehicleType || 'taxi', SOCKET_URL);
            }
          } else {
            // No active ride, so check for normal "online" status.
            if (savedOnlineStatus === "online") {
              console.log("✅ No active ride, restoring normal online status.");
              setIsDriverOnline(true);
              setDriverStatus("online");
              if (!isBackgroundServiceRunning()) {
                enableAutoReconnect();
                startBackgroundService();
              }
            }
          }

        } else {
          console.log("❌ Missing driver data or token, redirecting to login");
          // Don't clear storage immediately, do it async
          Promise.resolve().then(() => {
            AsyncStorage.clear();
            navigation.replace("LoginScreen");
          });
        }
      } catch (error) {
        console.error("❌ Error loading driver info:", error);
        Promise.resolve().then(() => {
          AsyncStorage.clear();
          navigation.replace("LoginScreen");
        });
      }
    };

    // Only load if driver data not already present
    if (!driverId || !driverName) {
      loadDriverInfo();
    } else {
      console.log("✅ Driver data already loaded:", driverId);
    }
  }, [driverId, driverName, navigation, restoreRideState]);
  
  // Request user location when ride is accepted
  useEffect(() => {
    if (rideStatus === "accepted" && ride?.rideId && socket) {
      console.log("📍 Requesting initial user location for accepted ride");
      socket.emit("getUserDataForDriver", { rideId: ride.rideId });
      
      const intervalId = setInterval(() => {
        if (rideStatus === "accepted" || rideStatus === "started") {
          socket.emit("getUserDataForDriver", { rideId: ride.rideId });
        }
      }, 10000);
      
      return () => clearInterval(intervalId);
    }
  }, [rideStatus, ride?.rideId]);
  
  // Optimized location saving - Enhanced for real-time tracking
  const saveLocationToDatabase = useCallback(
    async (location: LocationType) => {
      const isActiveRide = rideStatusRef.current === "accepted" || rideStatusRef.current === "started";

      // ✅ CRITICAL: Emit socket update IMMEDIATELY (don't wait for HTTP request)
      // This ensures user app receives driver location updates even if backend API is slow/failing
      if (socket && socket.connected && (isActiveRide || isDriverOnlineRef.current)) {
        try {
          socket.emit('driverLocationUpdate', {
            driverId,
            driverName: driverName || "Unknown Driver",
            latitude: location.latitude,
            longitude: location.longitude,
            vehicleType: driverVehicleTypeRef.current,
            status: isActiveRide ? "onRide" : "Live",
            rideId: rideRef.current?.rideId || null,
            bearing: currentSpeedRef.current > 0 ? calculateBearing(lastCoordRef.current, location) : 0,
            speed: currentSpeedRef.current || 0,
            timestamp: new Date().toISOString(),
            phase: rideStatusRef.current === "accepted" ? "pickup_navigation" : (rideStatusRef.current === "started" ? "dropoff_navigation" : "idle"),
          });
        } catch (socketError) {
          console.error("⚠️ Socket emit failed:", socketError);
        }
      }

      try {
        locationUpdateCount.current++;

        // During idle/online, emit every 3rd update to save bandwidth
        if (!isActiveRide && locationUpdateCount.current % 3 !== 0) {
          return;
        }

        const payload = {
          driverId,
          driverName: driverName || "Unknown Driver",
          latitude: location.latitude,
          longitude: location.longitude,
          vehicleType: driverVehicleTypeRef.current,
          status: isActiveRide ? "onRide" : isDriverOnlineRef.current ? "Live" : "offline",
          rideId: rideRef.current?.rideId || null,
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(`${API_BASE}/driver-location/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "User-Agent": "EazygoDriverApp/1.0",
            Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Failed to save location:", errorText);
        }
      } catch (error) {
        console.error("❌ Error saving location to DB:", error);
      }
    },
    [driverId, driverName] // ✅ Minimized dependencies using refs
  );

  // ✅ Keep ref updated for use in startBackgroundLocationTracking (avoids circular dependency)
  useEffect(() => {
    saveLocationToDatabaseRef.current = saveLocationToDatabase;
  }, [saveLocationToDatabase]);

  // ✅ Calculate bearing between two points (for smooth driver icon rotation)
  const calculateBearing = (start: LocationType | null, end: LocationType): number => {
    if (!start) return 0;
    const lat1 = (start.latitude * Math.PI) / 180;
    const lat2 = (end.latitude * Math.PI) / 180;
    const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let bearing = Math.atan2(y, x);
    bearing = (bearing * 180) / Math.PI;
    return (bearing + 360) % 360;
  };
  
  // Register driver with socket
  useEffect(() => {
    if (!isRegistered && driverId && location && isDriverOnline && socket) {
      console.log("📝 Registering driver with socket:", driverId);
      socket.emit("registerDriver", {
        driverId,
        driverName,
        latitude: location.latitude,
        longitude: location.longitude,
        vehicleType: driverVehicleType,
      });
      setIsRegistered(true);
    }
  }, [driverId, location, isRegistered, driverName, isDriverOnline, driverVehicleType]);

  // ============ HIGH-FREQUENCY LOCATION EMISSION FOR ACCEPTED RIDES ============
  // This ensures user app receives driver location updates every 1 second during pickup navigation
  const locationEmissionInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (locationEmissionInterval.current) {
      clearInterval(locationEmissionInterval.current);
      locationEmissionInterval.current = null;
    }

    const isActiveRide = rideStatus === "accepted" || rideStatus === "started";

    // ✅ Start high-frequency emission when ride is active
    // Use socketConnected state to ensure we restart if connection drops/restores
    if (isActiveRide && socket && socketConnected) {

      // ✅ Emit location every 1 second during BOTH accepted and started status
      locationEmissionInterval.current = setInterval(() => {
        // Use refs to access latest state without triggering re-renders
        const currentLocation = locationRef.current;
        const currentStatus = rideStatusRef.current;
        
        if (currentLocation && socket && socket.connected && (currentStatus === "accepted" || currentStatus === "started")) {
          socket.emit('driverLocationUpdate', {
            driverId: driverIdRef.current,
            driverName: driverNameRef.current || "Unknown Driver",
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            vehicleType: driverVehicleTypeRef.current,
            status: "onRide",
            rideId: rideRef.current?.rideId,
            bearing: 0, 
            speed: currentSpeedRef.current || 0,
            timestamp: new Date().toISOString(),
            phase: currentStatus === "accepted" ? "pickup_navigation" : "dropoff_navigation",
          });
        }
      }, 1000); // Every 1 second
    }

    // Cleanup when ride ends
    return () => {
      if (locationEmissionInterval.current) {
        clearInterval(locationEmissionInterval.current);
        locationEmissionInterval.current = null;
      }
    };
  }, [rideStatus, socketConnected]);

  // ✅ FORCE CLEAR MAP DATA WHEN RIDE ENDS
  useEffect(() => {
    if (rideStatus === "completed" || rideStatus === "idle") {
      console.log(`🧹 Status is ${rideStatus}, forcing map cleanup`);
      clearMapData();
      stopNavigation();
    }
  }, [rideStatus, clearMapData, stopNavigation]);

  // Find nearest point on route
  const findNearestPointOnRoute = useCallback(
    (currentLocation: LocationType, routeCoords: LocationType[]) => {
      if (!routeCoords || routeCoords.length === 0) return null;

      let minDistance = Infinity;
      let nearestIndex = 0;

      for (let i = 0; i < routeCoords.length; i++) {
        const distance = haversine(currentLocation, routeCoords[i]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }

      return { index: nearestIndex, distance: minDistance };
    },
    []
  );

  // ============ SMOOTH POLYLINE UPDATE SYSTEM ============
  // Professional smooth route update with interpolation and OFF-ROUTE DETECTION
  const updateSmoothRoute = useCallback(async () => {
    if (!location || !fullRouteCoords.length) return;

    // ✅ Check status ref to prevent updates after completion
    if (rideStatusRef.current !== "accepted" && rideStatusRef.current !== "started") return;

    // Check if movement is significant enough to update (prevents GPS jitter)
    if (!isSignificantMovement(lastRouteUpdateLocation.current, location, 8)) {
      return;
    }

    // ============ OFF-ROUTE DETECTION ============
    // Check if driver has gone off the planned route
    const destination = rideStatus === "accepted" ? ride?.pickup : ride?.drop;
    if (destination && !offRouteReFetchInProgress.current) {
      const offRouteCheck = isDriverOffRoute(
        location,
        fullRouteCoords,
        OFF_ROUTE_THRESHOLD,
        nearestPointIndex
      );

      setDistanceToRoute(offRouteCheck.distance);
      setIsOffRoute(offRouteCheck.isOffRoute);

      // If driver is off-route, re-fetch the route
      if (offRouteCheck.isOffRoute) {
        const now = Date.now();
        // Throttle off-route checks to every 3 seconds
        if (now - lastOffRouteCheckTime.current > 3000) {
          lastOffRouteCheckTime.current = now;

          offRouteReFetchInProgress.current = true;

          try {
            const newRouteData = await getRouteWithDetails(location, destination);
            if (newRouteData && newRouteData.coords.length > 0) {
              console.log(`✅ New route fetched with ${newRouteData.coords.length} points`);

              // Animate transition to new route
              animateSmoothRouteTransition(fullRouteCoords, newRouteData.coords, (interpolated) => {
                setVisibleRouteCoords(interpolated);
              }, () => {
                setFullRouteCoords(newRouteData.coords);
                setVisibleRouteCoords(newRouteData.coords);
                setNearestPointIndex(0);
                setIsOffRoute(false);
              });
            }
          } catch (error) {
            console.error('❌ Error re-fetching route:', error);
          } finally {
            offRouteReFetchInProgress.current = false;
          }
          return;
        }
      }
    }

    // Split route into travelled and remaining using smooth interpolation
    const segments = splitRouteAtDriver(
      location,
      fullRouteCoords,
      nearestPointIndex
    );

    // Update refs and state
    lastRouteUpdateLocation.current = location;
    previousRouteRef.current = visibleRouteCoords;

    // ✅ CRITICAL FIX: Directly update polyline for immediate visual feedback
    // This ensures the "consumed" polyline shrinks in real-time as the driver moves
    // Don't use complex interpolation - it causes delays and stale visuals
    setVisibleRouteCoords(segments.remaining);
    setTravelledRoute(segments.travelled);
    setRemainingRoute(segments.remaining);
    setRouteProgress(segments.progress);
    setNearestPointIndex(segments.nearestIndex);

  }, [location, fullRouteCoords, nearestPointIndex, visibleRouteCoords, isAnimatingRoute, rideStatus, ride]);

  // ============ SMOOTH ROUTE TRANSITION ANIMATION ============
  // Professional animation function for route transitions (like user app)
  const animateSmoothRouteTransition = useCallback((
    oldRoute: LocationType[],
    newRoute: LocationType[],
    onProgress: (interpolated: LocationType[]) => void,
    onComplete: () => void
  ) => {
    if (smoothRouteAnimationRef.current) {
      cancelAnimationFrame(smoothRouteAnimationRef.current);
    }

    const startTime = Date.now();
    const duration = 500; // 500ms duration
    let lastFrameTime = 0;

    const animate = () => {
      const now = Date.now();
      
      // Throttle updates to ~30fps to prevent map overload/flicker
      if (now - lastFrameTime < 32) {
        smoothRouteAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      lastFrameTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      const interpolated = interpolateRoutes(oldRoute, newRoute, easedProgress);
      onProgress(interpolated);

      if (progress < 1) {
        smoothRouteAnimationRef.current = requestAnimationFrame(animate);
      } else {
        onComplete();
        smoothRouteAnimationRef.current = null;
      }
    };

    smoothRouteAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // Throttled smooth route update (optimized for 60fps feel)
  const throttledUpdateVisibleRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }

    // ✅ REDUCED throttle to 250ms for responsive polyline updates during movement
    // This matches the GPS update frequency and ensures smooth visual feedback
    routeUpdateThrottle.current = setTimeout(() => {
      updateSmoothRoute();
    }, 250);
  }, [updateSmoothRoute]);

  // Automatically update route as driver moves - SMOOTH VERSION
  // Works for both "accepted" (to pickup) and "started" (to drop) phases
  useEffect(() => {
    if ((rideStatus === "accepted" || rideStatus === "started") && fullRouteCoords.length > 0) {
      throttledUpdateVisibleRoute();
    }
  }, [location, rideStatus, fullRouteCoords, throttledUpdateVisibleRoute]);

  // Cleanup animation frames on unmount
  useEffect(() => {
    return () => {
      if (routeAnimationFrame.current) {
        cancelAnimationFrame(routeAnimationFrame.current);
      }
      if (smoothRouteAnimationRef.current) {
        cancelAnimationFrame(smoothRouteAnimationRef.current);
      }
    };
  }, []);
  
  // ============ SMOOTH PICKUP ROUTE UPDATE (Before OTP) ============
  // Update pickup route as driver moves with smooth animation
  const pickupRouteUpdateRef = useRef<LocationType | null>(null);

  const updatePickupRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "accepted") return;

    // ✅ Check if significant movement (> 15 meters) to avoid too many API calls
    if (pickupRouteUpdateRef.current) {
      const distance = haversine(pickupRouteUpdateRef.current, location);
      if (distance < 15) return; // Skip if moved less than 15 meters
    }

    console.log("🗺️ Updating pickup route (driver → pickup)");
    pickupRouteUpdateRef.current = location;

    try {
      const pickupRoute = await fetchRoute(location, ride.pickup);
      if (pickupRoute && pickupRoute.length > 0) {
        console.log("✅ Generated pickup route with", pickupRoute.length, "points");

        // ✅ Update ride object with new route
        setRide((prev) => {
          if (!prev) return null;
          return { ...prev, routeCoords: pickupRoute };
        });

        // ✅ CRITICAL: Also update visibleRouteCoords for polyline rendering
        // Use smooth interpolation for professional animation
        if (visibleRouteCoords.length > 0 && !isAnimatingRoute) {
          setIsAnimatingRoute(true);

          const startTime = Date.now();
          const animationDuration = 400; // Slightly longer for pickup route

          const animatePickupRoute = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic

            const interpolated = interpolateRoute(
              visibleRouteCoords,
              pickupRoute,
              easedProgress
            );

            setVisibleRouteCoords(interpolated);

            if (progress < 1) {
              requestAnimationFrame(animatePickupRoute);
            } else {
              setIsAnimatingRoute(false);
              setVisibleRouteCoords(pickupRoute);
            }
          };

          requestAnimationFrame(animatePickupRoute);
        } else {
          // No previous route, set directly
          setVisibleRouteCoords(pickupRoute);
        }

        // ✅ Update full route coords for reference
        setFullRouteCoords(pickupRoute);
      }
    } catch (error) {
      console.error("❌ Error updating pickup route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute, visibleRouteCoords, isAnimatingRoute]);

  // ✅ Auto-update pickup route every 3 seconds during "accepted" status
  useEffect(() => {
    if (rideStatus === "accepted" && ride && location) {
      // Initial route generation
      updatePickupRoute();

      // Periodic route updates every 3 seconds
      const pickupRouteInterval = setInterval(() => {
        if (rideStatus === "accepted") {
          updatePickupRoute();
        }
      }, 3000);

      return () => {
        clearInterval(pickupRouteInterval);
        pickupRouteUpdateRef.current = null;
      };
    }
  }, [rideStatus, ride?.rideId, location?.latitude, location?.longitude]);
  



// Add function to start location updates
const startLocationUpdates = useCallback(() => {
  if (!isDriverOnline || !location || !socket) return;
  
  // Emit initial location
  socket.emit("driverLocationUpdate", {
    driverId,
    latitude: location.latitude,
    longitude: location.longitude,
    status: driverStatus,
    vehicleType: driverVehicleType
  });
  
  console.log('📍 Started location updates for driver:', driverId);
}, [isDriverOnline, location, driverId, driverStatus, socket, driverVehicleType]);

// In Screen1.tsx - Update the handleConnect function
const handleConnect = useCallback(() => {
  if (!isMounted.current) return;
  setSocketConnected(true);
  
  if (location && driverId && isDriverOnline) {
    const finalVehicleType = driverVehicleType || ""; // ✅ FIXED: No default 'taxi'
    
    // Register driver with all necessary info
    socket.emit("registerDriver", {
      driverId,
      driverName,
      latitude: location.latitude,
      longitude: location.longitude,
      vehicleType: finalVehicleType,
      status: driverStatus // Include current status
    });
    setIsRegistered(true);
    
    console.log(`✅ Driver registered: ${driverId} - ${finalVehicleType} - ${driverStatus}`);
    
    // Start emitting location updates
    startLocationUpdates();
  }
}, [isMounted, location, driverId, isDriverOnline, driverVehicleType, driverName, driverStatus, startLocationUpdates, socket]);


// In DriverScreen component - add this useEffect
useEffect(() => {
  if (!socket) return;
  
  const handleCompleteUserData = (data: any) => {
    console.log("📡 Received complete user data from socket:", data);
    
    if (data.rideId === ride?.rideId) {
      const passengerData: UserDataType = {
        name: data.userData?.name || userData?.name || "Passenger",
        mobile: data.userData?.mobile || userData?.mobile || "N/A",
        location: data.userData?.location || ride?.pickup,
        userId: data.userId || ride?.rideId,
        rating: 4.8
      };
      
      console.log("✅ Setting passenger data from socket:", passengerData);
      setUserData(passengerData);
      
      // Force show rider details
      if (!riderDetailsVisible) {
        setRiderDetailsVisible(true);
        slideAnim.setValue(0);
        fadeAnim.setValue(1);
      }
    }
  };
  
  socket.on("completeUserData", handleCompleteUserData);
  
  return () => {
    socket.off("completeUserData", handleCompleteUserData);
  };
}, [socket, ride, userData, riderDetailsVisible]);

// ============ PROFESSIONAL MAP FUNCTIONS ============

  // 1. Smooth Driver Location Animation with Proper Interpolation
  const startDriverAnimation = useCallback((newLat: number, newLng: number, duration: number = 1000) => {
    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Get current display location or snap to new location
    const currentDisplay = displayedDriverLocationRef.current || { latitude: newLat, longitude: newLng };
    const startLat = currentDisplay.latitude;
    const startLng = currentDisplay.longitude;

    // Validate coordinates
    if (!isValidLatLng(startLat, startLng) || !isValidLatLng(newLat, newLng)) {
      console.warn('Invalid coordinates for animation');
      setDisplayedDriverLocation({ latitude: newLat, longitude: newLng });
      return;
    }

    animationState.current = {
      startLat,
      startLng,
      endLat: newLat,
      endLng: newLng,
      startTime: Date.now(),
      duration: Math.max(300, Math.min(duration, 2000)) // Clamp between 300-2000ms
    };

    const animate = () => {
      if (!isMountedRef.current) return;
      
      const now = Date.now();
      const elapsed = now - animationState.current.startTime;
      const progress = Math.min(elapsed / animationState.current.duration, 1);

      // ✅ FIXED: Use proper easing function for smooth acceleration
      const easedProgress = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress; // Ease in-out quad

      const currentLat = lerp(animationState.current.startLat, animationState.current.endLat, easedProgress);
      const currentLng = lerp(animationState.current.startLng, animationState.current.endLng, easedProgress);

      const newPos = { latitude: currentLat, longitude: currentLng };
      setDisplayedDriverLocation(newPos);
      displayedDriverLocationRef.current = newPos;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Ensure final position is exact
        setDisplayedDriverLocation({ latitude: animationState.current.endLat, longitude: animationState.current.endLng });
        displayedDriverLocationRef.current = { latitude: animationState.current.endLat, longitude: animationState.current.endLng };
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // ✅ Ensure displayedDriverLocation is initialized immediately with current location
  useEffect(() => {
    if (location && !displayedDriverLocationRef.current) {
      setDisplayedDriverLocation(location);
      displayedDriverLocationRef.current = location;
    }
  }, [location]);
const fetchRealTimeRoute = useCallback(async (driverLocation: LocationType, dropoffLocation: LocationType) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${driverLocation.longitude},${driverLocation.latitude};${dropoffLocation.longitude},${dropoffLocation.latitude}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];

      // Extract coordinates from GeoJSON geometry
      const coords: LocationType[] = route.geometry.coordinates.map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));

      const currentDistance = (route.distance / 1000).toFixed(2); // meters to km
      const currentTime = Math.round(route.duration / 60); // seconds to minutes

      return {
        coords,
        distance: currentDistance,
        time: currentTime
      };
    }
  } catch (error) {
    console.error('❌ Real-time route calculation failed:', error);
  }
  return null;
}, []);

// 4. Map Following Behavior
const lastCameraUpdate = useRef(0);

const animateMapToDriver = useCallback((driverCoord: LocationType, duration: number = 1000) => {
  if (!cameraRef.current || !isMountedRef.current) return;
  
  // ✅ Prevent fighting with other animations (like focusing on pickup)
  if (mapAnimationInProgress.current) return;
  
  const now = Date.now();
  // ✅ Throttle camera updates to prevent "Request Canceled" errors (max once per 2s)
  if (now - lastCameraUpdate.current < 2000) return;
  lastCameraUpdate.current = now;
  
  // Follow in navigation mode OR when online/idle
  const isNavigating = rideStatusRef.current === "accepted" || rideStatusRef.current === "started";
  const isOnlineIdle = isDriverOnlineRef.current && rideStatusRef.current === "idle";

  if (isNavigating || isOnlineIdle) {
    cameraRef.current.setCamera({
      centerCoordinate: [driverCoord.longitude, driverCoord.latitude],
      zoomLevel: 16, // Consistent zoom
      animationDuration: 2000, // Match throttle for smooth continuous movement
    });
  }
}, []);

// Trigger map follow
useEffect(() => {
  // ✅ FIXED: Trigger map follow ONLY on real GPS updates (1Hz), not animation frames (60Hz)
  // This prevents "Request failed due to a permanent error: Canceled" and black screens
  if (location) {
    animateMapToDriver(location, 1500);
  }
}, [location, animateMapToDriver]);

// Map Region Change Handler
const handleRegionChangeComplete = useCallback((region: Region) => {
  if (!isMountedRef.current) return;

  // Store the current zoom level
  setMapZoomLevel(region.latitudeDelta);
  setCurrentMapRegion(region);
}, []);

// Pulse Animation Effect for Active Driver
useEffect(() => {
  if (rideStatus === "started" && ride) {
    // Start pulse animation for active driver marker
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  } else {
    // Stop pulse animation
    pulseAnimation.stopAnimation();
    pulseAnimation.setValue(1);
  }
}, [rideStatus, ride, pulseAnimation]);

const acceptRide = async (rideId?: string) => {
  const currentRideId = rideId || ride?.rideId;
  if (!currentRideId) {
    Alert.alert("Error", "No ride ID available. Please try again.");
    return;
  }

  if (!driverId) {
    Alert.alert("Error", "Driver not properly registered.");
    return;
  }

  // ✅ CRITICAL: Prevent double-tap - disable button immediately
  if (acceptButtonDisabled || isAccepting) {
    console.log("⚠️ Accept already in progress, ignoring duplicate tap");
    return;
  }

  setAcceptButtonDisabled(true);
  setIsAccepting(true);
  setPendingAcceptRideId(currentRideId);

if (!socket || !socket.connected) {
    Alert.alert("Connection Error", "Reconnecting to server...");
    reconnectSocket();
    socket.once("connect", () => {
      setTimeout(() => {
        setAcceptButtonDisabled(false);
        setIsAccepting(false);
        acceptRide(currentRideId);
      }, 1000);
    });
    return;
  }

  setIsLoading(true);

  // ✅ CRITICAL: Set userData from the existing ride object BEFORE socket call
  if (ride && !userData) {
    const passengerData = fetchPassengerData(ride);
    if (passengerData) {
      setUserData(passengerData);
      console.log("✅ Passenger data set from existing ride:", {
        name: passengerData.name,
        mobile: passengerData.mobile,
        userId: passengerData.userId
      });

      // ✅ FORCE SHOW RIDER DETAILS IMMEDIATELY
      setRiderDetailsVisible(true);
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
    }
  }

  if (socket) {
    console.log("🚀 Emitting acceptRide event for ride:", currentRideId);

    socket.emit(
      "acceptRide",
      {
        rideId: currentRideId,
        driverId: driverId,
        driverName: driverName,
        driverLat: location?.latitude,
        driverLng: location?.longitude,
        vehicleType: driverVehicleType
      },
      async (response: any) => {
        setIsLoading(false);
        setIsAccepting(false);
        setPendingAcceptRideId(null);

        if (!isMounted.current) {
          setAcceptButtonDisabled(false);
          return;
        }

        if (response && response.success) {
          console.log("✅ Ride accepted successfully:", response);

          // ✅ Update status AFTER successful response
          setRideStatus("accepted");
          setDriverStatus("onRide");

          // ✅ Update native service with ride status
          try {
            if (NativeLocationService.isAvailable()) {
              await NativeLocationService.updateRideStatus('accepted', ride?.rideId || "");
            }
          } catch (e) {
            console.error("NativeLocationService error:", e);
          }

          // Reset OTP verification state for new ride
          setOtpVerified(false);
          setLocationHistory([]);
          setLiveTripDistance(0);

          // Store price per km from response if available
          if (response.ride?.pricePerKm) {
            setPricePerKm(response.ride.pricePerKm);
          }

          // ✅ ENSURE PASSENGER DATA IS SET (fallback if not already set)
          if (!userData) {
            const passengerData = fetchPassengerData(ride!);
            if (passengerData) {
              setUserData(passengerData);
              console.log("✅ Passenger data set from response:", {
                name: passengerData.name,
                mobile: passengerData.mobile,
                userId: passengerData.userId
              });
            }
          }

          const initialUserLocation = {
            latitude: response.pickup?.lat || ride?.pickup?.latitude,
            longitude: response.pickup?.lng || ride?.pickup?.longitude,
          };

          setUserLocation(initialUserLocation);

          // Generate dynamic route from driver to pickup (GREEN ROUTE)
          if (location) {
            try {
              const pickupRoute = await fetchRoute(location, initialUserLocation);
              if (pickupRoute) {
                setRide((prev) => {
                  if (!prev) return null;
                  console.log("✅ Driver to pickup route generated with", pickupRoute.length, "points");
                  return { ...prev, routeCoords: pickupRoute };
                });
              }
            } catch (error) {
              console.error("❌ Error generating pickup route:", error);
            }

            animateToLocation(initialUserLocation, true);
          }

          // DEFAULT TO MAXIMIZED VIEW
          setRiderDetailsVisible(true);
          slideAnim.setValue(0);
          fadeAnim.setValue(1);

          // Emit event to notify other drivers
          socket.emit("rideTakenByDriver", {
            rideId: currentRideId,
            driverId: driverId,
            driverName: driverName,
          });

          socket.emit("driverAcceptedRide", {
            rideId: currentRideId,
            driverId: driverId,
            userId: response.userId,
            driverLocation: location,
          });

          setTimeout(() => {
            socket.emit("getUserDataForDriver", { rideId: currentRideId });
          }, 1000);

          // Save ride state after accepting
          saveRideState();

          // Re-enable button after successful acceptance
          setAcceptButtonDisabled(false);

        } else if (response.rideCancelled) {
          // ✅ CRITICAL: Handle cancellation during acceptance attempt
          console.log("❌ Ride was cancelled by user");
          setRide(null);
          setRideStatus("idle");
          setDriverStatus("online");
          setAcceptButtonDisabled(false);
          hideRiderDetails();
          clearMapData();

          Alert.alert(
            'Ride Cancelled',
            'Unfortunately, this ride has been cancelled by the user. Please wait for the next booking request.',
            [{ text: 'OK' }]
          );

        } else if (response.alreadyAccepted) {
          // ✅ CRITICAL: Another driver already accepted - professional alert
          console.log("❌ Ride already accepted by another driver");
          setRide(null);
          setRideStatus("idle");
          setDriverStatus("online");
          setAcceptButtonDisabled(false);
          hideRiderDetails();
          clearMapData();

          Alert.alert(
            'Ride Unavailable',
            'This ride has already been accepted by another driver.',
            [{
              text: 'OK',
              onPress: () => {
                console.log("Driver acknowledged ride taken alert");
              }
            }]
          );

        } else {
          // ✅ Generic error handling
          console.log("❌ Failed to accept ride:", response.message);
          setRideStatus("idle");
          setDriverStatus("online");
          setAcceptButtonDisabled(false);

          Alert.alert(
            'Error',
            response.message || 'Unable to accept ride. Please try again.',
            [{ text: 'OK' }]
          );
        }
      }
    );
  } else {
    // No socket available
    setIsLoading(false);
    setIsAccepting(false);
    setAcceptButtonDisabled(false);
    setPendingAcceptRideId(null);
    Alert.alert("Connection Error", "Unable to connect to server. Please check your internet connection.");
  }
};
  

  // Throttled pickup route update
  const throttledUpdatePickupRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updatePickupRoute();
    }, 2000);
  }, [updatePickupRoute]);
  
  // Update pickup route as driver moves
  useEffect(() => {
    if (rideStatus === "accepted" && location && ride) {
      throttledUpdatePickupRoute();
    }
  }, [location, rideStatus, ride, throttledUpdatePickupRoute]);
  
  // Update drop route as driver moves after OTP
  const updateDropRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "started") return;
    
    console.log("🗺️ Updating drop route as driver moves after OTP");
    
    try {
      const dropRoute = await fetchRoute(location, ride.drop);
      if (dropRoute && dropRoute.length > 0) {
        setFullRouteCoords(dropRoute);
        setVisibleRouteCoords(dropRoute);
        console.log("✅ Updated drop route with", dropRoute.length, "points");
      }
    } catch (error) {
      console.error("❌ Error updating drop route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute]);
  
  // Throttled drop route update
  const throttledUpdateDropRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      if (rideStatusRef.current === "started") updateDropRoute();
    }, 3000); // Update every 3 seconds
  }, [updateDropRoute]);
  
  // Update drop route as driver moves
  useEffect(() => {
    if (rideStatus === "started" && location && ride) {
      throttledUpdateDropRoute();
    }
  }, [location, rideStatus, ride, throttledUpdateDropRoute]);
  
  // Smooth map animation (MapLibre version)
  const animateToLocation = useCallback((targetLocation: LocationType, shouldIncludeUser: boolean = false) => {
    if (!cameraRef.current) return;
    
    // ✅ Allow animation during "accepted" state (to show pickup)
    // Only block if "started" (following driver to drop) AND we are not explicitly forcing it
    if (rideStatus === "started" && !shouldIncludeUser) return;

    // ✅ Set flag to prevent auto-follow from overriding this animation
    mapAnimationInProgress.current = true;

    cameraRef.current.setCamera({
      centerCoordinate: [targetLocation.longitude, targetLocation.latitude],
      zoomLevel: 15,
      animationDuration: 1000,
    });

    // ✅ Reset flag after animation completes
    setTimeout(() => {
      if (isMountedRef.current) {
        mapAnimationInProgress.current = false;
      }
    }, 1200);
  }, [rideStatus]);
  


  // Stop navigation
  const stopNavigation = useCallback(() => {
    console.log("🛑 Stopping navigation mode");
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
  }, []);
  
  // Logout function
  const handleLogout = async () => {
    try {
      console.log("🚪 Initiating logout for driver:", driverId);
     
      if (ride) {
        Alert.alert(
          "Active Ride",
          "Please complete your current ride before logging out.",
          [{ text: "OK" }]
        );
        return;
      }
      
      // Stop background tracking
      stopBackgroundLocationTracking();
      
      await api.post("/drivers/logout");
      await AsyncStorage.clear();
      console.log("✅ AsyncStorage cleared");
      
      if (socket) {
        socket.disconnect();
      }
      
      navigation.replace("LoginScreen");
      console.log("🧭 Navigated to LoginScreen");
    } catch (err) {
      console.error("❌ Error during logout:", err);
      Alert.alert("❌ Logout Error", "Failed to logout. Please try again.");
    }
  };
  
  
  
  // Reject ride
  const rejectRide = (rideId?: string) => {
    const currentRideId = rideId || ride?.rideId;
    if (!currentRideId) return;
   
    // Clean map data
    clearMapData();
   
    setRide(null);
    setRideStatus("idle");
    setDriverStatus("online");
    setUserData(null);
    setUserLocation(null);
    hideRiderDetails();
   
    if (socket) {
      socket.emit("rejectRide", {
        rideId: currentRideId,
        driverId,
      });
    }
   
    Alert.alert("Ride Rejected ❌", "You rejected the ride");
  };
  
  // Clear all map data (markers, routes, polylines)
  const clearMapData = useCallback(() => {
    console.log("🧹 Clearing all map data");
    setFullRouteCoords([]);
    setVisibleRouteCoords([]);
    setTravelledRoute([]); // ✅ Added to fix old polyline showing
    setRemainingRoute([]); // ✅ Added to fix old polyline showing
    setNearestPointIndex(0);
    setUserLocation(null);
    setTravelledKm(0);
    setLastCoord(null);
    distanceSinceOtp.current = 0;
    lastLocationBeforeOtp.current = null;
    // Clear OTP verification location
    setOtpVerificationLocation(null);
   
    // Reset map region to driver's current location (MapLibre)
    if (location && cameraRef.current && isMountedRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 14,
        animationDuration: 1000,
      });
    }
  }, [location]);
  

  
    // Only hides the modal (Safe for Back Button)
  const handleBillModalDismiss = useCallback(() => {
    setShowBillModal(false);
  }, []);

  // Confirms the ride and clears data
  const handleBillModalConfirm = useCallback(() => {
    console.log("💰 Bill confirmed, finalizing ride...");
    
    // Reset all ride states
    setRide(null);
    setUserData(null);
    setOtpSharedTime(null);
    setOtpVerificationLocation(null);
    setRideStatus("idle");
    setDriverStatus("online");
    
    // Clean map
    clearMapData();
    
    // Hide rider details (already hidden, but safe to call)
    hideRiderDetails();
    
    // Clear AsyncStorage
    clearRideState();
    
    // Close modal
    setShowBillModal(false);
    
    console.log("✅ Ride fully completed and cleaned up");
  }, [clearMapData, clearRideState, hideRiderDetails]);




  const confirmOTP = () => {
  console.log("1️⃣ Starting OTP verification...");

  if (!ride) {
    console.log("❌ No ride data available");
    return;
  }

  if (!ride.otp) {
    Alert.alert("Error", "OTP not yet received from server.");
    return;
  }

  // Validate OTP length
  if (enteredOtp.length !== 4) {
    Alert.alert("Invalid OTP", "Please enter a 4-digit OTP.");
    return;
  }

  // Prevent double submission
  if (otpVerifying) {
    console.log("⚠️ OTP verification already in progress");
    return;
  }

  console.log("2️⃣ Getting current location...");

  // Get start point immediately
  const startPoint = location || lastCoord;

  if (!startPoint) {
    Alert.alert("Error", "Unable to get current location. Please try again.");
    return;
  }

  console.log("3️⃣ Location obtained:", startPoint);

  // Check OTP locally
  if (enteredOtp !== ride.otp) {
    setEnteredOtp("");
    Alert.alert("Invalid OTP", "The OTP you entered is incorrect. Please check with the customer.");
    return;
  }

  console.log("✅ OTP Matched locally");

  // Set verifying state
  setOtpVerifying(true);

  // ✅ CRITICAL: Update UI state IMMEDIATELY to prevent freeze
  // Close modal and clear input FIRST
  setOtpModalVisible(false);
  setEnteredOtp("");

  console.log("4️⃣ Modal closed, proceeding with trip start...");

  // Use setTimeout to ensure UI updates before heavy operations
  setTimeout(() => {
    proceedWithTripStartSafe(startPoint);
  }, 100);
};

// ✅ SAFE Helper function - NO FREEZE
const proceedWithTripStartSafe = (startPoint: LocationType) => {
  console.log("5️⃣ proceedWithTripStartSafe called with:", startPoint);

  try {
    // === Update all states SYNCHRONOUSLY first ===
    console.log("6️⃣ Updating all states synchronously...");

    // Mark OTP as verified
    setOtpVerified(true);
    setOtpVerifying(false);

    // Update ride status
    setRideStatus("started");
    setTravelledKm(0);
    distanceSinceOtp.current = 0;
    lastLocationBeforeOtp.current = startPoint;
    setOtpVerificationLocation(startPoint);
    setOtpSharedTime(new Date());

    // ✅ Update native service with ride started status
    try {
      if (NativeLocationService.isAvailable()) {
        NativeLocationService.updateRideStatus('started', ride?.rideId || "");
      }
    } catch (e) {
      console.error("NativeLocationService error:", e);
    }

    // ✅ Initialize enhanced distance tracking
    setTripStartLocation(startPoint);
    setLocationHistory([startPoint]);
    setLiveTripDistance(0);
    setTravelledRoute([]); // Clear previous route data
    setRemainingRoute([]);

    // Keep rider details visible
    setRiderDetailsVisible(true);
    slideAnim.setValue(0);
    fadeAnim.setValue(1);

    // Force map refresh
    setMapRefreshKey(prev => prev + 1);
    mapAnimationInProgress.current = false;

    console.log("7️⃣ All states updated - Trip started");
    console.log("📍 Trip start location:", startPoint);

    // === Async operations in background (non-blocking) ===

    // Store OTP location to database (fire and forget)
    storeOtpLocationAsync(startPoint);

    // Socket emits (fire and forget)
    emitTripStartEvents(startPoint);

    // Save state (fire and forget)
    saveRideState().catch(err => console.error("State save error:", err));

    // Start navigation after brief delay
    setTimeout(() => {
      if (ride?.drop && startPoint) {
        startNavigation(startPoint).catch(err => {
          console.warn("Navigation error:", err);
        });
      }
    }, 500);

    console.log("8️⃣ proceedWithTripStartSafe completed - NO FREEZE");

    // ✅ Show NON-BLOCKING success message (toast-style, not Alert)
    // Use a simple console log for now - the UI is already showing "started" status
    console.log("✅ Trip started successfully!");

  } catch (error) {
    console.error("❌ Error in proceedWithTripStartSafe:", error);
    setOtpVerifying(false);
    // Don't show alert here - UI is already updated
  }
};

// ✅ Async function to store OTP location (non-blocking)
const storeOtpLocationAsync = async (startPoint: LocationType) => {
  try {
    console.log("📡 Storing OTP location to database...");
    const token = await AsyncStorage.getItem("authToken");
    const response = await fetch(`${API_BASE}/rides/store-otp-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rideId: ride?.rideId,
        driverId: driverId,
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
        pricePerKm: ride?.pricePerKm || ride?.farePerKm || pricePerKm || 40
      })
    });

    const data = await response.json();
    if (data.success) {
      console.log('✅ OTP verification location stored in database');
    } else {
      console.log('⚠️ OTP location storage response:', data);
    }
  } catch (error) {
    console.error('❌ Error storing OTP location (non-critical):', error);
    // Don't block UI - this is a background operation
  }
};

// ✅ Function to emit trip start events (non-blocking)
const emitTripStartEvents = (startPoint: LocationType) => {
  if (socket && socket.connected) {
    const timestamp = new Date().toISOString();

    console.log("📡 Emitting trip start events...");

    // Emit rideStarted event
    socket.emit("rideStarted", {
      rideId: ride?.rideId,
      driverId: driverId,
      startLocation: {
        lat: startPoint.latitude,
        lng: startPoint.longitude
      }
    });

    // Emit otpVerified event
    socket.emit("otpVerified", {
      rideId: ride?.rideId,
      driverId: driverId,
      timestamp: timestamp,
      driverLocation: startPoint
    });

    // Emit driverStartedRide event
    socket.emit("driverStartedRide", {
      rideId: ride?.rideId,
      driverId: driverId,
      driverLocation: startPoint,
      otpVerified: true,
      timestamp: timestamp
    });

    // Emit verifyRideOTP for backend confirmation (with callback)
    socket.emit("verifyRideOTP", {
      rideId: ride?.rideId,
      driverId: driverId,
      otp: ride?.otp,
      verificationLocation: {
        lat: startPoint.latitude,
        lng: startPoint.longitude
      }
    }, (response: any) => {
      if (response && response.success) {
        console.log("✅ Backend OTP verification confirmed:", response);
      } else {
        console.log("⚠️ Backend OTP verification response:", response);
      }
    });

    console.log("✅ Socket events emitted for trip start");
  } else {
    console.log("⚠️ Socket not connected, events not emitted");
  }
};

// Enhanced startNavigation with proper cleanup
const startNavigation = useCallback(async (startLocation: LocationType) => {
  if (!ride?.drop || !startLocation) return;
  console.log("🚀 Starting navigation from verified location to drop");

  // Clear any existing interval
  if (navigationInterval.current) {
    clearInterval(navigationInterval.current);
    navigationInterval.current = null;
  }

  try {
    // Use the passed startLocation directly
    const routeCoords = await fetchRoute(startLocation, ride.drop);
    
    if (routeCoords && routeCoords.length > 0) {
      console.log("✅ Navigation route fetched successfully:", routeCoords.length, "points");

      setFullRouteCoords(routeCoords);
      setVisibleRouteCoords(routeCoords);

      // Start periodic route re-fetching with cleanup
      navigationInterval.current = setInterval(async () => {
        // ✅ Use ref to check status
        if (rideStatusRef.current === "started" && locationRef.current) {
          console.log("🔄 Re-fetching optimized route from current location");
          const updatedRoute = await fetchRoute(locationRef.current, rideRef.current?.drop || ride?.drop);
          if (updatedRoute && updatedRoute.length > 0) {
            setFullRouteCoords(updatedRoute);
          }
        }
      }, 10000); 

      console.log("🗺️ Navigation started with real-time route updates");
    }
  } catch (error) {
    console.error("❌ Error starting navigation:", error);
  }
}, [ride?.drop, fetchRoute, location, rideStatus]);

// Improved cleanup in useEffect
useEffect(() => {
  return () => {
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
    }
    if (backgroundLocationInterval.current) {
      clearInterval(backgroundLocationInterval.current);
    }
    if (rideTakenAlertTimeout.current) {
      clearTimeout(rideTakenAlertTimeout.current);
    }
    // Clean up notification listeners
    NotificationService.off('rideRequest', handleNotificationRideRequest);
    NotificationService.off('tokenRefresh', () => {});
  };
}, []);



// Added timeout to fetchRoute to prevent hanging..
const fetchRoute = useCallback(
  async (origin: LocationType, destination: LocationType, retryCount = 0) => {
    const maxRetries = 2;
    try {
      console.log("🗺️ Fetching route between:", {
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
      });
       
      // ✅ OSRM URL with all optimization parameters
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&continue_straight=default&annotations=duration,distance`;
      
      // ✅ Add timeout and abort controller for reliability
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
       
      // ✅ Validate response has routes
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        
        if (!route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length < 2) {
          throw new Error("Invalid route geometry");
        }
        
        const coords = route.geometry.coordinates.map(
          ([lng, lat]: number[]) => ({
            latitude: lat,
            longitude: lng,
          })
        );
        
        const distance = (route.distance / 1000).toFixed(2);
        const duration = Math.round(route.duration / 60);
        console.log(`✅ Route fetched - ${coords.length} points, ${distance}km, ${duration}min`);
        
        return coords;
      } else {
        // ✅ No routes found - try retry
        if (retryCount < maxRetries) {
          console.warn(`⚠️ No routes returned from OSRM, retrying (${retryCount + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000));
          return fetchRoute(origin, destination, retryCount + 1);
        }
        
        console.warn("❌ OSRM returned no routes after retries, using fallback");
        return [origin, destination];
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error("❌ Route fetch error:", errorMsg);
      
      // ✅ Retry on network errors (but not on abort)
      if (retryCount < maxRetries && !errorMsg.includes('AbortError')) {
        console.log(`🔄 Retrying route fetch (${retryCount + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 1000));
        return fetchRoute(origin, destination, retryCount + 1);
      }
      
      // Final fallback
      console.warn("❌ All retries exhausted, using straight-line route");
      return [origin, destination];
    }
  },
  []
);


const fetchCurrentPrices = async () => {
  try {
    const token = await AsyncStorage.getItem("authToken");
    const timestamp = new Date().getTime();
    const response = await fetch(`${API_BASE}/admin/ride-prices/current?t=${timestamp}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    return data.prices || { bike: 0, taxi: 0, port: 0 };
  } catch (error) {
    console.error('Error fetching prices:', error);
    return { bike: 15, taxi: 32, port: 75 }; // Fallback defaults
  }
};



const completeRide = useCallback(async () => {
  console.log("🏁 COMPLETE RIDE FUNCTION CALLED");

  if (rideStatus !== "started") {
    Alert.alert("Cannot Complete", "Ride must be started to complete.");
    return;
  }

  if (!ride) {
    Alert.alert("Error", "Ride data is missing.");
    return;
  }

  if (!location) {
    Alert.alert("Error", "Current location is missing. Please wait for GPS.");
    return;
  }

  // ✅ Validate location coordinates before proceeding
  if (location.latitude === undefined || location.latitude === null ||
      location.longitude === undefined || location.longitude === null ||
      isNaN(location.latitude) || isNaN(location.longitude)) {
    Alert.alert("Error", "Invalid GPS coordinates. Please wait for valid location.");
    return;
  }

  // ✅ Get the final GPS coordinates
  const finalLocation = {
    lat: location.latitude,
    lng: location.longitude
  };

  console.log("📍 Ride completion details:");
  console.log("   End location:", finalLocation);
  console.log("   Ride ID:", ride.rideId);
  console.log("   NOTE: Distance and fare will be calculated by backend ONLY");

  // ✅ Stop navigation FIRST
  stopNavigation();

  // ✅ Show confirmation dialog - NO distance shown (backend will calculate)
  Alert.alert(
    'Complete Ride',
    'Are you sure you want to complete this ride?\n\nFinal distance and fare will be calculated by the server.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => submitRideCompletion(finalLocation)
      }
    ]
  );
}, [
  ride,
  rideStatus,
  location,
  stopNavigation
]);

// ✅ Helper function to submit ride completion - BACKEND ONLY CALCULATION
const submitRideCompletion = async (finalLocation: { lat: number; lng: number }) => {
  console.log("📡 Submitting ride completion to backend...");
  console.log("📍 Drop location:", finalLocation);
  console.log("⚠️ NOTE: Distance and fare will be calculated by backend ONLY");

  // ✅ Update ride status IMMEDIATELY to prevent double submission
  setRideStatus("completed");
  setDriverStatus("online");

  // ✅ Update native service - ride completed, back to online
  try {
    if (NativeLocationService.isAvailable()) {
      NativeLocationService.updateRideStatus('online', "");
    }
  } catch (e) {
    console.error("NativeLocationService error:", e);
  }

  try {
    // ✅ FIRST: Emit to socket for real-time backend processing
    // DO NOT send distance or fare - backend will calculate
    if (socket && socket.connected) {
      console.log("📡 Emitting driverCompletedRide socket event...");

      socket.emit("driverCompletedRide", {
        rideId: ride?.rideId,
        driverId: driverId,
        actualDrop: finalLocation,
        // ❌ REMOVED: distance, fare, startLocation, locationHistory
        // Backend will calculate everything from stored OTP location
        timestamp: new Date().toISOString()
      }, (response: any) => {
        console.log("📡 Socket completion response:", response);
      });
    }

    // ✅ THEN: Send HTTP request for fare calculation
    // ONLY send: rideId, driverId, completedLatitude, completedLongitude
    console.log("📡 Sending ride completion to server for calculation...");

    const token = await AsyncStorage.getItem("authToken");
    const response = await fetch(`${API_BASE}/rides/complete-with-calculation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rideId: ride?.rideId,
        driverId: driverId,
        completedLatitude: finalLocation.lat,
        completedLongitude: finalLocation.lng
        // ❌ REMOVED: distance, fare, startLatitude, startLongitude
        // Backend calculates everything from stored OTP verification location
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to complete ride');
    }

    console.log("✅ Server calculation complete:", result.data);

    // ✅ USE ONLY BACKEND VALUES - Never use frontend calculated values
    const serverDistance = result.data.distance;
    const serverFare = result.data.fare;
    const serverPricePerKm = result.data.pricePerKm;

    const billData = {
      distance: `${serverDistance} km`,
      travelTime: `${Math.round(serverDistance * 3)} mins`, // ~20km/h average
      charge: serverFare,
      userName: userData?.name || 'Customer',
      userMobile: userData?.mobile || 'N/A',
      baseFare: serverFare,
      timeCharge: 0,
      tax: 0,
      pricePerKm: serverPricePerKm,
      calculation: result.data.calculation || `${serverDistance} km × ₹${serverPricePerKm}/km = ₹${serverFare}`,
      pickupAddress: ride?.pickup?.address || 'Pickup',
      dropoffAddress: ride?.drop?.address || 'Drop-off',
      driverShare: result.data.driverShare,
      companyShare: result.data.companyShare
    };

    // ✅ Hide rider details BEFORE showing bill modal
    hideRiderDetails();

    // ✅ Clear map data
    clearMapData();

    // ✅ Show bill modal with BACKEND VALUES ONLY
    setBillDetails(billData);
    setShowBillModal(true);

    console.log("✅ Ride completion process completed successfully");
    console.log("💰 Bill details (FROM BACKEND):", billData);

  } catch (error: any) {
    console.error("❌ Error in submitRideCompletion:", error);

    // ✅ Show error to user - DO NOT calculate fare locally
    Alert.alert(
      'Completion Error',
      `Failed to complete ride: ${error.message || 'Server error'}\n\nPlease try again or contact support.`,
      [
        {
          text: 'Retry',
          onPress: () => submitRideCompletion(finalLocation)
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            // Revert status if user cancels
            setRideStatus("started");
            setDriverStatus("onRide");
          }
        }
      ]
    );
  }
};
// ❌ REMOVED: proceedWithFareCalculation and proceedWithCompletion functions
// These functions were calculating fare on frontend which is no longer allowed.
// All distance and fare calculations are now done by the backend ONLY.
// See submitRideCompletion() for the new backend-only implementation.




const handleBillModalClose = useCallback(() => {
  console.log("💰 Bill modal closing, finalizing ride...");

  // Reset all ride states
  setRide(null);
  setUserData(null);
  setOtpSharedTime(null);
  setOtpVerificationLocation(null);
  setRideStatus("idle");
  setDriverStatus("online");

  // ✅ Reset enhanced tracking states
  setOtpVerified(false);
  setOtpVerifying(false);
  setTripStartLocation(null);
  setLocationHistory([]);
  setLiveTripDistance(0);
  setPricePerKm(0);
  setAcceptButtonDisabled(false);

  // Reset distance tracking refs
  distanceSinceOtp.current = 0;
  lastLocationBeforeOtp.current = null;

  // Reset traveled distance
  setTravelledKm(0);
  setLastCoord(null);

  // Clean map
  clearMapData();

  // Hide rider details
  hideRiderDetails();

  // Clear AsyncStorage
  clearRideState();

  // Close modal
  setShowBillModal(false);

  // ✅ Force a small delay before reconnecting to ensure UI is clean
  setTimeout(() => {
    if (!isMountedRef.current) return;
    
  // ✅ CRITICAL: Ensure socket stays connected after ride completion
  // DO NOT disconnect socket - driver should remain available for new rides
  if (socket && !socket.connected) {
    console.log("🔌 Socket disconnected, attempting to reconnect...");
    reconnectSocket();
  } else if (socket && socket.connected && isDriverOnline && driverId && location) {
    // Re-register driver as available for new rides
    console.log("📝 Re-registering driver as available after ride completion");
    socket.emit("driverOnline", {
      driverId,
      driverName,
      latitude: location.latitude,
      longitude: location.longitude,
      vehicleType: driverVehicleType,
      status: "Live",
    });
  }
  }, 500);

  console.log("✅ Ride fully completed and cleaned up");
}, [clearMapData, clearRideState, hideRiderDetails, isDriverOnline, driverId, driverName, location, driverVehicleType]);
  
  // Handle verification modal close
  const handleVerificationModalClose = () => {
    setShowVerificationModal(false);
  };
  

  

  const handleRideRequest = useCallback(async (data: any) => {
  if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

  console.log(`🚗 Received ride request for ${data.vehicleType}`);

  const driverType = (driverVehicleType || "").toLowerCase();
  const requestVehicleType = (data.vehicleType || "").toLowerCase();

  if (requestVehicleType && driverType && requestVehicleType !== driverType) {
    console.log(`🚫 Ignoring ride request: Driver is ${driverType}, ride requires ${requestVehicleType}`);
    return;
  }
  
  try {
    let pickupLocation, dropLocation;
    
    try {
      if (typeof data.pickup === 'string') {
        pickupLocation = JSON.parse(data.pickup);
      } else {
        pickupLocation = data.pickup;
      }
      
      if (typeof data.drop === 'string') {
        dropLocation = JSON.parse(data.drop);
      } else {
        dropLocation = data.drop;
      }
    } catch (error) {
      console.error('Error parsing location data:', error);
      return;
    }
    
    // ✅ CRITICAL: Fetch the admin-set price for this ride from server
    console.log(`💰 Fetching admin-set price for ride: ${data.rideId}`);
    let adminSetPrice = 0;
    let pricePerKm = 0;
    
    try {
      // Fetch ride details from server to get the admin-set price
      const token = await AsyncStorage.getItem("authToken");
      const timestamp = new Date().getTime();
      const response = await fetch(`${API_BASE}/rides/get-ride-details/${data.rideId}?t=${timestamp}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const rideData = await response.json();
        if (rideData.success) {
          // Get price per km from the ride data (this was set by admin at booking time)
          pricePerKm = rideData.ride.pricePerKm || rideData.ride.farePerKm || 0;
          console.log(`✅ Admin-set price per km for this ride: ₹${pricePerKm}`);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching ride price details:', error);
      // Fallback: Use the fare sent with the ride request
      pricePerKm = data.pricePerKm || data.farePerKm || 0;
    }
    
    const rideData: RideType = {
      rideId: data.rideId,
      RAID_ID: data.RAID_ID || "N/A",
      otp: data.otp || "0000",
      pickup: {
        latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
        longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
        address: pickupLocation?.address || "Unknown location",
      },
      drop: {
        latitude: dropLocation?.lat || dropLocation?.latitude || 0,
        longitude: dropLocation?.lng || dropLocation?.longitude || 0,
        address: dropLocation?.address || "Unknown location",
      },
      fare: parseFloat(data.fare) || 0,
      distance: data.distance || "0 km",
      vehicleType: data.vehicleType,
      userName: data.userName || "Customer",
      userMobile: data.userMobile || "N/A",
      pricePerKm: pricePerKm, // ✅ Store the admin-set price per km
      farePerKm: pricePerKm   // ✅ Store for backward compatibility
    };
    
    // ✅ SET RIDE FIRST
    setRide(rideData);
    setRideStatus("onTheWay");
    
    // ✅ CRITICAL: SET PASSENGER DATA IMMEDIATELY
    const passengerData: UserDataType = {
      name: rideData.userName || "Passenger",
      mobile: rideData.userMobile || "N/A",
      location: rideData.pickup,
      userId: rideData.rideId,
      rating: 4.8,
    };
    
    setUserData(passengerData);
    
    // ✅ SHOW RIDER DETAILS IMMEDIATELY
    setRiderDetailsVisible(true);
    slideAnim.setValue(0);
    fadeAnim.setValue(1);

    // ✅ PLAY CUSTOM SOUND via Notification (Foreground)
    try {
      notifee.displayNotification({
        title: '🚖 New Ride Request!',
        body: `Pickup: ${rideData.pickup.address}`,
        android: {
          channelId: 'ride_requests_v4', // Must match channel created in App.tsx
          sound: 'notification',
          importance: AndroidImportance.HIGH,
          pressAction: { id: 'default' },
        },
      });
    } catch (err) {
      console.error("❌ Failed to play notification sound:", err);
    }
    
    Alert.alert(
      `🚖 New ${data.vehicleType?.toUpperCase()} Ride Request!`,
      `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}\n🚗 Vehicle: ${data.vehicleType}\n💵 Price/km: ₹${pricePerKm}`,
      [
        {
          text: "❌ Reject",
          onPress: () => rejectRide(rideData.rideId),
          style: "destructive",
        },
        {
          text: "✅ Accept",
          onPress: () => acceptRide(rideData.rideId),
        },
      ],
      { cancelable: false }
    );
  } catch (error) {
    console.error("❌ Error processing ride request:", error);
    Alert.alert("Error", "Could not process ride request. Please try again.");
  }
}, [isDriverOnline, driverVehicleType]);

  // Show ride taken alert
  const showRideTakenAlertMessage = useCallback(() => {
    setShowRideTakenAlert(true);
    
    // Clear any existing timeout
    if (rideTakenAlertTimeout.current) {
      clearTimeout(rideTakenAlertTimeout.current);
    }
    
    // Animate the progress bar
    Animated.timing(alertProgress, {
      toValue: 0,
      duration: 7000, // 7 seconds
      useNativeDriver: false,
    }).start();
    
    // Set new timeout to hide alert after 7 seconds
    rideTakenAlertTimeout.current = setTimeout(() => {
      setShowRideTakenAlert(false);
      // Reset the progress bar for next time
      alertProgress.setValue(1);
    }, 7000);
  }, [alertProgress]);
  

  
    // Render professional maximized passenger details
const renderMaximizedPassengerDetails = () => {
  
  if (!ride || !userData || !riderDetailsVisible) {
    return null;
  }

    return (
      <Animated.View 
        style={[
          styles.maximizedDetailsContainer,
          {
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim
          }
        ]}
      >
        {/* Header with Branding and Down Arrow */}
        <View style={styles.maximizedHeader}>
          <View style={styles.brandingContainer}>
            <Text style={styles.brandingText}>Future Tech - ERODE</Text>
          </View>
          <TouchableOpacity onPress={hideRiderDetails} style={styles.minimizeButton}>
            <MaterialIcons name="keyboard-arrow-down" size={28} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.maximizedContent} showsVerticalScrollIndicator={false}>
          {/* Contact Information */}
          <View style={styles.contactSection}>
            <View style={styles.contactRow}>
              <MaterialIcons name="phone" size={20} color="#666" />
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{userData.mobile}</Text>
            </View>
          </View>

          {/* Address Information */}
          <View style={styles.addressSection}>
            <View style={styles.addressRow}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Pick-up location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.pickup.address}
            </Text>
            
            <View style={[styles.addressRow, { marginTop: 16 }]}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Drop-off location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.drop.address}
            </Text>
          </View>

          {/* Fare Information */}
          <View style={styles.fareSection}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareAmount}>₹{ride.fare}</Text>
            </View>
          </View>
        </ScrollView>

        {/* ✅ FIX: Only show this button if ride is NOT started */}
        {rideStatus === "accepted" && (
          <TouchableOpacity 
            style={styles.startRideButton}
            onPress={() => setOtpModalVisible(true)}
          >
            <Text style={styles.startRideButtonText}>Enter OTP & Start Ride</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };



const renderMinimizedBookingBar = () => {
  
  if (!ride || !userData || riderDetailsVisible) {
    return null;
  }
  
    return (
      <View style={styles.minimizedBookingBarContainer}>
        <View style={styles.minimizedBookingBar}>
          {/* Line 1: Profile Image, Name, Maximize Arrow */}
          <View style={styles.minimizedFirstRow}>
            <View style={styles.minimizedProfileImage}>
              <Text style={styles.minimizedProfileImageText}>
                {calculateInitials(userData.name)}
              </Text>
            </View>
            <Text style={styles.minimizedProfileName} numberOfLines={1}>
              {userData.name}
            </Text>
            <TouchableOpacity 
              style={styles.minimizedExpandButton}
              onPress={showRiderDetails}
            >
              <MaterialIcons name="keyboard-arrow-up" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Line 2: Phone Icon, Mobile Number, Call Button */}
          <View style={styles.minimizedSecondRow}>
            <View style={styles.minimizedMobileContainer}>
              <MaterialIcons name="phone" size={16} color="#4CAF50" />
              <Text style={styles.minimizedMobileText} numberOfLines={1}>
                {userData.mobile}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.minimizedCallButton}
              onPress={handleCallPassenger}
            >
              <MaterialIcons name="call" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Socket event listeners for ride taken alerts
  useEffect(() => {
    if (!socket) {
      console.warn("⚠️ Socket not available, skipping socket event listeners");
      return;
    }
    

    

    
    const handleUserLiveLocationUpdate = (data: any) => {
      if (!isMounted.current) return;
     
      if (data && typeof data.lat === "number" && typeof data.lng === "number") {
        const newUserLocation = {
          latitude: data.lat,
          longitude: data.lng,
        };
       
        setUserLocation((prev) => {
          if (
            !prev ||
            prev.latitude !== newUserLocation.latitude ||
            prev.longitude !== newUserLocation.longitude
          ) {
            return newUserLocation;
          }
          return prev;
        });
       
        setUserData((prev) => {
          if (prev) {
            return { ...prev, location: newUserLocation };
          }
          return prev;
        });
      }
    };
    
    const handleUserDataForDriver = (data: any) => {
      if (!isMounted.current) return;
     
      if (data && data.userCurrentLocation) {
        const userLiveLocation = {
          latitude: data.userCurrentLocation.latitude,
          longitude: data.userCurrentLocation.longitude,
        };
       
        setUserLocation(userLiveLocation);
       
        if (userData && !userData.userId && data.userId) {
          setUserData((prev) => (prev ? { ...prev, userId: data.userId } : null));
        }
      }
    };
    
    const handleRideOTP = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        setRide((prev) => (prev ? { ...prev, otp: data.otp } : null));
      }
    };
    
    const handleDisconnect = () => {
      if (!isMounted.current) return;
      setSocketConnected(false);
      setIsRegistered(false);
     
      if (ride) {
        setUserData(null);
        setUserLocation(null);
        Alert.alert("Connection Lost", "Reconnecting to server...");
      }
    };
    
    const handleConnectError = (error: Error) => {
      if (!isMounted.current) return;
      setSocketConnected(false);
      setError("Failed to connect to server");
    };
    
    const handleRideCancelled = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        // ✅ NEW: Don't auto-close if status is onTheWay (pending acceptance)
        // This ensures the ride alert stays visible until the driver interacts with it
        if (rideStatus === 'onTheWay') {
          console.log("ℹ️ Ride cancelled while pending - keeping UI visible until interaction");
          return;
        }

        stopNavigation();
       
        socket.emit("driverRideCancelled", {
          rideId: ride.rideId,
          driverId: driverId,
          userId: userData?.userId,
        });
       
        // Clean map after cancellation
        clearMapData();
       
        setRide(null);
        setUserData(null);
        setRideStatus("idle");
        setDriverStatus("online");
        hideRiderDetails();
        
        // Clear ride state from AsyncStorage
        clearRideState();
       
        Alert.alert("Ride Cancelled", "The passenger cancelled the ride.");
      }
    };
    
    const handleRideAlreadyAccepted = (data: any) => {
      if (!isMounted.current) return;
     
      // If this driver had ride request, clean up
      if (ride && ride.rideId === data.rideId) {
        // Clean map
        clearMapData();
       
        setRide(null);
        setUserData(null);
        setRideStatus("idle");
        setDriverStatus("online");
        hideRiderDetails();
      }
    };
    
    const handleRideTakenByDriver = (data: any) => {
      if (!isMounted.current) return;
      
      // Only show the alert if this driver is not the one who took the ride
      if (data.driverId !== driverId) {
        Alert.alert(
          "Ride Already Taken",
          data.message || "This ride has already been accepted by another driver. Please wait for the next ride request.",
          [{ text: "OK" }]
        );
        
        // If this driver had the ride request, clean up
        if (ride && ride.rideId === data.rideId) {
          // Clean map
          clearMapData();
         
          setRide(null);
          setUserData(null);
          setRideStatus("idle");
          setDriverStatus("online");
          hideRiderDetails();
        }
      }
    };
    
    const handleRideStarted = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        console.log("🎉 Ride started - showing verification modal");
       
        setVerificationDetails({
          pickup: ride.pickup.address || "Pickup location",
          dropoff: ride.drop.address || "Dropoff location",
          time: new Date().toLocaleTimeString(),
          speed: currentSpeed,
          distance: distanceSinceOtp.current,
        });
       
        setShowVerificationModal(true);
      }
    };
    
    const handleRideCancelledAlert = (data: any) => {
      if (!isMounted.current) return;

      const { rideId, vehicleType } = data;

      // Check if this alert is relevant to us (matching vehicle type)
      const myDriverType = (driverVehicleType || "").toLowerCase();
      const alertVehicleType = (vehicleType || "").toLowerCase();

      if (alertVehicleType && myDriverType && alertVehicleType !== myDriverType) {
        return;
      }

      // If we are currently viewing this ride request
      if (ride && ride.rideId === rideId && rideStatus === "onTheWay") {
        console.log("⚠️ Ride Cancelled Alert for current request:", rideId);
        console.log("ℹ️ Keeping UI visible as per requirements. Validation will happen on Accept.");

      }
    };

    // ============ NEW SOCKET EVENT HANDLERS ============

    // Handle billAlert from backend - CRITICAL: Show bill BEFORE navigating away
    const handleBillAlert = (data: any) => {
      if (!isMounted.current) return;

      const {
        rideId: alertRideId,
        fare,
        distance,
        pricePerKm: ratePerKm,
        vehicleType: vType,
        pickup,
        dropoff,
        driverShare,
        companyShare
      } = data;

      console.log("💰 Bill Alert received:", data);

      // Only process if it matches our current ride
      if (ride && ride.rideId === alertRideId) {
        // Prepare bill details from backend response
        const billData = {
          distance: `${distance} km`,
          travelTime: `${Math.round(distance * 3)} mins`, // Estimate ~20km/h average
          charge: fare,
          userName: userData?.name || 'Customer',
          userMobile: userData?.mobile || 'N/A',
          baseFare: fare,
          timeCharge: 0,
          tax: 0,
          pricePerKm: ratePerKm,
          driverShare: driverShare,
          companyShare: companyShare,
          pickupAddress: pickup?.address || ride.pickup?.address || 'Pickup',
          dropoffAddress: dropoff?.address || ride.drop?.address || 'Drop-off'
        };

        console.log("📋 Setting bill details:", billData);

        // Hide rider details BEFORE showing bill modal
        hideRiderDetails();

        // Set bill details and show modal
        setBillDetails(billData);
        setShowBillModal(true);

        // Update status
        setRideStatus("completed");
        setDriverStatus("online");

        // Stop navigation
        stopNavigation();

        // Clear map data
        clearMapData();

        console.log("✅ Bill modal should now be visible");
      }
    };

    // Handle OTP verification success from backend
    const handleOtpVerificationSuccess = (data: any) => {
      if (!isMounted.current) return;

      if (ride && ride.rideId === data.rideId) {
        console.log("✅ OTP Verification Success from backend:", data);
        setOtpVerified(true);
        setOtpVerifying(false);

        // Initialize trip tracking
        if (location) {
          setTripStartLocation(location);
          setLocationHistory([location]);
          setLiveTripDistance(0);
        }
      }
    };

    // Handle OTP verification failure from backend
    const handleOtpVerificationFailed = (data: any) => {
      if (!isMounted.current) return;

      if (ride && ride.rideId === data.rideId) {
        console.log("❌ OTP Verification Failed from backend:", data);
        setOtpVerifying(false);
        setEnteredOtp('');

        Alert.alert(
          'Invalid OTP',
          data.message || 'Please check with the customer and try again.',
          [{ text: 'OK' }]
        );
      }
    };

    // Handle ride completion confirmation from backend
    const handleRideCompleted = (data: any) => {
      if (!isMounted.current) return;

      if (ride && ride.rideId === data.rideId) {
        console.log("✅ Ride completion confirmed by backend:", data);
        // Status already updated by billAlert, this is just confirmation
      }
    };

    socket.on("connect", handleConnect);
    socket.on("newRideRequest", handleRideRequest);
    socket.on("userLiveLocationUpdate", handleUserLiveLocationUpdate);
    socket.on("userDataForDriver", handleUserDataForDriver);
    socket.on("rideOTP", handleRideOTP);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("rideCancelled", handleRideCancelled);
    socket.on("rideAlreadyAccepted", handleRideAlreadyAccepted);
    socket.on("rideTakenByDriver", handleRideTakenByDriver);
    socket.on("rideStarted", handleRideStarted);
    socket.on("rideCancelledAlert", handleRideCancelledAlert);
    // New socket event listeners for enhanced ride flow
    socket.on("billAlert", handleBillAlert);
    socket.on("otpVerificationSuccess", handleOtpVerificationSuccess);
    socket.on("otpVerificationFailed", handleOtpVerificationFailed);
    socket.on("rideCompleted", handleRideCompleted);

    // Socket connection based on online status (with heartbeat)
  if (isDriverOnline && (!socket || !socket.connected)) {
    connectSocket();
} else if (!isDriverOnline && socket && socket.connected) {
    disconnectSocket();
}


    return () => {
      socket.off("connect", handleConnect);
      socket.off("newRideRequest", handleRideRequest);
      socket.off("userLiveLocationUpdate", handleUserLiveLocationUpdate);
      socket.off("userDataForDriver", handleUserDataForDriver);
      socket.off("rideOTP", handleRideOTP);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("rideCancelled", handleRideCancelled);
      socket.off("rideAlreadyAccepted", handleRideAlreadyAccepted);
      socket.off("rideTakenByDriver", handleRideTakenByDriver);
      socket.off("rideStarted", handleRideStarted);
      socket.off("rideCancelledAlert", handleRideCancelledAlert);
      // Cleanup new socket event listeners
      socket.off("billAlert", handleBillAlert);
      socket.off("otpVerificationSuccess", handleOtpVerificationSuccess);
      socket.off("otpVerificationFailed", handleOtpVerificationFailed);
      socket.off("rideCompleted", handleRideCompleted);
    };
  }, [location, driverId, driverName, ride, rideStatus, userData, stopNavigation, currentSpeed, isDriverOnline, clearMapData, clearRideState, driverVehicleType, handleRideRequest, hideRiderDetails]);

  // ============ SOCKET HEARTBEAT & AUTO-RECONNECT (7 SECONDS) ============
  // Maintains socket connection stability for ONLINE and ON_RIDE states
  const socketReconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  useEffect(() => {
    // Only run when driver is online OR has an active ride
    const shouldMaintainSocket = isDriverOnline || rideStatus === "accepted" || rideStatus === "started";

    if (!shouldMaintainSocket) {
      console.log("ℹ️ Socket heartbeat not needed (offline, no ride)");
      return;
    }


    const heartbeatInterval = setInterval(async () => {
      const isActiveRide = rideStatus === "accepted" || rideStatus === "started";

      // ============ CHECK SOCKET CONNECTION ============
      if (!socket || !socket.connected) {
        socketReconnectAttempts.current += 1;
        console.log(`⚠️ Socket disconnected! Attempt ${socketReconnectAttempts.current}/${maxReconnectAttempts}`);

        if (socketReconnectAttempts.current <= maxReconnectAttempts) {
          // Attempt reconnection
          reconnectSocket();

          // Wait and verify reconnection
          await new Promise(resolve => setTimeout(resolve, 2500));

          if (socket && socket.connected) {
            console.log("✅ Socket reconnected successfully");
            socketReconnectAttempts.current = 0;

            // Re-register driver based on current state
            if (driverId && location) {
              const registrationData = {
                driverId,
                driverName: driverName || "Driver",
                latitude: location.latitude,
                longitude: location.longitude,
                vehicleType: driverVehicleType,
                status: isActiveRide ? "onRide" : "Live",
                rideId: isActiveRide ? ride?.rideId : null,
                timestamp: new Date().toISOString(),
              };

              socket.emit("registerDriver", registrationData);
              console.log("📡 Re-registered driver after reconnection");

              // If active ride, also emit location update
              if (isActiveRide) {
                socket.emit("driverLocationUpdate", {
                  ...registrationData,
                  bearing: 0,
                  speed: currentSpeed || 0,
                });
              }
            }
          }
        } else {
          console.error("❌ Max reconnection attempts reached. Socket may be permanently disconnected.");
          // Reset counter to allow future attempts
          socketReconnectAttempts.current = 0;
        }
      } else {
        // ============ SOCKET IS CONNECTED - SEND HEARTBEAT ============
        socketReconnectAttempts.current = 0;

        // Send heartbeat ping to keep connection alive
        socket.emit("heartbeat", {
          driverId,
          status: isActiveRide ? "onRide" : "Live",
          rideId: isActiveRide ? ride?.rideId : null,
          timestamp: new Date().toISOString(),
        });

        // For active rides, also emit location to ensure user app stays updated
        if (isActiveRide && location) {
          socket.emit("driverLocationUpdate", {
            driverId,
            driverName: driverName || "Driver",
            latitude: location.latitude,
            longitude: location.longitude,
            vehicleType: driverVehicleType,
            status: "onRide",
            rideId: ride?.rideId,
            bearing: calculateBearing(lastCoord, location),
            speed: currentSpeed || 0,
            timestamp: new Date().toISOString(),
            phase: rideStatus === "accepted" ? "pickup_navigation" : "dropoff_navigation",
          });
        }
      }
    }, 7000); // Every 7 seconds

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [isDriverOnline, rideStatus, driverId, driverName, location, driverVehicleType, ride?.rideId, currentSpeed, lastCoord]);

  // 2. Central Handler for All Location Updates
  const handleLocationUpdate = useCallback(async (position: Geolocation.GeoPosition) => {
    if (!isMountedRef.current) return;

    const newLocation: LocationType = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    // 1. Update raw location state and start smooth UI animation
    setLocation(newLocation);
    startDriverAnimation(newLocation.latitude, newLocation.longitude);
    setCurrentSpeed(position.coords.speed || 0);
    lastLocationUpdate.current = newLocation;
    locationUpdateCount.current += 1;

    // 2. Handle route updates (slicing and off-route detection)
    const isNavigating = rideStatusRef.current === "accepted" || rideStatusRef.current === "started";
    const targetLocation = rideStatusRef.current === "accepted" ? rideRef.current?.pickup : rideRef.current?.drop;

    if (isNavigating && targetLocation && fullRouteCoordsRef.current.length > 0) {
      const offRouteCheck = isDriverOffRoute(newLocation, fullRouteCoordsRef.current, OFF_ROUTE_THRESHOLD, nearestPointIndexRef.current);

      if (offRouteCheck.isOffRoute && !offRouteReFetchInProgress.current) {
        offRouteReFetchInProgress.current = true;
        console.log(`⚠️ Driver is ${offRouteCheck.distance.toFixed(1)}m off-route. Recalculating...`);
        const newRouteData = await getRouteWithDetails(newLocation, targetLocation);
        if (newRouteData) {
          setFullRouteCoords(newRouteData.coords);
          setVisibleRouteCoords(newRouteData.coords);
          setNearestPointIndex(0);
        }
        offRouteReFetchInProgress.current = false;
      } else if (!offRouteCheck.isOffRoute) {
        // Driver is on-route, so we slice the polyline for the "consumed" effect
        const segments = splitRouteAtDriver(newLocation, fullRouteCoordsRef.current, offRouteCheck.nearestIndex);
        setVisibleRouteCoords(segments.remaining);
        setTravelledRoute(segments.travelled);
        setNearestPointIndex(segments.nearestIndex);
      }
    }

    // 3. Save to DB (throttled inside the function)
    saveLocationToDatabase(newLocation).catch(console.error);

    // 4. Update last coordinate for next calculation
    setLastCoord(newLocation);

  }, []);

  // Foreground Location Tracking for UI
  useEffect(() => {
    if (!isDriverOnline) return;

    const watchId = Geolocation.watchPosition(
      (position) => {
        handleLocationUpdate(position);
      },
      (error) => console.log(error),
      { enableHighAccuracy: true, distanceFilter: 5, interval: 1000 }
    );

    return () => Geolocation.clearWatch(watchId);
  }, [isDriverOnline, handleLocationUpdate]);

  // ✅ CRITICAL: Trigger smooth animation when location updates
  // This ensures the blue dot moves smoothly to the new position
  useEffect(() => {
    if (location && displayedDriverLocationRef.current) {
      startDriverAnimation(location.latitude, location.longitude, 1000);
    } else if (location) {
      // Initialize displayed location if not yet set
      setDisplayedDriverLocation(location);
      displayedDriverLocationRef.current = location;
    }
  }, [location, startDriverAnimation]);
  
  // Save ride state whenever it changes
  useEffect(() => {
    if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
      saveRideState();
    }
  }, [ride, rideStatus, userData, travelledKm, otpVerificationLocation, riderDetailsVisible, saveRideState]);
  
  // UI Rendering
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setError(null)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={styles.loadingText}>Fetching your location...</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            Geolocation.getCurrentPosition(
              (pos) => {
                setLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
              },
              (err) => {
                Alert.alert(
                  "Location Error",
                  "Could not get your location. Please check GPS settings."
                );
              },
              { enableHighAccuracy: true, timeout: 15000 }
            );
          }}
        >
          <Text style={styles.retryText}>Retry Location</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Show loading screen ONLY if driver ID is missing (critical data)
  // Location can load in background - DON'T block on it
  if (!driverId || !driverName) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }]}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={{ marginTop: 20, fontSize: 16, color: '#666' }}>Loading driver data...</Text>
        <Text style={{ marginTop: 10, fontSize: 14, color: '#999' }}>Please wait</Text>
      </View>
    );
  }

  // Use default location if not yet loaded (prevents freeze waiting for GPS)
  const currentLocation = location || { latitude: 12.9716, longitude: 77.5946 };

  return (
    <View style={styles.container}>
      {/* Top-left menu icon */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => navigation.navigate('Menu')}
      >
        <MaterialIcons name="menu" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Top-right logout button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <MaterialIcons name="logout" size={24} color="#fff" />
      </TouchableOpacity>

     <MapLibreGL.MapView
  ref={mapRef}
  style={styles.map}
  mapStyle={MAP_STYLE}
  logoEnabled={false}
  attributionEnabled={false}
  compassEnabled={true}
  zoomEnabled={true}
  scrollEnabled={true}
  pitchEnabled={false}
  rotateEnabled={false}
>
  <MapLibreGL.Camera
    ref={cameraRef}
    defaultSettings={{
      centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
      zoomLevel: 14,
    }}
    followUserLocation={false}
  />

  {/* ✅ Custom Animated Blue Dot for smooth movement */}
  {displayedDriverLocation && (
    <MapLibreGL.PointAnnotation
        id="driver-live-location"
        coordinate={[
            displayedDriverLocation.longitude,
            displayedDriverLocation.latitude
        ]}
        anchor={{ x: 0.5, y: 0.5 }}
    >
        <View style={styles.blueDotMarker}>
            <View style={styles.blueDotCore} />
        </View>
    </MapLibreGL.PointAnnotation>
  )}

  {/* Pickup marker */}
  {ride && rideStatus !== "started" && (
    <MapLibreGL.PointAnnotation
      id="pickup-marker"
      coordinate={[ride.pickup.longitude, ride.pickup.latitude]}
      title="Pickup Location"
    >
      <View style={styles.markerContainer}>
        <MaterialIcons name="location-pin" size={32} color="blue" />
      </View>
    </MapLibreGL.PointAnnotation>
  )}

  {/* Drop marker */}
  {ride && (
    <MapLibreGL.PointAnnotation
      id="drop-marker"
      coordinate={[ride.drop.longitude, ride.drop.latitude]}
      title="Drop Location"
    >
      <View style={styles.markerContainer}>
        <MaterialIcons name="place" size={32} color="red" />
      </View>
    </MapLibreGL.PointAnnotation>
  )}

  {/* ============ PROFESSIONAL POLYLINE RENDERING ============ */}

  {/* Route Shadow/Outline Layer - Creates depth effect */}
  {visibleRouteCoords.length >= 2 && (
    <MapLibreGL.ShapeSource
      id="route-shadow-source"
      shape={{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: visibleRouteCoords.map(c => [c.longitude, c.latitude]),
        },
      }}
    >
      <MapLibreGL.LineLayer
        id="route-shadow-layer"
        style={{
          lineColor: rideStatus === "accepted" ? '#1565C0' : '#2E7D32', // Dark blue for pickup, dark green for drop
          lineWidth: 8,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.4,
          lineBlur: 3,
        }}
      />
    </MapLibreGL.ShapeSource>
  )}

  {/* Main Route Layer - Primary visible polyline */}
  {visibleRouteCoords.length >= 2 && (
    <MapLibreGL.ShapeSource
      id="route-source"
      shape={{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: visibleRouteCoords.map(c => [c.longitude, c.latitude]),
        },
      }}
    >
      <MapLibreGL.LineLayer
        id="route-layer"
        style={{
          lineColor: rideStatus === "accepted" ? '#2196F3' : '#4CAF50', // Blue for pickup, green for drop
          lineWidth: 5,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </MapLibreGL.ShapeSource>
  )}

  {/* Travelled Route Layer - Shows consumed path (only during "started" status) */}
  {travelledRoute.length >= 2 && rideStatus === "started" && (
    <MapLibreGL.ShapeSource
      id="travelled-route-source"
      shape={{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: travelledRoute.map(c => [c.longitude, c.latitude]),
        },
      }}
    >
      <MapLibreGL.LineLayer
        id="travelled-route-layer"
        style={{
          lineColor: '#9E9E9E', // Gray for consumed route
          lineWidth: 4,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.6,
        }}
      />
    </MapLibreGL.ShapeSource>
  )}

  {/* NOTE: Route Progress Indicator removed - using blue dot instead */}
  {/* NOTE: User (passenger) live location marker removed - using pickup marker instead */}
</MapLibreGL.MapView>

      {/* Google Logo Overlay - Hides Google watermark */}
      <View style={styles.logoWatermarkContainer}>
        <Image source={logoImage} style={styles.logoWatermark} resizeMode="contain" />
      </View>

      {/* Professional Maximized Passenger Details (Default View) */}
      {renderMaximizedPassengerDetails()}
      
      {/* Minimized Booking Bar (2 lines) */}
      {renderMinimizedBookingBar()}

      {/* Single Bottom Button - Changes based on ride status */}
   
{ride && (rideStatus === "accepted" || rideStatus === "started") && (
  <TouchableOpacity
    style={[
      styles.button, 
      rideStatus === "accepted" ? styles.startButton : styles.completeButton
    ]}
    onPress={() => {
      console.log("🎯 Complete Ride button pressed");
      if (rideStatus === "accepted") {
        setOtpModalVisible(true);
      } else if (rideStatus === "started") {
        completeRide(); // Direct call
      }
    }}
    activeOpacity={0.7}
  >
    <MaterialIcons 
      name={rideStatus === "accepted" ? "play-arrow" : "flag"} 
      size={24} 
      color="#fff" 
    />
    <Text style={styles.btnText}>
      {rideStatus === "accepted" ? "Enter OTP & Start Ride" : "Complete Ride"}
    </Text>
  </TouchableOpacity>
)}

      {/* Ride Taken Alert */}
      {showRideTakenAlert && (
        <View style={styles.rideTakenAlertContainer}>
          <View style={styles.rideTakenAlertContent}>
            <Text style={styles.rideTakenAlertText}>
              This ride is already taken by another driver — please wait.
            </Text>
            <View style={styles.alertProgressBar}>
              <Animated.View 
                style={[
                  styles.alertProgressFill,
                  {
                    width: '100%',
                    transform: [{ scaleX: alertProgress }]
                  }
                ]}
              />
            </View>
          </View>
        </View>
      )}
      
      {/* Center ONLINE | OFFLINE button */}
      {!ride && (
        <View style={styles.onlineToggleContainer}>
          <TouchableOpacity
            style={[
              styles.onlineToggleButton,
              isDriverOnline ? styles.onlineButton : styles.offlineButton
            ]}
            onPress={toggleOnlineStatus}
          >
            <View style={styles.toggleContent}>
              <View style={[
                styles.toggleIndicator,
                { backgroundColor: isDriverOnline ? "#4caf50" : "#f44336" }
              ]} />
              <Text style={styles.toggleButtonText}>
                {isDriverOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
              </Text>
            </View>
            {backgroundTrackingActive && (
              <Text style={styles.trackingText}>📍 Live tracking active</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      
      {/* <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: socketConnected ? "#4caf50" : "#f44336" },
            ]}
          />
          <Text style={styles.statusText}>
            {socketConnected ? "Connected" : "Disconnected"}
          </Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  driverStatus === "online"
                    ? "#4caf50"
                    : driverStatus === "onRide"
                    ? "#ff9800"
                    : "#f44336",
              },
            ]}
          />
          <Text style={styles.statusText}>{driverStatus.toUpperCase()}</Text>
        </View>
       
        {ride && (rideStatus === "accepted" || rideStatus === "started") && userLocation && (
          <Text style={styles.userLocationText}>
            🟢 User Live: {userLocation.latitude.toFixed(4)},{" "}
            {userLocation.longitude.toFixed(4)}
          </Text>
        )}
       
        {rideStatus === "started" && (
          <Text style={styles.distanceText}>
            📏 Distance Travelled: {travelledKm.toFixed(2)} km
          </Text>
        )}
      </View> */}
      
      {ride && rideStatus === "onTheWay" && (
        <View style={styles.rideActions}>
          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={() => acceptRide()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={24} color="#fff" />
                <Text style={styles.btnText}>Accept Ride</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.rejectButton]}
            onPress={() => rejectRide()}
          >
            <MaterialIcons name="cancel" size={24} color="#fff" />
            <Text style={styles.btnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* OTP Modal */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter OTP</Text>
              <Text style={styles.modalSubtitle}>Please ask passenger for OTP to start the ride</Text>
            </View>
            <TextInput
              placeholder="Enter 4-digit OTP"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="numeric"
              style={styles.otpInput}
              maxLength={4}
              autoFocus
              placeholderTextColor="#999"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setOtpModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmOTP}
              >
                <Text style={styles.modalButtonText}>Confirm OTP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Offline Verification Modal */}
      <Modal
        visible={showOfflineVerificationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOfflineVerificationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Driver ID</Text>
              <Text style={styles.modalSubtitle}>Enter the last 4 digits of your Driver ID to confirm going offline</Text>
            </View>
            <View style={styles.verificationBox}>
              <TextInput
                style={styles.driverIdInput}
                placeholder="••••"
                placeholderTextColor="#bdc3c7"
                value={driverIdVerification}
                onChangeText={setDriverIdVerification}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => {
                  setShowOfflineVerificationModal(false);
                  setDriverIdVerification('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={verifyDriverIdAndGoOffline}
              >
                <Text style={styles.modalButtonText}>Confirm Offline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Verification Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showVerificationModal}
        onRequestClose={handleVerificationModalClose}
      >
        
      </Modal>
      
      {/* Bill Modal - Enhanced with fare breakdown */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showBillModal}
        onRequestClose={handleBillModalDismiss}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ride Completed</Text>
              <Text style={styles.modalSubtitle}>Thank you for the safe ride!</Text>
            </View>

            <View style={styles.billCard}>
              {/* Customer Details Section */}
              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Customer Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Name:</Text>
                  <Text style={styles.billValue}>{billDetails.userName}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Mobile:</Text>
                  <Text style={styles.billValue}>{billDetails.userMobile}</Text>
                </View>
              </View>

              {/* Trip Details Section */}
              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Trip Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Total Distance:</Text>
                  <Text style={styles.billValue}>{billDetails.distance}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Rate per km:</Text>
                  <Text style={styles.billValue}>{billDetails.pricePerKm ? `₹${billDetails.pricePerKm}/km` : 'N/A'}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Duration:</Text>
                  <Text style={styles.billValue}>{billDetails.travelTime}</Text>
                </View>
              </View>

              {/* Fare Breakdown Section */}
              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Fare Breakdown</Text>
                {billDetails.calculation && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Calculation:</Text>
                    <Text style={styles.billValue}>{billDetails.calculation}</Text>
                  </View>
                )}
                <View style={styles.billDivider} />
                <View style={styles.billRow}>
                  <Text style={styles.billTotalLabel}>Final Amount:</Text>
                  <Text style={styles.billTotalValue}>₹{billDetails.charge}</Text>
                </View>
                {billDetails.driverShare && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabel, { color: '#4CAF50' }]}>Your Earnings:</Text>
                    <Text style={[styles.billValue, { color: '#4CAF50', fontWeight: 'bold' }]}>₹{billDetails.driverShare}</Text>
                  </View>
                )}
              </View>

              {/* Route Section */}
              {(billDetails.pickupAddress || billDetails.dropoffAddress) && (
                <View style={styles.billSection}>
                  <Text style={styles.billSectionTitle}>Route</Text>
                  {billDetails.pickupAddress && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>From:</Text>
                      <Text style={[styles.billValue, { flex: 1 }]} numberOfLines={2}>{billDetails.pickupAddress}</Text>
                    </View>
                  )}
                  {billDetails.dropoffAddress && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>To:</Text>
                      <Text style={[styles.billValue, { flex: 1 }]} numberOfLines={2}>{billDetails.dropoffAddress}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.confirmButton} onPress={handleBillModalClose}>
              <Text style={styles.confirmButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default DriverScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  map: {
    flex: 1,
  },
  // Google Logo Overlay Styles
  logoWatermarkContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    zIndex: 1000,
  },
  logoWatermark: {
    width: 80,
    height: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  // Location Marker Styles
  locationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginTop: -4,
  },
  // MapLibre marker styles
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    borderRadius: 20,
    padding: 4,
  },
  // Professional Maximized Passenger Details (Screenshot Layout)
  maximizedDetailsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    maxHeight: "80%", // Increased height to ensure it covers the bottom button
  },
  maximizedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  brandingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  minimizeButton: {
    padding: 8,
  },
  maximizedContent: {
    flex: 1,
  },
  contactSection: {
    marginBottom: 20,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  contactLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    flex: 1,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  addressSection: {
    marginBottom: 20,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    fontWeight: "500",
  },
  addressText: {
    fontSize: 16,
    color: "#333333",
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  fareSection: {
    marginBottom: 20,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  fareLabel: {
    fontSize: 16,
    color: "#666666",
    fontWeight: "500",
  },
  fareAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  startRideButton: {
    backgroundColor: "#2196F3",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startRideButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Minimized Booking Bar Styles (2 lines)
  minimizedBookingBarContainer: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    zIndex: 11,
  },
  minimizedBookingBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  minimizedFirstRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  minimizedProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  minimizedProfileImageText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  minimizedProfileName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
    flex: 1,
  },
  minimizedExpandButton: {
    padding: 4,
  },
  minimizedSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  minimizedMobileContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  minimizedMobileText: {
    fontSize: 14,
    color: "#333333",
    marginLeft: 6,
    flex: 1,
  },
  minimizedCallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  // Ride Taken Alert Styles
  rideTakenAlertContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  rideTakenAlertContent: {
    backgroundColor: "rgba(255, 152, 0, 0.9)",
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rideTakenAlertText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  alertProgressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  alertProgressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  // Online/Offline Toggle Styles - MOVED TO BOTTOM RIGHT
  onlineToggleContainer: {
    position: "absolute",
    top: 120,
    right: 30,
    left: 'auto',
    zIndex: 11,
  },
  onlineToggleButton: {
    padding: 16,
    borderRadius: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    minWidth: 330,
  },
  onlineButton: {
    backgroundColor: "#4caf50",
  },
  offlineButton: {
    backgroundColor: "#f44336",
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  trackingText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500",
  },
  statusContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    marginRight: 16,
    color: "#333",
  },
  userLocationText: {
    fontSize: 11,
    color: "#4caf50",
    fontWeight: "500",
    marginTop: 2,
  },
  distanceText: {
    fontSize: 11,
    color: "#ff9800",
    fontWeight: "500",
    marginTop: 2,
  },
  rideActions: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#4caf50",
    flex: 1,
  },
  rejectButton: {
    backgroundColor: "#f44336",
    flex: 1,
  },





  startButton: {
    backgroundColor: "#2196f3",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  completeButton: {
    backgroundColor: "#ff9800",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  logoutButton: {
    backgroundColor: "#dc3545",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  // startButton: {
  //   backgroundColor: "#2196f3",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },
  // completeButton: {
  //   backgroundColor: "#ff9800",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },
  // logoutButton: {
  //   backgroundColor: "#dc3545",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },










  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },








  // modalOverlay: {
  //   flex: 1,
  //   justifyContent: "center",
  //   alignItems: "center",
  //   backgroundColor: "rgba(0,0,0,0.7)",
  //   padding: 20,
  // },
  // modalContainer: {
  //   backgroundColor: "white",
  //   padding: 24,
  //   borderRadius: 20,
  //   width: "100%",
  //   elevation: 12,
  //   shadowColor: "#000",
  //   shadowOffset: { width: 0, height: 6 },
  //   shadowOpacity: 0.3,
  //   shadowRadius: 12,
  // },


  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 20,
    zIndex: 999, // ✅ ADD THIS: Force it to be the top-most layer
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 20,
    width: "100%",
    elevation: 99, // ✅ INCREASED from 12: Must be higher than maximizedDetailsContainer (16)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    zIndex: 1000, // ✅ ADD THIS
  },












  modalHeader: {
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    color: "#333",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  otpInput: {
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    marginVertical: 16,
    padding: 20,
    fontSize: 20,
    textAlign: "center",
    fontWeight: "700",
    backgroundColor: "#f8f9fa",
    color: "#333",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 8,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cancelModalButton: {
    backgroundColor: "#757575",
  },
  confirmModalButton: {
    backgroundColor: "#4caf50",
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  billCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  billSection: {
    marginBottom: 20,
  },
  billSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
  },
  billValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333333",
  },
  billDivider: {
    height: 1,
    backgroundColor: "#DDDDDD",
    marginVertical: 12,
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },
  billTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  confirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#f44336",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: "#4caf50",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  blackDotMarker: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    width: 14,
    height: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  blackDotInner: {
    backgroundColor: "#000000",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalIconContainer: {
    alignItems: "center",
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  billDetailsContainer: {
    width: "100%",
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  modalConfirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Top Navigation Buttons
  menuButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2ecc71',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  logoutButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  // Online/Offline Toggle Styles
  onlineToggleContainer: {
    position: "absolute",
    top: 45,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  onlineToggleButton: {
    padding: 14,
    borderRadius: 30,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    width: 180,
  },
  // Offline Verification Modal Styles
  verificationBox: {
    marginBottom: 20,
  },
  driverIdInput: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 20,
    fontSize: 20,
    textAlign: 'center',
    fontWeight: '700',
    backgroundColor: '#f8f9fa',
    color: '#333',
  },
});
