package com.dobrysad.app;

import android.webkit.ValueCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
