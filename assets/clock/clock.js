// SPDX-License-Identifier: Apache-2.0
// The screensaver: draws the chosen language's grid and lights the words for
// the current time, once a minute. Kiosk Satellite passes the settings in the
// URL fragment and recreates the page when they change.
(function () {
  'use strict';
  var options = {};
  try { options = JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')); } catch (_) {}
  function color(value, fallback) {
    return typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value) ? value : fallback;
  }
  // The setting gives the language's name; languages/index.json gives its file.
  var languageName = typeof options.languageName === 'string' ? options.languageName : 'English';
  var size = typeof options.size === 'number' && isFinite(options.size) ? Math.max(40, Math.min(100, options.size)) : 85;
  var style = document.documentElement.style;
  style.setProperty('--lit', color(options.lit, '#FFFFFF'));
  style.setProperty('--unlit', color(options.unlit, '#262626'));
  style.setProperty('--background', color(options.background, '#000000'));
  style.setProperty('--dots', options.dots === false ? 'none' : 'block');

  var face = document.getElementById('face');
  var grid = document.getElementById('grid');
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dot'));
  var data = null;
  var variant = null;
  var cells = {};

  // Square cells, as large as the viewport allows with a cell's margin all
  // round (the corner dots sit in it), scaled by the size setting. Written as
  // CSS in viewport units, so the face follows any change of the viewport:
  // a WebView can settle on its size after the page has run, without a
  // resize event.
  function layout() {
    var rows = data.grid.length + 2, columns = Array.from(data.grid[0]).length + 2;
    var css = ':root { --columns: ' + (columns - 2) + '; --cell: calc(' + size + 'vw / ' + columns + '); }\n' +
      '@media (min-aspect-ratio: ' + columns + '/' + rows + ') { :root { --cell: calc(' + size + 'vh / ' + rows + '); } }';
    var sheet = document.createElement('style');
    sheet.textContent = css;
    document.head.appendChild(sheet);
  }

  // A slow drift of a quarter of a cell, one step a minute, round a small
  // circle in an hour: cheap, and the letters never sit still for long.
  function drift(now) {
    if (options.drift === false) return;
    var angle = (now.getMinutes() / 60) * 2 * Math.PI;
    style.setProperty('--drift-x', (Math.cos(angle) * 0.25).toFixed(3));
    style.setProperty('--drift-y', (Math.sin(angle) * 0.25).toFixed(3));
  }

  function render(now) {
    var state = WordClock.at(data, now.getHours(), now.getMinutes(), variant);
    Object.keys(cells).forEach(function (key) { cells[key].classList.toggle('lit', !!state.cells[key]); });
    dots.forEach(function (dot, i) { dot.classList.toggle('lit', i < state.dots); });
    face.setAttribute('aria-label', state.words.join(' '));
    drift(now);
  }

  function tick() {
    var now = new Date();
    render(now);
    // Wake just after the next minute starts.
    setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }

  function build() {
    grid.textContent = '';
    cells = {};
    data.grid.forEach(function (row, r) {
      Array.from(row).forEach(function (letter, c) {
        var span = document.createElement('span');
        span.textContent = letter;
        grid.appendChild(span);
        cells[r + ',' + c] = span;
      });
    });
    document.documentElement.lang = data.id;
  }

  function json(file) {
    return fetch(file).then(function (response) { return response.json(); });
  }
  json('languages/index.json')
    .then(function (index) {
      var chosen = index.filter(function (entry) { return entry.name === languageName; })[0] || index[0];
      if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(chosen.id)) throw new Error('bad language id');
      return json('languages/' + chosen.id + '.json');
    })
    .then(function (loaded) {
      // A file that fails its own checks would light the wrong words: show
      // nothing instead, which is plainly broken rather than quietly wrong.
      // The usage chosen in the language's setting, by its name; the base
      // usage, or anything unknown, is no variant.
      variant = WordClock.variantNamed(loaded, options[WordClock.settingKey(loaded)]);
      if (WordClock.problems(WordClock.withVariant(loaded, variant)).length) return;
      data = loaded;
      build();
      layout();
      tick();
    })
    .catch(function () {});
}());
