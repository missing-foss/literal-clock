// SPDX-License-Identifier: Apache-2.0
import java.util.HashMap;
import java.util.Map;
import me.jxl.kiosk.plugins.PluginHost;
import org.missing_foss.literalclock.LiteralClockPlugin;

/** The plugin publishes its renderer at start, and again only when a setting changes it. */
public final class LiteralClockTest {
    static final class Host implements PluginHost {
        int publications;
        String key, title, entry;
        Map<String, Object> options;
        public void publishScreensaverAsset(String key, String title, String entry, Map<String, Object> data) {
            this.key = key; this.title = title; this.entry = entry; options = new HashMap<>(data); publications++;
        }
        public void showWindow(String title, String message, String buttonLabel) { throw new AssertionError("no window"); }
        public void hideWindow() {}
        public void log(String message) {}
    }

    static Map<String, Object> defaults() {
        Map<String, Object> s = new HashMap<>();
        s.put("language", "English");
        s.put("litColor", "#FFFFFF");
        s.put("unlitColor", "#262626");
        s.put("backgroundColor", "#000000");
        s.put("minuteDots", true);
        s.put("size", 85.0);
        s.put("drift", true);
        return s;
    }

    public static void main(String[] args) throws Exception {
        Host host = new Host();
        LiteralClockPlugin plugin = new LiteralClockPlugin();
        Map<String, Object> settings = defaults();
        plugin.start(host, settings);
        assert host.publications == 1 : "published at start";
        assert "literal_clock".equals(host.key) && "Literal Clock".equals(host.title) && "clock/index.html".equals(host.entry);
        assert "English".equals(host.options.get("languageName"));
        assert Boolean.TRUE.equals(host.options.get("dots")) && Boolean.TRUE.equals(host.options.get("drift"));
        assert Double.valueOf(85).equals(host.options.get("size"));

        plugin.configure(defaults());
        assert host.publications == 1 : "unchanged settings do not recreate the page";

        settings = defaults();
        settings.put("language", "Français");
        settings.put("minuteDots", false);
        settings.put("litColor", "#FF8800");
        plugin.configure(settings);
        assert host.publications == 2 : "a changed setting publishes again";
        assert "Français".equals(host.options.get("languageName"));
        assert Boolean.FALSE.equals(host.options.get("dots"));
        assert "#FF8800".equals(host.options.get("lit"));

        settings.put("litColor", "not a colour");
        settings.put("size", 500.0);
        plugin.configure(settings);
        assert "#FFFFFF".equals(host.options.get("lit")) : "a bad colour falls back";
        assert Double.valueOf(100).equals(host.options.get("size")) : "size is clamped";

        settings = defaults();
        settings.put("language", "Deutsch");
        settings.put("variant_de", "viertel vier, dreiviertel vier");
        settings.put("variantless", "not passed");
        plugin.configure(settings);
        assert "viertel vier, dreiviertel vier".equals(host.options.get("variant_de")) : "a usage setting reaches the page";
        assert !host.options.containsKey("variantless") : "other keys do not";

        plugin.stop();
        int before = host.publications;
        plugin.configure(defaults());
        assert host.publications == before : "nothing is published after stop";
        System.out.println("LiteralClockTest: ok");
    }
}
