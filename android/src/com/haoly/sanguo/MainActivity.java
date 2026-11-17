package com.haoly.sanguo;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * 数独 App 的原生外壳。
 *
 * 页面资源全部打包在 assets/www 下，通过拦截一个虚拟的 https 源来提供，
 * 而不是用 file:// —— 这样 localStorage 与 Service Worker 都处于安全上下文中，
 * 存档、进度和离线缓存才能正常工作。
 */
public class MainActivity extends Activity {

    private static final String TAG = "Sudoku";
    private static final String HOST = "sanguo.app";
    private static final String ORIGIN = "https://" + HOST;
    private static final String ASSET_ROOT = "www";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // 存档与进度依赖 localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setSaveFormData(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);     // 纯本地资源，无需联网校验
        }
        s.setUserAgentString(s.getUserAgentString() + " SudokuApp/1.0");

        web.addJavascriptInterface(new Bridge(), "SanguoBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;   // 站内路由交给 WebView 自己处理
                try {                                            // 站外链接甩给系统浏览器
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(ORIGIN + "/index.html");
        }
    }

    /* ------------------------------------------------------------------ *
     * 资源服务：把 assets/www 映射成 https://sanguo.app/
     * ------------------------------------------------------------------ */

    private WebResourceResponse serve(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";

        String rel = path.startsWith("/") ? path.substring(1) : path;
        if (rel.indexOf("..") >= 0) return notFound();          // 挡掉目录穿越
        if (rel.isEmpty()) rel = "index.html";

        String asset = ASSET_ROOT + "/" + rel;
        AssetManager am = getAssets();
        InputStream in = null;
        try {
            in = am.open(asset);
        } catch (IOException e1) {
            try {
                in = am.open(asset + "/index.html");             // 目录请求回退到 index.html
            } catch (IOException e2) {
                in = null;
            }
            if (in == null) {
                Log.w(TAG, "404 " + path);
                return notFound();
            }
        }
        return new WebResourceResponse(mimeOf(rel), "UTF-8", in);
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse(
                "text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.US);
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);

        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    /* ------------------------------------------------------------------ *
     * 生命周期
     * ------------------------------------------------------------------ */

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    /* ------------------------------------------------------------------ *
     * 前端可调用的原生能力
     * ------------------------------------------------------------------ */

    private final class Bridge {

        /** 让状态栏跟随网页主题（传入 #rrggbb）。 */
        @JavascriptInterface
        public void setStatusBarColor(String color) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        int c = Color.parseColor(color);
                        Window w = getWindow();
                        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                        w.setStatusBarColor(c);
                        // 用亮度判断状态栏该用深字还是浅字
                        double lum = 0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            int flags = w.getDecorView().getSystemUiVisibility();
                            if (lum > 186) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            else flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            w.getDecorView().setSystemUiVisibility(flags);
                        }
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public int getVersionCode() {
            return 1;
        }
    }
}
