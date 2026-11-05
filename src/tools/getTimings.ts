import { z } from "zod";
import { CMZClient, defaultClient } from "../client.js";
import { minutesToFormattedTime } from "../utils/time.js";

export const getPrayerTimingsSchema = {
  masjidId: z
    .string()
    .describe("MongoDB ObjectId of the Masjid (e.g. '64bf1f88e20a32014f3b7a10')"),
  startDate: z
    .string()
    .describe("Start date for the query in YYYY-MM-DD format (e.g. '2026-08-25')"),
  endDate: z
    .string()
    .describe("End date for the query in YYYY-MM-DD format (e.g. '2026-08-25')"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token override for authentication"),
};

interface RawTimingItem {
  _id: string;
  namazName: string;
  type: number;
  azaanTime: number;
  jamaatTime: number;
  offset?: {
    iqamah?: number;
    azaan?: number;
  };
  iqamahType?: string;
  azaanType?: string;
  isAutomaticIqama?: boolean;
}

interface RawMasjidTiming {
  _id: string;
  masjidId: string;
  date: string;
  prayerType: string;
  prayerMethod?: string;
  createdAt?: string;
  updatedAt?: string;
  timings: RawTimingItem[];
}

interface GetTimingsQueryResult {
  getTimingsByMasjidId: RawMasjidTiming[];
}

const GET_TIMINGS_QUERY = `
  query GetTimings($masjidId: String, $startDate: String, $endDate: String) {
    getTimingsByMasjidId(masjidId: $masjidId, startDate: $startDate, endDate: $endDate) {
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
        type
        azaanTime
        jamaatTime
        offset {
          iqamah
          azaan
        }
        iqamahType
        azaanType
        isAutomaticIqama
      }
    }
  }
`;

export async function getPrayerTimingsHandler(
  args: z.infer<z.ZodObject<typeof getPrayerTimingsSchema>>,
  client: CMZClient = defaultClient
) {
  const result = await client.graphql<GetTimingsQueryResult>(
    GET_TIMINGS_QUERY,
    {
      masjidId: args.masjidId,
      startDate: args.startDate,
      endDate: args.endDate,
    },
    args.authToken
  );

  const rawTimings = result.getTimingsByMasjidId || [];

  const formattedDays = rawTimings.map((day) => {
    return {
      id: day._id,
      masjidId: day.masjidId,
      date: day.date,
      prayerType: day.prayerType,
      prayerMethod: day.prayerMethod,
      prayers: (day.timings || []).map((t) => {
        const azaanFormatted = minutesToFormattedTime(t.azaanTime);
        const jamaatFormatted = minutesToFormattedTime(t.jamaatTime);

        return {
          id: t._id,
          prayerName: t.namazName,
          prayerTypeIndex: t.type,
          azaanTimeMinutes: t.azaanTime,
          azaanTimeFormatted: azaanFormatted.time12,
          azaanTime24h: azaanFormatted.time24,
          jamaatTimeMinutes: t.jamaatTime,
          jamaatTimeFormatted: jamaatFormatted.time12,
          jamaatTime24h: jamaatFormatted.time24,
          offset: t.offset,
          iqamahType: t.iqamahType,
          azaanType: t.azaanType,
          isAutomaticIqama: t.isAutomaticIqama,
        };
      }),
    };
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            masjidId: args.masjidId,
            range: { startDate: args.startDate, endDate: args.endDate },
            count: formattedDays.length,
            schedules: formattedDays,
          },
          null,
          2
        ),
      },
    ],
  };
}
