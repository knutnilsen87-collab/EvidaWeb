package no.saksrom.api.policy;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ProviderPolicyRepository extends JpaRepository<ProviderPolicy, UUID> {
}
