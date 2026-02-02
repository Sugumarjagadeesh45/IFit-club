// src/RideHistoryScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RideHistoryScreenProps {
  navigation: any;
}

interface Ride {
  rideId: string;
  userName: string;
  userMobile: string;
  pickup: {
    address: string;
    lat: number;
    lng: number;
  };
  drop: {
    address: string;
    lat: number;
    lng: number;
  };
  fare: number;
  distance: number;
  status: string;
  startTime: string;
  endTime?: string;
  rating?: number;
  paymentMethod: string;
}

const RideHistoryScreen: React.FC<RideHistoryScreenProps> = ({ navigation }) => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalRides: 0,
    totalEarnings: 0,
    averageRating: 0,
  });

  useEffect(() => {
    fetchRideHistory();
  }, []);

  const fetchRideHistory = async () => {
    try {
      const driverInfoStr = await AsyncStorage.getItem('driverInfo');

      if (!driverInfoStr) {
        Alert.alert('Error', 'Authentication required');
        navigation.goBack();
        return;
      }

      // Since backend doesn't have /drivers/{id}/rides endpoint yet,
      // we show empty state. When backend adds the endpoint, this will work automatically.
      setRides([]);
      setStats({
        totalRides: 0,
        totalEarnings: 0,
        averageRating: 0,
      });
    } catch (error: any) {
      console.error('Error loading ride history:', error);
      Alert.alert('Error', 'Failed to load ride history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRideHistory();
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return '#27ae60';
      case 'cancelled':
        return '#e74c3c';
      case 'ongoing':
        return '#3498db';
      default:
        return '#95a5a6';
    }
  };

  const RideCard = ({ ride }: { ride: Ride }) => (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => {
        // Could navigate to ride details screen
        Alert.alert('Ride Details', `Ride ID: ${ride.rideId}\nStatus: ${ride.status}`);
      }}
    >
      <View style={styles.rideHeader}>
        <View style={styles.rideIdContainer}>
          <MaterialIcons name="local-taxi" size={18} color="#2ecc71" />
          <Text style={styles.rideId}>{ride.rideId}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(ride.status)}20` }]}>
          <Text style={[styles.statusText, { color: getStatusColor(ride.status) }]}>
            {ride.status}
          </Text>
        </View>
      </View>

      <View style={styles.userInfo}>
        <MaterialIcons name="person" size={16} color="#7f8c8d" />
        <Text style={styles.userName}>{ride.userName}</Text>
        <Text style={styles.userMobile}> • {ride.userMobile}</Text>
      </View>

      <View style={styles.locationContainer}>
        <View style={styles.locationItem}>
          <MaterialIcons name="trip-origin" size={16} color="#3498db" />
          <Text style={styles.locationText} numberOfLines={1}>
            {ride.pickup.address}
          </Text>
        </View>
        <View style={styles.locationDivider} />
        <View style={styles.locationItem}>
          <MaterialIcons name="location-on" size={16} color="#e74c3c" />
          <Text style={styles.locationText} numberOfLines={1}>
            {ride.drop.address}
          </Text>
        </View>
      </View>

      <View style={styles.rideFooter}>
        <View style={styles.rideInfoItem}>
          <MaterialIcons name="access-time" size={14} color="#95a5a6" />
          <Text style={styles.rideInfoText}>{formatDate(ride.startTime)}</Text>
        </View>
        <View style={styles.rideInfoItem}>
          <MaterialIcons name="straighten" size={14} color="#95a5a6" />
          <Text style={styles.rideInfoText}>{ride.distance.toFixed(2)} km</Text>
        </View>
        {ride.rating && (
          <View style={styles.rideInfoItem}>
            <MaterialIcons name="star" size={14} color="#f39c12" />
            <Text style={styles.rideInfoText}>{ride.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.fare}>{formatCurrency(ride.fare)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
        <Text style={styles.loadingText}>Loading ride history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#2ecc71', '#27ae60', '#229954']}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride History</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2ecc71']} />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialIcons name="list" size={24} color="#3498db" />
            <Text style={styles.statValue}>{stats.totalRides}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="currency-rupee" size={24} color="#27ae60" />
            <Text style={styles.statValue}>{formatCurrency(stats.totalEarnings)}</Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="star" size={24} color="#f39c12" />
            <Text style={styles.statValue}>{stats.averageRating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
          </View>
        </View>

        {/* Rides List */}
        <View style={styles.ridesSection}>
          <Text style={styles.sectionTitle}>All Rides</Text>

          {rides.length > 0 ? (
            rides.map((ride) => <RideCard key={ride.rideId} ride={ride} />)
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="history" size={60} color="#bdc3c7" />
              <Text style={styles.emptyStateText}>No rides yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start accepting rides to see your history here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 4,
    textAlign: 'center',
  },
  ridesSection: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  rideCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rideId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginLeft: 6,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
    marginLeft: 6,
  },
  userMobile: {
    fontSize: 13,
    color: '#7f8c8d',
  },
  locationContainer: {
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#7f8c8d',
    marginLeft: 8,
    flex: 1,
  },
  locationDivider: {
    width: 1,
    height: 8,
    backgroundColor: '#bdc3c7',
    marginLeft: 7,
    marginVertical: 2,
  },
  rideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  rideInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  rideInfoText: {
    fontSize: 12,
    color: '#95a5a6',
    marginLeft: 4,
  },
  fare: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#27ae60',
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#7f8c8d',
    marginTop: 15,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#95a5a6',
    marginTop: 5,
    textAlign: 'center',
  },
});

export default RideHistoryScreen;
