#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";

import {
  getPrayerTimingsSchema,
  getPrayerTimingsHandler,
  updatePrayerTimingsSchema,
  updatePrayerTimingsHandler,
  deletePrayerTimingsSchema,
  deletePrayerTimingsHandler,
  getCalculationMethodsSchema,
  getCalculationMethodsHandler,
  extractTimingsFromFileSchema,
  extractTimingsFromFileHandler,
} from "./tools/index.js";

// Load environment variables
dotenv.config();

const server = new McpServer({
  name: "cmz-timings-mcp",
  version: "1.0.0",
});

// 1. Get prayer timings tool
server.tool(
  "get_prayer_timings",
  "Fetch daily prayer schedules and iqamah timings for a masjid across a date range. Returns formatted 12-hour/24-hour times alongside raw minutes.",
  getPrayerTimingsSchema,
  async (args) => {
    return await getPrayerTimingsHandler(args);
  }
);

// 2. Update prayer timings tool
server.tool(
  "update_prayer_timings",
  "Create or update prayer timings for a masjid on specific dates. Accepts readable time strings ('05:30 AM', '18:15') or integer minutes from midnight.",
  updatePrayerTimingsSchema,
  async (args) => {
    return await updatePrayerTimingsHandler(args);
  }
);

// 3. Delete prayer timings tool
server.tool(
  "delete_prayer_timings",
  "Delete prayer timings for a masjid within a specified date range.",
  deletePrayerTimingsSchema,
  async (args) => {
    return await deletePrayerTimingsHandler(args);
  }
);

// 4. Get calculation methods tool
server.tool(
  "get_calculation_methods",
  "Retrieve prayer times calculated across all supported astronomical calculation methods (ISNA, MWL, Umm al-Qura, Karachi, etc.) for a coordinate and date.",
  getCalculationMethodsSchema,
  async (args) => {
    return await getCalculationMethodsHandler(args);
  }
);

// 5. Extract timings from file tool
server.tool(
  "extract_timings_from_file",
  "Extract structured prayer schedules from a timetable file (PDF, CSV, Excel, image, DOCX) using cmz-backend's extractor endpoint.",
  extractTimingsFromFileSchema,
  async (args) => {
    return await extractTimingsFromFileHandler(args);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CMZ Timings MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error running CMZ Timings MCP server:", error);
  process.exit(1);
});
