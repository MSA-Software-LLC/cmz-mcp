import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CMZClient } from "./client.js";
import {
  getPrayerTimingsSchema,
  getPrayerTimingsHandler,
  updatePrayerTimingsSchema,
  updatePrayerTimingsHandler,
  deletePrayerTimingsSchema,
  deletePrayerTimingsHandler,
  getCalculationMethodsSchema,
  getCalculationMethodsHandler,
} from "./tools/index.js";

test("Integration - MCP Server connected to simulated CMZ Backend", async () => {
  // 1. Setup simulated CMZ Backend server
  let receivedGraphQLBody: Record<string, unknown> | null = null;
  let receivedAuthHeader: string | null = null;
  let receivedRestPath: string | null = null;

  const mockServer = http.createServer(async (req, res) => {
    receivedAuthHeader = req.headers["authorization"] || null;

    let bodyText = "";
    for await (const chunk of req) {
      bodyText += chunk;
    }

    if (req.url === "/graphql") {
      const parsedBody = JSON.parse(bodyText);
      receivedGraphQLBody = parsedBody;

      if (parsedBody.query?.includes("getTimingsByMasjidId")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              getTimingsByMasjidId: [
                {
                  _id: "timing_real_1",
                  masjidId: parsedBody.variables?.masjidId,
                  date: "2026-08-25",
                  prayerType: "DAILY",
                  timings: [
                    {
                      _id: "time_1",
                      namazName: "Fajr",
                      type: 1,
                      azaanTime: 330,
                      jamaatTime: 360,
                    },
                  ],
                },
              ],
            },
          })
        );
        return;
      }

      if (parsedBody.query?.includes("createOrUpdateTimings")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              createOrUpdateTimings: [
                {
                  _id: "timing_real_1",
                  masjidId: parsedBody.variables?.masjidId,
                  date: "2026-08-25",
                  prayerType: "DAILY",
                  timings: [
                    {
                      _id: "time_1",
                      namazName: "Fajr",
                      azaanTime: 330,
                      jamaatTime: 360,
                    },
                  ],
                },
              ],
            },
          })
        );
        return;
      }

      if (parsedBody.query?.includes("deleteTimings")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { deleteTimings: true } }));
        return;
      }
    }

    if (req.url === "/prayer-times/calculation-methods") {
      receivedRestPath = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "success",
          data: {
            methods: [
              {
                methodName: "ISNA",
                date: "2026-08-25",
                fajr: "05:00 AM",
                dhuhr: "01:00 PM",
                asr: "05:00 PM",
                maghrib: "07:45 PM",
                isha: "09:15 PM",
                fajrAngle: 15,
                ishaAngle: 15,
              },
            ],
          },
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = (mockServer.address() as AddressInfo).port;
  const mockBackendUrl = `http://127.0.0.1:${port}`;

  try {
    // 2. Initialize CMZClient pointing to simulated backend
    const cmzClient = new CMZClient(mockBackendUrl, "Bearer test-jwt-token-123");

    // 3. Initialize MCP Server and register tools with the client
    const mcpServer = new McpServer({
      name: "cmz-timings-test",
      version: "1.0.0",
    });

    mcpServer.tool(
      "get_prayer_timings",
      "Get timings",
      getPrayerTimingsSchema,
      (args) => getPrayerTimingsHandler(args, cmzClient)
    );

    mcpServer.tool(
      "update_prayer_timings",
      "Update timings",
      updatePrayerTimingsSchema,
      (args) => updatePrayerTimingsHandler(args, cmzClient)
    );

    mcpServer.tool(
      "delete_prayer_timings",
      "Delete timings",
      deletePrayerTimingsSchema,
      (args) => deletePrayerTimingsHandler(args, cmzClient)
    );

    mcpServer.tool(
      "get_calculation_methods",
      "Get calculation methods",
      getCalculationMethodsSchema,
      (args) => getCalculationMethodsHandler(args, cmzClient)
    );

    // 4. Setup in-memory transport link between MCP Server and MCP Client
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    const mcpClient = new Client({
      name: "integration-test-client",
      version: "1.0.0",
    });
    await mcpClient.connect(clientTransport);

    // 5. Test MCP tools/list
    const toolsResult = await mcpClient.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);
    assert.ok(toolNames.includes("get_prayer_timings"));
    assert.ok(toolNames.includes("update_prayer_timings"));
    assert.ok(toolNames.includes("delete_prayer_timings"));
    assert.ok(toolNames.includes("get_calculation_methods"));

    // 6. Test calling get_prayer_timings
    const getResult = (await mcpClient.callTool({
      name: "get_prayer_timings",
      arguments: {
        masjidId: "masjid_abc",
        startDate: "2026-08-25",
        endDate: "2026-08-25",
      },
    })) as { content: Array<{ type: string; text: string }> };

    assert.strictEqual(receivedAuthHeader, "Bearer test-jwt-token-123");
    const getPayload = JSON.parse(getResult.content[0].text);
    assert.strictEqual(getPayload.masjidId, "masjid_abc");
    assert.strictEqual(getPayload.schedules[0].prayers[0].prayerName, "Fajr");
    assert.strictEqual(getPayload.schedules[0].prayers[0].azaanTimeFormatted, "05:30 AM");

    // 7. Test calling update_prayer_timings with human time strings
    const updateResult = (await mcpClient.callTool({
      name: "update_prayer_timings",
      arguments: {
        masjidId: "masjid_abc",
        date: "2026-08-25",
        timings: [
          {
            namazName: "Fajr",
            azaanTime: "05:30 AM",
            jamaatTime: "06:00 AM",
          },
        ],
      },
    })) as { content: Array<{ type: string; text: string }> };

    const updatePayload = JSON.parse(updateResult.content[0].text);
    assert.strictEqual(updatePayload.success, true);
    assert.strictEqual(updatePayload.updatedDaysCount, 1);

    // 8. Test calling delete_prayer_timings
    const deleteResult = (await mcpClient.callTool({
      name: "delete_prayer_timings",
      arguments: {
        masjidId: "masjid_abc",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
    })) as { content: Array<{ type: string; text: string }> };

    const deletePayload = JSON.parse(deleteResult.content[0].text);
    assert.strictEqual(deletePayload.success, true);

    // 9. Test calling get_calculation_methods
    const methodsResult = (await mcpClient.callTool({
      name: "get_calculation_methods",
      arguments: {
        latitude: 40.7128,
        longitude: -74.006,
        timezone: "America/New_York",
      },
    })) as { content: Array<{ type: string; text: string }> };

    assert.strictEqual(receivedRestPath, "/prayer-times/calculation-methods");
    const methodsPayload = JSON.parse(methodsResult.content[0].text);
    assert.strictEqual(methodsPayload.methods[0].methodName, "ISNA");

    await mcpClient.close();
    await mcpServer.close();
  } finally {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});
