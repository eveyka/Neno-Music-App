# Custom Proguard rules for Neno Music Android App

# Keep all Tauri runtime classes and plugins
-keep class app.tauri.** { *; }
-keep interface app.tauri.** { *; }

# Keep all app classes
-keep class com.neno.desktop.** { *; }
-keep interface com.neno.desktop.** { *; }

# Keep all JavascriptInterface annotations and methods for WebView <-> JS Bridge
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepattributes JavascriptInterface
-keepclassmembers class * {
    native <methods>;
    @android.webkit.JavascriptInterface <methods>;
}

# Keep AndroidX Media, MediaSession, and Notifications classes
-keep class androidx.media.** { *; }
-keep class android.support.v4.media.** { *; }
-keep class androidx.webkit.** { *; }
-keep class androidx.core.app.** { *; }
-dontwarn androidx.webkit.**
-dontwarn android.support.v4.media.**