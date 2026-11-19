package com.tavernduel.game;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Полноэкранное окно с игрой.
 * При запуске игра обновляется прямо с GitHub (см. Updater): докачиваются только изменившиеся файлы.
 * Игра открывается с адреса https://tron.game/ — его запросы приложение обслуживает само:
 * сначала скачанные файлы из памяти телефона, а если их нет — встроенные из assets/game.
 */
public class MainActivity extends Activity {

    /** Папка игры на GitHub (публичный репозиторий) */
    private static final String REMOTE = "https://raw.githubusercontent.com/fillin669-sketch/Gvint/ccr-ed511808-3mdvrp/";
    private static final String HOST = "tron.game";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int APK_VERSION = 17;          // совпадает с versionCode в манифесте
    private static final long UPDATE_LIMIT_MS = 45000;  // дольше ждать обновление не будем

    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "application/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("txt", "text/plain");
        MIME.put("jpg", "image/jpeg"); MIME.put("jpeg", "image/jpeg"); MIME.put("png", "image/png"); MIME.put("webp", "image/webp");
        MIME.put("svg", "image/svg+xml"); MIME.put("woff2", "font/woff2"); MIME.put("mp3", "audio/mpeg");
    }

    private WebView web;
    private File gameDir;
    private long lastBackPress;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        gameDir = new File(getFilesDir(), "game");
        setVolumeControlStream(AudioManager.STREAM_MUSIC);   // кнопки громкости регулируют звук игры, а не звонка

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 9, 5));
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new GameClient());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        setContentView(web);
        hideSystemBars();

        if (state != null) {
            web.restoreState(state);
            return;
        }
        splash("Проверяем обновления…");
        new Thread(new Runnable() {
            @Override public void run() {
                Updater up = new Updater(REMOTE, gameDir, new Updater.Bundled() {
                    @Override public InputStream open() throws IOException { return getAssets().open("game/files.txt"); }
                }, new Updater.Progress() {
                    @Override public void update(final String text) {
                        runOnUiThread(new Runnable() { @Override public void run() { splash(text); } });
                    }
                });
                final String updated = up.run(UPDATE_LIMIT_MS);
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        web.loadUrl(START + "?apk=" + APK_VERSION + (updated != null ? "&updated=" + updated : ""));
                    }
                });
            }
        }).start();
    }

    private void splash(String text) {
        String html = "<html><body style='margin:0;background:#0d0905;color:#d9b45a;font-family:serif;display:flex;"
                + "align-items:center;justify-content:center;height:100vh;flex-direction:column'>"
                + "<div style='font-size:42px;letter-spacing:10px'>ТРОН</div>"
                + "<div style='margin-top:14px;font-size:16px;color:#b9a888'>" + text + "</div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private class GameClient extends WebViewClient {
        /** Обслуживаем запросы к https://tron.game/… из памяти телефона или из assets */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath() == null ? "" : u.getPath().replaceFirst("^/+", "");
            if (path.isEmpty()) path = "index.html";
            if (path.contains("..")) return notFound();
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            try {
                File f = new File(gameDir, path);
                InputStream in = f.isFile() ? new FileInputStream(f) : getAssets().open("game/" + path);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
        }

        /** Ссылки наружу (например, скачать новый APK) открываются в браузере */
        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url.startsWith("https://" + HOST + "/") && !url.endsWith(".apk")) return false;
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
        web.destroy();
        super.onDestroy();
    }
}
