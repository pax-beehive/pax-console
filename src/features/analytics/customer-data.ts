export type Customer = {
  user_id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  first_visit_at: string | null;
  last_visit_at: string | null;
  devices: number;
  agents: number;
  first_bound_at: string | null;
  user_messages: number;
  first_message_at: string | null;
  last_message_at: string | null;
  encrypted_records: number;
  sessions: number;
};
export type RegionalCustomers = {
  region: string;
  available: boolean;
  updated_at?: string;
  users?: Customer[];
  error?: string;
};
export type CustomerSnapshot = { regions: RegionalCustomers[] };
export type MergedCustomer = Customer & { regions: string[]; stale: boolean };

export function retainRegionalSnapshots(
  previous: CustomerSnapshot | undefined,
  incoming: CustomerSnapshot,
): CustomerSnapshot {
  return {
    regions: incoming.regions.map((region) =>
      region.available
        ? region
        : {
            ...previous?.regions.find((old) => old.region === region.region),
            ...region,
            users: previous?.regions.find((old) => old.region === region.region)
              ?.users,
          },
    ),
  };
}

function earliest(a: string | null, b: string | null) {
  return !a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b;
}
function latest(a: string | null, b: string | null) {
  return !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;
}

export function mergeCustomers(
  snapshot: CustomerSnapshot,
  region = "all",
): MergedCustomer[] {
  const users = new Map<string, MergedCustomer>();
  for (const source of snapshot.regions) {
    if (region !== "all" && source.region !== region) continue;
    for (const row of source.users ?? []) {
      const email = row.email.trim().toLowerCase();
      if (email === "local@example.local") continue;
      const old = users.get(email);
      if (!old) {
        users.set(email, {
          ...row,
          email,
          regions: [source.region],
          stale: !source.available,
        });
        continue;
      }
      old.regions.push(source.region);
      old.stale ||= !source.available;
      old.is_admin ||= row.is_admin;
      old.created_at = earliest(old.created_at, row.created_at)!;
      old.first_visit_at = earliest(old.first_visit_at, row.first_visit_at);
      old.last_visit_at = latest(old.last_visit_at, row.last_visit_at);
      old.first_bound_at = earliest(old.first_bound_at, row.first_bound_at);
      old.first_message_at = earliest(
        old.first_message_at,
        row.first_message_at,
      );
      old.last_message_at = latest(old.last_message_at, row.last_message_at);
      for (const key of [
        "devices",
        "agents",
        "user_messages",
        "encrypted_records",
        "sessions",
      ] as const)
        old[key] += row[key];
    }
  }
  return [...users.values()].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      a.email.localeCompare(b.email),
  );
}

export function customerStage(user: Customer) {
  if (user.user_messages > 0) return "sent";
  if (user.encrypted_records > 0) return "encrypted";
  if (user.agents > 0) return "bound";
  return "unbound";
}
