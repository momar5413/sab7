package com.sab7.tasbeeh;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeKeysPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // When enabled from the app, volume buttons count instead of changing the volume.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean volumeKey = code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN;
        if (VolumeKeysPlugin.enabled && volumeKey) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                VolumeKeysPlugin.press(code == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
