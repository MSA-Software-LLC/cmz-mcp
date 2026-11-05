import { z } from "zod";
import { CMZClient, defaultClient } from "../client.js";

export const getCalculationMethodsSchema = {
  latitude: z
    .number()
    .default(40.7128)
    .describe("Latitude of the location (defaults to New York 40.7128)"),
  longitude: z
    .number()
    .default(-74.006)
    .describe("Longitude of the location (defaults to New York -74.0060)"),
  timezone: z
    .string()
    .default("America/New_York")
    .describe("Timezone identifier (e.g. 'America/New_York', 'Europe/London', 'Asia/Riyadh')"),
  date: z
    .string()
    .optional()
    .describe("Date in YYYY-MM-DD format (defaults to current date)"),
  madhab: z
    .enum(["shafi", "hanafi"])
    .default("shafi")
    .describe("Asr calculation madhab ('shafi' or 'hanafi')"),
  highLatitudeRule: z
    .enum(["middleOfTheNight", "seventhOfTheNight", "twilightAngle"])
    .default("twilightAngle")
    .describe("Rule for high latitudes"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token override for authentication"),
};

interface CalculationMethodResult {
  status: string;
  data: {
    methods: Array<{
      methodName: string;
      date: string;
      fajr: string;
      dhuhr: string;
      asr: string;
      maghrib: string;
      isha: string;
      fajrAngle: number;
      ishaAngle: number;
      ishaInterval?: number;
    }>;
  };
}

export async function getCalculationMethodsHandler(
  args: z.infer<z.ZodObject<typeof getCalculationMethodsSchema>>,
  client: CMZClient = defaultClient
) {
  const currentDate = args.date || new Date().toISOString().split("T")[0];

  const payload = {
    latitude: args.latitude,
    longitude: args.longitude,
    timezone: args.timezone,
    date: currentDate,
    method: "MuslimWorldLeague",
    madhab: args.madhab,
    highLatitudeRule: args.highLatitudeRule,
  };

  const response = await client.rest<CalculationMethodResult>(
    "/prayer-times/calculation-methods",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    args.authToken
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            location: {
              latitude: args.latitude,
              longitude: args.longitude,
              timezone: args.timezone,
            },
            date: currentDate,
            madhab: args.madhab,
            methods: response?.data?.methods || [],
          },
          null,
          2
        ),
      },
    ],
  };
}
