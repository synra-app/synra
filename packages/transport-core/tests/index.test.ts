import { expect, test } from "vite-plus/test";
import { DEFAULT_RETRY_POLICY, MessageDeduper, getRetryDelayMs } from "../src/index.ts";

test("getRetryDelayMs uses exponential backoff with cap", () => {
  const first = getRetryDelayMs(1, DEFAULT_RETRY_POLICY);
  const third = getRetryDelayMs(3, DEFAULT_RETRY_POLICY);
  const tenth = getRetryDelayMs(10, DEFAULT_RETRY_POLICY);

  expect(first).toBe(500);
  expect(third).toBe(2_000);
  expect(tenth).toBe(2_000);
});

test("MessageDeduper no longer matches after expiration", () => {
  const deduper = new MessageDeduper(100);
  const startAt = 1_000;

  deduper.remember("m1", startAt);
  expect(deduper.has("m1", startAt + 50)).toBe(true);
  expect(deduper.has("m1", startAt + 101)).toBe(false);
});
