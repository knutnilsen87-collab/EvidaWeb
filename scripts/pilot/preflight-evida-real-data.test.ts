import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertFixtureUploadAllowed,
  determineExitCode,
  formatOperatorActions,
  operatorActionsFor,
  runCheckDefinitions,
  type CheckDefinition
} from "./preflight-evida-real-data";

function missing(name: string, detail: string): CheckDefinition {
  return {
    name,
    whyImportant: `${name} er sikkerhetskritisk.`,
    suggestedAction: `Start eller installer ${name}.`,
    requiresInstall: true,
    run: async () => ({ status: "blocked", detail })
  };
}

describe("EVIDA real-data preflight", () => {
  it.each(["ClamAV/clamd", "Docker daemon"])("reports %s missing as explicit operator action", async (name) => {
    const checks = await runCheckDefinitions([missing(name, "ikke tilgjengelig")]);
    const output = formatOperatorActions(operatorActionsFor(checks));

    expect(output).toContain("🚨 HANDLING KREVES AV KNUT");
    expect(output).toContain(`Komponent: ${name}`);
    expect(output).toContain("Ekte data tillatt: NEI");
    expect(determineExitCode(checks)).toBe(2);
  });

  it("reports native picker as manual approval", async () => {
    const checks = await runCheckDefinitions([{
      name: "Native file picker signoff",
      whyImportant: "Native picker må verifiseres på Windows.",
      suggestedAction: "Utfør og signer smoke-testen.",
      requiresManualApproval: true,
      run: async () => ({ status: "manual_required", detail: "manual_required" })
    }]);

    const [action] = operatorActionsFor(checks);
    expect(action.status).toBe("krever godkjenning");
    expect(action.requires_manual_approval).toBe(true);
  });

  it("continues after an individual probe throws", async () => {
    const checks = await runCheckDefinitions([
      { ...missing("Docker daemon", "missing"), run: async () => { throw new Error("not installed"); } },
      missing("ClamAV/clamd", "missing")
    ]);

    expect(checks).toHaveLength(2);
    expect(checks[0].status).toBe("error");
    expect(checks[1].status).toBe("blocked");
    expect(determineExitCode(checks)).toBe(1);
  });

  it("allows only PDF/TXT fixtures under the allowlisted folder", () => {
    const root = path.resolve("F:/repo/evida");
    expect(assertFixtureUploadAllowed(root, path.join(root, "test-fixtures/uploads/safe.pdf"), "test"))
      .toBe(path.join(root, "test-fixtures/uploads/safe.pdf"));
    expect(() => assertFixtureUploadAllowed(root, path.join(root, "secrets.txt"), "test")).toThrow(/allowlistede/);
  });

  it("disables fixture upload in production", () => {
    const root = path.resolve("F:/repo/evida");
    expect(() => assertFixtureUploadAllowed(root, path.join(root, "test-fixtures/uploads/safe.txt"), "production"))
      .toThrow(/deaktivert/);
  });
});
