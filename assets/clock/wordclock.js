// SPDX-License-Identifier: Apache-2.0
// Which cells of a language's grid light up at a given time. Everything
// language-specific is data (languages/*.json); this file has no word of any
// language in it. The screensaver loads it as a script, the tests as a module.
(function (root) {
  'use strict';

  // A step token is a word id, or the hour: `@this` or `@next` (the coming
  // hour, for "to" and "half" forms that count towards it), optionally with
  // the hour form to use, as in `@next.genitive`. The form defaults to `name`.
  var HOUR = /^@(this|next)(?:\.([A-Za-z_][A-Za-z0-9_]*))?$/;

  // The language with one of its variants applied. A variant replaces whole
  // entries: `steps` by index ("9": [...]), `hours` by form, `words` by id.
  function withVariant(language, variantId) {
    var variants = language.variants || [];
    var variant = null;
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].id === variantId) variant = variants[i];
    }
    if (!variant) return language;
    function merged(base, over) {
      var out = {};
      var key;
      for (key in base) out[key] = base[key];
      for (key in over || {}) out[key] = over[key];
      return out;
    }
    var steps = language.steps.slice();
    for (var index in variant.steps || {}) steps[Number(index)] = variant.steps[index];
    return {
      id: language.id,
      name: language.name,
      grid: language.grid,
      words: merged(language.words, variant.words),
      hours: merged(language.hours, variant.hours),
      steps: steps
    };
  }

  // The key of a language's usage setting: variant_ and its id, with any
  // character a setting key can't hold as an underscore (zh-Hans: variant_zh_Hans).
  function settingKey(language) {
    return 'variant_' + language.id.replace(/[^A-Za-z0-9_]/g, '_');
  }

  // The id of the variant a usage setting names, by the variant's name;
  // null for the base usage, nothing chosen or a name the file doesn't have.
  function variantNamed(language, name) {
    var variants = language.variants || [];
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].name === name) return variants[i].id;
    }
    return null;
  }

  // The word ids said at hour (0-23) and minute (0-59), in order.
  function wordsAt(language, hour, minute) {
    var step = language.steps[Math.floor(minute / 5)];
    var out = [];
    step.forEach(function (token) {
      var match = HOUR.exec(token);
      if (!match) {
        out.push(token);
        return;
      }
      var h = match[1] === 'next' ? (hour + 1) % 24 : hour;
      var forms = language.hours[match[2] || 'name'];
      forms[h % forms.length].forEach(function (id) { out.push(id); });
    });
    return out;
  }

  // What the face shows at hour and minute: the lit cells as "row,column"
  // keys, the words they come from, and the corner dots (0 to 4) for the
  // minutes past the five-minute step.
  function at(language, hour, minute, variantId) {
    var lang = withVariant(language, variantId);
    var words = wordsAt(lang, hour, minute);
    var cells = {};
    words.forEach(function (id) {
      lang.words[id].forEach(function (span) {
        for (var c = 0; c < span[2]; c++) cells[span[0] + ',' + (span[1] + c)] = true;
      });
    });
    return { words: words, cells: cells, dots: minute % 5 };
  }

  // The carousel's languages: the names in its setting, one per line as the
  // plugin passes them, that a language file answers to (known), in the
  // order given, repeats kept. Empty when there are none.
  function carouselNames(text, known) {
    if (typeof text !== 'string') return [];
    return text.split('\n').filter(function (name) { return known.indexOf(name) >= 0; });
  }

  // Which of names shows at date. The slot is counted from the local date,
  // not from when the page started, so a restart or a DST change lands on
  // the same language: whole local days, then hours, then five minutes.
  // every is '5 minutes', '1 hour' or '1 day'; anything else is an hour.
  // Null when names is empty.
  function carouselName(names, every, date) {
    if (!names.length) return null;
    var days = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    var slot = every === '1 day' ? days : days * 24 + date.getHours();
    if (every === '5 minutes') slot = slot * 12 + Math.floor(date.getMinutes() / 5);
    return names[((slot % names.length) + names.length) % names.length];
  }

  // Everything wrong with a language file, as sentences; empty when it is
  // sound. The tests run it on every file; the screensaver refuses a file
  // that fails it rather than light the wrong cells.
  function problems(language) {
    var out = [];
    var grid = language.grid;
    if (!Array.isArray(grid) || grid.length === 0) return ['no grid'];
    var width = Array.from(grid[0]).length;
    grid.forEach(function (row, r) {
      if (Array.from(row).length !== width) out.push('row ' + r + ' is not ' + width + ' cells wide');
    });
    var words = language.words || {};
    Object.keys(words).forEach(function (id) {
      words[id].forEach(function (span) {
        var r = span[0], c = span[1], n = span[2];
        if (!(r >= 0 && r < grid.length && c >= 0 && n > 0 && c + n <= width)) {
          out.push('word ' + id + ' has a span outside the grid');
        }
      });
    });
    function knownWord(id, where) {
      if (!Object.prototype.hasOwnProperty.call(words, id)) out.push(where + ' names unknown word ' + id);
    }
    var hours = language.hours || {};
    if (!hours.name) out.push('no `name` hour form');
    Object.keys(hours).forEach(function (form) {
      if (hours[form].length !== 12 && hours[form].length !== 24) {
        out.push('hour form ' + form + ' has ' + hours[form].length + ' entries, not 12 or 24');
      }
      hours[form].forEach(function (ids, h) {
        ids.forEach(function (id) { knownWord(id, 'hour form ' + form + '[' + h + ']'); });
      });
    });
    if (!Array.isArray(language.steps) || language.steps.length !== 12) out.push('there must be 12 steps');
    (language.steps || []).forEach(function (step, s) {
      step.forEach(function (token) {
        var match = HOUR.exec(token);
        if (!match) knownWord(token, 'step ' + s);
        else if (!hours[match[2] || 'name']) out.push('step ' + s + ' names unknown hour form ' + match[2]);
      });
    });
    return out;
  }

  var api = {
    at: at, wordsAt: wordsAt, withVariant: withVariant, variantNamed: variantNamed, settingKey: settingKey,
    problems: problems, carouselNames: carouselNames, carouselName: carouselName
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WordClock = api;
}(this));
