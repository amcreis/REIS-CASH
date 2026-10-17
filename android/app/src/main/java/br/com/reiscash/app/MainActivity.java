package br.com.reiscash.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabColorSchemeParams;

public final class MainActivity extends Activity {
    private static final Uri SITE = Uri.parse("https://amcreis.github.io/REIS-CASH/?android=1");
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        findViewById(R.id.open_cash).setOnClickListener(view -> openCash());
        if (savedInstanceState == null) openCash();
    }
    private void openCash() {
        // Use the real browser's session so Google OAuth, storage and downloads
        // behave exactly as they do on the website. No WebView or JS bridge.
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.rgb(220, 236, 255))
                .setNavigationBarColor(Color.rgb(244, 248, 252)).build())
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_LIGHT)
            .setShowTitle(true)
            .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            .build();
        String provider = CustomTabsClient.getPackageName(this, null);
        if (provider != null) tab.intent.setPackage(provider);
        try {
            tab.launchUrl(this, SITE);
            finish();
        } catch (ActivityNotFoundException unavailable) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, SITE));
                finish();
            } catch (ActivityNotFoundException noBrowser) {
                ((TextView)findViewById(R.id.message)).setText(R.string.no_browser);
            }
        }
    }
}
