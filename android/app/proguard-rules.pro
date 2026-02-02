# --- Default project ProGuard rules ---

# Keep React Native classes
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**

# Keep Reanimated classes (to prevent "createNode is not a function" crash)
-keep class com.swmansion.reanimated.** { *; }
-keepclassmembers class * {
  @com.swmansion.reanimated.annotations.DoNotStrip *;
}

# Keep Firebase Messaging (so notifications work)
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Keep React Native SVG (so SVG rendering doesn’t get stripped)
-keep class com.horcrux.svg.** { *; }

# Keep vector icons
-keep class com.oblador.vectoricons.** { *; }

# Don’t strip annotations or interfaces used by React Native bridge
-keepattributes *Annotation*, InnerClasses
-keep interface com.facebook.react.bridge.** { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keepclassmembers class * {
  @com.facebook.react.uimanager.annotations.ReactProp <methods>;
}

# Optional: Prevent warnings
-dontwarn com.facebook.hermes.**
-dontwarn okhttp3.**

# Keep Socket.IO classes (for native background service)
-keep class io.socket.** { *; }
-dontwarn io.socket.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okio.**

# Keep our native location service classes
-keep class com.webase.eazygodriver.BackgroundLocationService { *; }
-keep class com.webase.eazygodriver.BootCompleteReceiver { *; }
-keep class com.webase.eazygodriver.LocationServiceModule { *; }
-keep class com.webase.eazygodriver.LocationServicePackage { *; }

# Keep Google Play Services Location
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.**
