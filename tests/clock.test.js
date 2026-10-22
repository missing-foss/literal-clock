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
