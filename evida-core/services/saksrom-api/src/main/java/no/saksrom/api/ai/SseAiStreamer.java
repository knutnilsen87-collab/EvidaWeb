package no.saksrom.api.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Reusable Server-Sent Events driver for streaming AI-generated responses token-by-token.
 *
 * <p>Design goals (shared by every AI response in EVIDA, not per-feature):
 * <ul>
 *   <li>Low time-to-first-token: streaming starts as soon as the producer emits, never buffering the
 *       whole response first.</li>
 *   <li>Every event carries a monotonic {@code seq} (also set as the SSE {@code id:} field) so the
 *       client can detect gaps and, on reconnect, resume from a known token index.</li>
 *   <li>Always terminates explicitly with {@code event: done} on success or {@code event: error} on
 *       failure — the stream is never closed silently.</li>
 * </ul>
 *
 * <p>Producers receive a {@link TokenSink}; the driver owns sequencing, the terminal events, timeout
 * and cleanup. The producer only decides <em>what</em> to stream.
 */
@Component
public class SseAiStreamer {

    private static final Logger log = LoggerFactory.getLogger(SseAiStreamer.class);

    private final ObjectMapper objectMapper;
    private final StreamingProperties properties;
    private final ExecutorService executor;

    public SseAiStreamer(ObjectMapper objectMapper, StreamingProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.executor = Executors.newCachedThreadPool(daemonFactory());
    }

    /** A unit of work that emits events onto the sink. Any thrown exception becomes an {@code error} event. */
    @FunctionalInterface
    public interface StreamProducer {
        void produce(TokenSink sink) throws Exception;
    }

    /** Handle producers use to push events; the driver adds sequencing and terminal framing. */
    public interface TokenSink {
        /** Low-level: emit a named event with an arbitrary JSON payload. {@code seq} is added automatically. */
        void event(String name, Map<String, Object> data);

        /** Emit a lifecycle stage marker (e.g. "reading_sources"). */
        void stage(String stage, String label);

        /** Emit a single token for a logical section. */
        void token(String sectionId, String text);

        /** Tokenize {@code fullText} and stream it token-by-token, honouring resume position and pacing. */
        void tokens(String sectionId, String fullText);

        /** True once the client has disconnected / stream was cancelled; producers should stop early. */
        boolean cancelled();
    }

    public SseEmitter stream(StreamProducer producer) {
        return stream(0, producer);
    }

    /**
     * @param resumeFromToken content-token index the client already has; tokens before it are suppressed
     *                        on reconnect so the client can heal a gap without re-rendering.
     */
    public SseEmitter stream(int resumeFromToken, StreamProducer producer) {
        SseEmitter emitter = new SseEmitter(properties.timeoutMillis());
        SinkImpl sink = new SinkImpl(emitter, Math.max(0, resumeFromToken));

        emitter.onTimeout(() -> {
            sink.markCancelled();
            emitter.complete();
        });
        emitter.onError(throwable -> sink.markCancelled());
        emitter.onCompletion(sink::markCancelled);

        executor.execute(() -> {
            try {
                sink.event("meta", Map.of("streamId", sink.streamId, "resumeFromToken", sink.resumeFromToken));
                producer.produce(sink);
                if (!sink.cancelled()) {
                    sink.event("done", Map.of("tokenCount", sink.tokenIndex.get()));
                }
                emitter.complete();
            } catch (Exception failure) {
                if (!sink.cancelled()) {
                    try {
                        sink.event("error", Map.of("message", safeMessage(failure)));
                    } catch (RuntimeException ignored) {
                        // Client already gone; nothing more we can do.
                    }
                    emitter.complete();
                }
                log.warn("AI SSE stream failed", failure);
            }
        });
        return emitter;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return (message == null || message.isBlank()) ? "Uventet feil under strømming." : message;
    }

    private static ThreadFactory daemonFactory() {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, "evida-sse-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    private final class SinkImpl implements TokenSink {
        private final SseEmitter emitter;
        private final String streamId = UUID.randomUUID().toString();
        private final int resumeFromToken;
        private final AtomicLong seq = new AtomicLong(0);
        private final AtomicInteger tokenIndex = new AtomicInteger(0);
        private final AtomicBoolean cancelled = new AtomicBoolean(false);

        private SinkImpl(SseEmitter emitter, int resumeFromToken) {
            this.emitter = emitter;
            this.resumeFromToken = resumeFromToken;
        }

        @Override
        public void event(String name, Map<String, Object> data) {
            if (cancelled.get()) {
                return;
            }
            long id = seq.getAndIncrement();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("seq", id);
            if (data != null) {
                payload.putAll(data);
            }
            try {
                emitter.send(SseEmitter.event()
                        .id(Long.toString(id))
                        .name(name)
                        .data(objectMapper.writeValueAsString(payload), MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException disconnected) {
                // Broken pipe / already completed: client went away. Stop emitting.
                markCancelled();
            }
        }

        @Override
        public void stage(String stage, String label) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("stage", stage);
            if (label != null) {
                data.put("label", label);
            }
            event("stage", data);
        }

        @Override
        public void token(String sectionId, String text) {
            int index = tokenIndex.getAndIncrement();
            if (index < resumeFromToken || cancelled.get()) {
                return;
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("sectionId", sectionId);
            data.put("index", index);
            data.put("text", text);
            event("token", data);
            pace();
        }

        @Override
        public void tokens(String sectionId, String fullText) {
            List<String> tokens = TextTokenizer.tokenize(fullText);
            for (String token : tokens) {
                if (cancelled.get()) {
                    return;
                }
                token(sectionId, token);
            }
        }

        @Override
        public boolean cancelled() {
            return cancelled.get();
        }

        private void markCancelled() {
            cancelled.set(true);
        }

        private void pace() {
            long delay = properties.serverTokenDelayMillis();
            if (delay <= 0) {
                return;
            }
            try {
                Thread.sleep(delay);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                markCancelled();
            }
        }
    }
}
