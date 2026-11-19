package com.tavernduel.game;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Полноэкранное окно с игрой.
 * Сначала открывается онлайн-версия с GitHub Pages — так новые карты и правки приходят сами.
 * Если сети нет или сайт недоступен — встроенная копия из assets/game.
 */
public class MainActivity extends Activity {

    /** Адрес онлайн-версии игры */
    private static final String ONLINE_URL = "https://fillin669-sketch.github.io/Gvint/index.html";
    private static final String OFFLINE_URL = "file:///android_asset/game/index.html";
    private static final int APK_VERSION = 12;      // совпадает с versionCode в манифесте
    private static final long ONLINE_TIMEOUT_MS = 8000;

    private WebView web;
    private long lastBackPress;
    private boolean usingOffline;
    private boolean onlineLoaded;
    private final Handler handler = new Handler();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 9, 5));
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new GameClient());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        setContentView(web);
        hideSystemBars();

        if (state != null) {
            web.restoreState(state);
        } else {
            loadOnline();
        }
    }

    private void loadOnline() {
        usingOffline = false;
        onlineLoaded = false;
        web.loadUrl(ONLINE_URL + "?apk=" + APK_VERSION);
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (!onlineLoaded && !usingOffline) loadOffline();
            }
        }, ONLINE_TIMEOUT_MS);
    }

    private void loadOffline() {
        if (usingOffline) return;
        usingOffline = true;
        web.stopLoading();
        web.loadUrl(OFFLINE_URL + "?apk=" + APK_VERSION + "&offline=1");
    }

    private class GameClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.startsWith("https://")) onlineLoaded = true;
        }

        // старые Android
        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int code, String desc, String url) {
            if (url != null && url.startsWith(ONLINE_URL)) loadOffline();
        }

        // Android 6+
        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) loadOffline();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
            if (req.isForMainFrame()) loadOffline();
        }

        /** Ссылки наружу (например, скачать новый APK) открываются в браузере */
        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            boolean inside = url.startsWith("file:///android_asset/") || url.startsWith(ONLINE_URL);
            if (inside && !url.endsWith(".apk")) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "Не удалось открыть ссылку", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) {
            finish();
        } else {
            lastBackPress = now;
            Toast.makeText(this, "Нажмите «Назад» ещё раз, чтобы выйти", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
