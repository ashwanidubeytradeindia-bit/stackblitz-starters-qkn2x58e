
package com.cryptosignalpro.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.net.Uri;
import android.content.Intent;
import android.graphics.Color;

public class MainActivity extends Activity {

    private WebView webView;

    // IMPORTANT: Replace with your real Render URL.
    private static final String APP_URL =
        "https://YOUR-RENDER-URL.onrender.com";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(
            Color.rgb(5, 15, 30)
        );

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        webView.setWebChromeClient(
            new WebChromeClient()
        );

        webView.setWebViewClient(
            new WebViewClient() {

                @Override
                public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
                ) {
                    Uri uri = request.getUrl();
                    Uri allowed = Uri.parse(APP_URL);

                    if ("https".equals(uri.getScheme())
                        && allowed.getHost().equalsIgnoreCase(
                            uri.getHost())) {
                        return false;
                    }

                    if ("https".equals(uri.getScheme())) {
                        startActivity(new Intent(
                            Intent.ACTION_VIEW, uri
                        ));
                    }

                    return true;
                }

                @Override
                public void onReceivedSslError(
                    WebView view,
                    SslErrorHandler handler,
                    SslError error
                ) {
                    handler.cancel();
                }
            }
        );

        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
