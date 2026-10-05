export function projectStorageKey(ownerId?: string | null): string {
  return `float_active_project_${ownerId || 'local'}`;
}
