import test from "node:test";
import assert from "node:assert/strict";
import { SQL_FOLD_FROM, SQL_FOLD_TO, escapeLike, matchesSearch, normalizeSearch } from "./search-text.ts";

test("alef, ya and ta-marbuta variants match", () => {
  assert.ok(matchesSearch("احمد", "أحمد حسن"));
  assert.ok(matchesSearch("ابراهيم", "إبراهيم"));
  assert.ok(matchesSearch("اسماء", "أسماء"));
  assert.ok(matchesSearch("منى", "منى"));
  assert.ok(matchesSearch("منه", "منة"));
  assert.ok(matchesSearch("على", "علي"));
  assert.ok(matchesSearch("فاطمه", "فاطمة"));
});

test("tashkeel and tatweel are ignored", () => {
  assert.equal(normalizeSearch("مُحَمَّد"), normalizeSearch("محمد"));
  assert.equal(normalizeSearch("محـــمد"), "محمد");
});

test("Arabic digits match Latin digits", () => {
  assert.ok(matchesSearch("٠١٠٢٠٣", "phone 010203"));
  assert.ok(matchesSearch("S-٢٠٢٦", "S-2026-ABC"));
});

test("every word must match, in any order, across fields", () => {
  assert.ok(matchesSearch("حسن احمد", "أحمد حسن عبد الله", "د. سمير"));
  assert.ok(matchesSearch("سمير", "أحمد", "د. سمير"));
  assert.ok(!matchesSearch("حسن محمود", "أحمد حسن"));
});

test("empty query matches everything; missing fields are fine", () => {
  assert.ok(matchesSearch("", "x"));
  assert.ok(matchesSearch("  ", undefined));
  assert.ok(!matchesSearch("a", undefined, null));
});

test("case-insensitive for Latin", () => {
  assert.ok(matchesSearch("demo", "DEMO-AHMED"));
});

test("SQL fold lists line up one-to-one", () => {
  assert.equal([...SQL_FOLD_FROM].length, [...SQL_FOLD_TO].length);
  for (let i = 0; i < SQL_FOLD_FROM.length; i += 1) {
    assert.equal(normalizeSearch(SQL_FOLD_FROM[i]), SQL_FOLD_TO[i]);
  }
});

test("escapeLike escapes wildcards", () => {
  assert.equal(escapeLike("50%_x\\"), "50\\%\\_x\\\\");
  assert.equal(escapeLike("plain"), "plain");
});
