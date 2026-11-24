package de.schulprojekt.konfetti;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Bildschirm bleibt während des Spielens an
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xFF14111F);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // damit die Spielernamen gespeichert bleiben
        web.setWebChromeClient(new WebChromeClient()); // für alert()-Hinweise
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    // Zurück-Taste: im Spiel zurück zum Menü, im Menü App schließen
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
            "(function(){var b=document.querySelector('.back');" +
            "if(b){b.click();return true;}" +
            "if(!document.querySelector('.tile')){home();return true;}return false;})()",
            result -> { if (!"true".equals(result)) finish(); });
    }
}
