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
| 简体中文 | 6×6 | *一刻, 三刻* (default), *四十五分* or *差五分* |

A language is data, not code: a grid, the words as cells, and a sentence for each five minutes. [Adding a language](docs/adding-a-language.md) says how.

## Settings

Under **Plugin Manager → Literal Clock**:

- **Language**, and that language's usage choice, if it has one;
- **Lit letters**, **Unlit letters** and **Background** colours;
- **Minute dots**: the corner dots, one for each minute past the five-minute step, clockwise from the top left;
- **Size**: how much of the screen the clock fills;
- **Slow drift**: moves the clock a little each minute, round a small circle once an hour.

Choose **Literal Clock** under **Screensaver → Screensaver mode**. Kiosk Satellite decides when the screensaver shows; the clock redraws once a minute and does nothing in between. The letters use the system font, so no font is shipped.

## Install

For testing, build the ZIP (below) and use **Plugin Manager → Developer Tools → Install from ZIP**.

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
