// SPDX-License-Identifier: Apache-2.0
// Every minute of the day, in every language and variant: the lit cells,
// read left to right and top to bottom, spell the expected sentence, and the
// corner dots count the minutes past it. The expected sentences are in
// tests/expected/, one per five minutes, written and reviewed apart from the
// language files: a mistake in a language file cannot also be in them.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const WordClock = require('../assets/clock/wordclock.js');

const languagesDir = path.join(__dirname, '..', 'assets', 'clock', 'languages');
const expectedDir = path.join(__dirname, 'expected');

const languages = fs.readdirSync(languagesDir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(languagesDir, f), 'utf8')));

// The base of each language, then each variant: `en`, `de`, `de.regional`.
const faces = languages.flatMap((language) => [
  { language, variant: null, name: language.id },
  ...(language.variants || []).map((v) => ({ language, variant: v.id, name: `${language.id}.${v.id}` })),
]);

// Only letters count: a hyphen cell, an apostrophe or a space neither adds
// to nor breaks the spelling.
const letters = (text) => Array.from(text.normalize('NFC')).filter((ch) => /\p{L}/u.test(ch)).join('');

function litText(language, cells) {
  let out = '';
  language.grid.forEach((row, r) => {
    Array.from(row).forEach((ch, c) => { if (cells[`${r},${c}`]) out += ch; });
  });
  return out;
}

function expectedSentences(name) {
  const file = path.join(expectedDir, `${name}.txt`);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const byStep = new Map();
  for (const line of lines) {
    const m = /^(\d\d):(\d\d) (.+)$/.exec(line);
    assert.ok(m, `${name}.txt: unreadable line "${line}"`);
    byStep.set(Number(m[1]) * 60 + Number(m[2]), m[3]);
  }
  return byStep;
}

test('every language file is sound, base and variants', () => {
  for (const face of faces) {
    const language = WordClock.withVariant(face.language, face.variant);
    assert.deepStrictEqual(WordClock.problems(language), [], face.name);
  }
});

test('every face has its expected sentences, and every expected file a face', () => {
  const names = faces.map((f) => f.name).sort();
  const files = fs.readdirSync(expectedDir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).sort();
  assert.deepStrictEqual(files, names);
});

for (const face of faces) {
  test(`${face.name}: every minute of the day`, () => {
    const language = WordClock.withVariant(face.language, face.variant);
    const expected = expectedSentences(face.name);
    assert.strictEqual(expected.size, 288, `${face.name}.txt must give all 288 five-minute steps`);
    let checked = 0;
    for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay++) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const sentence = expected.get(minuteOfDay - (minute % 5));
      const face_ = WordClock.at(face.language, hour, minute, face.variant);
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      assert.strictEqual(letters(litText(language, face_.cells)), letters(sentence), `${face.name} ${time}: "${sentence}"`);
      assert.strictEqual(face_.dots, minute % 5, `${face.name} ${time}: corner dots`);
      checked++;
    }
    assert.strictEqual(checked, 1440);
  });
}

test('a broken language file is reported, not lit', () => {
  const bad = {
    grid: ['AB', 'C'],
    words: { A: [[0, 0, 1]], OUT: [[0, 1, 5]] },
    hours: { name: [['A']] },
    steps: [['A', 'NOPE', '@this.genitive']],
  };
  const found = WordClock.problems(bad).join('\n');
  for (const expected of ['row 1 is not 2 cells wide', 'word OUT has a span outside the grid',
    'hour form name has 1 entries', 'there must be 12 steps', 'step 0 names unknown word NOPE',
    'step 0 names unknown hour form genitive']) {
    assert.ok(found.includes(expected), `missing: ${expected}\n${found}`);
  }
});

test('a variant replaces steps, hours and words, and leaves the base alone', () => {
  const base = {
    id: 'x', name: 'X', grid: ['AB'],
    words: { A: [[0, 0, 1]], B: [[0, 1, 1]] },
    hours: { name: [['A']].concat(Array(11).fill(['A'])) },
    steps: Array(12).fill(['@this']),
    variants: [{ id: 'v', name: 'V', steps: { 1: ['B'] } }],
  };
  assert.deepStrictEqual(WordClock.at(base, 0, 5).words, ['A']);
  assert.deepStrictEqual(WordClock.at(base, 0, 5, 'v').words, ['B']);
  assert.deepStrictEqual(WordClock.at(base, 0, 0, 'v').words, ['A']);
  assert.deepStrictEqual(WordClock.at(base, 0, 5, 'unknown').words, ['A'], 'an unknown variant is the base');
  assert.strictEqual(WordClock.variantNamed(base, 'V'), 'v', 'a usage setting names a variant by its name');
  assert.strictEqual(WordClock.variantNamed(base, 'X'), null, 'the base, or an unknown name, is no variant');
  assert.strictEqual(WordClock.variantNamed(base, undefined), null, 'nothing chosen is no variant');
  assert.strictEqual(WordClock.settingKey({ id: 'zh-Hans' }), 'variant_zh_Hans', 'a setting key holds no hyphen');
});

test('the language setting, languages/index.json and the language files name the same languages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kiosk-satellite-plugin.json'), 'utf8'));
  const setting = manifest.settings.find((s) => s.key === 'language');
  const index = JSON.parse(fs.readFileSync(path.join(languagesDir, 'index.json'), 'utf8'));
  const files = languages.map((l) => ({ id: l.id, name: l.name }));
  assert.deepStrictEqual(setting.options, index.map((e) => e.name), 'setting options in index order');
  assert.deepStrictEqual([...index].sort((a, b) => a.id.localeCompare(b.id)), files, 'index entries are the files');
  assert.ok(setting.options.includes(setting.default), 'the default is one of the options');
});

test('each language with usage variants has its setting, and only those do', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kiosk-satellite-plugin.json'), 'utf8'));
  const variantSettings = manifest.settings.filter((s) => s.key.startsWith('variant_'));
  const withVariants = languages.filter((l) => (l.variants || []).length);
  assert.deepStrictEqual(variantSettings.map((s) => s.key).sort(), withVariants.map((l) => WordClock.settingKey(l)).sort());
  for (const language of languages) {
    assert.strictEqual('baseName' in language, (language.variants || []).length > 0, `${language.id}: baseName exactly when there are variants`);
  }
  for (const language of withVariants) {
    const setting = variantSettings.find((s) => s.key === WordClock.settingKey(language));
    assert.strictEqual(setting.type, 'select');
    assert.deepStrictEqual(setting.options, [language.baseName, ...language.variants.map((v) => v.name)], `${language.id}: base first, then each variant`);
    assert.strictEqual(setting.default, language.baseName, `${language.id}: the base is the default`);
    assert.deepStrictEqual(setting.visibleWhen, { key: 'language', equals: language.name }, `${language.id}: shown only for its language`);
  }
});

// Kiosk Satellite titles a list's rows by the field `row.title` names, or
// else by the first `string` field; with neither, every row reads "Untitled".
test('every list setting has a field its rows are titled by', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kiosk-satellite-plugin.json'), 'utf8'));
  const lists = manifest.settings.filter((s) => s.type === 'list');
  assert.ok(lists.length > 0, 'the manifest has a list setting');
  for (const list of lists) {
    const key = list.row && list.row.title !== undefined
      ? list.row.title
      : (list.fields.find((f) => f.type === 'string') || {}).key;
    assert.ok(list.fields.some((f) => f.key === key), `${list.key}: rows are titled by one of its fields`);
  }
  const carousel = manifest.settings.find((s) => s.key === 'carouselLanguages');
  assert.strictEqual(carousel.row.title, 'language', 'a carousel row shows its language');
});

// The carousel: which language shows when, from the time alone.
test('the carousel turns on the clock, from the local date, in list order', () => {
  const names = ['English', 'Français', 'Deutsch'];
  const pick = (every, ...when) => WordClock.carouselName(names, every, new Date(...when));

  // Every hour: the hour after is the next language, in the list's order.
  const h = ['English', 'Français', 'Deutsch'].indexOf(pick('1 hour', 2026, 9, 24, 13, 0));
  assert.strictEqual(pick('1 hour', 2026, 9, 24, 14, 0), names[(h + 1) % 3]);
  assert.strictEqual(pick('1 hour', 2026, 9, 24, 15, 0), names[(h + 2) % 3]);
  assert.strictEqual(pick('1 hour', 2026, 9, 24, 13, 59, 59), pick('1 hour', 2026, 9, 24, 13, 0), 'the same all hour');
  // Five languages, so that 24 hours are not a whole number of turns.
  const five = ['A', 'B', 'C', 'D', 'E'];
  const late = five.indexOf(WordClock.carouselName(five, '1 hour', new Date(2026, 9, 24, 23, 59)));
  assert.strictEqual(WordClock.carouselName(five, '1 hour', new Date(2026, 9, 25, 0, 0)), five[(late + 1) % 5],
    'midnight is the next hour too');

  // Every five minutes: changes at :05, not before.
  assert.strictEqual(pick('5 minutes', 2026, 9, 24, 12, 4, 59), pick('5 minutes', 2026, 9, 24, 12, 0));
  assert.notStrictEqual(pick('5 minutes', 2026, 9, 24, 12, 5), pick('5 minutes', 2026, 9, 24, 12, 4, 59));
  const m = names.indexOf(pick('5 minutes', 2026, 9, 24, 12, 0));
  assert.strictEqual(pick('5 minutes', 2026, 9, 24, 12, 5), names[(m + 1) % 3]);

  // Every day: changes at local midnight, not before.
  assert.strictEqual(pick('1 day', 2026, 9, 24, 23, 59), pick('1 day', 2026, 9, 24, 0, 0));
  const d = names.indexOf(pick('1 day', 2026, 9, 24, 0, 0));
  assert.strictEqual(pick('1 day', 2026, 9, 25, 0, 0), names[(d + 1) % 3]);

  // A restart lands on the same language: the answer depends on the time only.
  assert.strictEqual(pick('1 hour', 2026, 9, 24, 13, 30), pick('1 hour', 2026, 9, 24, 13, 30));
  // Anything but the three intervals is an hour.
  assert.strictEqual(pick('weekly', 2026, 9, 24, 13, 30), pick('1 hour', 2026, 9, 24, 13, 30));
  assert.strictEqual(WordClock.carouselName([], '1 hour', new Date()), null, 'no language: none');
  assert.strictEqual(WordClock.carouselName(['Italiano'], '5 minutes', new Date(2026, 9, 24, 7, 35)), 'Italiano');
});

test('the carousel follows the local date across a DST change: one day is one step', () => {
  // Days counted from the local date, so the 23- and 25-hour days of a DST
  // change are still one day each, in any time zone the tests run in.
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let previous = names.indexOf(WordClock.carouselName(names, '1 day', new Date(2026, 0, 1, 12, 0)));
  for (let day = 2; day <= 366; day++) {
    const today = names.indexOf(WordClock.carouselName(names, '1 day', new Date(2026, 0, day, 0, 0)));
    assert.strictEqual(today, (previous + 1) % names.length, `2026 day ${day}`);
    previous = today;
  }
});

test('the carousel lists only languages with a file, in the order given, repeats kept', () => {
  const known = ['English', 'Français', 'Deutsch'];
  assert.deepStrictEqual(WordClock.carouselNames('English\nKlingon\nDeutsch\nEnglish', known), ['English', 'Deutsch', 'English']);
  assert.deepStrictEqual(WordClock.carouselNames('', known), []);
  assert.deepStrictEqual(WordClock.carouselNames(undefined, known), [], 'nothing passed: none');
  assert.deepStrictEqual(WordClock.carouselNames('Klingon', known), [], 'only unknown names: none, the Language setting applies');
});

test('the carousel setting offers the same languages as the Language setting', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kiosk-satellite-plugin.json'), 'utf8'));
  const language = manifest.settings.find((s) => s.key === 'language');
  const list = manifest.settings.find((s) => s.key === 'carouselLanguages');
  const every = manifest.settings.find((s) => s.key === 'carouselEvery');
  const on = manifest.settings.find((s) => s.key === 'carousel');
  assert.strictEqual(on.type, 'boolean');
  assert.strictEqual(on.default, false, 'off by default');
  assert.strictEqual(list.type, 'list');
  assert.deepStrictEqual(list.fields.map((f) => f.key), ['language']);
  assert.deepStrictEqual(list.fields[0].options, language.options);
  assert.deepStrictEqual(every.options, ['5 minutes', '1 hour', '1 day']);
  assert.strictEqual(every.default, '1 hour');
  for (const s of [list, every]) assert.deepStrictEqual(s.visibleWhen, { key: 'carousel', equals: true });
  const keys = manifest.settings.map((s) => s.key);
  assert.ok(keys.indexOf('carousel') < keys.indexOf('carouselLanguages'), 'visibleWhen names a setting declared before');
});
