export default async function globalTeardown() {
  await globalThis.__PG_CONTAINER__?.stop();
  await globalThis.__PG_EMBEDDED__?.stop();
}
