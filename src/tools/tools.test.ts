import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { CMZClient } from "../client.js";
import { getPrayerTimingsHandler } from "./getTimings.js";
import { updatePrayerTimingsHandler } from "./updateTimings.js";
import { deletePrayerTimingsHandler } from "./deleteTimings.js";
import { getCalculationMethodsHandler } from "./calculationMethods.js";
import { extractTimingsFromFileHandler } from "./extractTimings.js";

// Mock implementation of CMZClient for isolated unit testing
class MockCMZClient extends CMZClient {
  public lastGraphqlQuery: string = "";
  public lastGraphqlVariables: Record<string, unknown> = {};
  public lastRestPath: string = "";
  public lastRestOptions: RequestInit | undefined;

  public mockGraphqlResponse: unknown = {};
  public mockRestResponse: unknown = {};

  constructor() {
    super("http://mock-backend:8080", "mock-token-xyz");
  }

  override async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    authTokenOverride?: string
  ): Promise<T> {
    this.lastGraphqlQuery = query;
    this.lastGraphqlVariables = variables || {};
    return this.mockGraphqlResponse as T;
  }

  override async rest<T>(
    path: string,
    init?: RequestInit,
    authTokenOverride?: string
  ): Promise<T> {
    this.lastRestPath = path;
    this.lastRestOptions = init;
    return this.mockRestResponse as T;
  }
}

test("MCP Tool - get_prayer_timings", async () => {
  const mockClient = new MockCMZClient();
  mockClient.mockGraphqlResponse = {
    getTimingsByMasjidId: [
      {
        _id: "timing_doc_1",
        masjidId: "masjid_123",
        date: "2026-08-25T00:00:00.000Z",
        prayerType: "DAILY",
        prayerMethod: "ISNA",
        timings: [
          {
            _id: "time_1",
            namazName: "Fajr",
            type: 1,
            azaanTime: 330, // 05:30 AM
            jamaatTime: 360, // 06:00 AM
            offset: { iqamah: 30, azaan: 0 },
            iqamahType: "manual",
            isAutomaticIqama: false,
          },
          {
            _id: "time_2",
            namazName: "Dhur",
            type: 2,
            azaanTime: 780, // 01:00 PM
            jamaatTime: 810, // 01:30 PM
            offset: { iqamah: 30, azaan: 0 },
            isAutomaticIqama: false,
          },
        ],
      },
    ],
  };

  const response = await getPrayerTimingsHandler(
    {
      masjidId: "masjid_123",
      startDate: "2026-08-25",
      endDate: "2026-08-25",
    },
    mockClient
  );

  assert.ok(mockClient.lastGraphqlQuery.includes("getTimingsByMasjidId"));
  assert.strictEqual(mockClient.lastGraphqlVariables["masjidId"], "masjid_123");

  const parsed = JSON.parse(response.content[0].text);
  assert.strictEqual(parsed.count, 1);
  const fajr = parsed.schedules[0].prayers[0];
  assert.strictEqual(fajr.prayerName, "Fajr");
  assert.strictEqual(fajr.azaanTimeMinutes, 330);
  assert.strictEqual(fajr.azaanTimeFormatted, "05:30 AM");
  assert.strictEqual(fajr.jamaatTimeMinutes, 360);
  assert.strictEqual(fajr.jamaatTimeFormatted, "06:00 AM");

  const dhur = parsed.schedules[0].prayers[1];
  assert.strictEqual(dhur.azaanTimeFormatted, "01:00 PM");
  assert.strictEqual(dhur.jamaatTimeFormatted, "01:30 PM");
});

test("MCP Tool - update_prayer_timings single day", async () => {
  const mockClient = new MockCMZClient();
  mockClient.mockGraphqlResponse = {
    createOrUpdateTimings: [
      {
        _id: "timing_doc_1",
        masjidId: "masjid_123",
        date: "2026-08-25",
        prayerType: "DAILY",
        timings: [
          {
            _id: "t_fajr",
            namazName: "Fajr",
            azaanTime: 330,
            jamaatTime: 360,
          },
        ],
      },
    ],
  };

  const response = await updatePrayerTimingsHandler(
    {
      masjidId: "masjid_123",
      date: "2026-08-25",
      prayerType: "DAILY",
      timings: [
        {
          namazName: "Fajr",
          azaanTime: "05:30 AM", // string converted to 330
          jamaatTime: "06:00 AM", // string converted to 360
        },
      ],
    },
    mockClient
  );

  assert.ok(mockClient.lastGraphqlQuery.includes("createOrUpdateTimings"));
  const payload = mockClient.lastGraphqlVariables["timings"] as Array<{
    date: string;
    timings: Array<{ azaanTime: number; jamaatTime: number; namazName: string }>;
  }>;
  assert.strictEqual(payload[0].date, "2026-08-25");
  assert.strictEqual(payload[0].timings[0].azaanTime, 330);
  assert.strictEqual(payload[0].timings[0].jamaatTime, 360);

  const parsed = JSON.parse(response.content[0].text);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.updatedDaysCount, 1);
});

test("MCP Tool - update_prayer_timings multiple days batch", async () => {
  const mockClient = new MockCMZClient();
  mockClient.mockGraphqlResponse = {
    createOrUpdateTimings: [
      { _id: "doc_1", date: "2026-08-25", timings: [] },
      { _id: "doc_2", date: "2026-08-26", timings: [] },
    ],
  };

  const response = await updatePrayerTimingsHandler(
    {
      masjidId: "masjid_123",
      days: [
        {
          date: "2026-08-25",
          prayerType: "DAILY",
          prayerMethod: "ISNA",
          timings: [{ namazName: "Fajr", azaanTime: 330, jamaatTime: 360 }],
        },
        {
          date: "2026-08-26",
          prayerType: "DAILY",
          prayerMethod: "ISNA",
          timings: [{ namazName: "Fajr", azaanTime: 331, jamaatTime: 360 }],
        },
      ],
    },
    mockClient
  );

  const payload = mockClient.lastGraphqlVariables["timings"] as Array<{ date: string }>;
  assert.strictEqual(payload.length, 2);
  assert.strictEqual(payload[0].date, "2026-08-25");
  assert.strictEqual(payload[1].date, "2026-08-26");

  const parsed = JSON.parse(response.content[0].text);
  assert.strictEqual(parsed.updatedDaysCount, 2);
});

test("MCP Tool - delete_prayer_timings", async () => {
  const mockClient = new MockCMZClient();
  mockClient.mockGraphqlResponse = {
    deleteTimings: true,
  };

  const response = await deletePrayerTimingsHandler(
    {
      masjidId: "masjid_123",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
    mockClient
  );

  assert.ok(mockClient.lastGraphqlQuery.includes("deleteTimings"));
  assert.strictEqual(mockClient.lastGraphqlVariables["masjidId"], "masjid_123");
  assert.strictEqual(mockClient.lastGraphqlVariables["startDate"], "2026-08-01");

  const parsed = JSON.parse(response.content[0].text);
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.deletedRange.startDate, "2026-08-01");
});

test("MCP Tool - get_calculation_methods", async () => {
  const mockClient = new MockCMZClient();
  mockClient.mockRestResponse = {
    status: "success",
    data: {
      methods: [
        {
          methodName: "MuslimWorldLeague",
          date: "2026-08-25",
          fajr: "04:30 AM",
          dhuhr: "01:00 PM",
          asr: "05:00 PM",
          maghrib: "07:50 PM",
          isha: "09:20 PM",
          fajrAngle: 18,
          ishaAngle: 17,
        },
      ],
    },
  };

  const response = await getCalculationMethodsHandler(
    {
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
      date: "2026-08-25",
      madhab: "shafi",
      highLatitudeRule: "twilightAngle",
    },
    mockClient
  );

  assert.strictEqual(mockClient.lastRestPath, "/prayer-times/calculation-methods");
  const parsed = JSON.parse(response.content[0].text);
  assert.strictEqual(parsed.methods.length, 1);
  assert.strictEqual(parsed.methods[0].methodName, "MuslimWorldLeague");
});

test("MCP Tool - extract_timings_from_file", async () => {
  const tempFile = path.join(os.tmpdir(), "sample_schedule.csv");
  await fs.writeFile(
    tempFile,
    "Day,Fajr Azaan,Fajr Jamaat,Dhuhr Azaan,Dhuhr Jamaat\n2026-08-25,05:30 AM,06:00 AM,01:00 PM,01:30 PM\n"
  );

  const mockClient = new MockCMZClient();
  mockClient.mockRestResponse = {
    regularTimings: [
      {
        date: "2026-08-25",
        timings: [
          { namazName: "Fajr", azaanTime: "05:30 AM", jamaatTime: "06:00 AM" },
        ],
      },
    ],
  };

  try {
    const response = await extractTimingsFromFileHandler(
      {
        filePath: tempFile,
      },
      mockClient
    );

    assert.strictEqual(mockClient.lastRestPath, "/v3/ai/timing-extractor");
    const parsed = JSON.parse(response.content[0].text);
    assert.strictEqual(parsed.sourceFile, "sample_schedule.csv");
    assert.strictEqual(parsed.extracted.regularTimings.length, 1);
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
});
