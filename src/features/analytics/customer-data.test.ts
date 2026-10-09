import { describe, expect, it } from "vitest";
import {
  customerStage,
  mergeCustomers,
  retainRegionalSnapshots,
  type Customer,
  type CustomerSnapshot,
} from "./customer-data";
export const customer = (
  email: string,
  extra: Partial<Customer> = {},
): Customer => ({
  user_id: email,
  email,
  is_admin: false,
  created_at: "2026-10-01T00:00:00Z",
  first_visit_at: null,
  last_visit_at: null,
  devices: 0,
  agents: 0,
  first_bound_at: null,
  user_messages: 0,
  first_message_at: null,
  last_message_at: null,
  encrypted_records: 0,
  sessions: 0,
  ...extra,
});
describe("customer analytics semantics", () => {
  it("deduplicates regional identities and keeps encrypted records out of send counts", () => {
    const snapshot: CustomerSnapshot = {
      regions: [
        {
          region: "us",
          available: true,
          users: [
            customer("ONE@example.invalid", { agents: 2, user_messages: 3 }),
            customer("local@example.local"),
          ],
        },
        {
          region: "hk",
          available: true,
          users: [
            customer("one@example.invalid", {
              agents: 1,
              encrypted_records: 99,
              is_admin: true,
              first_visit_at: "2026-10-09T00:00:00Z",
            }),
          ],
        },
      ],
    };
    const users = mergeCustomers(snapshot);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      agents: 3,
      user_messages: 3,
      encrypted_records: 99,
      is_admin: true,
      regions: ["us", "hk"],
    });
    expect(mergeCustomers(snapshot, "hk")[0].agents).toBe(1);
    expect(customerStage(customer("encrypted", { encrypted_records: 3 }))).toBe(
      "encrypted",
    );
    expect(customerStage(users[0])).toBe("sent");
  });
  it("retains a failed region's last snapshot and never fabricates empty success", () => {
    const old: CustomerSnapshot = {
      regions: [
        {
          region: "hk",
          available: true,
          updated_at: "2026-10-09T00:00:00Z",
          users: [customer("one")],
        },
      ],
    };
    const next = retainRegionalSnapshots(old, {
      regions: [{ region: "hk", available: false, error: "unavailable" }],
    });
    expect(next.regions[0].updated_at).toBe(old.regions[0].updated_at);
    expect(mergeCustomers(next)[0].stale).toBe(true);
    expect(
      retainRegionalSnapshots(undefined, {
        regions: [{ region: "hk", available: false }],
      }).regions[0].users,
    ).toBeUndefined();
  });
});
