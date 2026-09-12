/** Internal app path only. Reject protocol-relative and external URLs. */
export function sanitizeReturnUrl(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}
