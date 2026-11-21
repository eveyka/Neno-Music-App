# Security & Hardening Proguard rules for Neon Music Android App

# Repackage & Obfuscate internal implementation classes
-repackageclasses 'com.neno.desktop.internal'
-allowaccessmodification
-renamesourcefileattribute SourceFile
-keepattributes Exceptions,InnerClasses,Signature,Deprecated,*Annotation*,EnclosingMethod,JavascriptInterface

# Strip all debug and verbose logs from release binary to prevent information leakage
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Keep essential Android component entry points (Manifest targets)
-keep public class com.neno.desktop.MainActivity extends android.app.Activity
-keep public class com.neno.desktop.MediaPlaybackService extends android.app.Service
-keep public class com.neno.desktop.TauriActivity

# Keep all Tauri runtime classes and native bridge plugins
-keep class app.tauri.** { *; }
-keep interface app.tauri.** { *; }

# Keep all JavascriptInterface annotations and JNI methods for WebView <-> Rust Bridge
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