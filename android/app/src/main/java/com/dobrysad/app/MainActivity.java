package com.dobrysad.app;

import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /* True fullscreen / edge-to-edge immersive mode: the WebView draws behind both the status
       bar and the 3-button/gesture navigation bar (WindowCompat.setDecorFitsSystemWindows(...,
       false)), and both bars are hidden by default (WindowInsetsControllerCompat.hide(...)).
       BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE is what gives the standard Android "swipe from an
       edge to peek the bars, they float on top of the content and hide themselves again after a
       moment" behaviour, entirely handled by the OS -- nothing in the web app needs to poll for
       or re-hide anything itself. index.html's own CSS already reads env(safe-area-inset-*) for
       its header/nav padding (from the scroll-crop fix earlier in this project), and those
       values correctly collapse to ~0 while the bars are hidden, so the layout doesn't need to
       change based on this. */
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller == null) return;
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    /* The manifest points MainActivity at AppTheme.NoActionBarLaunch (parent Theme.SplashScreen)
       so the OS-drawn splash screen has the right background -- but nothing ever switched the
       activity back to a normal theme afterwards (no @capacitor/splash-screen plugin is
       installed to do it, and the splash API doesn't do it for you). Left on the splash theme
       permanently, the window never gets the plain AppTheme.NoActionBar decor the rest of this
       class assumes, which is what let the real system status bar (with the real clock) and a
       device/theme-dependent letterboxed background keep showing no matter what
       hideSystemBars() did. setTheme() must run before super.onCreate() -- that's the documented
       place for it, same as the AndroidX SplashScreen API's own installSplashScreen(this) call
       would use. */
    /* index.html's native-app detection used to rely only on window.Capacitor showing up in the
       WebView -- that injection is asynchronous, so on a real device it can lose the race
       against the page's own first inline script (a retry loop patched around this before, but
       still gave up after ~2s and could leave a session permanently stuck). Appending a fixed
       marker to the WebView's own User-Agent string here removes the race entirely:
       navigator.userAgent is available to the page synchronously, the instant it starts parsing
       -- there is nothing left to lose a timing race against. */
    private void markWebViewAsNativeApp() {
        if (bridge == null || bridge.getWebView() == null) return;
        WebSettings settings = bridge.getWebView().getSettings();
        String ua = settings.getUserAgentString();
        if (ua != null && ua.indexOf("DobrySadNativeApp") < 0) {
            settings.setUserAgentString(ua + " DobrySadNativeApp");
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(savedInstanceState);
        markWebViewAsNativeApp();
        hideSystemBars();
    }

    /* Re-hide whenever the window regains focus -- the system can bring the bars back on its own
       (returning from another app, dismissing a system dialog/keyboard, etc.), and this is the
       standard place to reassert immersive mode after any of that. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /* Belt-and-suspenders alongside onWindowFocusChanged: on some devices the WebView's own first
       layout pass (right as index.html's start screen appears) can nudge the system bars back on
       without a focus change ever firing, which is what let them show up on the app's own
       "Dobry Sad" start/logo screen even after onCreate()'s hideSystemBars() call. onResume() is
       always called after onCreate() on a fresh launch, so this is a second, cheap chance to
       reassert immersive mode right as that screen is about to be visible. */
    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    /* Hardware back button: @capacitor/app (the plugin that normally exposes a JS 'backButton'
       event) isn't installed in this project, so instead of that we ask the web app directly,
       via plain WebView.evaluateJavascript() (no extra native plugin needed for this), whether
       it handled the press itself -- closed a modal, switched tabs -- or whether there's truly
       nothing left to close. Only in that last case do we minimize the app, matching normal
       Android back-button behaviour instead of always minimizing regardless of what's on screen
       (see index.html's window.__handleAndroidBack). */
    @Override
    public void onBackPressed() {
        if (bridge == null || bridge.getWebView() == null) {
            super.onBackPressed();
            return;
        }
        bridge.getWebView().evaluateJavascript(
            "(function(){ try { return window.__handleAndroidBack ? window.__handleAndroidBack() : true; } catch(e) { return true; } })()",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if ("true".equals(value)) {
                        moveTaskToBack(true);
                    }
                }
            }
        );
    }
}
