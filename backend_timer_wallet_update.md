# Backend Update: Driver Timer & Wallet Logic

## 🚨 CRITICAL RULES (MUST BE FOLLOWED)

### 1. Wallet Deduction Rule
**₹100 must be deducted ONLY when:**
1.  The timer is exactly `00:00:00` (expired or new session).
2.  **AND** the driver taps **ONLINE**.

**Strict Prohibition:**
- If the background timer is **already running** (e.g., driver logged out and back in, or app crashed):
  - **NO** wallet deduction should occur.
  - The timer must continue running without interruption.
  - The API must return `success: true` but `amountDeducted: 0`.

### 2. Offline Verification Rule
**When a driver taps OFFLINE while the timer is running:**
1.  The App will request a 4-digit PIN (Last 4 digits of Driver ID).
2.  **If Verified:** The backend must stop the timer (`/working-hours/stop`).
3.  **If Failed:** The driver remains ONLINE, and the timer continues.

---

## 2. API Implementation Requirements

### 2.1 Start Shift (Go Online)
**Endpoint:** `POST /api/drivers/working-hours/start`

**Logic:**
```javascript
async function startShift(driverId) {
  const driver = await Driver.findById(driverId);
  
  // SCENARIO 1: Timer is already active (Resume)
  if (driver.timerActive) {
    return { 
      success: true, 
      message: "Timer already running - Resumed", 
      timerActive: true,
      amountDeducted: 0, // ⛔ NO DEDUCTION
      walletBalance: driver.wallet
    };
  }
  
  // SCENARIO 2: Timer paused but has time left (Resume)
  if (driver.remainingSeconds > 0) {
    driver.timerActive = true;
    driver.lastStartTime = new Date();
    await driver.save();
    return { 
      success: true, 
      message: "Session Resumed", 
      timerActive: true,
      amountDeducted: 0, // ⛔ NO DEDUCTION
      walletBalance: driver.wallet
    };
  }
  
  // SCENARIO 3: New Shift (Time = 0)
  if (driver.wallet < 100) {
    return { success: false, message: "Insufficient wallet balance" };
  }
  
  // ✅ DEDUCT HERE
  driver.wallet -= 100;
  driver.remainingSeconds = 12 * 3600; // 12 hours
  driver.timerActive = true;
  driver.lastStartTime = new Date();
  await driver.save();
  
  return { 
    success: true, 
    message: "New shift started", 
    timerActive: true,
    amountDeducted: 100, // ✅ DEDUCTED
    walletBalance: driver.wallet
  };
}
```

### 2.2 Check Status (Sync UI)
- **Endpoint:** `GET /api/drivers/working-hours/status/:driverId`
- **Response:** Must return `{ success: true, timerActive: boolean, remainingSeconds: number }`.
- **Frontend Behavior:** If `timerActive` is true, the App will automatically set the UI to **ONLINE** without calling the start endpoint.

### 2.3 Stop Shift (Go Offline)
- **Endpoint:** `POST /api/drivers/working-hours/stop`
- **Action:** Set `timerActive = false`. Do **NOT** reset `remainingSeconds`.

---

## 3. Background Jobs (FCM Alerts)

Backend must run a cron job or scheduled task to check active timers and send FCM alerts at:
1. **1 Hour Remaining** (01:00:00)
2. **30 Minutes Remaining** (00:30:00)
3. **10 Seconds Remaining** (00:00:10)

## 4. Automatic Offline on Expiry
**When timer reaches 0:**
1. Backend detects expiry.
2. **Action:**
  1. Set `driver.isOnline = false`.
  2. Set `driver.timerActive = false`.
  3. Emit `driverForcedOffline` socket event.
  4. Send FCM notification: "Working hours expired. You are now offline."