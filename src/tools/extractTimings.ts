import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { CMZClient, defaultClient } from "../client.js";

export const extractTimingsFromFileSchema = {
  masjidId: z
    .string()
    .describe("MongoDB ObjectId of the Masjid (required to verify Community Package subscription)"),
  entityType: z
    .enum(["MASJID", "ORGANIZATION", "INDIVIDUAL"])
    .optional()
    .describe("Entity type for subscription verification (defaults to 'MASJID')"),
  filePath: z
    .string()
    .describe("Absolute or relative path to a local timetable file (PDF, PNG, JPG, CSV, Excel, DOCX)"),
  authToken: z
    .string()
    .optional()
    .describe("Optional JWT Bearer token override for authentication"),
};

export interface ExtractTimingsFromFileArgs {
  masjidId: string;
  entityType?: "MASJID" | "ORGANIZATION" | "INDIVIDUAL";
  filePath: string;
  authToken?: string;
}

interface ExtractedTimingResult {
  regularTimings?: Array<{
    date: string;
    timings: Array<{
      namazName: string;
      azaanTime: string | null;
      jamaatTime: string | null;
    }>;
  }>;
  specialTimings?: Array<{
    namazName: string;
    startDate: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  }>;
}

export async function extractTimingsFromFileHandler(
  args: ExtractTimingsFromFileArgs,
  client: CMZClient = defaultClient
) {
  await client.requireCommunityPackage(args.masjidId, args.entityType || "MASJID", args.authToken);

  const resolvedPath = path.resolve(args.filePath);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(resolvedPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read local timetable file at ${resolvedPath}: ${msg}`);
  }

  const fileName = path.basename(resolvedPath);
  const blob = new Blob([new Uint8Array(fileBuffer)]);

  const formData = new FormData();
  formData.append("file", blob, fileName);

  const response = await client.rest<ExtractedTimingResult>(
    "/v3/ai/timing-extractor",
    {
      method: "POST",
      body: formData,
    },
    args.authToken
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sourceFile: fileName,
            extracted: response,
          },
          null,
          2
        ),
      },
    ],
  };
}
