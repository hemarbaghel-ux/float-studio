/** A settled request may clear shared UI state only while it still owns the active slot. */
export function ownsActiveRequest<T>(active: T | null, request: T): boolean {
  return active === request;
}
