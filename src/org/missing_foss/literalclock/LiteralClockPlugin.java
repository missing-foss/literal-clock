// SPDX-License-Identifier: Apache-2.0
package org.missing_foss.literalclock;

import java.util.Map;
import me.jxl.kiosk.plugins.KioskPlugin;
import me.jxl.kiosk.plugins.PluginHost;

/**
 * The word clock screensaver. Kiosk Satellite owns when it shows; this only
 * publishes the renderer, and again when a setting that changes it does.
 */
public final class LiteralClockPlugin implements KioskPlugin {
    static final String KEY = "literal_clock";
    static final String TITLE = "Literal Clock";
    static final String ENTRY = "clock/index.html";

    private PluginHost host;
    private Map<String, Object> published;

    @Override
    public void start(PluginHost host, Map<String, Object> settings) {
        this.host = host;
        publish(settings);
    }

    @Override
    public void configure(Map<String, Object> settings) {
        publish(settings);
    }

    private void publish(Map<String, Object> settings) {
        if (host == null) return;
        Map<String, Object> options = ClockOptions.from(settings);
        // Publishing recreates the page, so only on a change.
        if (options.equals(published)) return;
        host.publishScreensaverAsset(KEY, TITLE, ENTRY, options);
        published = options;
    }

    @Override
    public void execute(String command, Map<String, Object> arguments) {}

    @Override
    public void onEvent(String event, Map<String, Object> payload) {}

    @Override
    public void stop() {
        // Kiosk Satellite removes the renderer when the session ends.
        host = null;
        published = null;
    }
}
