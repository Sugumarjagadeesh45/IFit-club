
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  StatusBar,
  Linking,
} from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome';
import { RootStackParamList } from '../App';

import { API_BASE } from './apiConfig';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const auth = getAuth(getApp());

const LoginScreen = () => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAvailable, setResendAvailable] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const restoreVerification = async () => {
      try {
        const storedVerificationId = await AsyncStorage.getItem('verificationId');
        const storedPhone = await AsyncStorage.getItem('phoneNumber');
        if (storedVerificationId && storedPhone) {
          setVerificationId(storedVerificationId);
          setMobileNumber(storedPhone);
          setOtpSent(true);
          Alert.alert('Session Restored', `Please enter OTP sent to ${storedPhone}`);
        }
      } catch (error) {
        console.log('Restore session error:', error);
      }
    };
    restoreVerification();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      setResendAvailable(false);
      timer = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            setResendAvailable(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const isValidPhoneNumber = (phone: string) => /^[6-9]\d{9}$/.test(phone);
  const cleanPhoneNumber = (phone: string) => phone.replace('+91', '').replace(/\D/g, '');

  // ---------------------------------------------------------
  // 1️⃣ SEND OTP FUNCTION (Fixed Endpoint)
  // ---------------------------------------------------------
  const sendOTP = async () => {
    const phone = mobileNumber.trim();
    
    if (!phone) {
      Alert.alert('Error', 'Please enter your mobile number.');
      return;
    }
    
    if (!isValidPhoneNumber(phone)) {
      Alert.alert('Error', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    
    try {
      setLoading(true);
      const cleanPhone = cleanPhoneNumber(phone);
      console.log(`📞 Checking driver: ${cleanPhone}`);
      
      try {
        // 🔴 FIX: Changed endpoint to /auth/request-driver-otp
        // This avoids the 401 Unauthorized error in driverRoutes
        const checkResponse = await axios.post(
          `${API_BASE}/auth/request-driver-otp`, 
          { phoneNumber: cleanPhone },
          { 
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        console.log('📋 Driver check response:', checkResponse.data);
        
        if (checkResponse.data.success) {
          console.log(`✅ Driver found: ${checkResponse.data.name}`);
          
          // Save preliminary info
          await AsyncStorage.multiSet([
            ['driverId', checkResponse.data.driverId || ''],
            ['driverName', checkResponse.data.name || ''],
            ['phoneNumber', cleanPhone],
          ]);
          
          // Send Firebase OTP
          console.log(`🔥 Sending Firebase OTP to: +91${cleanPhone}`);
          const confirmation = await signInWithPhoneNumber(auth, `+91${cleanPhone}`);
          
          setVerificationId(confirmation.verificationId);
          await AsyncStorage.setItem('verificationId', confirmation.verificationId);
          
          Alert.alert('OTP Sent', `OTP sent to ${phone}`);
          setOtpSent(true);
          setResendCountdown(30);
          
        } else {
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              {
                text: 'Contact Admin',
                onPress: () => {
                  const { Linking } = require('react-native');
                  Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue');
                }
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
        }

      } catch (backendError: any) {
        console.error('❌ Backend check error:', backendError.message);
        console.error('❌ Status Code:', backendError.response?.status);

        if (backendError.response?.status === 404) {
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              {
                text: 'Contact Admin',
                onPress: () => {
                  const { Linking } = require('react-native');
                  Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue');
                }
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
        } else if (backendError.response?.status === 401) {
           // This handles the specific error you were seeing
           Alert.alert('Server Config Error', 'Server returned 401. Please check backend middleware order.');
        } else {
          Alert.alert('Connection Error', 'Could not reach the driver server.');
        }
      }
      
    } catch (error: any) {
      console.error('❌ General error:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // 2️⃣ VERIFY OTP FUNCTION (Fixed Endpoint + Immediate Navigation)
  // ---------------------------------------------------------
  const verifyOTP = async () => {
    const phone = mobileNumber.trim();

    if (!code || !verificationId) {
      Alert.alert('Error', 'Please enter OTP.');
      return;
    }

    try {
      setLoading(true);
      console.log('1️⃣ Verifying Firebase OTP...');

      const credential = PhoneAuthProvider.credential(verificationId, code);
      const userCredential = await signInWithCredential(auth, credential);
      const cleanPhone = cleanPhoneNumber(phone);

      console.log(`2️⃣ Firebase Success. Getting driver data from backend...`);

      // Try both endpoints for compatibility
      let response;
      try {
        response = await axios.post(
          `${API_BASE}/auth/get-complete-driver-info`,
          { phoneNumber: cleanPhone },
          {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (err) {
        console.log('⚠️ Trying alternative endpoint...');
        response = await axios.post(
          `${API_BASE}/auth/get-driver-info`,
          { phoneNumber: cleanPhone },
          {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
      }

      if (response.data?.success) {
        const { token, driver } = response.data;

        console.log('3️⃣ Backend login successful');
        console.log('4️⃣ Storing data in AsyncStorage...');

        // Store all required data in parallel for speed
        await Promise.all([
          AsyncStorage.setItem('authToken', token),
          AsyncStorage.setItem('driverInfo', JSON.stringify(driver)),
          AsyncStorage.setItem('phoneNumber', cleanPhone),
          AsyncStorage.setItem('driverId', driver.driverId),
          AsyncStorage.setItem('driverName', driver.name),
          AsyncStorage.setItem('driverVehicleType', (driver.vehicleType || 'taxi').toLowerCase()),
          AsyncStorage.setItem('vehicleNumber', driver.vehicleNumber || ''),
          AsyncStorage.setItem('walletBalance', driver.wallet.toString()),
          AsyncStorage.removeItem('verificationId') // Clean up
        ]);

        console.log('5️⃣ Data stored successfully');
        setVerificationId(null);

        // CRITICAL: Stop loading BEFORE navigation
        setLoading(false);

        console.log('6️⃣ Navigating to Screen1...');

        // IMMEDIATE navigation with replace (no back button)
        // Pass minimal but essential data via params
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Screen1',
            params: {
              driverId: driver.driverId,
              driverName: driver.name,
              latitude: driver.location?.coordinates?.[1] || 0,
              longitude: driver.location?.coordinates?.[0] || 0,
              vehicleType: (driver.vehicleType || 'taxi').toLowerCase()
            }
          }],
        });

        console.log('7️⃣ Navigation completed');

      } else {
        throw new Error(response.data?.message || 'Login failed on server');
      }

    } catch (error: any) {
      console.error('❌ Verification error:', error);
      setLoading(false);

      if (error.code === 'auth/invalid-verification-code') {
        Alert.alert('Invalid OTP', 'The code is incorrect. Please try again.');
      } else if (error.message?.includes('Login failed')) {
        Alert.alert('Login Failed', 'Could not fetch driver details from server.');
      } else {
        Alert.alert('Error', 'Authentication failed. Please try again.');
      }
    }
  };

  return (
    <LinearGradient colors={['#2ecc71', '#27ae60', '#229954']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Icon name="taxi" size={60} color="#fff" />
            </View>
            <Text style={styles.appName}>EazyGo Driver</Text>
            <Text style={styles.tagline}>Start Your Journey</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Login to start earning</Text>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <View style={styles.iconContainer}>
                  <Icon name="phone" size={18} color="#2ecc71" />
                </View>
                <View style={styles.inputContent}>
                  <Text style={styles.inputLabel}>Mobile Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10-digit number"
                    placeholderTextColor="#b0b0b0"
                    value={mobileNumber}
                    onChangeText={(text) => setMobileNumber(text.replace(/[^0-9]/g, ''))}
                    keyboardType="phone-pad"
                    maxLength={10}
                    editable={!loading}
                  />
                </View>
              </View>

              {otpSent && (
                <View style={styles.inputWrapper}>
                  <View style={styles.iconContainer}>
                    <Icon name="lock" size={18} color="#2ecc71" />
                  </View>
                  <View style={styles.inputContent}>
                    <Text style={styles.inputLabel}>OTP Code</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="6-digit code"
                      placeholderTextColor="#b0b0b0"
                      value={code}
                      onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!loading}
                    />
                  </View>
                </View>
              )}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={otpSent ? verifyOTP : sendOTP}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? ['#95a5a6', '#7f8c8d'] : ['#2ecc71', '#27ae60']}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>{otpSent ? 'Verify OTP' : 'Send OTP'}</Text>
                      <Icon name="arrow-right" size={18} color="#fff" style={styles.buttonIcon} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {otpSent && (
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={sendOTP}
                  disabled={loading || !resendAvailable}
                >
                  <Text style={[styles.resendText, !resendAvailable && styles.resendDisabledText]}>
                    {resendAvailable ? '🔄 Resend OTP' : `⏱️ Resend in ${resendCountdown}s`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Secure & Verified Login</Text>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  contentContainer: {
    width: width * 0.9,
    maxWidth: 420,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginTop: 10,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 5,
    fontWeight: '400',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 25,
    padding: 28,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 30,
    fontWeight: '400',
  },
  inputContainer: {
    marginBottom: 25,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#e8f8f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '500',
    padding: 0,
  },
  buttonContainer: {
    marginTop: 10,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonGradient: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonIcon: {
    marginLeft: 8,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    color: '#2ecc71',
    fontSize: 15,
    fontWeight: '600',
  },
  resendDisabledText: {
    color: '#95a5a6',
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default LoginScreen;











// import React, { useState, useRef, useEffect } from 'react';
// import {
//   View,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   StyleSheet,
//   KeyboardAvoidingView,
//   Platform,
//   Alert,
//   ActivityIndicator,
//   Dimensions,
//   Animated,
//   StatusBar,
//   Linking,
// } from 'react-native';
// import { getApp } from '@react-native-firebase/app';
// import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
// import { useNavigation } from '@react-navigation/native';
// import { NativeStackNavigationProp } from '@react-navigation/native-stack';
// import axios from 'axios';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import LinearGradient from 'react-native-linear-gradient';
// import Icon from 'react-native-vector-icons/FontAwesome';
// import { RootStackParamList } from '../App';

// const { width, height } = Dimensions.get('window');

// type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// // Initialize Firebase with modular API
// const auth = getAuth(getApp());

// const getApiUrl = () => {
//   // 1. If running on Android Emulator
//   if (Platform.OS === 'android') {
//     return 'http://10.0.2.2:5001/api'; 
//   }
  
//   // 2. If running on iOS Simulator
//   if (Platform.OS === 'ios') {
//     return 'http://localhost:5001/api';
//   }

//   // 3. If running on a Physical Device (Update this with your PC's IP)
//   // return 'http://192.168.1.XX:5001/api'; 
  
//   return 'http://10.0.2.2:5001/api'; // Default fallback
// };

// const API_URL = getApiUrl();

// const LoginScreen = () => {
//   const [mobileNumber, setMobileNumber] = useState('');
//   const [code, setCode] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [resendAvailable, setResendAvailable] = useState(true);
//   const [resendCountdown, setResendCountdown] = useState(0);
//   const [otpSent, setOtpSent] = useState(false);
//   const [verificationId, setVerificationId] = useState<string | null>(null);
//   const navigation = useNavigation<NavigationProp>();
  
//   // Animation values
//   const fadeAnim = useRef(new Animated.Value(0)).current;
//   const slideAnim = useRef(new Animated.Value(50)).current;

//   useEffect(() => {
//     // Start animations when component mounts
//     Animated.parallel([
//       Animated.timing(fadeAnim, {
//         toValue: 1,
//         duration: 1000,
//         useNativeDriver: true,
//       }),
//       Animated.timing(slideAnim, {
//         toValue: 0,
//         duration: 800,
//         useNativeDriver: true,
//       }),
//     ]).start();
//   }, []);

//   useEffect(() => {
//     const restoreVerification = async () => {
//       try {
//         const storedVerificationId = await AsyncStorage.getItem('verificationId');
//         const storedPhone = await AsyncStorage.getItem('phoneNumber');

//         if (storedVerificationId && storedPhone) {
//           setVerificationId(storedVerificationId);
//           setMobileNumber(storedPhone);
//           setOtpSent(true);

//           Alert.alert(
//             'Session Restored',
//             `Please enter OTP sent to ${storedPhone}`
//           );
//         }
//       } catch (error) {
//         console.log('Restore session error:', error);
//       }
//     };

//     restoreVerification();
//   }, []);

//   useEffect(() => {
//     let timer: NodeJS.Timeout;
//     if (resendCountdown > 0) {
//       setResendAvailable(false);
//       timer = setInterval(() => {
//         setResendCountdown((prev) => {
//           if (prev <= 1) {
//             setResendAvailable(true);
//             clearInterval(timer);
//             return 0;
//           }
//           return prev - 1;
//         });
//       }, 1000);
//     }
//     return () => clearInterval(timer);
//   }, [resendCountdown]);

//   const isValidPhoneNumber = (phone: string) => /^[6-9]\d{9}$/.test(phone);

//   // Function to clean phone number
//   const cleanPhoneNumber = (phone: string) => {
//     return phone.replace('+91', '').replace(/\D/g, '');
//   };

//   // ✅ FIXED: Send OTP function
//   const sendOTP = async () => {
//     const phone = mobileNumber.trim();
    
//     if (!phone) {
//       Alert.alert('Error', 'Please enter your mobile number.');
//       return;
//     }
    
//     if (!isValidPhoneNumber(phone)) {
//       Alert.alert('Error', 'Please enter a valid 10-digit Indian mobile number.');
//       return;
//     }
    
//     try {
//       setLoading(true);
//       console.log(`📞 Checking driver: ${phone}`);
//       console.log(`🌐 API URL: ${API_URL}`);
      
//       // Clean phone number for database query
//       const cleanPhone = cleanPhoneNumber(phone);
      
//       try {
//         // ✅ CORRECT ENDPOINT: Check if driver exists
//         const checkResponse = await axios.post(
//           `${API_URL}/drivers/driver-verify-phone`,  // ✅ THIS IS THE CORRECT ENDPOINT
//           { phoneNumber: cleanPhone },
//           { 
//             timeout: 8000,
//             headers: {
//               'Content-Type': 'application/json',
//               'Accept': 'application/json'
//             }
//           }
//         );
        
//         console.log('📋 Driver check response:', checkResponse.data);
        
//         if (checkResponse.data.success && checkResponse.data.driver) {
//           console.log(`✅ Driver found: ${checkResponse.data.driver.driverId}`);
          
//           // Save driver info to AsyncStorage
//           await AsyncStorage.multiSet([
//             ['driverId', checkResponse.data.driver.driverId],
//             ['driverName', checkResponse.data.driver.name],
//             ['driverVehicleType', checkResponse.data.driver.vehicleType || 'taxi'],
//             ['vehicleNumber', checkResponse.data.driver.vehicleNumber || 'N/A'],
//             ['driverInfo', JSON.stringify(checkResponse.data.driver)],
//             ['phoneNumber', cleanPhone],
//           ]);
          
//           // Now send Firebase OTP
//           console.log(`🔥 Sending Firebase OTP to: +91${cleanPhone}`);
//           const formattedPhone = `+91${cleanPhone}`;
          
//           try {
//             const confirmation = await signInWithPhoneNumber(auth, formattedPhone);
            
//             setVerificationId(confirmation.verificationId);
//             await AsyncStorage.setItem('verificationId', confirmation.verificationId);
            
//             Alert.alert('OTP Sent', `OTP has been sent to ${phone}. Please check your messages.`);
//             setOtpSent(true);
//             setResendCountdown(30);
            
//           } catch (firebaseError: any) {
//             console.error('❌ Firebase OTP error:', firebaseError);
            
//             if (firebaseError.code === 'auth/invalid-phone-number') {
//               Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
//             } else if (firebaseError.code === 'auth/too-many-requests') {
//               Alert.alert('Too Many Attempts', 'Please try again later.');
//             } else {
//               Alert.alert('Error', firebaseError.message || 'Failed to send OTP. Please try again.');
//             }
//           }
          
//         } else {
//           // Driver not found
//           Alert.alert(
//             'Authentication Failed',
//             'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
//             [
//               { 
//                 text: 'Contact Admin', 
//                 onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue')
//               },
//               { text: 'OK', style: 'cancel' }
//             ]
//           );
//         }
        
//       } catch (backendError: any) {
//         console.error('❌ Backend check error:', backendError.message);
        
//         if (backendError.response?.status === 404) {
//           // Driver not found in database
//           Alert.alert(
//             'Driver Not Found',
//             'This phone number is not registered as a driver. Please contact admin.',
//             [
//               { 
//                 text: 'Contact Admin', 
//                 onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com')
//               },
//               { text: 'OK' }
//             ]
//           );
//         } else {
//           // Other backend errors
//           Alert.alert(
//             'Network Error',
//             'Cannot reach our servers. Please try again later.',
//             [{ text: 'OK' }]
//           );
//         }
//       }
      
//     } catch (error: any) {
//       console.error('❌ General error in sendOTP:', error);
//       Alert.alert('Error', 'An unexpected error occurred. Please try again.');
//     } finally {
//       setLoading(false);
//     }
//   };


  
//   // ✅ FIXED: Verify OTP function
// const verifyOTP = async () => {
//   const phone = mobileNumber.trim();
  
//   if (!code) {
//     Alert.alert('Error', 'Please enter OTP.');
//     return;
//   }

//   if (!verificationId) {
//     Alert.alert('Error', 'No OTP session found. Please request a new OTP.');
//     return;
//   }

//   try {
//     setLoading(true);
//     console.log('1️⃣ Starting OTP verification for:', phone);
    
//     // 1. Verify with Firebase
//     console.log('2️⃣ Verifying Firebase OTP...');
//     const credential = PhoneAuthProvider.credential(verificationId, code);
//     const userCredential = await signInWithCredential(auth, credential);
    
//     console.log('✅ Firebase authentication successful');
//     console.log('Firebase UID:', userCredential.user.uid);
    
//     // 2. Get complete driver data
//     const cleanPhone = cleanPhoneNumber(phone);
//     console.log(`3️⃣ Getting driver data for: ${cleanPhone}`);
//     console.log(`API URL: ${API_URL}/drivers/complete-driver-login`);
    
//     try {
//       const response = await axios.post(
//         `${API_URL}/drivers/complete-driver-login`,
//         { phoneNumber: cleanPhone },
//         { 
//           timeout: 15000,
//           headers: {
//             'Content-Type': 'application/json',
//           }
//         }
//       );

//       console.log('📋 Backend response received:', {
//         status: response.status,
//         success: response.data?.success,
//         hasToken: !!response.data?.token,
//         driverId: response.data?.driver?.driverId,
//         fullResponse: response.data
//       });

//       if (response.data?.success) {
//         const driverInfo = response.data.driver;
//         const token = response.data.token;
        
//         console.log('✅ Backend login successful:', {
//           driverId: driverInfo.driverId,
//           name: driverInfo.name,
//           tokenLength: token?.length || 0
//         });
        
//         // Save everything to AsyncStorage
//         await AsyncStorage.multiSet([
//           ['authToken', token || ''],
//           ['driverInfo', JSON.stringify(driverInfo)],
//           ['phoneNumber', cleanPhone],
//           ['firebaseUid', userCredential.user.uid],
//           ['driverId', driverInfo.driverId || ''],
//           ['driverName', driverInfo.name || ''],
//           ['driverVehicleType', driverInfo.vehicleType || 'taxi'],
//           ['vehicleNumber', driverInfo.vehicleNumber || 'N/A'],
//         ]);

//         // Verify storage
//         const storedToken = await AsyncStorage.getItem('authToken');
//         console.log('💾 Token stored successfully:', storedToken?.substring(0, 20) + '...');

//         // Clear verification session
//         await AsyncStorage.removeItem('verificationId');
//         setVerificationId(null);

//         console.log('✅ All data saved, navigating to Screen1...');
        
//         // Navigate to Screen1
//         navigation.reset({
//           index: 0,
//           routes: [
//             {
//               name: 'Screen1',
//               params: {
//                 driverInfo: driverInfo,
//               },
//             },
//           ],
//         });
        
//       } else {
//         console.error('❌ Backend response indicates failure:', response.data);
//         throw new Error(response.data?.message || 'Login failed');
//       }
      
//     } catch (backendError: any) {
//       console.error('❌ Backend API error:', {
//         message: backendError.message,
//         response: backendError.response?.data,
//         status: backendError.response?.status,
//         url: backendError.config?.url
//       });
      
//       // Try using stored driver info as fallback
//       const storedDriverInfo = await AsyncStorage.getItem('driverInfo');
      
//       if (storedDriverInfo) {
//         console.log('🔄 Using stored driver info as fallback');
//         const driverInfo = JSON.parse(storedDriverInfo);
        
//         // Create temporary token
//         const tempToken = `temp-${Date.now()}-${driverInfo.driverId}`;
        
//         await AsyncStorage.multiSet([
//           ['authToken', tempToken],
//           ['firebaseUid', userCredential.user.uid],
//         ]);

//         await AsyncStorage.removeItem('verificationId');

//         Alert.alert(
//           'Logged In (Limited Mode)',
//           'Logged in with limited functionality. Server connection issue.',
//           [
//             {
//               text: 'Continue',
//               onPress: () => {
//                 navigation.reset({
//                   index: 0,
//                   routes: [
//                     {
//                       name: 'Screen1',
//                       params: { driverInfo: driverInfo },
//                     },
//                   ],
//                 });
//               }
//             }
//           ]
//         );
//       } else {
//         Alert.alert(
//           'Login Error',
//           'Could not retrieve driver information. Please try again.',
//           [{ text: 'OK' }]
//         );
//       }
//     }
    
//   } catch (firebaseError: any) {
//     console.error('❌ Firebase verification error:', {
//       code: firebaseError.code,
//       message: firebaseError.message,
//       stack: firebaseError.stack
//     });
    
//     if (firebaseError.code === 'auth/invalid-verification-code') {
//       Alert.alert('Invalid OTP', 'The OTP you entered is incorrect. Please try again.');
//     } else if (firebaseError.code === 'auth/code-expired') {
//       Alert.alert('OTP Expired', 'The OTP has expired. Please request a new one.');
//     } else if (firebaseError.code === 'auth/too-many-requests') {
//       Alert.alert('Too Many Attempts', 'Please try again later.');
//     } else {
//       Alert.alert('Verification Failed', firebaseError.message || 'Failed to verify OTP.');
//     }
    
//     setCode('');
//   } finally {
//     setLoading(false);
//   }
// };




//   return (
//     <LinearGradient
//       colors={['#4facfe', '#00f2fe']}
//       style={styles.container}
//       start={{ x: 0, y: 0 }}
//       end={{ x: 1, y: 1 }}
//     >
//       <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
//       <KeyboardAvoidingView
//         style={styles.keyboardContainer}
//         behavior={Platform.OS === 'ios' ? 'padding' : undefined}
//         keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
//       >
//         <Animated.View 
//           style={[
//             styles.contentContainer, 
//             { 
//               opacity: fadeAnim, 
//               transform: [{ translateY: slideAnim }] 
//             } 
//           ]}
//         >
//           <View style={styles.header}>
//             <View style={styles.logoContainer}>
//               <Icon name="taxi" size={80} color="#fff" />
//               <Text style={styles.appName}>EazyGo Driver</Text>
//             </View>
//           </View>
          
//           <View style={styles.card}>
//             <Text style={styles.title}>Welcome Back!</Text>
//             <Text style={styles.subtitle}>Login to your driver account</Text>
            
//             <View style={styles.inputContainer}>
//               <View style={styles.inputWrapper}>
//                 <Icon name="phone" size={20} color="#4facfe" style={styles.inputIcon} />
//                 <TextInput
//                   style={styles.input}
//                   placeholder="Mobile Number"
//                   placeholderTextColor="#999"
//                   value={mobileNumber}
//                   onChangeText={(text) => setMobileNumber(text.replace(/[^0-9]/g, ''))}
//                   keyboardType="phone-pad"
//                   maxLength={10}
//                   editable={!loading}
//                 />
//               </View>
              
//               {otpSent && (
//                 <View style={styles.inputWrapper}>
//                   <Icon name="lock" size={20} color="#4facfe" style={styles.inputIcon} />
//                   <TextInput
//                     style={styles.input}
//                     placeholder="Enter OTP"
//                     placeholderTextColor="#999"
//                     value={code}
//                     onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
//                     keyboardType="number-pad"
//                     maxLength={6}
//                     editable={!loading}
//                   />
//                 </View>
//               )}
//             </View>
            
//             <View style={styles.buttonContainer}>
//               {otpSent ? (
//                 <>
//                   <TouchableOpacity 
//                     style={[styles.button, loading && styles.buttonDisabled]} 
//                     onPress={verifyOTP} 
//                     disabled={loading}
//                   >
//                     {loading ? (
//                       <ActivityIndicator color="#fff" size="small" />
//                     ) : (
//                       <Text style={styles.buttonText}>Verify OTP</Text>
//                     )}
//                   </TouchableOpacity>
                  
//                   <TouchableOpacity
//                     style={styles.resendButton}
//                     onPress={sendOTP}
//                     disabled={loading || !resendAvailable}
//                   >
//                     <Text style={[
//                       styles.resendText, 
//                       !resendAvailable && styles.resendDisabledText
//                     ]}>
//                       {resendAvailable ? 'Resend OTP' : `Resend in ${resendCountdown}s`}
//                     </Text>
//                   </TouchableOpacity>
//                 </>
//               ) : (
//                 <TouchableOpacity 
//                   style={[styles.button, loading && styles.buttonDisabled]} 
//                   onPress={sendOTP} 
//                   disabled={loading}
//                 >
//                   {loading ? (
//                       <ActivityIndicator color="#fff" size="small" />
//                     ) : (
//                       <Text style={styles.buttonText}>Send OTP</Text>
//                     )}
//                 </TouchableOpacity>
//               )}
//             </View>
//           </View>
//         </Animated.View>
//       </KeyboardAvoidingView>
//     </LinearGradient>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//   },
//   keyboardContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   contentContainer: {
//     width: width * 0.9,
//     maxWidth: 400,
//   },
//   header: {
//     alignItems: 'center',
//     marginBottom: 30,
//   },
//   logoContainer: {
//     alignItems: 'center',
//     marginBottom: 20,
//   },
//   appName: {
//     fontSize: 28,
//     fontWeight: 'bold',
//     color: '#fff',
//     marginTop: 10,
//   },
//   card: {
//     backgroundColor: '#ffffff',
//     borderRadius: 20,
//     padding: 30,
//     width: '100%',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 10 },
//     shadowOpacity: 0.3,
//     shadowRadius: 20,
//     elevation: 10,
//   },
//   title: {
//     fontSize: 24,
//     fontWeight: 'bold',
//     color: '#333',
//     textAlign: 'center',
//     marginBottom: 5,
//   },
//   subtitle: {
//     fontSize: 16,
//     color: '#666',
//     textAlign: 'center',
//     marginBottom: 30,
//   },
//   inputContainer: {
//     marginBottom: 20,
//   },
//   inputWrapper: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#f5f5f5',
//     borderRadius: 15,
//     marginBottom: 15,
//     paddingHorizontal: 15,
//     height: 55,
//   },
//   inputIcon: {
//     marginRight: 10,
//   },
//   input: {
//     flex: 1,
//     fontSize: 16,
//     color: '#333',
//   },
//   buttonContainer: {
//     marginTop: 10,
//   },
//   button: {
//     backgroundColor: '#4facfe',
//     borderRadius: 15,
//     height: 55,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   buttonDisabled: {
//     backgroundColor: '#a0a0a0',
//   },
//   buttonText: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: 'bold',
//   },
//   resendButton: {
//     alignItems: 'center',
//     marginTop: 10,
//   },
//   resendText: {
//     color: '#4facfe',
//     fontSize: 16,
//   },
//   resendDisabledText: {
//     color: '#a0a0a0',
//   },
// });

// export default LoginScreen;