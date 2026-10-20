import { expect, it } from "vitest";
import {
  retainSubscriptionSnapshots,
  subscriptionSummary,
  type SubscriptionSnapshot,
} from "./subscription-data";

it("Given a failed region, retains the previous timestamp and marks totals partial", () => {
  const previous: SubscriptionSnapshot = {
    regions: [
      {
        region: "hk",
        available: true,
        updated_at: "2026-10-19T00:00:00Z",
        receivers: [],
        summary: {
          total: 3,
          enabled: 2,
          disabled: 1,
          revoked: 0,
          expired: 0,
          invalidated: 0,
          enabled_users: 1,
        },
      },
    ],
  };
  const next = retainSubscriptionSnapshots(previous, {
    regions: [{ region: "hk", available: false, error: "unavailable" }],
  });
  expect(next.regions[0].updated_at).toBe(previous.regions[0].updated_at);
  expect(next.regions[0].available).toBe(false);
  expect(subscriptionSummary(next.regions)).toMatchObject({
    total: 3,
    enabled: 2,
    partial: true,
  });
  expect(
    subscriptionSummary([{ region: "us", available: false }]).total,
  ).toBeNull();
});

it("Given distinct regional snapshots, sums full filtered totals rather than page rows", () => {
  const result = subscriptionSummary(
    ["us", "hk"].map((region) => ({
      region,
      available: true,
      receivers: [],
      summary: {
        total: 20,
        enabled: 10,
        disabled: 0,
        revoked: 0,
        expired: 10,
        invalidated: 0,
        enabled_users: 5,
      },
    })),
  );
  expect(result).toMatchObject({
    total: 40,
    enabled: 20,
    enabled_users: 10,
    partial: false,
  });
});
