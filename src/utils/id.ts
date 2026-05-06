export function generateTokenId(): string {
  const ts = Date.now().toString(36); // base36 timestamp
  const rand = Math.random().toString(36).slice(2, 7);
  const id = `${ts}${rand}`;
  console.log(`[ttimer] generateTokenId: generated id=${id}`);
  return id;
}