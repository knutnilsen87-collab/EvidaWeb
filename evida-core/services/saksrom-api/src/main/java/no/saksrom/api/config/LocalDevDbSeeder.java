package no.saksrom.api.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

@Configuration
public class LocalDevDbSeeder {
    private static final Logger log = LoggerFactory.getLogger(LocalDevDbSeeder.class);

    private static final UUID DEV_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID DEV_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");

    private final EvidaProperties properties;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    public LocalDevDbSeeder(
            EvidaProperties properties,
            JdbcTemplate jdbcTemplate,
            @Autowired(required = false) org.flywaydb.core.Flyway flyway
    ) {
        this.properties = properties;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void seed() {
        if (!properties.security().localDevMode()) {
            return;
        }

        log.info("Local dev mode active. Ensuring default tenant and user exist in database...");
        try {
            jdbcTemplate.execute("INSERT INTO tenants (id, name, status) " +
                    "VALUES ('" + DEV_TENANT_ID + "', 'Dev Tenant', 'ACTIVE') " +
                    "ON CONFLICT (id) DO NOTHING");

            jdbcTemplate.execute("INSERT INTO users (id, tenant_id, email, display_name, role, status) " +
                    "VALUES ('" + DEV_USER_ID + "', '" + DEV_TENANT_ID + "', 'dev@evida.local', 'Dev User', 'OWNER', 'ACTIVE') " +
                    "ON CONFLICT (id) DO NOTHING");

            log.info("Database seeding of dev tenant and user completed successfully.");
        } catch (Exception e) {
            log.error("Failed to seed local dev database", e);
        }
    }
}
