import { afterEach, describe, expect, it, vi } from "vitest";
import { AiStreamServerError, AiStreamUnavailableError, streamAiSse } from "./aiStream";

function sseResponse(frames: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        frames.forEach((frame) => controller.enqueue(encoder.encode(frame)));
        controller.close();
      }
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamAiSse", () => {
  it("parses SSE frames and ignores heartbeat comments and the done terminator", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      "event: meta\ndata: {\"seq\":0,\"streamId\":\"s1\"}\n\n",
      ": keep-alive\n\n",
      "event: token\ndata: {\"seq\":1,\"sectionId\":\"overview\",\"index\":0,\"text\":\"Hei \"}\n\n",
      "event: token\ndata: {\"seq\":2,\"sectionId\":\"overview\",\"index\":1,\"text\":\"verden\"}\n\n",
      "event: done\ndata: {\"seq\":3,\"tokenCount\":2}\n\n"
    ])));

    const events: string[] = [];
    const result = await streamAiSse("/api/x/sse", {}, (frame) => events.push(frame.event));

    expect(events).toEqual(["meta", "token", "token"]);
    expect(result.lastTokenIndex).toBe(1);
  });

  it("reports a sequence gap so the client can detect a dropped event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      "event: meta\ndata: {\"seq\":0}\n\n",
      "event: token\ndata: {\"seq\":2,\"index\":1,\"text\":\"x\"}\n\n",
      "event: done\ndata: {\"seq\":3}\n\n"
    ])));

    const gaps: Array<{ expected: number; received: number }> = [];
    await streamAiSse("/api/x/sse", { onGap: (info) => gaps.push(info) }, () => undefined);

    expect(gaps).toEqual([{ expected: 1, received: 2 }]);
  });

  it("rejects with AiStreamServerError on an error frame, flagging that content had arrived", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      "event: token\ndata: {\"seq\":0,\"index\":0,\"text\":\"Del \"}\n\n",
      "event: error\ndata: {\"seq\":1,\"message\":\"Modellen feilet\"}\n\n"
    ])));

    const error = await streamAiSse("/api/x/sse", {}, () => undefined).catch((e) => e);
    expect(error).toBeInstanceOf(AiStreamServerError);
    expect((error as AiStreamServerError).message).toBe("Modellen feilet");
    expect((error as AiStreamServerError).receivedContent).toBe(true);
  });

  it("throws AiStreamUnavailableError for 404 so callers can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(streamAiSse("/api/x/sse", {}, () => undefined)).rejects.toBeInstanceOf(AiStreamUnavailableError);
  });

  it("throws AiStreamUnavailableError when the connection cannot be made", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(streamAiSse("/api/x/sse", {}, () => undefined)).rejects.toBeInstanceOf(AiStreamUnavailableError);
  });
});
