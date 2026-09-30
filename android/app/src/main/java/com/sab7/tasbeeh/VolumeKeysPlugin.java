package com.sab7.tasbeeh;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app count with the hardware volume buttons.
 * JS enables it with VolumeKeys.setEnabled({ enabled }) and listens for "press" events.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    static volatile boolean enabled = false;
    private static VolumeKeysPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    static void press(String direction) {
        VolumeKeysPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("direction", direction);
        plugin.notifyListeners("press", data);
    }
}
