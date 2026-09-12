export function errMsg(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "object") {
    const o = error as { shortMessage?: string; message?: string };
    if (o.shortMessage) return o.shortMessage;
    if (o.message) return o.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
