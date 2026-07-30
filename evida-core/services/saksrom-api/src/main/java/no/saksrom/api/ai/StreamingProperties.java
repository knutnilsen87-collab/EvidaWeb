package no.saksrom.api.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

/**
 * Central configuration for AI response streaming (server side).
 *
 * <p>Perceived reading speed (tokens/second) is paced on the client so it stays smooth regardless of
 * how bursty the backend delivery is; these server-side knobs only control transport timeouts and an
 * optional deliberate delay used mainly for local demos. Bound from {@code evida.streaming.*}.
 */
@ConfigurationProperties(prefix = "evida.streaming")
public record StreamingProperties(
        long timeoutMillis,
        long heartbeatMillis,
        long serverTokenDelayMillis
) {
    public static final long DEFAULT_TIMEOUT_MILLIS = 120_000L;
    public static final long DEFAULT_HEARTBEAT_MILLIS = 15_000L;

    // Two constructors on a @ConfigurationProperties record: Spring Boot must be told which one binds.
    @ConstructorBinding
    public StreamingProperties {
        if (timeoutMillis <= 0) {
            timeoutMillis = DEFAULT_TIMEOUT_MILLIS;
        }
        if (heartbeatMillis <= 0) {
            heartbeatMillis = DEFAULT_HEARTBEAT_MILLIS;
        }
        if (serverTokenDelayMillis < 0) {
            serverTokenDelayMillis = 0L;
        }
    }

    public StreamingProperties() {
        this(DEFAULT_TIMEOUT_MILLIS, DEFAULT_HEARTBEAT_MILLIS, 0L);
    }
}
