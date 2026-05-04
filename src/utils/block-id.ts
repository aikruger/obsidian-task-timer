export function generateBlockId(prefix: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const rand = Math.random().toString(36).substring(2, 6);
  return `^${prefix}-${timestamp}-${rand}`;
}
