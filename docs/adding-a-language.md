# Adding a language

A language is data: a JSON file, a list of expected sentences and two
one-line entries. No code changes.

## 1. The language file

Add `assets/clock/languages/<id>.json`, where `<id>` is the language's code
(`de`, `nl`, `zh-Hans`). `en.json` and `fr.json` are complete examples.

```json
{
  "id": "en",
  "name": "English",
  "grid": ["ITLISASAMPM", "..."],
  "words": { "IT": [[0, 0, 2]], "QUARTER": [[1, 2, 7]], "...": [] },
  "hours": { "name": [["TWELVE"], ["ONE"], "..."] },
  "steps": [["IT", "IS", "@this", "OCLOCK"], "..."]
}
```

- **`name`** is what the Language setting shows, in the language itself
  (`Français`, `Deutsch`).
- **`grid`** is the letter grid, one string per row. Every row has the same
  number of characters; a character is one cell, so a grid can hold accented
  letters or one Chinese character per cell. 11 by 10 is the classic size; a
  language that needs more room can have more rows or columns.
- **`words`** names each word that can light, as a list of spans
  `[row, column, length]`, counted from 0. A word can be several spans that
  are not next to each other: French `ET_QUART` is `ET` and `QUART` on the
  same row with a letter between them, and in Chinese one hour can be two
  characters from different places. When the same text appears twice in the
  grid (English has a minute `FIVE` and an hour `FIVE`), give them two names.
- **`hours`** gives, for each hour form, the words of every hour: 12 entries
  (from twelve o'clock, then one, two...) or 24 (from midnight) when the
  hours differ through the day, as French *minuit* and *midi* do. The form
  `name` is required. Add others where a language changes the hour's form,
  such as a Polish genitive after *wpół do*.
- **`steps`** gives the sentence for each five minutes, from :00 to :55, as
  a list of words. `@this` is the current hour and `@next` the coming one,
  for the languages and the "to" forms that count towards it (*half vier*,
  *moins le quart*). `@next.genitive` takes the hour in the form
  `genitive`.

The minutes in between are the four corner dots: one for each minute past
the step, clockwise from the top left.

### Variants

Where usage differs within a language, add `variants`. Each one replaces
whole entries of the base: `steps` by index, `hours` by form, `words` by
name. The base is the default, and `baseName` says what it is. `de.json`
has one:

```json
"baseName": "viertel nach drei, viertel vor vier",
"variants": [
  {
    "id": "regional",
    "name": "viertel vier, dreiviertel vier",
    "steps": { "3": ["ES", "IST", "VIERTEL", "@next"], "9": ["ES", "IST", "DREIVIERTEL", "@next"] }
  }
]
```

The choice is a setting in `kiosk-satellite-plugin.json`, shown only for
that language: a `select` with the key `variant_<id>` (any character other
than a letter, digit or underscore becomes `_`: `variant_zh_Hans`), the options
`baseName` and then each variant's `name`, the default `baseName`, and
`"visibleWhen": { "key": "language", "equals": "<name>" }`. The plugin
hands every `variant_` setting to the page, which picks the variant by its
name.

## 2. The expected sentences

Add `tests/expected/<id>.txt`: all 288 five-minute steps of the day, one
per line, `HH:MM` and the sentence, in capitals.

```text
00:00 IT IS TWELVE O'CLOCK
00:05 IT IS FIVE PAST TWELVE
```

Write these from the language, not from the JSON file: they are what the
file is checked against, so a mistake copied from one into the other passes
unseen. Have them read by someone who speaks it. A variant gets its own
file, `tests/expected/<id>.<variant>.txt`.

Only letters are compared: spaces, hyphens and apostrophes don't count, so
`O'CLOCK` matches a grid's `OCLOCK`.

## 3. The two lists

- Add `{ "id": "<id>", "name": "<name>" }` to
  `assets/clock/languages/index.json`.
- Add the same name to the `options` of the `language` setting in
  `kiosk-satellite-plugin.json`, in the same order as the index.

## 4. Check

```sh
python3 tools/test.py
```

For every language and variant, the tests check:

- the file itself: the grid is rectangular, every span is inside it, and every
  word, hour form and step names something that exists;
- every minute of the day, all 1,440: the lit cells, read left to right and
  top to bottom, spell the expected sentence, and the corner dots count the
  minutes past it;
- the setting, the index and the files name the same languages;
- each language with variants has its setting, as above, and no other
  language has one.

The screensaver refuses a file that fails its own checks and shows nothing,
rather than light the wrong words.
