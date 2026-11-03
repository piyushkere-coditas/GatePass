export default async function globalTeardown() {
  await globalThis.__PG_EMBEDDED__?.stop();
}
