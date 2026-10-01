export const CODE_ROTATION_MS = 60_000;
export const CODE_GRACE_MS = 30_000;
export const PAIRING_CONFIRMATION_MS = 30_000;
export const SHORT_PAIRING_LIFETIME_MS = 600_000;

export function codeGeneration(createdAt: number, now: number) {
  if (!Number.isFinite(createdAt) || !Number.isFinite(now) || now < createdAt)
    throw new Error("Invalid pairing clock");
  return Math.floor((now - createdAt) / CODE_ROTATION_MS);
}

export function generationDeadline(
  createdAt: number,
  expiresAt: number,
  generation: number,
) {
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    generation > 9
  )
    throw new Error("Invalid code generation");
  return Math.min(
    expiresAt,
    createdAt + SHORT_PAIRING_LIFETIME_MS,
    createdAt + (generation + 1) * CODE_ROTATION_MS + CODE_GRACE_MS,
  );
}

export function confirmationDeadline(expiresAt: number, now: number) {
  return Math.min(expiresAt, now + PAIRING_CONFIRMATION_MS);
}

export function normalizeShortCode(value: string) {
  const normalized = value.replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(normalized)) throw new Error("Enter eight digits");
  return normalized;
}
