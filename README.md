<p align="center"><img src="assets/icon.png" width="128" alt="Literal Clock icon"></p>

# Literal Clock

A word clock screensaver for [Kiosk Satellite](https://github.com/jxlarrea/kiosk-satellite): a grid of letters where the words that tell the time light up, "IT IS TWENTY PAST FOUR", with four corner dots for the minutes in between.

## Languages

| Language | Grid | Usage choices |
|---|---|---|
| English | 11×10 | |
| Français | 11×10 | |
| Deutsch | 11×10 | *viertel nach drei, viertel vor vier* (default) or *viertel vier, dreiviertel vier* |
| Nederlands | 11×10 | |
| Italiano | 11×12 | *mezzogiorno, mezzanotte* (default) or *sono le dodici* |
| Español | 11×11 | *son las tres* (default) or *son las tres en punto* |
| Português † | 16×9 | *Portugal (um quarto, menos)* (default) or *Brasil (quinze, para as)* |
| Srpski (latinica) † | 15×9 | |
| Српски (ћирилица) † | 15×9 | |
| 简体中文 | 6×6 | *一刻, 三刻* (default), *四十五分* or *差五分* |

† Unverified: the wording still waits for a native speaker's check.

A language is data, not code: a grid, the words as cells, and a sentence for each five minutes. [Adding a language](docs/adding-a-language.md) says how.

## Settings

Under **Plugin Manager → Literal Clock**:

- **Language**, and that language's usage choice, if it has one;
- **Language carousel**: several languages in turn, in the order of the **Carousel languages** list (a language listed twice shows twice as often), changing every five minutes, on the hour or at midnight (**Change every**, one hour by default), with a short fade. Each language keeps its own usage choice. Off, or with no language in the list, **Language** applies;
- **Lit letters**, **Unlit letters** and **Background** colours;
- **Minute dots**: the corner dots, one for each minute past the five-minute step, clockwise from the top left;
- **Size**: how much of the screen the clock fills;
- **Slow drift**: moves the clock a little each minute, round a small circle once an hour.

Choose **Literal Clock** under **Screensaver → Screensaver mode**. Kiosk Satellite decides when the screensaver shows; the clock redraws once a minute and does nothing in between. The letters use the system font, so no font is shipped.

## Installation

### Community Plugins (Recommended)

Literal Clock is listed in [Community Plugins](https://kiosksatellite.com/plugins/). Use the button below to open it in your Kiosk Satellite and install it.

[![Install in Kiosk Satellite](https://kiosksatellite.com/img/badges/plugin-add.svg)](https://kiosksatellite.com/redirect/plugin/?repository=missing-foss/literal-clock)

Or search for `Literal Clock` in **Settings > Plugin Manager > Browse plugins** in Kiosk Satellite.

### Manual

1. Open **Settings > Plugin Manager** in Kiosk Satellite and turn on **Enable Plugins**.
2. Choose **Add plugin**, paste `https://github.com/missing-foss/literal-clock` and choose **Preview**.
3. Review the plugin and choose **Trust and install**.

### From a ZIP

For testing, build the ZIP (below) and use **Plugin Manager → Developer Tools → Install from ZIP**.

## Data

Literal Clock sends no data anywhere: it reads only its own files and makes no network request.

## Develop

You need Python 3, JDK 17 or newer, Node.js 18 or newer, and an Android SDK with a platform and build-tools (`ANDROID_HOME` set).

```sh
python3 tools/test.py                            # every test
python3 tools/build.py --android-platform 35     # dist/literal-clock-<version>.zip
```

`tools/test.py` runs:

- the plugin against the SDK;
- the clock for every minute of the day in every language and usage, against the reviewed sentences in `tests/expected/`;
- the build tools' own tests.

The screensaver itself is `assets/clock/`: an HTML page, with `wordclock.js` turning a time into lit cells. The Java plugin only publishes the page with its settings.

The icon's source is `art/icon.svg`. Render it with `rsvg-convert -w 256 -h 256 art/icon.svg -o assets/icon.png` (it needs the DejaVu Sans Bold font).

## Licence

[Apache-2.0](LICENSE), as the plugin template and SDK it builds on.
