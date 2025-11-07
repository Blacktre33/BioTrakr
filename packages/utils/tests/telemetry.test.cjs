const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

require("./helpers/setup.cjs");

const {
  getMockAssetLocationPings,
  getMockMaintenanceTasks,
  listMockTelemetryAssets,
} = require("../dist/utils/src/index.js");

describe("mock telemetry helpers", () => {
  test("provides seeded assets and recent location pings", () => {
    const seeds = listMockTelemetryAssets();
    assert.ok(Array.isArray(seeds) && seeds.length > 0, "should list telemetry seeds");

    const firstSeed = seeds[0];
    const pings = getMockAssetLocationPings(firstSeed.assetId, 5);

    assert.equal(pings.length, 5);
    assert.ok(pings.every((ping) => ping.assetId === firstSeed.assetId));
  });

  test("returns maintenance tasks with supported statuses", () => {
    const tasks = getMockMaintenanceTasks();
    const allowedStatuses = new Set(["scheduled", "in_progress", "completed"]);

    assert.ok(tasks.length > 0, "should expose mock maintenance tasks");
    assert.ok(tasks.every((task) => allowedStatuses.has(task.status)));
  });
});

