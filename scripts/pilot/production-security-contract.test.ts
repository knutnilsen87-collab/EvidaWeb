import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readRepoFile = (relativePath: string) => readFile(path.join(repoRoot, relativePath), "utf8");

describe("production security contract", () => {
  it("requires HTTPS OIDC, MFA claims, an explicit role allowlist, and encrypted target storage", async () => {
    const [compose, validator] = await Promise.all([
      readRepoFile("deploy/pilot/docker-compose.yml"),
      readRepoFile("evida-core/services/saksrom-api/src/main/java/no/saksrom/api/config/SecurityModeValidator.java")
    ]);

    expect(compose).toContain("SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI");
    expect(compose).toContain('EVIDA_MFA_REQUIRED: "true"');
    expect(compose).toContain("EVIDA_MFA_ACCEPTED_AMR:");
    expect(compose).toContain("EVIDA_ALLOWED_ROLES:");
    expect(compose).toContain("EVIDA_STORAGE_ENCRYPTION_ATTESTED:");
    expect(validator).toContain("production profile requires an HTTPS JWT issuer-uri");
    expect(validator).toContain("production profile requires MFA claim enforcement");
    expect(validator).toContain("production profile requires an explicit EVIDA role allowlist");
  });

  it("publishes only the HTTPS gateway surface", async () => {
    const compose = await readRepoFile("deploy/pilot/docker-compose.yml");
    const publishedPorts = [...compose.matchAll(/^\s+- "(\d+):(\d+)"$/gm)]
      .map((match) => `${match[1]}:${match[2]}`);

    expect(publishedPorts).toEqual(["80:80", "443:443"]);
    expect(compose).not.toMatch(/^\s+- "(18080|3000|4173|5432|3310):/m);
  });

  it("keeps external providers disabled globally and tenant-controlled through one audited authority", async () => {
    const [compose, service, migration] = await Promise.all([
      readRepoFile("deploy/pilot/docker-compose.yml"),
      readRepoFile("evida-core/services/saksrom-api/src/main/java/no/saksrom/api/policy/ProviderPolicyService.java"),
      readRepoFile("evida-core/services/saksrom-api/src/main/resources/db/migration/V011__provider_policy_authority.sql")
    ]);

    expect(compose).toContain('EVIDA_AI_PROVIDER_CALLS_ENABLED: "false"');
    expect(service).toContain('AUTHORITY = "backend-provider-policy"');
    expect(service).toContain('"PROVIDER_POLICY_CHANGED"');
    expect(service).toContain("globalKillSwitchOpen && tenantApproved");
    expect(migration.toLowerCase()).toContain("create table provider_policies");
    expect(migration.toLowerCase()).toContain("primary key");
  });

  it("ships fail-closed operator evidence writers for every external technical gate", async () => {
    const scripts = await Promise.all([
      readRepoFile("scripts/pilot/test-target-storage.ps1"),
      readRepoFile("scripts/pilot/test-release-signatures.ps1"),
      readRepoFile("scripts/pilot/test-live-edge.ps1"),
      readRepoFile("scripts/pilot/test-production-identity.ps1"),
      readRepoFile("scripts/pilot/write-managed-workstation-smoke.ps1")
    ]);

    for (const script of scripts) {
      expect(script).toContain('"blocked"');
      expect(script).toContain("artifacts\\first-user");
    }
  });
});
