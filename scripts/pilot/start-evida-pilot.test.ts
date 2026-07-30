import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("secure pilot startup contract", () => {
  it("requires malware scanning by default and names the synthetic-only override", async () => {
    const script = await readFile(
      path.join(repoRoot, "scripts", "pilot", "start-evida-pilot.ps1"),
      "utf8"
    );

    expect(script).toContain("$malwareScanRequired = -not $AllowMalwareBypassForSyntheticDev");
    expect(script).toContain('EVIDA_MALWARE_SCAN_ENABLED = "true"');
    expect(script).toContain("REAL DATA FORBIDDEN");
    expect(script).toContain("start-evida-clamav.ps1");
    expect(script).toContain("artifacts\\pilot-start");
    expect(script).toContain("contains_client_content = $false");
    expect(script).not.toContain("[switch]$EnableMalwareScan");
  });

  it("does not opt the one-click pilot launcher into the synthetic bypass", async () => {
    const launcher = await readFile(path.join(repoRoot, "Start EVIDA Pilot.bat"), "utf8");

    expect(launcher).not.toContain("AllowMalwareBypassForSyntheticDev");
    expect(launcher).toContain("start-evida-pilot.ps1");
  });
});
