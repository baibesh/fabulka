/**
 * Muse Image's 400 for a prompt its safety filter refused: "The response was filtered due to the
 * prompt triggering our content management policy." The SDK error carries only the status and
 * this message. Kept apart from the gateways so the journal can name it too.
 */
export function isSafetyRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 400 && /content (?:management )?policy/i.test(message);
}

/** The journal's error code for a safety refusal (instead of a bare http_400). */
export const CONTENT_POLICY = 'content_policy';
