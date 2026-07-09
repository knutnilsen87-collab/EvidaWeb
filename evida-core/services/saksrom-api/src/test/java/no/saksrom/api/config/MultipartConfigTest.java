package no.saksrom.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.unit.DataSize;

import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * DEFECT-P5-1 regression guard: spring.servlet.multipart limits must be configured explicitly
 * and stay above Tomcat's 1MB default, aligned with evida.documents.max-file-size-bytes,
 * so normal legal PDFs are never rejected with HTTP 413 before EVIDA's own validation runs.
 */
class MultipartConfigTest {
    private static final Pattern ENV_PLACEHOLDER = Pattern.compile("^\\$\\{[A-Z0-9_]+:(.+)}$");

    @Test
    void multipartLimitsAreConfiguredAboveTomcatDefaultAndAlignedWithEvidaPolicy() {
        Properties properties = loadApplicationYaml();

        String maxFileSize = defaultValue(properties.getProperty("spring.servlet.multipart.max-file-size"));
        String maxRequestSize = defaultValue(properties.getProperty("spring.servlet.multipart.max-request-size"));
        String evidaMaxBytes = defaultValue(properties.getProperty("evida.documents.max-file-size-bytes"));

        assertNotNull(maxFileSize, "spring.servlet.multipart.max-file-size must be configured");
        assertNotNull(maxRequestSize, "spring.servlet.multipart.max-request-size must be configured");
        assertNotNull(evidaMaxBytes, "evida.documents.max-file-size-bytes must be configured");

        DataSize fileSize = DataSize.parse(maxFileSize);
        DataSize requestSize = DataSize.parse(maxRequestSize);
        assertTrue(fileSize.toBytes() > DataSize.ofMegabytes(1).toBytes(),
                "multipart max-file-size default must exceed Tomcat's 1MB default, was " + maxFileSize);
        assertTrue(requestSize.toBytes() > DataSize.ofMegabytes(1).toBytes(),
                "multipart max-request-size default must exceed Tomcat's 1MB default, was " + maxRequestSize);

        long evidaBytes = Long.parseLong(evidaMaxBytes);
        assertEquals(evidaBytes, fileSize.toBytes(),
                "multipart max-file-size should stay aligned with evida.documents.max-file-size-bytes");
        assertTrue(requestSize.toBytes() >= fileSize.toBytes(),
                "max-request-size must be at least max-file-size");
    }

    private Properties loadApplicationYaml() {
        YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
        factory.setResources(new ClassPathResource("application.yml"));
        Properties properties = factory.getObject();
        assertNotNull(properties, "application.yml must be loadable");
        return properties;
    }

    private String defaultValue(String rawValue) {
        if (rawValue == null) {
            return null;
        }
        Matcher matcher = ENV_PLACEHOLDER.matcher(rawValue.trim());
        return matcher.matches() ? matcher.group(1) : rawValue.trim();
    }
}
