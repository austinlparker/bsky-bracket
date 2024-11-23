export function determineTeamHash(did: string): number {
  const NUM_TEAMS = 512;
  let hash = 0;
  for (let i = 0; i < did.length; i++) {
    const char = did.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const positiveHash = hash >>> 0;
  return positiveHash % NUM_TEAMS;
}
