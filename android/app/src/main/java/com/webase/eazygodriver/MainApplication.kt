package com.webase.eazygodriver

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
    object : DefaultReactNativeHost(this) {
      override fun getPackages(): List<ReactPackage> =
        PackageList(this).packages.apply {
          // ✅ Add our custom LocationServicePackage
          add(LocationServicePackage())
        }

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override fun getJSMainModuleName(): String = "index"

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
    }

  override val reactHost: ReactHost
    get() = DefaultReactHost.getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)

    // ✅ Check if driver was online before app restart/reboot
    // This helps restore driver state automatically
    if (BackgroundLocationService.wasDriverOnline(this)) {
      Log.d("MainApplication", "📱 Driver was online before app restart")
      // Service will be started when React Native initializes
    }
  }
}