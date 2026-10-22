// SPDX-License-Identifier: Apache-2.0
package org.missing_foss.literalclock;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/** The rendering options for assets/clock/index.html, from the plugin's settings. */
final class ClockOptions {
    private ClockOptions() {}

    private static String color(Object value, String fallback) {
        return value instanceof String && ((String) value).matches("#[a-fA-F0-9]{6}") ? (String) value : fallback;
    }

    static Map<String, Object> from(Map<String, Object> settings) {
        Map<String, Object> data = new LinkedHashMap<>();
        // The language's name as the setting shows it; the page finds its file
        // in languages/index.json, so a new language needs no code here.
        Object language = settings.get("language");
        data.put("languageName", language instanceof String ? language : "English");
        data.put("lit", color(settings.get("litColor"), "#FFFFFF"));
        data.put("unlit", color(settings.get("unlitColor"), "#262626"));
        data.put("background", color(settings.get("backgroundColor"), "#000000"));
        data.put("dots", !Boolean.FALSE.equals(settings.get("minuteDots")));
        Object size = settings.get("size");
        double percent = size instanceof Number ? ((Number) size).doubleValue() : 85;
        data.put("size", Double.isFinite(percent) ? Math.max(40, Math.min(100, percent)) : 85);
        data.put("drift", !Boolean.FALSE.equals(settings.get("drift")));
        // A language's usage choices (variant_de and the like), as the
        // setting names them: the page matches them to the language file.
        for (Map.Entry<String, Object> setting : new TreeMap<>(settings).entrySet()) {
            if (setting.getKey().startsWith("variant_") && setting.getValue() instanceof String) {
                data.put(setting.getKey(), setting.getValue());
            }
        }
        return data;
    }
}
