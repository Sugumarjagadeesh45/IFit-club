# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IFIT Club is a React Native personal fitness tracking app, similar to Strava. The app provides real-time GPS tracking with a professional map interface, designed for users in a local area to track their fitness activities.

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
The app uses React Navigation with a native stack navigator:
- **FitnessMapScreen**: Main map screen with GPS tracking (entry point)

### Core Features
1. **Real-time GPS Tracking**: Live location updates with smooth animations
2. **Map View**: MapLibreGL with OpenStreetMap tiles (free, no API key required)
3. **Animated Location Marker**: Professional blue dot with pulse animation
4. **Polyline Routes**: Support for displaying workout routes
5. **Smooth Animations**: Frame-based location interpolation for smooth marker movement

## Key Files

### Core Application Files
- [App.tsx](App.tsx): Navigation container (direct entry to map screen)
- [src/FitnessMapScreen.tsx](src/FitnessMapScreen.tsx): Main fitness tracking map screen
- [index.js](index.js): App entry point

### Map & Utilities
- [src/mapStyle.ts](src/mapStyle.ts): MapLibre map styling configuration
- [src/utils/AnimatedMapUtils.ts](src/utils/AnimatedMapUtils.ts): Map animation utilities
- [src/utils/LocationUtils.ts](src/utils/LocationUtils.ts): Location calculation utilities
- [src/utils/RouteService.ts](src/utils/RouteService.ts): Route calculation and management
- [src/utils/SmoothMapAnimations.ts](src/utils/SmoothMapAnimations.ts): Smooth animation utilities
- [src/utils/SmoothPolyline.ts](src/utils/SmoothPolyline.ts): Polyline rendering utilities

### Assets
- [src/assets/](src/assets/): Image assets and icons

## Technical Details

### Map Implementation
- Uses MapLibreGL (free, open-source alternative to Mapbox)
- No API key required (uses OpenStreetMap tiles)
- Features:
  - Smooth camera following
  - Professional blue dot for user location
  - Polyline route display with shadow effect
  - Throttled camera updates to prevent performance issues

### Location Tracking
- Uses `@react-native-community/geolocation`
- Features:
  - High accuracy GPS
  - Distance filter of 5 meters
  - Frame-based smooth animation between location updates
  - Haversine formula for distance calculations

### Location Permissions
- **Android**: `ACCESS_FINE_LOCATION` required
- **iOS**: Location permission required (handled automatically)

## Android Configuration

- **Package**: `com.webase.ifitclub`
- **Min SDK**: 24, Target SDK: 35
- **ProGuard**: Enabled for release builds

## iOS Configuration

- **Pods**: Use `pod install` after dependency changes
- **Permissions**: Location (WhenInUse) required

## Development Notes

### Adding New Features
The app is designed to be extended with fitness tracking features:
- Workout recording (start/stop tracking)
- Distance and pace calculations
- Activity history
- Statistics and analytics

### Map Styling
The map uses a light style defined in `mapStyle.ts`. To customize:
- Modify the style JSON in `getLightMapStyleString()`
- Colors, fonts, and layer visibility can be adjusted

### Performance Considerations
- Location updates are throttled (5m distance filter)
- Camera updates are throttled (2 second minimum interval)
- Animations use `requestAnimationFrame` for smooth 60fps movement
- Map style is memoized to prevent unnecessary re-renders

## Quick Start

1. Install dependencies: `npm install`
2. For iOS: `cd ios && pod install && cd ..`
3. Start Metro: `npm start`
4. Run the app: `npm run android` or `npm run ios`
5. Grant location permissions when prompted
6. The map will display with your live location

## Future Enhancements

Potential features to add:
- Start/Stop workout tracking
- Pace and speed display
- Distance tracking
- Workout history
- Route saving and replay
- Statistics dashboard
- Social sharing
- Achievement badges
