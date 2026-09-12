import { cleanupE2ENotes } from "./fixtures/test-base";

export default async function globalTeardown(): Promise<void> {
  await cleanupE2ENotes();
}
