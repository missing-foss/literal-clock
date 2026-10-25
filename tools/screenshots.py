#!/usr/bin/env python3
"""Render the README's screenshots from the clock page in this repository.

Each shot is the page in assets/clock/ with the given settings, at a fixed
time, in headless Chromium; ffmpeg turns the frames into WebP. The script then
rewrites the README's Screenshots section, so each caption lists the exact
settings behind its image. Run it again for each release:

    python3 tools/screenshots.py [--chromium PATH] [--port N]

It needs Chromium (or Chrome) and ffmpeg with libwebp. Fonts come from the
system: the Chinese grid needs a CJK font, Serbian a Cyrillic one.
"""
import argparse
import base64
import contextlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import http.server
import functools
import select
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SHOTS_DIR = 'docs/screenshots'
START, END = '<!-- screenshots:start -->', '<!-- screenshots:end -->'

# ---- This clock -------------------------------------------------------------

NAME = 'Literal Clock'
TIME = (10, 47, 0)  # one time for every still: several words lit, two minute dots
LARGE, SMALL, ANIMATION = (1280, 800), (960, 480), (800, 500)
STILL_AT = 1500  # ms of the page's time before a still is taken
# Settings every shot shares, and the captions don't repeat.
COMMON = {'drift': False}

HERO = {'file': 'english', 'settings': {}}
GRID = [
    {'file': 'francais', 'settings': {'language': 'Français'}},
    {'file': 'deutsch', 'settings': {'language': 'Deutsch', 'variant_de': 'viertel vier, dreiviertel vier'}},
    {'file': 'nederlands', 'settings': {'language': 'Nederlands'}},
    {'file': 'espanol', 'settings': {'language': 'Español'}},
    {'file': 'portugues-brasil', 'settings': {'language': 'Português', 'variant_pt': 'Brasil (quinze, para as)'}},
    {'file': 'italiano', 'settings': {'language': 'Italiano'}},
    {'file': 'srpski-latinica', 'settings': {'language': 'Srpski (latinica)'}},
    {'file': 'srpski-cirilica', 'settings': {'language': 'Српски (ћирилица)'}},
    {'file': 'zh-hans', 'settings': {'language': '简体中文'}},
    {'file': 'custom-colours', 'settings': {
        'litColor': '#FFC872', 'unlitColor': '#1D2B45', 'backgroundColor': '#0B1426'}},
    {'file': 'smaller-no-dots', 'settings': {'size': 60, 'minuteDots': False}},
    # The carousel moving through three languages: a still in each of three
    # five-minute slots (Deutsch, English, Français in turn), each held, with
    # the page's 0.6 s fade out and in between them.
    {'file': 'carousel', 'settings': {
        'carousel': True, 'carouselEvery': '5 minutes',
        'carouselLanguages': [{'language': 'English'}, {'language': 'Français'}, {'language': 'Deutsch'}]},
     'animation': {'fps': 5, 'hold': 2.6, 'fade': 0.6, 'stills': [(10, 42, 0), (10, 47, 0), (10, 52, 0)]}},
]
SMALL_SHOT = {'file': 'small-screen', 'settings': {}, 'size': SMALL}


def page_options(settings):
    """The page's options for these settings, as ClockOptions.java makes them."""
    def color(value, fallback):
        ok = isinstance(value, str) and len(value) == 7 and value[0] == '#' and all(
            c in '0123456789abcdefABCDEF' for c in value[1:])
        return value if ok else fallback
    size = settings.get('size', 85)
    every = settings.get('carouselEvery')
    data = {
        'languageName': settings['language'] if isinstance(settings.get('language'), str) else 'English',
        'lit': color(settings.get('litColor'), '#FFFFFF'),
        'unlit': color(settings.get('unlitColor'), '#262626'),
        'background': color(settings.get('backgroundColor'), '#000000'),
        'dots': settings.get('minuteDots') is not False,
        'size': max(40, min(100, size)),
        'drift': settings.get('drift') is not False,
        'carousel': settings.get('carousel') is True,
        'carouselLanguages': '\n'.join(row['language'] for row in settings.get('carouselLanguages', [])),
        'carouselEvery': every if every in ('5 minutes', '1 day') else '1 hour',
    }
    for key in sorted(settings):
        if key.startswith('variant_') and isinstance(settings[key], str):
            data[key] = settings[key]
    return data

# ---- The renderer -----------------------------------------------------------

# Runs before the page's own scripts: Date starts at the shot's time and runs
# with the page's (virtual) clock, and Math.random repeats from a fixed seed,
# so a shot renders the same each time.
SHIM = """<script>(function () {
  var Real = Date, start = new Real(%(y)d, 0, 15, %(h)d, %(m)d, %(s)d).getTime(), t0 = performance.now();
  function now() { return start + (performance.now() - t0); }
  function Fixed() {
    if (!(this instanceof Fixed)) return new Real(now()).toString();
    if (!arguments.length) return new Real(now());
    return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
  }
  Fixed.prototype = Real.prototype; Fixed.now = now; Fixed.UTC = Real.UTC; Fixed.parse = Real.parse;
  Date = Fixed;
  var seed = 20261025;
  Math.random = function () {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();</script>"""


def manifest():
    return json.loads((ROOT / 'kiosk-satellite-plugin.json').read_text(encoding='utf-8'))


def legend(settings, specs):
    """The caption: each setting the shot changes, as the settings screen names it."""
    parts = []
    for key, value in settings.items():
        spec = specs[key]
        if spec['type'] == 'boolean':
            value = 'on' if value else 'off'
        elif spec['type'] == 'number':
            value = f"{value} {spec.get('unit', '')}".strip()
        elif spec['type'] == 'list':
            value = ', '.join(row[spec['row']['title']] for row in value)
        parts.append(f"{spec['title']}: {value}")
    return ' · '.join(parts) or 'Every setting at its default'


class Browser:
    """Headless Chromium, driven over DevTools on --remote-debugging-pipe.

    One page load per shot, with virtual time stepped between screenshots:
    the page's timers, and so its frames, land at the same moments on every
    run, which separate loads per frame do not.
    """

    def __init__(self, chromium, profile):
        commands_in, self.commands = os.pipe()
        self.replies, replies_out = os.pipe()

        def pipes():  # Chromium reads DevTools commands on fd 3, writes replies on fd 4
            os.dup2(commands_in, 3)
            os.dup2(replies_out, 4)
        self.process = subprocess.Popen(
            [chromium, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
             '--no-default-browser-check', '--remote-debugging-pipe', f'--user-data-dir={profile}', 'about:blank'],
            pass_fds=(3, 4), preexec_fn=pipes, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.close(commands_in)
        os.close(replies_out)
        self.buffer, self.last_id, self.events, self.session = b'', 0, [], None

    def _message(self):
        while b'\0' not in self.buffer:
            ready, _, _ = select.select([self.replies], [], [], 60)
            chunk = os.read(self.replies, 1 << 20) if ready else b''
            if not chunk:
                raise SystemExit('Chromium stopped answering on the DevTools pipe')
            self.buffer += chunk
        message, self.buffer = self.buffer.split(b'\0', 1)
        return json.loads(message)

    def send(self, method, **params):
        self.last_id += 1
        message = {'id': self.last_id, 'method': method, 'params': params}
        if self.session:
            message['sessionId'] = self.session
        os.write(self.commands, json.dumps(message).encode() + b'\0')
        while True:
            reply = self._message()
            if reply.get('id') == self.last_id:
                if 'error' in reply:
                    raise SystemExit(f'Chromium refused {method}: {reply["error"]}')
                return reply['result']
            self.events.append(reply)

    def wait(self, event):
        while True:
            message = self.events.pop(0) if self.events else self._message()
            if message.get('method') == event:
                return message

    def frames(self, url, size, times_ms):
        """PNG screenshots of url at each virtual time (ms after navigation)."""
        target = self.send('Target.createTarget', url='about:blank')['targetId']
        self.session = self.send('Target.attachToTarget', targetId=target, flatten=True)['sessionId']
        self.send('Emulation.setDeviceMetricsOverride', width=size[0], height=size[1], deviceScaleFactor=1, mobile=False)
        self.send('Emulation.setVirtualTimePolicy', policy='pause')
        self.send('Page.navigate', url=url)
        shots, elapsed = [], 0
        for time_ms in times_ms:
            if time_ms > elapsed:
                self.send('Emulation.setVirtualTimePolicy', policy='pauseIfNetworkFetchesPending',
                          budget=time_ms - elapsed)
                self.wait('Emulation.virtualTimeBudgetExpired')
                elapsed = time_ms
            shots.append(base64.b64decode(self.send('Page.captureScreenshot', format='png')['data']))
        return shots

    def close(self):
        self.session = None
        try:
            self.send('Browser.close')
        except SystemExit:
            self.process.kill()
        self.process.wait(timeout=30)


class Renderer:
    def __init__(self, chromium, ffmpeg, port, work):
        self.chromium, self.ffmpeg, self.work = chromium, ffmpeg, Path(work)
        self.site = self.work / 'site'
        handler = functools.partial(QuietHandler, directory=str(self.site))
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.port = self.server.server_address[1]
        self.pages = 0

    def page(self, start, options):
        """The URL of a copy of the clock page that starts at start, with options."""
        self.pages += 1
        folder = self.site / f'p{self.pages}'
        shutil.copytree(ROOT / 'assets/clock', folder)
        index = folder / 'index.html'
        shim = SHIM % {'y': 2026, 'h': start[0], 'm': start[1], 's': start[2]}
        html = index.read_text(encoding='utf-8')
        if '<head>' not in html:
            raise SystemExit('assets/clock/index.html has no <head> for the time shim')
        index.write_text(html.replace('<head>', '<head>' + shim, 1), encoding='utf-8')
        fragment = json.dumps(options, ensure_ascii=False, separators=(',', ':'))
        return f'http://127.0.0.1:{self.port}/p{self.pages}/index.html#' + quote(fragment, safe='')

    def frames(self, url, size, times_ms, stem):
        browser = Browser(self.chromium, self.work / f'profile-{self.pages}')
        try:
            shots = browser.frames(url, size, times_ms)
        finally:
            browser.close()
        paths = []
        for i, data in enumerate(shots):
            paths.append(self.work / f'{stem}-{i:03d}.png')
            paths[-1].write_bytes(data)
        return paths

    def still(self, options, size, out, at_ms):
        png, = self.frames(self.page(TIME, options), size, [at_ms], out.stem)
        self.encode([self.ffmpeg, '-y', '-loglevel', 'error', '-i', str(png),
                     '-c:v', 'libwebp', '-lossless', '0', '-quality', '90', '-compression_level', '6', str(out)])

    def animation(self, options, spec, out):
        """Stills, each held, faded out to black and in again between them.

        The fade is composed here rather than captured: Chromium runs CSS
        transitions on its compositor clock, outside the virtual time this
        script steps, so captured fade frames land anywhere.
        """
        pngs = [self.frames(self.page(start, options), LARGE, [STILL_AT], f'{out.stem}-{n}')[0]
                for n, start in enumerate(spec['stills'])]
        fade, length = spec['fade'], spec['hold'] + 2 * spec['fade']
        inputs, chains = [], []
        for n, png in enumerate(pngs):
            inputs += ['-loop', '1', '-framerate', str(spec['fps']), '-t', f'{length:.3f}', '-i', str(png)]
            chains.append(f'[{n}:v]fade=t=in:st=0:d={fade},fade=t=out:st={length - fade:.3f}:d={fade}[v{n}]')
        graph = ';'.join(chains) + ';' + ''.join(f'[v{n}]' for n in range(len(pngs))) + \
            f'concat=n={len(pngs)}:v=1:a=0,scale={ANIMATION[0]}:{ANIMATION[1]}:flags=lanczos'
        self.encode([self.ffmpeg, '-y', '-loglevel', 'error', *inputs, '-filter_complex', graph,
                     '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '75', '-compression_level', '6',
                     '-loop', '0', str(out)])

    def encode(self, command):
        run = subprocess.run(command, capture_output=True, text=True)
        if run.returncode != 0:
            raise SystemExit(f'ffmpeg failed:\n{run.stderr[-2000:]}')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def cell(shot, caption, width=None):
    alt = f'{NAME} at {TIME[0]}:{TIME[1]:02d}. {caption}'
    if 'animation' in shot:
        alt = f'{NAME}, animated. {caption}'
    attribute = f' width="{width}"' if width else ''
    return (f'<img src="{SHOTS_DIR}/{shot["file"]}.webp"{attribute} alt="{alt}"><br>'
            f'<sub>{caption}</sub>')


def section(captions):
    rows = []
    for i in range(0, len(GRID), 2):
        pair = GRID[i:i + 2]
        cells = ''.join(f'<td width="50%" valign="top">{cell(s, captions[s["file"]])}</td>' for s in pair)
        rows.append(f'<tr>{cells}</tr>')
    small = SMALL_SHOT
    small_caption = f'{small["size"][0]} × {small["size"][1]} screen · {captions[small["file"]]}'
    return '\n'.join([
        START,
        '## Screenshots',
        '',
        f'<p align="center">{cell(HERO, captions[HERO["file"]])}</p>',
        '',
        f'<table>\n' + '\n'.join(rows) + f'\n<tr><td colspan="2" align="center">'
        f'{cell(small, small_caption, small["size"][0] // 2)}</td></tr>\n</table>',
        '',
        f'All at {TIME[0]}:{TIME[1]:02d}, with Slow drift off; every other setting at its default. '
        'Regenerate with `python3 tools/screenshots.py`.',
        END,
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--chromium', default=os.environ.get('CHROMIUM', 'chromium'), help='Chromium or Chrome binary')
    parser.add_argument('--ffmpeg', default='ffmpeg', help='ffmpeg binary, with libwebp')
    parser.add_argument('--port', type=int, default=0, help='Port for the local page server (default: any free one)')
    parser.add_argument('--only', help='Render just this file name (no extension); the README is left alone')
    parser.add_argument('--work', help='Keep the page copies and frames in this empty folder, to check them')
    args = parser.parse_args()
    specs = {s['key']: s for s in manifest()['settings']}
    defaults = {key: spec['default'] for key, spec in specs.items()}
    out_dir = ROOT / SHOTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    captions = {}
    if args.work:
        Path(args.work).mkdir(parents=True)  # refuses an existing folder: frames would mix
    with (contextlib.nullcontext(args.work) if args.work else tempfile.TemporaryDirectory()) as work:
        (Path(work) / 'site').mkdir()
        renderer = Renderer(args.chromium, args.ffmpeg, args.port, work)
        for shot in [HERO] + GRID + [SMALL_SHOT]:
            unknown = set(shot['settings']) - set(specs)
            if unknown:
                raise SystemExit(f'{shot["file"]}: no such setting {sorted(unknown)}')
            captions[shot['file']] = legend(shot['settings'], specs)
            if args.only and shot['file'] != args.only:
                continue
            options = page_options({**defaults, **COMMON, **shot['settings']})
            out = out_dir / f'{shot["file"]}.webp'
            if 'animation' in shot:
                renderer.animation(options, shot['animation'], out)
            else:
                renderer.still(options, shot.get('size', LARGE), out, shot.get('at', STILL_AT))
            print(f'{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB')
        renderer.server.shutdown()
    if args.only:
        return
    readme = ROOT / 'README.md'
    text = readme.read_text(encoding='utf-8')
    if START not in text or END not in text:
        raise SystemExit(f'README.md needs the {START} and {END} markers')
    head, rest = text.split(START, 1)
    readme.write_text(head + section(captions) + rest.split(END, 1)[1], encoding='utf-8')
    print('README.md: Screenshots section rewritten')


if __name__ == '__main__':
    main()
