// src/MenuScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiConfig';

interface MenuScreenProps {
  navigation: any;
  route: any;
}

interface DriverInfo {
  driverId: string;
  name: string;
  phone: string;
  email?: string;
  profilePicture?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  wallet?: number; // Wallet balance from login response
  onlineStatus?: 'online' | 'offline'; // Online/Offline status from backend
}

const MenuScreen: React.FC<MenuScreenProps> = ({ navigation, route }) => {
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [workingHoursStatus, setWorkingHoursStatus] = useState({
    active: false,
    remainingTime: '12:00:00',
    remainingSeconds: 0,
    assignedHours: 12,
  });
  const [autoStopEnabled, setAutoStopEnabled] = useState(false);
  const APP_VERSION = '1.0.0';

  useEffect(() => {
    loadDriverData();
  }, []);

  // ✅ Real-time timer update (every second)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (workingHoursStatus.active && workingHoursStatus.remainingSeconds > 0) {
      interval = setInterval(() => {
        setWorkingHoursStatus((prev) => {
          const newSeconds = prev.remainingSeconds - 1;
          if (newSeconds <= 0) {
            return { ...prev, active: false, remainingSeconds: 0, remainingTime: '00:00:00' };
          }

          const hours = Math.floor(newSeconds / 3600);
          const minutes = Math.floor((newSeconds % 3600) / 60);
          const seconds = newSeconds % 60;
          const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

          return {
            ...prev,
            remainingSeconds: newSeconds,
            remainingTime: formatted,
          };
        });
      }, 1000); // Update every second
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [workingHoursStatus.active, workingHoursStatus.remainingSeconds]);

  const loadDriverData = async () => {
    try {
      setLoading(true);

      // Load driver info from AsyncStorage
      const driverInfoStr = await AsyncStorage.getItem('driverInfo');

      if (driverInfoStr) {
        const info = JSON.parse(driverInfoStr);
        setDriverInfo(info);

        // Use wallet balance from login response stored in AsyncStorage
        if (info.wallet !== undefined) {
          setWalletBalance(info.wallet);
        }

        // Fetch working hours status
        try {
          const token = await AsyncStorage.getItem('authToken');
          const timestamp = new Date().getTime();
          const response = await fetch(`${API_BASE}/drivers/working-hours/status/${info.driverId}?t=${timestamp}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          const result = await response.json();

          if (result.success && result.timerActive) {
            setWorkingHoursStatus({
              active: true,
              remainingTime: result.formattedTime || '12:00:00',
              remainingSeconds: result.remainingSeconds || 43200, // Default 12 hours
              assignedHours: result.assignedHours || 12,
            });
          }
        } catch (error) {
          console.log('Working hours status not available:', error);
        }
      }
    } catch (error) {
      console.error('Error loading driver data:', error);
      Alert.alert('Error', 'Failed to load driver information');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // WORKING HOURS CONTROL HANDLERS
  // ========================================

  const handleAutoStop = async () => {
    Alert.alert(
      'Auto-Stop',
      'This will automatically stop your working hours and set you OFFLINE when the timer reaches 00:00:00.\n\nExtra Half Time and Extra Full Time buttons will be disabled.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable',
          onPress: async () => {
            try {
              setAutoStopEnabled(true);
              Alert.alert('✅ Auto-Stop Enabled', 'You will automatically go OFFLINE when working hours end.\n\nExtra time buttons are now disabled.');
            } catch (error) {
              Alert.alert('Error', 'Failed to enable auto-stop');
            }
          },
        },
      ]
    );
  };

  const handleExtraHalfTime = async () => {
    if (!driverInfo?.driverId) return;
    if (autoStopEnabled) {
      Alert.alert('⚠️ Auto-Stop Enabled', 'Extra time buttons are disabled when Auto-Stop is enabled.');
      return;
    }

    const assignedHours = workingHoursStatus.assignedHours || 12;
    const additionalSeconds = assignedHours === 12 ? 21599 : 43199; // 05:59:59 for 12h, 11:59:59 for 24h
    const additionalTime = assignedHours === 12 ? '05:59:59' : '11:59:59';
    const debitAmount = 50;

    Alert.alert(
      'Add Extra Half Time',
      `Add +${additionalTime} to your working hours?\n\n₹${debitAmount} will be debited from your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add Time',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              const response = await fetch(`${API_BASE}/drivers/working-hours/extend`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  driverId: driverInfo.driverId,
                  additionalSeconds: additionalSeconds,
                  debitAmount: debitAmount,
                }),
              });
              const result = await response.json();

              if (result.success) {
                // Update local state
                setWorkingHoursStatus((prev) => ({
                  ...prev,
                  remainingSeconds: prev.remainingSeconds + additionalSeconds,
                  remainingTime: formatTime(prev.remainingSeconds + additionalSeconds),
                }));

                // Update wallet balance
                if (result.newWalletBalance !== undefined) {
                  setWalletBalance(result.newWalletBalance);
                  // Update AsyncStorage
                  const driverInfoStr = await AsyncStorage.getItem('driverInfo');
                  if (driverInfoStr) {
                    const info = JSON.parse(driverInfoStr);
                    info.wallet = result.newWalletBalance;
                    await AsyncStorage.setItem('driverInfo', JSON.stringify(info));
                  }
                }

                Alert.alert('✅ Success', `Added ${additionalTime} to your working hours!\n\n₹${debitAmount} debited\nNew Balance: ₹${result.newWalletBalance || 'N/A'}`);
                loadDriverData(); // Refresh data
              } else {
                Alert.alert('❌ Failed', result.message || 'Could not add extra time');
              }
            } catch (error) {
              console.error('Error adding extra half time:', error);
              Alert.alert('Error', 'Failed to add extra time');
            }
          },
        },
      ]
    );
  };

  const handleExtraFullTime = async () => {
    if (!driverInfo?.driverId) return;
    if (autoStopEnabled) {
      Alert.alert('⚠️ Auto-Stop Enabled', 'Extra time buttons are disabled when Auto-Stop is enabled.');
      return;
    }

    const assignedHours = workingHoursStatus.assignedHours || 12;
    const additionalSeconds = assignedHours === 12 ? 43199 : 86399; // 11:59:59 for 12h, 23:59:59 for 24h
    const additionalTime = assignedHours === 12 ? '11:59:59' : '23:59:59';
    const debitAmount = 100;

    Alert.alert(
      'Add Extra Full Time',
      `Add +${additionalTime} to your working hours?\n\n₹${debitAmount} will be debited from your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add Time',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              const response = await fetch(`${API_BASE}/drivers/working-hours/extend`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  driverId: driverInfo.driverId,
                  additionalSeconds: additionalSeconds,
                  debitAmount: debitAmount,
                }),
              });
              const result = await response.json();

              if (result.success) {
                // Update local state
                setWorkingHoursStatus((prev) => ({
                  ...prev,
                  remainingSeconds: prev.remainingSeconds + additionalSeconds,
                  remainingTime: formatTime(prev.remainingSeconds + additionalSeconds),
                }));

                // Update wallet balance
                if (result.newWalletBalance !== undefined) {
                  setWalletBalance(result.newWalletBalance);
                  // Update AsyncStorage
                  const driverInfoStr = await AsyncStorage.getItem('driverInfo');
                  if (driverInfoStr) {
                    const info = JSON.parse(driverInfoStr);
                    info.wallet = result.newWalletBalance;
                    await AsyncStorage.setItem('driverInfo', JSON.stringify(info));
                  }
                }

                Alert.alert('✅ Success', `Added ${additionalTime} to your working hours!\n\n₹${debitAmount} debited\nNew Balance: ₹${result.newWalletBalance || 'N/A'}`);
                loadDriverData(); // Refresh data
              } else {
                Alert.alert('❌ Failed', result.message || 'Could not add extra time');
              }
            } catch (error) {
              console.error('Error adding extra full time:', error);
              Alert.alert('Error', 'Failed to add extra time');
            }
          },
        },
      ]
    );
  };

  // Helper function to format seconds to HH:MM:SS
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                'authToken',
                'driverInfo',
                'driverId',
                'driverName',
                'phoneNumber'
              ]);
              navigation.reset({
                index: 0,
                routes: [{ name: 'LoginScreen' }],
              });
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const MenuItem = ({ icon, iconFamily = 'MaterialIcons', title, onPress, color = '#2ecc71' }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconContainer, { backgroundColor: `${color}15` }]}>
        {iconFamily === 'MaterialIcons' ? (
          <MaterialIcons name={icon} size={24} color={color} />
        ) : (
          <FontAwesome5 name={icon} size={20} color={color} />
        )}
      </View>
      <Text style={styles.menuItemText}>{title}</Text>
      <MaterialIcons name="chevron-right" size={24} color="#bdc3c7" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
        <Text style={styles.loadingText}>Loading...</Text>
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
        <Text style={styles.headerTitle}>Menu</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            {driverInfo?.profilePicture ? (
              <Image
                source={{ uri: driverInfo.profilePicture }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <MaterialIcons name="person" size={50} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.profileName}>{driverInfo?.name || 'Driver'}</Text>
          <Text style={styles.profilePhone}>{driverInfo?.phone || 'N/A'}</Text>
          {driverInfo?.vehicleType && (
            <View style={styles.vehicleBadge}>
              <MaterialIcons name="directions-car" size={16} color="#2ecc71" />
              <Text style={styles.vehicleText}>
                {driverInfo.vehicleType}
                {driverInfo.vehicleNumber && ` - ${driverInfo.vehicleNumber}`}
              </Text>
            </View>
          )}
        </View>

        {/* Working Hours Status Banner */}
        {workingHoursStatus.active && (
          <>
            <View style={styles.workingHoursBanner}>
              <LinearGradient
                colors={['#3498db', '#2980b9']}
                style={styles.workingHoursGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.workingHoursIcon}>
                  <MaterialIcons name="access-time" size={28} color="#fff" />
                </View>
                <View style={styles.workingHoursContent}>
                  <Text style={styles.workingHoursLabel}>Working Hours Remaining</Text>
                  <Text style={styles.workingHoursTime}>{workingHoursStatus.remainingTime}</Text>
                </View>
                <View style={styles.workingHoursBadge}>
                  <Text style={styles.workingHoursBadgeText}>{workingHoursStatus.assignedHours}h</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Working Hours Control Buttons */}
            <View style={styles.controlButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  styles.autoStopButton,
                  autoStopEnabled && styles.autoStopButtonActive,
                ]}
                onPress={handleAutoStop}
              >
                <MaterialIcons
                  name={autoStopEnabled ? 'check-circle' : 'stop-circle'}
                  size={20}
                  color={autoStopEnabled ? '#fff' : '#e74c3c'}
                />
                <Text
                  style={[
                    styles.controlButtonText,
                    autoStopEnabled && styles.autoStopButtonActiveText,
                  ]}
                >
                  {autoStopEnabled ? '✓ Auto-Stop' : 'Auto-Stop'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlButton,
                  styles.halfTimeButton,
                  autoStopEnabled && styles.disabledButton,
                ]}
                onPress={handleExtraHalfTime}
                disabled={autoStopEnabled}
              >
                <MaterialIcons
                  name="update"
                  size={20}
                  color={autoStopEnabled ? '#999' : '#f39c12'}
                />
                <Text
                  style={[
                    styles.controlButtonText,
                    autoStopEnabled && styles.disabledButtonText,
                  ]}
                >
                  {workingHoursStatus.assignedHours === 12 ? '+05:59:59' : '+11:59:59'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlButton,
                  styles.fullTimeButton,
                  autoStopEnabled && styles.disabledButton,
                ]}
                onPress={handleExtraFullTime}
                disabled={autoStopEnabled}
              >
                <MaterialIcons
                  name="add-circle"
                  size={20}
                  color={autoStopEnabled ? '#999' : '#27ae60'}
                />
                <Text
                  style={[
                    styles.controlButtonText,
                    autoStopEnabled && styles.disabledButtonText,
                  ]}
                >
                  {workingHoursStatus.assignedHours === 12 ? '+11:59:59' : '+23:59:59'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <MenuItem
            icon="person"
            title="Profile"
            onPress={() => navigation.navigate('Profile')}
            color="#2ecc71"
          />

          <MenuItem
            icon="account-balance-wallet"
            title={`Wallet - ₹${walletBalance.toFixed(2)}`}
            onPress={() => navigation.navigate('Wallet')}
            color="#f39c12"
          />

          <MenuItem
            icon="history"
            title="Ride History"
            onPress={() => navigation.navigate('RideHistory')}
            color="#3498db"
          />

          <MenuItem
            icon="settings"
            title="Settings"
            onPress={() => navigation.navigate('Settings')}
            color="#95a5a6"
          />

          <MenuItem
            icon="share"
            iconFamily="FontAwesome5"
            title="Refer & Earn"
            onPress={() => navigation.navigate('Refer')}
            color="#2ecc71"
          />

          <MenuItem
            icon="logout"
            title="Logout"
            onPress={handleLogout}
            color="#e74c3c"
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>App Version {APP_VERSION}</Text>
          <Text style={styles.footerCopyright}>© 2025 Eazy Go Driver</Text>
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
  profileSection: {
    backgroundColor: '#fff',
    padding: 30,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  profileImageContainer: {
    marginBottom: 15,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#2ecc71',
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2ecc71',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#27ae60',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },
  profilePhone: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 10,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f8f5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 5,
  },
  vehicleText: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '600',
    marginLeft: 5,
  },
  menuSection: {
    paddingHorizontal: 15,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#95a5a6',
    marginBottom: 5,
  },
  footerCopyright: {
    fontSize: 13,
    color: '#bdc3c7',
  },
  workingHoursBanner: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  workingHoursGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  workingHoursIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workingHoursContent: {
    flex: 1,
  },
  workingHoursLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  workingHoursTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
  workingHoursBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  workingHoursBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // ========================================
  // CONTROL BUTTONS STYLES
  // ========================================
  controlButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 20,
    gap: 10,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  autoStopButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e74c3c',
  },
  halfTimeButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#f39c12',
  },
  fullTimeButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#27ae60',
  },
  controlButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2c3e50',
  },
  autoStopButtonActive: {
    backgroundColor: '#e74c3c',
    borderColor: '#c0392b',
  },
  autoStopButtonActiveText: {
    color: '#fff',
  },
  disabledButton: {
    backgroundColor: '#f5f5f5',
    borderColor: '#d0d0d0',
    opacity: 0.6,
  },
  disabledButtonText: {
    color: '#999',
  },
});

export default MenuScreen;
