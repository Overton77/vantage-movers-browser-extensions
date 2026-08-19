export function generateOperationId(
  randomUuid: () => string = defaultRandomUuid,
): string {
  return randomUuid().toLowerCase();
}

function defaultRandomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("UUID v4 generation is unavailable");
}

export function isLowercaseUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
