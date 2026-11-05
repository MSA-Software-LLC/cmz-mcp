import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTimeToMinutes,
  minutesToFormattedTime,
  normalizePrayerName,
} from "./time.js";

test("time utilities - parseTimeToMinutes", async (t) => {
  await t.test("parses 12-hour AM/PM times correctly", () => {
    assert.strictEqual(parseTimeToMinutes("12:00 AM"), 0);
    assert.strictEqual(parseTimeToMinutes("12:30 AM"), 30);
    assert.strictEqual(parseTimeToMinutes("05:15 AM"), 315);
    assert.strictEqual(parseTimeToMinutes("5:15 am"), 315);
    assert.strictEqual(parseTimeToMinutes("11:59 AM"), 719);
    assert.strictEqual(parseTimeToMinutes("12:00 PM"), 720);
    assert.strictEqual(parseTimeToMinutes("12:45 PM"), 765);
    assert.strictEqual(parseTimeToMinutes("01:30 PM"), 810);
    assert.strictEqual(parseTimeToMinutes("1:30 pm"), 810);
    assert.strictEqual(parseTimeToMinutes("11:59 PM"), 1439);
  });

  await t.test("parses 24-hour times correctly", () => {
    assert.strictEqual(parseTimeToMinutes("00:00"), 0);
    assert.strictEqual(parseTimeToMinutes("05:15"), 315);
    assert.strictEqual(parseTimeToMinutes("12:00"), 720);
    assert.strictEqual(parseTimeToMinutes("13:30"), 810);
    assert.strictEqual(parseTimeToMinutes("23:59"), 1439);
  });

  await t.test("accepts valid numeric minutes and minute strings", () => {
    assert.strictEqual(parseTimeToMinutes(0), 0);
    assert.strictEqual(parseTimeToMinutes(360), 360);
    assert.strictEqual(parseTimeToMinutes(1439), 1439);
    assert.strictEqual(parseTimeToMinutes("360"), 360);
  });

  await t.test("throws error on invalid formats or out-of-range minutes", () => {
    assert.throws(() => parseTimeToMinutes(1440), /Invalid minute value/);
    assert.throws(() => parseTimeToMinutes(-1), /Invalid minute value/);
    assert.throws(() => parseTimeToMinutes("24:00"), /Invalid 24-hour time format/);
    assert.throws(() => parseTimeToMinutes("13:00 AM"), /Invalid 12-hour time format/);
    assert.throws(() => parseTimeToMinutes("invalid-time"), /Unrecognized time format/);
  });
});

test("time utilities - minutesToFormattedTime", async (t) => {
  await t.test("formats minutes to 12-hour and 24-hour strings", () => {
    assert.deepStrictEqual(minutesToFormattedTime(0), {
      minutes: 0,
      time12: "12:00 AM",
      time24: "00:00",
    });

    assert.deepStrictEqual(minutesToFormattedTime(330), {
      minutes: 330,
      time12: "05:30 AM",
      time24: "05:30",
    });

    assert.deepStrictEqual(minutesToFormattedTime(720), {
      minutes: 720,
      time12: "12:00 PM",
      time24: "12:00",
    });

    assert.deepStrictEqual(minutesToFormattedTime(1125), {
      minutes: 1125,
      time12: "06:45 PM",
      time24: "18:45",
    });

    assert.deepStrictEqual(minutesToFormattedTime(1439), {
      minutes: 1439,
      time12: "11:59 PM",
      time24: "23:59",
    });
  });
});

test("time utilities - normalizePrayerName", () => {
  assert.strictEqual(normalizePrayerName("fajr"), "Fajr");
  assert.strictEqual(normalizePrayerName("dhuhr"), "Dhur");
  assert.strictEqual(normalizePrayerName("dhur"), "Dhur");
  assert.strictEqual(normalizePrayerName("asr"), "Asar");
  assert.strictEqual(normalizePrayerName("asar"), "Asar");
  assert.strictEqual(normalizePrayerName("maghrib"), "Maghrib");
  assert.strictEqual(normalizePrayerName("isha"), "Isha");
  assert.strictEqual(normalizePrayerName("sunrise"), "Sunrise");
  assert.strictEqual(normalizePrayerName("jummah"), "Jummah");
  assert.strictEqual(normalizePrayerName("taraweeh"), "Taraweeh");
});
