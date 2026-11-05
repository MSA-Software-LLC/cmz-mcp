import { z } from "zod";
import { CMZClient, defaultClient } from "../client.js";
import { normalizePrayerName, parseTimeToMinutes, minutesToFormattedTime } from "../utils/time.js";

const singlePrayerInputSchema = z.object({
  namazName: z
    .string()
    .describe("Name of the prayer (e.g. 'Fajr', 'Dhur', 'Asar', 'Maghrib', 'Isha', 'Sunrise', 'Jummah')"),
  azaanTime: z
    .union([z.string(), z.number()])
    .describe("Azaan time as string (e.g. '05:30 AM', '18:15') or integer minutes from midnight (0-1439)"),
  jamaatTime: z
    .union([z.string(), z.number()])
    .describe("Jamaat/Iqamah time as string (e.g. '06:00 AM', '18:30') or integer minutes from midnight (0-1439)"),
  offset: z
    .object({
      iqamah: z.number().optional().describe("Iqamah offset in minutes"),
      azaan: z.number().optional().describe("Azaan offset in minutes"),
    })
    .optional(),
  iqamahType: z.string().optional().describe("Optional iqamah calculation type"),
  azaanType: z.string().optional().describe("Optional azaan calculation type"),
  isAutomaticIqama: z.boolean().optional().describe("Whether iqamah time is automatically computed"),
});

const dayScheduleInputSchema = z.object({
  date: z.string().describe("Date in YYYY-MM-DD format (e.g. '2026-08-25')"),
  prayerType: z
    .string()
    .default("DAILY")
    .describe("Schedule type (typically 'DAILY' or 'SPECIAL')"),
  prayerMethod: z
    .string()
    .default("ISNA")
    .describe("Calculation method identifier (e.g. 'ISNA', 'MWL', 'Karachi')"),
  timings: z.array(singlePrayerInputSchema).describe("List of prayer timings for this day"),
});

export const updatePrayerTimingsSchema = {
  masjidId: z
    .string()
    .describe("MongoDB ObjectId of the Masjid (e.g. '64bf1f88e20a32014f3b7a10')"),
  entityType: z
    .enum(["MASJID", "ORGANIZATION", "INDIVIDUAL"])
    .optional()
    .describe("Entity type for subscription verification (defaults to 'MASJID')"),
  // Single day shorthand
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format if updating a single day"),
  prayerType: z
    .string()
    .optional()
    .describe("Prayer type (e.g. 'DAILY') if updating a single day"),
  prayerMethod: z
    .string()
    .optional()
    .describe("Calculation method if updating a single day"),
  timings: z
    .array(singlePrayerInputSchema)
    .optional()
    .describe("List of prayer timings if updating a single day"),
  // Multiple days batch option
  days: z
    .array(dayScheduleInputSchema)
    .optional()
    .describe("Array of multiple daily schedules if performing a batch update"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token override for authentication"),
};

export interface UpdatePrayerTimingsArgs {
  masjidId: string;
  entityType?: "MASJID" | "ORGANIZATION" | "INDIVIDUAL";
  date?: string;
  prayerType?: string;
  prayerMethod?: string;
  timings?: Array<{
    namazName: string;
    azaanTime: string | number;
    jamaatTime: string | number;
    offset?: { iqamah?: number; azaan?: number };
    iqamahType?: string;
    azaanType?: string;
    isAutomaticIqama?: boolean;
  }>;
  days?: Array<{
    date: string;
    prayerType?: string;
    prayerMethod?: string;
    timings: Array<{
      namazName: string;
      azaanTime: string | number;
      jamaatTime: string | number;
      offset?: { iqamah?: number; azaan?: number };
      iqamahType?: string;
      azaanType?: string;
      isAutomaticIqama?: boolean;
    }>;
  }>;
  authToken?: string;
}

const UPDATE_TIMINGS_MUTATION = `
  mutation CreateOrUpdateTimings($masjidId: String!, $timings: [MasjidTimingInput!]!) {
    createOrUpdateTimings(masjidId: $masjidId, timings: $timings) {
      _id
      masjidId
      date
      prayerType
      prayerMethod
      createdAt
      updatedAt
      timings {
        _id
        namazName
        azaanTime
        jamaatTime
        offset {
          iqamah
          azaan
        }
        isAutomaticIqama
      }
    }
  }
`;

interface UpdateTimingsMutationResult {
  createOrUpdateTimings: Array<{
    _id: string;
    masjidId: string;
    date: string;
    prayerType: string;
    prayerMethod?: string;
    timings: Array<{
      _id: string;
      namazName: string;
      azaanTime: number;
      jamaatTime: number;
    }>;
  }>;
}

export async function updatePrayerTimingsHandler(
  args: UpdatePrayerTimingsArgs,
  client: CMZClient = defaultClient
) {
  await client.requireCommunityPackage(args.masjidId, args.entityType || "MASJID", args.authToken);

  const daysToProcess: Array<z.infer<typeof dayScheduleInputSchema>> = [];

  if (args.days && args.days.length > 0) {
    daysToProcess.push(
      ...args.days.map((d) => ({
        date: d.date,
        prayerType: d.prayerType || "DAILY",
        prayerMethod: d.prayerMethod || "ISNA",
        timings: d.timings,
      }))
    );
  } else if (args.date && args.timings && args.timings.length > 0) {
    daysToProcess.push({
      date: args.date,
      prayerType: args.prayerType || "DAILY",
      prayerMethod: args.prayerMethod || "ISNA",
      timings: args.timings,
    });
  } else {
    throw new Error(
      "Either provide 'date' and 'timings' for a single day update, or 'days' for multiple days."
    );
  }

  // Format into GraphQL MasjidTimingInput
  const graphqlPayload = daysToProcess.map((day) => {
    return {
      date: day.date,
      prayerType: day.prayerType || "DAILY",
      prayerMethod: day.prayerMethod || "ISNA",
      timings: day.timings.map((t) => {
        const azaanMinutes = parseTimeToMinutes(t.azaanTime);
        const jamaatMinutes = parseTimeToMinutes(t.jamaatTime);

        return {
          namazName: normalizePrayerName(t.namazName),
          azaanTime: azaanMinutes,
          jamaatTime: jamaatMinutes,
          offset: t.offset || null,
          iqamahType: t.iqamahType || null,
          azaanType: t.azaanType || null,
          isAutomaticIqama: t.isAutomaticIqama ?? null,
        };
      }),
    };
  });

  const result = await client.graphql<UpdateTimingsMutationResult>(
    UPDATE_TIMINGS_MUTATION,
    {
      masjidId: args.masjidId,
      timings: graphqlPayload,
    },
    args.authToken
  );

  const updatedRecords = result.createOrUpdateTimings || [];

  const summary = updatedRecords.map((r) => ({
    id: r._id,
    date: r.date,
    prayerType: r.prayerType,
    prayersCount: r.timings?.length || 0,
    prayers: (r.timings || []).map((p) => ({
      name: p.namazName,
      azaan: minutesToFormattedTime(p.azaanTime).time12,
      jamaat: minutesToFormattedTime(p.jamaatTime).time12,
    })),
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            masjidId: args.masjidId,
            updatedDaysCount: summary.length,
            records: summary,
          },
          null,
          2
        ),
      },
    ],
  };
}
