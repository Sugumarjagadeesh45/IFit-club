// src/ActiveRideScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  BackHandler,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { getLightMapStyleString } from './mapStyle';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Geolocation from '@react-native-community/geolocation';
import axios from 'axios';
import { getDistance } from 'geolib';
import BackgroundService from 'react-native-background-actions';
import backgroundLocationTask from './BackgroundLocationService';
import { API_BASE } from './apiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

MapLibreGL.setAccessToken(null);

const { width, height } = Dimensions.get('window');

interface Location {
  latitude: number;
  longitude: number;
}

interface Ride {
  _id: string;
  RAID_ID: string;
  customerId: string;
  name: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupCoordinates: Location;
  dropoffCoordinates: Location;
  fare: number;
  distance: number;
  status: string;
  otp?: string;
}

interface ActiveRideScreenProps {
  route: any;
  navigation: any;
}

const ActiveRideScreen: React.FC<ActiveRideScreenProps> = ({ route, navigation }) => {
  const { rideId } = route.params;
  const mapRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeToPickup, setRouteToPickup] = useState<Location[]>([]);
  const [routeToDropoff, setRouteToDropoff] = useState<Location[]>([]);
  const [distanceToPickup, setDistanceToPickup] = useState<number>(0);
  const [etaToPickup, setEtaToPickup] = useState<string>('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [driverReachedPickup, setDriverReachedPickup] = useState(false);
  const [rideStarted, setRideStarted] = useState(false);
  const [isBackgroundTaskRunning, setIsBackgroundTaskRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Handle back button press
  useEffect(() => {
    const backAction = () => {
      Alert.alert(
        "Exit Ride",
        "Are you sure you want to exit this ride? This will end the ride tracking.",
        [
          { text: "Cancel", onPress: () => null, style: "cancel" },
          { text: "Yes", onPress: () => handleExitRide() }
        ]
      );
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  // Load token and ride details
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log("🔄 Starting to load data...");
        setDebugInfo("Loading data...");
        
        // Check if rideId is provided
        if (!rideId) {
          console.error("❌ No rideId provided");
          setDebugInfo("Error: No ride ID provided");
          Alert.alert("Error", "No ride ID provided");
          navigation.goBack();
          return;
        }
        
        console.log("🚖 RideId provided:", rideId);
        setDebugInfo(`Ride ID: ${rideId}`);
        
        // Get token from AsyncStorage
        const savedToken = await AsyncStorage.getItem("authToken");
        console.log("🔑 Token retrieved:", savedToken ? "Token exists" : "No token found");
        setDebugInfo(prev => prev + "\nToken: " + (savedToken ? "Exists" : "Not found"));
        
        if (!savedToken) {
          console.log("❌ No token found, redirecting to login");
          setDebugInfo("No token found, redirecting to login");
          Alert.alert("Session Expired", "Please login again");
          navigation.replace("LoginScreen");
          return;
        }
        
        setToken(savedToken);
        
        // Construct the API URL
        const timestamp = new Date().getTime();
        const apiUrl = `${API_BASE}/drivers/rides/${rideId}?t=${timestamp}`;
        console.log("🌐 API URL:", apiUrl);
        setDebugInfo(prev => prev + `\nAPI URL: ${apiUrl}`);
        
        // Fetch ride details
        console.log("📡 Fetching ride details...");
        setDebugInfo(prev => prev + "\nFetching ride details...");
        
        const response = await axios.get(apiUrl, {
          headers: { Authorization: `Bearer ${savedToken}` },
          timeout: 10000 // 10 seconds timeout
        });
        
        console.log("✅ Ride details response status:", response.status);
        console.log("📋 Ride data received:", JSON.stringify(response.data, null, 2));
        setDebugInfo(prev => prev + `\nResponse status: ${response.status}`);
        
        // Check if we got valid ride data
        if (!response.data) {
          throw new Error("No ride data received from server");
        }
        
        // Validate required fields
        if (!response.data.RAID_ID || !response.data.pickupCoordinates || !response.data.dropoffCoordinates) {
          console.error("❌ Missing required fields in ride data");
          setDebugInfo("Error: Missing required fields in ride data");
          throw new Error("Invalid ride data format");
        }
        
        setRide(response.data);
        setDebugInfo(prev => prev + "\nRide data set successfully");
        
        // Start background location tracking
        await startBackgroundLocationTracking(rideId);
        
        // Fetch route to dropoff (always fetch this route)
        if (response.data.pickupCoordinates && response.data.dropoffCoordinates) {
          console.log("🗺️ Fetching route to dropoff...");
          setDebugInfo(prev => prev + "\nFetching route to dropoff...");
          await fetchRoute(response.data.pickupCoordinates, response.data.dropoffCoordinates, setRouteToDropoff);
        }
        
      } catch (error: any) {
        console.error("❌ Error loading ride data:", error);
        
        // Enhanced error logging
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error("📡 Response error:", {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
          });
          setDebugInfo(prev => prev + `\nResponse error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
          
          // Handle specific error statuses
          if (error.response.status === 401) {
            Alert.alert("Session Expired", "Please login again");
            navigation.replace("LoginScreen");
          } else if (error.response.status === 404) {
            Alert.alert("Ride Not Found", "The requested ride could not be found");
            navigation.goBack();
          } else if (error.response.status >= 500) {
            Alert.alert("Server Error", "There was a problem with the server. Please try again later.");
          } else {
            Alert.alert("Error", `Failed to load ride details: ${error.response.data?.msg || error.response.data?.error || "Unknown error"}`);
          }
        } else if (error.request) {
          // The request was made but no response was received
          console.error("🌐 Network error:", error.request);
          setDebugInfo(prev => prev + `\nNetwork error: ${error.message}`);
          Alert.alert("Network Error", "Please check your internet connection and try again");
        } else if (error.code === 'ECONNABORTED') {
          // Request timeout
          console.error("⏱️ Request timeout:", error.message);
          setDebugInfo(prev => prev + `\nRequest timeout: ${error.message}`);
          Alert.alert("Request Timeout", "The request took too long. Please try again.");
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error("💥 Unexpected error:", error.message);
          setDebugInfo(prev => prev + `\nUnexpected error: ${error.message}`);
          Alert.alert("Error", `Failed to load ride details: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    return () => {
      // Stop background task when component unmounts
      if (isBackgroundTaskRunning) {
        BackgroundService.stop();
        setIsBackgroundTaskRunning(false);
      }
    };
  }, [rideId]);

  // Start location tracking
  useEffect(() => {
    if (!token) return;
    
    const requestLocationPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location for ride tracking',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    };
    
    const startLocationTracking = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Location permission is required for this feature');
        return;
      }
      
      Geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = { latitude, longitude };
          setCurrentLocation(newLocation);
          
          // Update location to backend
          try {
            await axios.post(
              `${API_BASE}/drivers/update-location`,
              { latitude, longitude, rideId },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } catch (error) {
            console.error('Error updating location:', error);
          }
          
          // If we have ride details, check if driver reached pickup
          if (ride && !driverReachedPickup) {
            const distance = getDistance(
              { latitude, longitude },
              ride.pickupCoordinates
            );
            
            if (distance < 50) { // 50 meters threshold
              setDriverReachedPickup(true);
              setShowOtpModal(true);
            }
          }
          
          // Update route to pickup if we have current location and ride details
          if (ride && !driverReachedPickup && ride.pickupCoordinates) {
            await fetchRoute(newLocation, ride.pickupCoordinates, setRouteToPickup);
            
            // Calculate distance and ETA
            const dist = getDistance(newLocation, ride.pickupCoordinates);
            setDistanceToPickup(dist);
            
            // Simple ETA calculation (assuming 30 km/h average speed in city)
            const etaMinutes = Math.ceil(dist / 500); // 500 meters per minute
            setEtaToPickup(`${etaMinutes} min`);
          }
        },
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true, distanceFilter: 10, interval: 5000 }
      );
    };
    
    startLocationTracking();
  }, [token, ride, driverReachedPickup]);

  const fetchRoute = async (origin: Location, destination: Location, setRoute: (locations: Location[]) => void) => {
    try {
      console.log("🗺️ Fetching route from", origin, "to", destination);
      // Use OSRM (Free) instead of Google Directions
      const response = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`
      );
      
      if (response.data.routes && response.data.routes.length > 0) {
        const points = response.data.routes[0].geometry.coordinates.map((c: number[]) => ({
          latitude: c[1],
          longitude: c[0]
        }));
        setRoute(points);
        console.log("✅ Route fetched successfully with", points.length, "points");
      } else {
        console.log("⚠️ No routes found in Google Maps response");
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  };

  const centerMapOnRoute = () => {
    if (routeToPickup.length > 0 && routeToDropoff.length > 0) {
      // Combine both routes to fit all points
      const allPoints = [...routeToPickup, ...routeToDropoff];
      
      // Calculate min and max coordinates
      let minLat = allPoints[0].latitude;
      let maxLat = allPoints[0].latitude;
      let minLng = allPoints[0].longitude;
      let maxLng = allPoints[0].longitude;
      
      allPoints.forEach(point => {
        minLat = Math.min(minLat, point.latitude);
        maxLat = Math.max(maxLat, point.latitude);
        minLng = Math.min(minLng, point.longitude);
        maxLng = Math.max(maxLng, point.longitude);
      });
      
      const midLat = (minLat + maxLat) / 2;
      const midLng = (minLng + maxLng) / 2;
      const latDelta = (maxLat - minLat) * 1.2;
      const lngDelta = (maxLng - minLng) * 1.2;
      
      cameraRef.current?.fitBounds(
        [minLng, minLat],
        [maxLng, maxLat],
        50,
        1000
      );
    }
  };

  useEffect(() => {
    if (routeToPickup.length > 0 && routeToDropoff.length > 0) {
      centerMapOnRoute();
    }
  }, [routeToPickup, routeToDropoff]);

  const startBackgroundLocationTracking = async (currentRideId: string) => {
    try {
      // Request necessary permissions
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location for ride tracking',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Location permission is required for this feature');
          return;
        }
      }
      
      // Start the background service
      const options = {
        taskName: 'Location Tracking',
        taskTitle: 'Tracking your location',
        taskDesc: 'Your location is being tracked for the active ride',
        taskIcon: {
          name: 'ic_launcher',
          type: 'mipmap',
        },
        color: '#4caf50',
        parameters: {
          rideId: currentRideId,
        },
      };
      
      console.log('Starting background location tracking...');
      await BackgroundService.start(options, backgroundLocationTask);
      setIsBackgroundTaskRunning(true);
      console.log('Background location tracking started successfully');
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      Alert.alert('Error', 'Failed to start background location tracking');
    }
  };

  const handleExitRide = async () => {
    try {
      // Stop background task
      if (isBackgroundTaskRunning) {
        await BackgroundService.stop();
        setIsBackgroundTaskRunning(false);
      }
      
      // Update ride status to cancelled
      if (token && ride) {
        await axios.put(
          `${API_BASE}/drivers/rides/${ride.RAID_ID}`,
          { status: 'Cancelled' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      navigation.navigate('Screen1');
    } catch (error) {
      console.error('Error exiting ride:', error);
      Alert.alert('Error', 'Failed to exit ride');
    }
  };

  const verifyOtp = async () => {
    if (!ride || !otp) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }
    
    try {
      // Update ride status to ongoing
      await axios.put(
        `${API_BASE}/drivers/rides/${ride.RAID_ID}`,
        { status: 'ongoing' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setRideStarted(true);
      setShowOtpModal(false);
      Alert.alert('Success', 'Ride started successfully');
    } catch (error) {
      console.error('Error verifying OTP:', error);
      Alert.alert('Error', 'Invalid OTP. Please try again.');
    }
  };

  const completeRide = async () => {
    if (!token || !ride || !currentLocation) return;

    // ✅ Validate location coordinates before proceeding
    if (currentLocation.latitude === undefined || currentLocation.latitude === null ||
        currentLocation.longitude === undefined || currentLocation.longitude === null ||
        isNaN(currentLocation.latitude) || isNaN(currentLocation.longitude)) {
      Alert.alert('Error', 'Invalid GPS coordinates. Please wait for valid location.');
      return;
    }

    try {
      console.log("Attempting to complete ride with RAID_ID:", ride.RAID_ID);
      console.log("⚠️ NOTE: Distance and fare will be calculated by backend ONLY");

      // Stop background task FIRST
      if (isBackgroundTaskRunning) {
        await BackgroundService.stop();
        setIsBackgroundTaskRunning(false);
      }

      // ✅ BACKEND-ONLY: Send completion request with drop location only
      // DO NOT send distance or fare - backend calculates everything
      const response = await axios.post(
        `${API_BASE}/rides/complete-with-calculation`,
        {
          rideId: ride.RAID_ID,
          driverId: await AsyncStorage.getItem('driverId'),
          completedLatitude: currentLocation.latitude,
          completedLongitude: currentLocation.longitude
          // ❌ REMOVED: distance, fare, startLatitude, startLongitude
          // Backend calculates everything from stored OTP verification location
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Ride completion response:", response.data);

      if (response.data.success) {
        // ✅ USE ONLY BACKEND VALUES for billing display
        const serverData = response.data.data;
        const billMessage = `Distance: ${serverData.distance} km\nFare: ₹${serverData.fare}\n${serverData.calculation || ''}`;

        setShowCompleteModal(false);

        // Show bill with BACKEND VALUES ONLY
        Alert.alert(
          'Ride Completed',
          billMessage,
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Screen1')
            }
          ]
        );
      } else {
        throw new Error(response.data.message || 'Failed to complete ride');
      }
    } catch (error: any) {
      console.error('Error completing ride:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        console.error('Error status:', error.response.status);
        Alert.alert('Error', `Failed to complete ride: ${error.response.data.msg || error.response.data.message || error.response.data.error || 'Unknown error'}`);
      } else {
        Alert.alert('Error', `Failed to complete ride: ${error.message || 'Network error'}`);
      }
    }
  };

  if (loading || !ride || !currentLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text>Loading ride details...</Text>
        <Text style={styles.debugText}>{debugInfo}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Ride</Text>
        <View style={{ width: 28 }} />
      </View>
      
      {/* Map */}
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={getLightMapStyleString()}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
            zoomLevel: 14,
          }}
          followUserLocation={true}
        />

        {/* Driver's current location */}
        <MapLibreGL.PointAnnotation
          id="driver-loc"
          coordinate={[currentLocation.longitude, currentLocation.latitude]}
          title="You"
        >
          <View style={{ backgroundColor: 'green', width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'white' }} />
        </MapLibreGL.PointAnnotation>
        
        {/* Pickup location */}
        <MapLibreGL.PointAnnotation
          id="pickup-loc"
          coordinate={[ride.pickupCoordinates.longitude, ride.pickupCoordinates.latitude]}
          title="Pickup"
        >
           <MaterialIcons name="location-pin" size={40} color="blue" />
        </MapLibreGL.PointAnnotation>
        
        {/* Dropoff location */}
        <MapLibreGL.PointAnnotation
          id="dropoff-loc"
          coordinate={[ride.dropoffCoordinates.longitude, ride.dropoffCoordinates.latitude]}
          title="Dropoff"
        >
           <MaterialIcons name="location-pin" size={40} color="red" />
        </MapLibreGL.PointAnnotation>
        
        {/* Route to pickup (only show if not reached pickup) */}
        {!driverReachedPickup && routeToPickup.length > 0 && (
          <MapLibreGL.ShapeSource
            id="route-pickup"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: routeToPickup.map(l => [l.longitude, l.latitude]),
              },
              properties: {}
            }}
          >
            <MapLibreGL.LineLayer id="line-pickup" style={{ lineColor: '#FF0000', lineWidth: 4 }} />
          </MapLibreGL.ShapeSource>
        )}
        
        {/* Route to dropoff (always show) */}
        {routeToDropoff.length > 0 && (
          <MapLibreGL.ShapeSource
            id="route-dropoff"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: routeToDropoff.map(l => [l.longitude, l.latitude]),
              },
              properties: {}
            }}
          >
            <MapLibreGL.LineLayer id="line-dropoff" style={{ lineColor: '#0000FF', lineWidth: 4 }} />
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>
      
      {/* Ride Info Card */}
      <View style={styles.rideInfoCard}>
        <View style={styles.rideInfoRow}>
          <Text style={styles.rideInfoLabel}>Customer:</Text>
          <Text style={styles.rideInfoValue}>{ride.name}</Text>
        </View>
        
        <View style={styles.rideInfoRow}>
          <Text style={styles.rideInfoLabel}>Pickup:</Text>
          <Text style={styles.rideInfoValue} numberOfLines={2}>{ride.pickupLocation}</Text>
        </View>
        
        <View style={styles.rideInfoRow}>
          <Text style={styles.rideInfoLabel}>Dropoff:</Text>
          <Text style={styles.rideInfoValue} numberOfLines={2}>{ride.dropoffLocation}</Text>
        </View>
        
        {!driverReachedPickup && (
          <>
            <View style={styles.rideInfoRow}>
              <Text style={styles.rideInfoLabel}>Distance to Pickup:</Text>
              <Text style={styles.rideInfoValue}>{distanceToPickup.toFixed(0)} meters</Text>
            </View>
            
            <View style={styles.rideInfoRow}>
              <Text style={styles.rideInfoLabel}>ETA to Pickup:</Text>
              <Text style={styles.rideInfoValue}>{etaToPickup}</Text>
            </View>
          </>
        )}
        
        <View style={styles.rideInfoRow}>
          <Text style={styles.rideInfoLabel}>Fare:</Text>
          <Text style={styles.rideInfoValue}>${ride.fare}</Text>
        </View>
        
        <View style={styles.rideInfoRow}>
          <Text style={styles.rideInfoLabel}>Status:</Text>
          <Text style={styles.rideInfoValue}>
            {driverReachedPickup ? (rideStarted ? 'Ride in Progress' : 'Waiting for OTP') : 'Heading to Pickup'}
          </Text>
        </View>
      </View>
      
      {/* Complete Ride Button (only show after ride has started) */}
      {rideStarted && (
        <TouchableOpacity
          style={styles.completeButton}
          onPress={() => setShowCompleteModal(true)}
        >
          <Text style={styles.completeButtonText}>Complete Ride</Text>
        </TouchableOpacity>
      )}
      
      {/* OTP Verification Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showOtpModal}
        onRequestClose={() => setShowOtpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Enter OTP</Text>
            <Text style={styles.modalMessage}>
              Please enter the OTP provided by the customer to start the ride
            </Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder="Enter OTP"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={6}
            />
            
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowOtpModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={verifyOtp}
              >
                <Text style={styles.confirmButtonText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Complete Ride Confirmation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCompleteModal}
        onRequestClose={() => setShowCompleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Complete Ride</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to complete this ride?
            </Text>
            
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCompleteModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={completeRide}
              >
                <Text style={styles.confirmButtonText}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugText: {
    marginTop: 10,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#4caf50',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  map: {
    flex: 1,
  },
  rideInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    margin: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rideInfoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  rideInfoLabel: {
    fontWeight: 'bold',
    width: 120,
    color: '#555',
  },
  rideInfoValue: {
    flex: 1,
    color: '#333',
  },
  completeButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 15,
    borderRadius: 10,
    margin: 15,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  modalMessage: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    color: '#555',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 5,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#4caf50',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  otpInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 20,
    fontSize: 18,
    textAlign: 'center',
  },
});

export default ActiveRideScreen;