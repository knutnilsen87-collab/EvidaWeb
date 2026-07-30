package no.saksrom.api.config;

import no.saksrom.api.ai.StreamingProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({EvidaProperties.class, StreamingProperties.class})
public class AppConfig {
}
