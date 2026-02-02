// src/ProfileScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProfileScreenProps {
  navigation: any;
}

interface DriverProfile {
  driverId: string;
  name: string;
  phone: string;
  email?: string;
  vehicleName?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
  workingHours?: '12' | '24';
  profilePicture?: string;
  wallet?: number;
  rating?: number;
  totalRides?: number;
  address?: string;
  dateOfBirth?: string;
  emergencyContact?: string;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editableName, setEditableName] = useState('');
  const [editableEmail, setEditableEmail] = useState('');
  const [editableWorkingHours, setEditableWorkingHours] = useState<'12' | '24'>('12');
  const [editableAddress, setEditableAddress] = useState('');
  const [editableEmergencyContact, setEditableEmergencyContact] = useState('');

  // Load profile data on mount
  useEffect(() => {
    loadProfileData();
  }, []);

  // ✅ FIX: Reload profile data when screen comes into focus (for real-time wallet updates)
  useFocusEffect(
    useCallback(() => {
      console.log('📱 ProfileScreen focused - reloading profile data');
      loadProfileData();
    }, [])
  );

  const loadProfileData = async () => {
    try {
      setLoading(true);
      const driverInfoStr = await AsyncStorage.getItem('driverInfo');

      if (!driverInfoStr) {
        Alert.alert('Error', 'Authentication required');
        navigation.goBack();
        return;
      }

      const driverInfo = JSON.parse(driverInfoStr);
      setProfile(driverInfo);

      // Set editable fields
      setEditableName(driverInfo.name || '');
      setEditableEmail(driverInfo.email || '');
      setEditableWorkingHours(driverInfo.workingHours || '12');
      setEditableAddress(driverInfo.address || '');
      setEditableEmergencyContact(driverInfo.emergencyContact || '');
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validation
      if (!editableName.trim()) {
        Alert.alert('Error', 'Name cannot be empty');
        return;
      }

      // Update profile
      const updatedProfile = {
        ...profile,
        name: editableName,
        email: editableEmail,
        workingHours: editableWorkingHours,
        address: editableAddress,
        emergencyContact: editableEmergencyContact,
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem('driverInfo', JSON.stringify(updatedProfile));
      setProfile(updatedProfile);
      setEditing(false);

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset editable fields
    setEditableName(profile?.name || '');
    setEditableEmail(profile?.email || '');
    setEditableWorkingHours(profile?.workingHours || '12');
    setEditableAddress(profile?.address || '');
    setEditableEmergencyContact(profile?.emergencyContact || '');
    setEditing(false);
  };

  const InfoField = ({
    icon,
    label,
    value,
    editable = false,
    locked = false,
    onChangeText,
    keyboardType = 'default',
  }: any) => (
    <View style={styles.infoField}>
      <View style={styles.fieldHeader}>
        <MaterialIcons name={icon} size={20} color="#7f8c8d" />
        <Text style={styles.fieldLabel}>{label}</Text>
        {locked && <MaterialIcons name="lock" size={16} color="#e74c3c" />}
      </View>
      <TextInput
        style={[
          styles.fieldValue,
          editing && editable && styles.fieldValueEditable,
          locked && styles.fieldValueLocked,
        ]}
        value={value}
        onChangeText={onChangeText}
        editable={editing && editable && !locked}
        keyboardType={keyboardType}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
        <Text style={styles.loadingText}>Loading profile...</Text>
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
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => (editing ? handleSave() : setEditing(true))}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons
              name={editing ? 'save' : 'edit'}
              size={24}
              color="#fff"
            />
          )}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Picture Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            {profile?.profilePicture ? (
              <Image
                source={{ uri: profile.profilePicture }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <MaterialIcons name="person" size={60} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.profileName}>{profile?.name}</Text>
          <Text style={styles.profileId}>ID: {profile?.driverId}</Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialIcons name="star" size={24} color="#f39c12" />
            <Text style={styles.statValue}>{profile?.rating?.toFixed(1) || '0.0'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="local-taxi" size={24} color="#3498db" />
            <Text style={styles.statValue}>{profile?.totalRides || 0}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="account-balance-wallet" size={24} color="#27ae60" />
            <Text style={styles.statValue}>₹{profile?.wallet || 0}</Text>
            <Text style={styles.statLabel}>Wallet</Text>
          </View>
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <InfoField
            icon="person"
            label="Full Name"
            value={editableName}
            editable={true}
            onChangeText={setEditableName}
          />

          <InfoField
            icon="phone"
            label="Mobile Number"
            value={profile?.phone || ''}
            locked={true}
          />

          <InfoField
            icon="email"
            label="Email Address"
            value={editableEmail}
            editable={true}
            onChangeText={setEditableEmail}
            keyboardType="email-address"
          />

          <InfoField
            icon="home"
            label="Address"
            value={editableAddress}
            editable={true}
            onChangeText={setEditableAddress}
          />

          <InfoField
            icon="contact-phone"
            label="Emergency Contact"
            value={editableEmergencyContact}
            editable={true}
            onChangeText={setEditableEmergencyContact}
            keyboardType="phone-pad"
          />
        </View>

        {/* Vehicle Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Information</Text>

          <InfoField
            icon="directions-car"
            label="Vehicle Name"
            value={profile?.vehicleName || 'N/A'}
            locked={true}
          />

          <InfoField
            icon="category"
            label="Vehicle Type"
            value={profile?.vehicleType || 'N/A'}
            locked={true}
          />

          <InfoField
            icon="confirmation-number"
            label="Vehicle Number"
            value={profile?.vehicleNumber || 'N/A'}
            locked={true}
          />

          <InfoField
            icon="badge"
            label="License Number"
            value={profile?.licenseNumber || 'N/A'}
            locked={true}
          />
        </View>

        {/* Work Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Settings</Text>

          <View style={styles.infoField}>
            <View style={styles.fieldHeader}>
              <MaterialIcons name="access-time" size={20} color="#7f8c8d" />
              <Text style={styles.fieldLabel}>Working Hours</Text>
            </View>
            <View style={styles.workingHoursContainer}>
              <TouchableOpacity
                style={[
                  styles.workingHoursButton,
                  editableWorkingHours === '12' && styles.workingHoursButtonActive,
                  !editing && styles.workingHoursButtonDisabled,
                ]}
                onPress={() => editing && setEditableWorkingHours('12')}
                disabled={!editing}
              >
                <Text
                  style={[
                    styles.workingHoursText,
                    editableWorkingHours === '12' && styles.workingHoursTextActive,
                  ]}
                >
                  12 Hours
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.workingHoursButton,
                  editableWorkingHours === '24' && styles.workingHoursButtonActive,
                  !editing && styles.workingHoursButtonDisabled,
                ]}
                onPress={() => editing && setEditableWorkingHours('24')}
                disabled={!editing}
              >
                <Text
                  style={[
                    styles.workingHoursText,
                    editableWorkingHours === '24' && styles.workingHoursTextActive,
                  ]}
                >
                  24 Hours
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {editing && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving}
            >
              <LinearGradient
                colors={['#2ecc71', '#27ae60']}
                style={styles.saveButtonGradient}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="save" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 30 }} />
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
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
  profileId: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 20,
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
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  infoField: {
    marginBottom: 15,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#7f8c8d',
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  fieldValue: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '500',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  fieldValueEditable: {
    backgroundColor: '#fff',
    borderColor: '#2ecc71',
  },
  fieldValueLocked: {
    backgroundColor: '#ecf0f1',
    color: '#95a5a6',
  },
  workingHoursContainer: {
    flexDirection: 'row',
    marginTop: 10,
  },
  workingHoursButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e9ecef',
    marginHorizontal: 5,
    alignItems: 'center',
  },
  workingHoursButtonActive: {
    borderColor: '#2ecc71',
    backgroundColor: '#e8f8f5',
  },
  workingHoursButtonDisabled: {
    opacity: 0.6,
  },
  workingHoursText: {
    fontSize: 15,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  workingHoursTextActive: {
    color: '#2ecc71',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e74c3c',
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e74c3c',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
});

export default ProfileScreen;
