# Ride Booking – Vehicle Type Based Driver Alert System
## Professional Requirement & Implementation Notes

## Overview

The current codebase (EazyGo Driver) is working perfectly.

Using the same logic and functions, a new project has been started for a ride booking application, and the implementation is almost complete.

However, **a critical issue has been identified in the new project**.

---

## Current Issue

**Problem:** When a user books a ride, the ride alert is sent to **all online drivers**.

At the same time, the vehicle type of all online drivers automatically changes to `taxi`, which should **never happen**.

⚠️ **This behavior is incorrect.**

---

## Correct Expected Behavior

### User Ride Booking Flow

When a user books a ride, the user must select a **vehicle type**:
- `taxi`
- `port`
- `bike`

⚠️ **Vehicle types must always be stored and compared in lowercase only.**

### Driver Filtering Rules

Only drivers who are:
1. **Online** (`isOnline: true`)
2. **AND** have the **same vehicle type** as selected by the user

should receive the ride alert.

❌ Drivers with other vehicle types must **NOT** receive the ride request.

### Vehicle Type Immutability

A driver's vehicle type must **NEVER** change automatically:
- ❌ Not during ride booking
- ❌ Not during alert broadcasting
- ❌ Not during socket events
- ❌ Not during API calls

✅ Vehicle type should **only** be set:
- During driver registration
- Via driver profile update API
- Via admin panel update (if applicable)

---

## Correct Ride Alert Flow

### Step 1: User Books a Ride

User selects:
- Pickup location
- Drop location
- **Vehicle type** (`taxi` | `port` | `bike`)

Ride is created with the selected vehicle type.

### Step 2: Backend Filters Drivers

```javascript
// Fetch only online drivers
const onlineDrivers = await Driver.find({ isOnline: true });

// Filter drivers by matching vehicle type
const matchingDrivers = onlineDrivers.filter(driver =>
  driver.vehicleType === ride.vehicleType  // Both must be lowercase
);
```

### Step 3: Send Ride Alert

```javascript
// Send ride request only to matching drivers
matchingDrivers.forEach(driver => {
  io.to(driver.socketId).emit('newRideRequest', {
    rideId: ride._id,
    pickup: ride.pickupLocation,
    drop: ride.dropLocation,
    vehicleType: ride.vehicleType,
    fare: ride.fare,
    distance: ride.distance
  });
});

// Other drivers are ignored - they do NOT receive any alert
```

---

## Important Backend Rules

### Vehicle Type Rules

✅ **Vehicle type is immutable during ride booking**

✅ **Must be set only at:**
- Driver registration
- Driver profile update

❌ **Must NOT be modified in:**
- Ride creation logic
- Socket events
- Notification logic
- Ride broadcast functions
- Driver online/offline events

---

## Example Database Structure

### Driver Model

```javascript
{
  "_id": "driverId123",
  "name": "John Doe",
  "phone": "+1234567890",
  "isOnline": true,
  "vehicleType": "bike",   // taxi | port | bike (lowercase only)
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "socketId": "socket_abc123",
  "fcmToken": "fcm_token_xyz"
}
```

### Ride Model

```javascript
{
  "_id": "rideId456",
  "userId": "userId789",
  "vehicleType": "port",    // taxi | port | bike (lowercase only)
  "pickupLocation": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "123 Main St"
  },
  "dropLocation": {
    "latitude": 40.7589,
    "longitude": -73.9851,
    "address": "456 Broadway"
  },
  "status": "requested",    // requested | accepted | started | completed
  "fare": 25.50,
  "distance": 5.2,
  "driverId": null,         // Assigned when driver accepts
  "createdAt": "2025-01-06T10:00:00Z"
}
```

---

## Sample Backend Logic (Reference)

### Ride Creation API

```javascript
// POST /api/rides/create
router.post('/create', async (req, res) => {
  try {
    const { userId, pickup, drop, vehicleType } = req.body;

    // ✅ Validate vehicle type
    const validVehicleTypes = ['taxi', 'port', 'bike'];
    const normalizedVehicleType = vehicleType.toLowerCase();

    if (!validVehicleTypes.includes(normalizedVehicleType)) {
      return res.status(400).json({
        error: 'Invalid vehicle type. Must be: taxi, port, or bike'
      });
    }

    // Create ride with user-selected vehicle type
    const ride = await Ride.create({
      userId,
      pickupLocation: pickup,
      dropLocation: drop,
      vehicleType: normalizedVehicleType,  // ✅ Store in lowercase
      status: 'requested',
      fare: calculateFare(pickup, drop),
      distance: calculateDistance(pickup, drop)
    });

    // ✅ Find ONLY online drivers with MATCHING vehicle type
    const matchingDrivers = await Driver.find({
      isOnline: true,
      vehicleType: normalizedVehicleType  // ✅ Filter by vehicle type
    });

    // Send ride alert only to matching drivers
    matchingDrivers.forEach(driver => {
      // Socket notification
      if (driver.socketId) {
        io.to(driver.socketId).emit('newRideRequest', {
          rideId: ride._id,
          userName: req.user.name,
          pickup: ride.pickupLocation,
          drop: ride.dropLocation,
          vehicleType: ride.vehicleType,
          fare: ride.fare,
          distance: ride.distance
        });
      }

      // FCM notification
      if (driver.fcmToken) {
        sendFCMNotification(driver.fcmToken, {
          type: 'rideRequest',
          rideId: ride._id,
          pickup: ride.pickupLocation.address,
          distance: ride.distance
        });
      }
    });

    res.status(201).json({
      success: true,
      ride,
      driversNotified: matchingDrivers.length
    });

  } catch (error) {
    console.error('Ride creation error:', error);
    res.status(500).json({ error: 'Failed to create ride' });
  }
});
```

### Get Online Drivers (Filtered by Vehicle Type)

```javascript
// GET /api/drivers/online?vehicleType=bike
router.get('/online', async (req, res) => {
  try {
    const { vehicleType } = req.query;

    const query = { isOnline: true };

    // ✅ Filter by vehicle type if provided
    if (vehicleType) {
      query.vehicleType = vehicleType.toLowerCase();
    }

    const drivers = await Driver.find(query).select(
      'name location vehicleType rating'
    );

    res.json({ drivers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});
```

### Driver Profile Update API

```javascript
// PUT /api/drivers/profile
router.put('/profile', authenticateDriver, async (req, res) => {
  try {
    const { vehicleType, name, vehicleNumber } = req.body;

    const updates = {};

    if (name) updates.name = name;
    if (vehicleNumber) updates.vehicleNumber = vehicleNumber;

    // ✅ Only allow vehicle type update via profile API
    if (vehicleType) {
      const validTypes = ['taxi', 'port', 'bike'];
      const normalized = vehicleType.toLowerCase();

      if (!validTypes.includes(normalized)) {
        return res.status(400).json({
          error: 'Invalid vehicle type'
        });
      }

      updates.vehicleType = normalized;
    }

    const driver = await Driver.findByIdAndUpdate(
      req.driverId,
      updates,
      { new: true }
    );

    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});
```

---

## Socket Event Handlers

### Driver Goes Online

```javascript
socket.on('driverGoOnline', async ({ driverId }) => {
  try {
    // ✅ Only update online status and socketId
    // ❌ NEVER update vehicleType here
    await Driver.findByIdAndUpdate(driverId, {
      isOnline: true,
      socketId: socket.id,
      lastOnlineAt: new Date()
    });

    console.log(`Driver ${driverId} is now online`);
  } catch (error) {
    console.error('Error setting driver online:', error);
  }
});
```

### Driver Goes Offline

```javascript
socket.on('driverGoOffline', async ({ driverId }) => {
  try {
    // ✅ Only update online status
    // ❌ NEVER update vehicleType here
    await Driver.findByIdAndUpdate(driverId, {
      isOnline: false,
      socketId: null
    });

    console.log(`Driver ${driverId} is now offline`);
  } catch (error) {
    console.error('Error setting driver offline:', error);
  }
});
```

---

## Important Notes (Must Follow)

### ❌ Never Do This

```javascript
// ❌ WRONG: Changing driver vehicle type during ride booking
await Driver.updateMany({ isOnline: true }, { vehicleType: 'taxi' });

// ❌ WRONG: Hardcoding vehicle type
io.emit('newRideRequest', { ...ride, vehicleType: 'taxi' });

// ❌ WRONG: Sending to all drivers regardless of vehicle type
const allDrivers = await Driver.find({ isOnline: true });
allDrivers.forEach(driver => sendRideAlert(driver));
```

### ✅ Always Do This

```javascript
// ✅ CORRECT: Filter drivers by vehicle type
const matchingDrivers = await Driver.find({
  isOnline: true,
  vehicleType: ride.vehicleType  // Both in lowercase
});

// ✅ CORRECT: Preserve user-selected vehicle type
const ride = await Ride.create({
  vehicleType: req.body.vehicleType.toLowerCase()
});

// ✅ CORRECT: Send alerts only to matching drivers
matchingDrivers.forEach(driver => {
  io.to(driver.socketId).emit('newRideRequest', ride);
});
```

---

## Validation Checklist

Before deploying, verify:

- [ ] Vehicle types are stored in **lowercase** in database
- [ ] User can select vehicle type during booking
- [ ] Ride document stores correct vehicle type
- [ ] Driver filter query includes `vehicleType` match
- [ ] Ride alerts sent **only** to matching drivers
- [ ] Driver `vehicleType` field is **never** updated during ride flow
- [ ] Driver registration sets initial vehicle type
- [ ] Profile update API allows vehicle type change
- [ ] Socket events do **not** modify vehicle type
- [ ] FCM notifications respect vehicle type filtering

---

## Testing Scenarios

### Test Case 1: User Books Taxi Ride

**Steps:**
1. User selects vehicle type: `taxi`
2. User books ride

**Expected:**
- Only drivers with `vehicleType: "taxi"` receive alert
- Drivers with `port` or `bike` do NOT receive alert
- No driver's vehicle type changes

### Test Case 2: User Books Bike Ride

**Steps:**
1. User selects vehicle type: `bike`
2. User books ride

**Expected:**
- Only drivers with `vehicleType: "bike"` receive alert
- Drivers with `taxi` or `port` do NOT receive alert
- No driver's vehicle type changes

### Test Case 3: Driver Goes Online

**Steps:**
1. Driver (vehicle type: `port`) goes online

**Expected:**
- Driver's `isOnline` changes to `true`
- Driver's `vehicleType` remains `port`
- Driver receives ride alerts **only** for `port` rides

---

## Key APIs / Endpoints Summary

| Endpoint | Method | Purpose | Vehicle Type Handling |
|----------|--------|---------|----------------------|
| `/api/rides/create` | POST | Create new ride | Accept from user, filter drivers |
| `/api/drivers/online` | GET | Get online drivers | Filter by `vehicleType` query |
| `/api/drivers/profile` | PUT | Update driver profile | Allow vehicle type update |
| `/api/drivers/register` | POST | Register new driver | Set initial vehicle type |

---

## Final Conclusion

The system must ensure that:

✅ **Vehicle type selection by the user strictly controls driver notifications**

✅ **Driver vehicle types remain unchanged during ride operations**

✅ **Only relevant drivers receive ride alerts**

✅ **All vehicle type comparisons use lowercase**

This logic should be followed consistently across:
- Backend APIs
- Socket events
- Database updates
- FCM notifications
- Driver app socket listeners

---

## Reference Implementation Files

For working reference, see these files in the current EazyGo Driver project:

- [src/apiConfig.ts](src/apiConfig.ts) - API configuration
- [src/socket.ts](src/socket.ts) - Socket.IO client setup
- [src/Screen1.tsx](src/Screen1.tsx) - Ride request handling on driver side
- [utils/api.ts](utils/api.ts) - API client with auth

⚠️ **Backend implementation is critical** - ensure server-side filtering is correctly implemented before testing.
