# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EazyGo Driver is a React Native driver application for a ride-hailing platform. The app handles real-time ride requests, GPS tracking, fare calculations, and driver-customer interactions through Socket.IO and Firebase Cloud Messaging.

## Development Commands

### Running the App
```bash
# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

### Build & Quality
```bash
# Run linter
npm run lint

# Run tests
npm test
```

### Platform-Specific Commands
```bash
# Android - Clean build
cd android && ./gradlew clean && cd ..

# iOS - Install pods (after adding new dependencies)
cd ios && pod install && cd ..
```

## Architecture

### Navigation Structure
The app uses React Navigation with a native stack navigator ([App.tsx:153](App.tsx#L153)):
- **LoginScreen**: OTP-based authentication entry point
- **Screen1**: Main driver dashboard (ride requests, map, status management)
- **ActiveRideScreen**: Active ride management with live tracking
- **RejectRideScreen**: Ride rejection with reason selection
- **Menu Screens**: Profile, Wallet, RideHistory, Settings, Refer

### Authentication Flow
1. User enters phone number in LoginScreen
2. OTP sent via backend API
3. On successful verification, auth token and driver info stored in AsyncStorage
4. App checks for stored credentials on launch ([App.tsx:160-210](App.tsx#L160-L210))
5. Auto-navigates to Screen1 if valid credentials exist

### Real-Time Communication

**Socket.IO Integration** ([src/socket.ts](src/socket.ts))
- WebSocket-only transport for reliability
- Auto-reconnection with 20 attempts, 2s delay
- Secure mode enabled for HTTPS/ngrok connections
- Manual connect via `connectSocket()` function
- Additional utilities: `disconnectSocket()`, `reconnectSocket()`, `enableAutoReconnect()`, `disableAutoReconnect()`, `isSocketConnected()`

**Key Socket Events:**
- `driverLocationUpdate`: Broadcasts driver GPS location (foreground & background)
- `newRideRequest`: Incoming ride request from backend
- `driverAcceptedRide`: Driver accepts ride
- `driverCompletedRide`: Final fare and distance submission
- `driverGoOnline`: Driver status change to online
- `driverGoOffline`: Driver status change to offline

**Firebase Cloud Messaging** ([index.js:14-108](index.js#L14-L108))
- Background FCM handler for killed/background app states
- Notifee integration for high-priority, full-screen notifications
- Action buttons (Accept/Reject) in notifications
- Intent storage in AsyncStorage for app resumption

### Background Location Tracking

**Service Implementation** ([src/BackgroundLocationService.tsx](src/BackgroundLocationService.tsx))
- Uses `react-native-background-actions` for persistent foreground service
- 15-second location update intervals
- Emits `driverLocationUpdate` with latitude, longitude, speed, bearing
- Maintains socket connection during background operation
- Auto-reconnects if socket drops

**Starting/Stopping:**
```javascript
import { startBackgroundService, stopBackgroundService } from './BackgroundLocationService';

// When driver goes online
await startBackgroundService();

// When driver goes offline
await stopBackgroundService();
```

### API Configuration

**Environment Setup** ([src/apiConfig.ts](src/apiConfig.ts))
- Configured to use **localhost + ngrok** for development
- Centralized `API_BASE` and `SOCKET_URL` exports
- API: **Localhost (10.0.2.2:5002)**
- Socket: **ngrok** (`https://89d7dd056f4d.ngrok-free.app`)

**To update the ngrok URL (when ngrok restarts):**
```typescript
// src/apiConfig.ts
const NGROK_URL = 'https://your-new-ngrok-url.ngrok-free.app';
```

**Note**: Each time you restart ngrok, update the `NGROK_URL` in apiConfig.ts with the new URL.

**IMPORTANT - Production API Override** ([src/LoginScreen.tsx:36](src/LoginScreen.tsx#L36))
- LoginScreen currently has a **hardcoded production API URL**: `https://taxi.webase.co.in/api`
- This overrides the apiConfig.ts settings for the login flow only
- If testing authentication with local backend, you must change this hardcoded URL in LoginScreen.tsx
- All other screens use the centralized apiConfig.ts configuration

**API Client** ([utils/api.ts](utils/api.ts))
- Axios instance with automatic auth token injection
- Reads token from AsyncStorage on every request
- Base URL configured via `API_BASE` from apiConfig

### Fare Calculation Logic

**Critical Business Rules** ([src/ride_price_show_final_fare.md](src/ride_price_show_final_fare.md))

1. **Pre-Ride Estimate**: Backend sends estimated fare in ride request payload
2. **Dynamic Calculation**: Starts at OTP verification using driver's GPS location
3. **Final Fare Formula**: `distance_travelled × price_per_km`
4. **Distance Measurement**: Haversine distance from OTP verification point to current location
5. **Completion**: Driver app calculates and sends `finalDistance` and `finalFare` to backend
6. **Backend Verification**: Backend must re-verify fare calculation before charging customer

**No additional fees** (platform fees, taxes, etc.) should be added on the driver app side.

### Vehicle Type Filtering

**Critical Business Logic** ([ride_booking_note.md](ride_booking_note.md))

The system supports three vehicle types: `taxi`, `port`, and `bike`. **All vehicle types must be stored and compared in lowercase only.**

**Important Rules:**
1. When a user books a ride, they select a vehicle type (`taxi`, `port`, or `bike`)
2. Only drivers who are **online** AND have the **same vehicle type** receive the ride request
3. A driver's vehicle type must **NEVER** change automatically during ride operations
4. Vehicle type should only be set during:
   - Driver registration
   - Driver profile update via API
   - Admin panel update (if applicable)

**Backend Filtering:**
```javascript
// Backend must filter drivers by vehicle type
const matchingDrivers = await Driver.find({
  isOnline: true,
  vehicleType: ride.vehicleType  // Both must be lowercase
});
```

**Driver App Behavior:**
- Driver receives ride requests only for their registered vehicle type
- Vehicle type is immutable during socket events, ride booking, and notification logic
- Displayed in ride request details to ensure transparency

### State Management

**Driver Status States:**
- `offline`: Not accepting rides
- `online`: Available for ride requests, background service running
- `onRide`: Currently servicing a ride

**Ride Status States:**
- `idle`: No active ride
- `onTheWay`: Ride accepted, navigating to pickup
- `accepted`: Arrived at pickup, waiting for passenger
- `started`: OTP verified, ride in progress
- `completed`: Ride finished, fare calculated

**Persistent Storage (AsyncStorage):**
- `authToken`: JWT authentication token
- `driverInfo`: Driver profile JSON (driverId, name, phone, vehicleType, etc.)
- `driverId`: Driver unique identifier
- `driverName`: Driver display name
- `phoneNumber`: Driver phone number
- `verificationId`: Firebase OTP verification ID (temporary during login)
- `pendingRideRequest`: Ride request received while app was backgrounded
- `rideActionIntent`: Accept/reject action from notification tap
- `openRideRequest`: Flag to indicate user wants to see ride request (from notification tap)

### Map & Location Handling

**Libraries:**
- `react-native-maps`: MapView rendering
- `@react-native-community/geolocation`: GPS position tracking
- `geolib`/`haversine`/`haversine-distance`: Distance calculations
- `@mapbox/polyline`: Route polyline decoding

**Smooth Animations** ([src/Screen1.tsx:93-100](src/Screen1.tsx#L93-L100))
- Animated driver marker position using `Animated.Value`
- Bearing calculation for marker rotation
- Travelled route polyline with opacity animations
- AnimatedMapUtils for coordinate interpolation

**Route Display:**
- Full route from backend (OSRM/Google Directions)
- Visible route segments calculated based on driver position
- Nearest point index tracking for route progression
- Auto-zoom to fit pickup/drop markers

## Key Files

### Core Application Files
- [App.tsx](App.tsx): Navigation container and auth check
- [src/Screen1.tsx](src/Screen1.tsx): Main driver dashboard with ride request handling
- [src/ActiveRideScreen.tsx](src/ActiveRideScreen.tsx): Active ride tracking and management
- [src/LoginScreen.tsx](src/LoginScreen.tsx): OTP authentication
- [src/RejectRideScreen.tsx](src/RejectRideScreen.tsx): Ride rejection with reason selection
- [index.js](index.js): App entry, FCM background handler, Notifee events

### Services & Utilities
- [src/socket.ts](src/socket.ts): Socket.IO client configuration
- [src/apiConfig.ts](src/apiConfig.ts): API and socket URL configuration
- [src/BackgroundLocationService.tsx](src/BackgroundLocationService.tsx): Background GPS tracking
- [src/Notifications.tsx](src/Notifications.tsx): Notifee notification service
- [utils/api.ts](utils/api.ts): Axios instance with auth interceptor
- [src/utils/AnimatedMapUtils.ts](src/utils/AnimatedMapUtils.ts): Map animation utilities

### Menu & Profile Screens
- [src/MenuScreen.tsx](src/MenuScreen.tsx): Main menu navigation
- [src/ProfileScreen.tsx](src/ProfileScreen.tsx): Driver profile management
- [src/WalletScreen.tsx](src/WalletScreen.tsx): Wallet and earnings
- [src/RideHistoryScreen.tsx](src/RideHistoryScreen.tsx): Past ride history
- [src/SettingsScreen.tsx](src/SettingsScreen.tsx): App settings
- [src/ReferScreen.tsx](src/ReferScreen.tsx): Referral program

### Documentation
- [CLAUDE.md](CLAUDE.md): This file - development guidance
- [src/ride_price_show_final_fare.md](src/ride_price_show_final_fare.md): Detailed fare calculation rules
- [ride_booking_note.md](ride_booking_note.md): Vehicle type filtering requirements

## Android Configuration

- **Package**: `com.webase.eazygodriver`
- **Min SDK**: 24, Target SDK: 35 ([android/build.gradle](android/build.gradle))
- **Firebase**: Google Services plugin enabled ([android/app/build.gradle:5](android/app/build.gradle#L5))
- **ProGuard**: Enabled for release builds
- **Vector Icons**: Font gradle script applied
- **Signing**: Release keystore configured via gradle.properties

## iOS Configuration

- **Bundle ID**: Check [ios/EazygoDriver.xcodeproj](ios/EazygoDriver.xcodeproj)
- **Pods**: Use `pod install` after dependency changes
- **Permissions**: Location (Always & WhenInUse), Notifications required

## Firebase Integration

**Required Services:**
- Firebase Authentication (OTP via backend)
- Cloud Messaging (ride request notifications)
- Firestore (optional, check backend requirements)

**Setup:**
- Android: `google-services.json` in `android/app/`
- iOS: `GoogleService-Info.plist` in `ios/EazygoDriver/`

## Testing Strategy

When testing ride flows:
1. Start your backend server on `localhost:5002`
2. Start ngrok: `ngrok http 5002`
3. Update `NGROK_URL` in [src/apiConfig.ts](src/apiConfig.ts) with the new ngrok URL
4. **IMPORTANT**: Update hardcoded production URL in [src/LoginScreen.tsx:36](src/LoginScreen.tsx#L36) if testing authentication with local backend
5. Start Metro bundler: `npm start`
6. Run the app: `npm run android` or `npm run ios`
7. Check socket connection logs in console to verify connection
8. Verify background service starts when going online
9. Test notification permissions on physical devices (not emulators)
10. Monitor AsyncStorage for auth persistence

## Backend API Endpoints

### Critical Endpoints

**Get Ride Details:**
```
GET /api/rides/:rideId
```
Example: `GET /api/rides/RID003786`

**⚠️ IMPORTANT:** The app should ONLY use this endpoint. Do not try these incorrect endpoints:
- ❌ `/api/rides/get-ride/:rideId`
- ❌ `/api/ride/get/:rideId`
- ❌ `/api/api/rides/:rideId` (double `/api/`)

**Response Structure:**
```json
{
  "success": true,
  "ride": {
    "_id": "675...",
    "RAID_ID": "RID003786",
    "user": {
      "_id": "user_id",
      "name": "sugumar",
      "phoneNumber": "9876543210",
      "customerId": "CUS0065"
    },
    "userName": "sugumar",
    "userMobile": "9876543210",
    "name": "sugumar",  // Alternative field
    "mobile": "9876543210",  // Alternative field
    "customerId": "CUS0065",
    "pickup": { "lat": 11.345, "lng": 77.721, "address": "..." },
    "drop": { "lat": 11.309, "lng": 77.738, "address": "..." },
    "vehicleType": "bike",
    "distance": 5.4,
    "fare": 81,
    "status": "searching",
    "otp": "0065"
  }
}
```

**Critical Passenger Data Fields:**
The backend sends passenger data in multiple field variations for compatibility:
- `userName` OR `name` OR `user.name` - Passenger name
- `userMobile` OR `mobile` OR `user.phoneNumber` - Passenger mobile
- `customerId` OR `user.customerId` - Customer ID
- `otp` - Last 4 digits of customerId

The driver app should check ALL these fields to extract passenger data.

**Start Working Hours (Go Online):**
```
POST /api/drivers/working-hours/start
Body: { "driverId": "dri10003" }
```
**⚠️ CRITICAL:** Deducts ₹100 from wallet for NEW shifts. Resume scenarios don't charge.

**Stop Working Hours (Go Offline):**
```
POST /api/drivers/working-hours/stop
Body: { "driverId": "dri10003" }
```
**Note:** This PAUSES the timer, does NOT deduct wallet.

**Update FCM Token:**
```
POST /api/drivers/fcm-token
Body: { "driverId": "dri10003", "fcmToken": "fcm_token_here" }
```

**Update Driver Status:**
```
PATCH /api/drivers/:driverId/status
Body: { "status": "Live" | "Offline" | "onRide" }
```

**Start Ride (After OTP):**
```
POST /api/rides/start
Body: { "rideId": "RID003786", "driverId": "dri10003", "otp": "0065" }
```

**Complete Ride:**
Use Socket.IO event `rideCompleted` with:
```javascript
{
  rideId, driverId, finalDistance, finalFare, driverCurrentLocation
}
```

### Socket.IO Events

**Emit (Driver → Server):**
- `driverOnline` - Register as online
- `updateLocation` - Send GPS updates every 5s
- `rideAccepted` - Accept ride request
- `rideCompleted` - Complete ride with fare

**Listen (Server → Driver):**
- `rideRequest` - New ride available
- `billAlert` - Bill for completed ride (show BEFORE navigating away)
- `rideCompleted` - Ride completion confirmation
- `workingHoursWarning` - Timer warnings

## Common Debugging

**Socket not connecting:**
- Verify `NGROK_URL` in apiConfig.ts matches your current ngrok URL
- Ensure backend server is running on `localhost:5002`
- Ensure ngrok is running: `ngrok http 5002`
- Check `secure: true` setting in socket.ts (required for HTTPS/ngrok)
- Review socket connection logs in console
- Test ngrok URL in browser to verify it forwards to localhost

**Ride details not loading (404 errors):**
- Check if app is using correct endpoint: `GET /api/rides/:rideId`
- Verify backend route is registered correctly
- Check authorization header is being sent
- Add `ngrok-skip-browser-warning: true` header for ngrok URLs
- Review network logs to see exact failing endpoint

**Background location not working:**
- Request location permissions (Always on Android)
- Verify foreground service notification appears
- Check BackgroundActions.isRunning() status
- Review background task logs

**Notifications not appearing:**
- Request notification permissions
- Check FCM token registration
- Verify Notifee channel creation
- Test on physical device (emulators unreliable)

**Auth issues:**
- Clear AsyncStorage: `AsyncStorage.clear()`
- Check authToken in AsyncStorage
- Verify API interceptor adds Authorization header
- Check backend token validation

**Ride requests not received:**
- Verify driver is online and socket is connected
- Check driver's vehicle type matches the ride request vehicle type
- Confirm backend is filtering drivers correctly by vehicle type
- Review FCM token and notification permissions
- Check backend logs for ride broadcast events
- Verify `driverOnline` event was emitted after socket connection

**Driver charged twice when going online:**
- Backend detects resume vs new shift automatically
- If `remainingWorkingSeconds > 0` and `timerActive === false`, it's a resume (no charge)
- Otherwise, it's a new shift (₹100 deducted)
- Check `amountDeducted` in response to display correct message to driver

## Important Development Notes

### TypeScript Configuration
- Project uses TypeScript 5.0.4
- React 19.1.0 and React Native 0.80.2
- Type definitions available for most libraries

### Location Permissions
- **Android**: Request `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`
- **iOS**: Request `WhenInUse` and `Always` location permissions
- Background location tracking requires "Allow all the time" permission on Android

### Firebase Setup Requirements
- **Android**: Place `google-services.json` in `android/app/` directory
- **iOS**: Place `GoogleService-Info.plist` in `ios/EazygoDriver/` directory
- Ensure Firebase project supports both Authentication and Cloud Messaging
- Configure APNs for iOS push notifications

### ProGuard Configuration
- ProGuard enabled for Android release builds
- Custom rules in `android/app/proguard-rules.pro`
- Keep Socket.IO and Firebase classes from obfuscation

### Gradle Configuration
- Vector Icons fonts automatically linked via gradle script
- Google Services plugin applied for Firebase integration
- Release signing configured via `gradle.properties` (not in version control)

### Working Hours System Rules

**Wallet Deduction Logic:**
- **Going Online (New Shift):** ₹100 deducted from wallet
- **Resuming Paused Shift:** No wallet deduction
- **Going Offline:** No wallet deduction (timer pauses)
- **Extending Hours:** ₹100 for additional 12 hours
- **Add Half Time:** ₹50 for 12-hour shifts (adds 6h), ₹100 for 24-hour shifts (adds 12h)
- **Add Full Time:** ₹100 for 12-hour shifts (adds 12h), ₹200 for 24-hour shifts (adds 24h)

**Backend Detection:**
The backend automatically determines if it's a resume or new shift:
- If `driver.remainingWorkingSeconds > 0` AND `driver.timerActive === false` → Resume (no charge)
- Otherwise → New shift (₹100 charged)

**Frontend Implementation:**
```javascript
const response = await startWorkingHours(driverId);

if (response.amountDeducted > 0) {
  // New shift started
  Alert.alert('Shift Started',
    `₹${response.amountDeducted} deducted. Balance: ₹${response.walletBalance}`);
} else {
  // Resumed existing shift
  Alert.alert('Shift Resumed', 'No wallet deduction.');
}
```

**Timer Warnings:**
- First warning at 1 hour remaining
- Second warning at 30 minutes remaining
- Third warning at 15 minutes remaining
- Auto-logout when timer reaches 0

### OTP System

**OTP Generation:**
- OTP is the last 4 digits of user's `customerId`
- Example: `customerId: "CUS0065"` → `otp: "0065"`
- Always displayed with leading zeros

**OTP Validation:**
- Driver must verify OTP before starting ride
- Incorrect OTP will return error: `{ success: false, message: "Invalid OTP" }`
- OTP is case-sensitive and must match exactly

### Ride Completion Flow

**Critical Order:**
1. Driver presses "Complete Ride"
2. App emits Socket.IO event `rideCompleted` with fare data
3. Server responds with `billAlert` event (show bill modal)
4. Server then sends `rideCompleted` event (confirmation)
5. App shows bill to driver (BLOCKING modal)
6. Only after driver closes bill, navigate away and clear state

**⚠️ NEVER navigate away before showing the bill modal**

### Development Best Practices
- Always test on physical devices for location and notification features
- Monitor socket connection status in development logs
- Clear AsyncStorage when testing authentication flows
- Use Metro bundler's reload feature to test foreground/background transitions
- Test ride flows end-to-end with backend server running
- Never skip showing the bill modal after ride completion
- Prevent duplicate API calls (especially for going online/offline)
- Always emit `driverOnline` socket event after successful socket connection
- Update FCM token after login and on token refresh events

## Quick Reference Tables

### API Endpoint Quick Lookup

| Purpose | Method | Endpoint | Auth Required |
|---------|--------|----------|---------------|
| Request OTP | POST | `/api/auth/request-driver-otp` | No |
| Get Driver Info | POST | `/api/auth/get-complete-driver-info` | No |
| Get Driver Details | GET | `/api/drivers/:driverId` | Yes |
| Update Status | PATCH | `/api/drivers/:driverId/status` | Yes |
| Update FCM Token | POST | `/api/drivers/fcm-token` | Yes |
| Go Online | POST | `/api/drivers/working-hours/start` | Yes |
| Go Offline | POST | `/api/drivers/working-hours/stop` | Yes |
| Get Timer Status | GET | `/api/drivers/working-hours/status/:driverId` | Yes |
| Extend Hours | POST | `/api/drivers/working-hours/extend` | Yes |
| Get Ride Details | GET | `/api/rides/:rideId` | Yes |
| Mark Arrived | POST | `/api/rides/arrived` | Yes |
| Start Ride | POST | `/api/rides/start` | Yes |
| Complete Ride | POST | `/api/rides/simple-complete` | Yes |

### Wallet Deduction Quick Reference

| Action | Cost | When Charged | Notes |
|--------|------|--------------|-------|
| Go Online (New) | ₹100 | First time or after 12h expires | Minimum balance required |
| Go Online (Resume) | ₹0 | When resuming paused shift | No charge |
| Go Offline | ₹0 | Anytime | Just pauses timer |
| Extend Hours | ₹100 | When purchasing extension | Adds 12 hours |
| Half Time (12h) | ₹50 | During shift | Adds 6 hours |
| Half Time (24h) | ₹100 | During shift | Adds 12 hours |
| Full Time (12h) | ₹100 | During shift | Adds 12 hours |
| Full Time (24h) | ₹200 | During shift | Adds 24 hours |

### Socket.IO Events Reference

#### Driver Emits (Send to Server)

| Event | Data | Purpose |
|-------|------|---------|
| `driverOnline` | `{ driverId, vehicleType }` | Register as online |
| `updateLocation` | `{ driverId, latitude, longitude, status }` | Send GPS location |
| `rideAccepted` | `{ rideId, driverId, driverName, driverPhone, vehicleType }` | Accept ride |
| `rideCompleted` | `{ rideId, driverId, finalDistance, finalFare, driverCurrentLocation }` | Complete ride |

#### Driver Listens (Receive from Server)

| Event | Data | Purpose |
|-------|------|---------|
| `rideRequest` | Full ride object | New ride available |
| `billAlert` | `{ rideId, distance, fare, ... }` | Show bill (before completion) |
| `rideCompleted` | `{ rideId, status }` | Confirmation of completion |
| `workingHoursWarning` | `{ warningNumber, message, remainingSeconds }` | Timer warnings |

### Driver Status Values

| Status | Meaning | When to Use |
|--------|---------|-------------|
| `"Offline"` | Not accepting rides | Default, after logout |
| `"Live"` | Online, available | After going online |
| `"onRide"` | Currently on ride | After accepting ride |

### Ride Status Flow

| Status | Meaning | Triggered By |
|--------|---------|--------------|
| `"searching"` | Looking for driver | User books ride |
| `"accepted"` | Driver accepted | Driver accepts |
| `"arrived"` | Driver at pickup | Driver marks arrived |
| `"started"` | Ride in progress | OTP verified |
| `"completed"` | Ride finished | Driver completes ride |
| `"cancelled"` | Ride cancelled | User/Driver cancels |
