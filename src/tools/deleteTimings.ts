import { z } from "zod";
import { CMZClient, defaultClient } from "../client.js";

export const deletePrayerTimingsSchema = {
  masjidId: z
    .string()
    .describe("MongoDB ObjectId of the Masjid (e.g. '64bf1f88e20a32014f3b7a10')"),
  startDate: z
    .string()
    .describe("Start date of range to delete in YYYY-MM-DD format (inclusive)"),
  endDate: z
    .string()
    .describe("End date of range to delete in YYYY-MM-DD format (exclusive)"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token override for authentication"),
};

const DELETE_TIMINGS_MUTATION = `
  mutation DeleteTimings($masjidId: String!, $startDate: String!, $endDate: String!) {
    deleteTimings(masjidId: $masjidId, startDate: $startDate, endDate: $endDate)
  }
`;

interface DeleteTimingsMutationResult {
  deleteTimings: boolean;
}

export async function deletePrayerTimingsHandler(
  args: z.infer<z.ZodObject<typeof deletePrayerTimingsSchema>>,
  client: CMZClient = defaultClient
) {
  const result = await client.graphql<DeleteTimingsMutationResult>(
    DELETE_TIMINGS_MUTATION,
    {
      masjidId: args.masjidId,
      startDate: args.startDate,
      endDate: args.endDate,
    },
    args.authToken
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: result.deleteTimings,
            masjidId: args.masjidId,
            deletedRange: {
              startDate: args.startDate,
              endDate: args.endDate,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
