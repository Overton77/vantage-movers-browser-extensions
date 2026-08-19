export async function fingerprintPendingRow(input: {
  operation_kind: string;
  row_id: string;
  expected_target?: { model: string; id: string };
  granot_statement: Record<string, string | number | null>;
}): Promise<string> {
  const canonical = JSON.stringify({
    operation_kind: input.operation_kind,
    row_id: input.row_id,
    expected_target: input.expected_target ?? null,
    statement: canonicalizeStatement(input.granot_statement),
  });
  const bytes = new TextEncoder().encode(canonical);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bufferToHex(digest);
  }
  return fallbackHex(canonical);
}

function canonicalizeStatement(
  statement: Record<string, string | number | null>,
): Record<string, string | number | null> {
  return Object.fromEntries(
    Object.entries(statement).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fallbackHex(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
