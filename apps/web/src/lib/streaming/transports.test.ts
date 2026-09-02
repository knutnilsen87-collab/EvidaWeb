import { describe, expect, it, vi } from "vitest";
import { MockSaksromStreamTransport } from "./transports";

const request = {
  query: "Hva viser kilden?", caseId: "case", tenantId: "tenant", mode: "SPOERRE" as const,
  includePartial: false, sourceBasis: "READY_PAGE_UNITS_ONLY" as const
};

describe("MockSaksromStreamTransport", () => {
  it("emits deterministic source-bound events", async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const promise = new MockSaksromStreamTransport().stream(request, {
      signal: new AbortController().signal, onEvent: (event) => events.push(event)
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "started" }),
      expect.objectContaining({ type: "citation" }),
      expect.objectContaining({ type: "completed" })
    ]));
    vi.useRealTimers();
  });

  it("aborts delays immediately", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const promise = new MockSaksromStreamTransport().stream(request, { signal: controller.signal, onEvent: vi.fn() });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    vi.useRealTimers();
  });
});
