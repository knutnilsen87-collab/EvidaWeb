import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEicarFixture, removeEicarFixture } from "./create-eicar-fixture";
import {
  CLAMAV_ACTION,
  OPERATOR_ACTION_BLOCK,
  clamavEndpoint,
  dockerDaemonReachable,
  eicarWasRejectedByClamd,
  loadPilotEnvironment,
  readMalwareArtifact,
  scanFileWithClamd,
  tcpReachable,
  writeGateArtifacts
} from "./malware-gate-lib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main(): Promise<void> {
  const environment = await loadPilotEnvironment(repoRoot);
  const { host, port } = clamavEndpoint(environment);
  const [dockerReachable, clamdReachable] = await Promise.all([
    dockerDaemonReachable(),
    tcpReachable(host, port)
  ]);
  const previous = await readMalwareArtifact(repoRoot);

  if (!clamdReachable) {
    console.log(OPERATOR_ACTION_BLOCK);
    await writeGateArtifacts(repoRoot, {
      ...previous,
      clamdReachable: false,
      eicarRejected: false,
      realClientDataAllowed: false,
      operatorActionRequired: [CLAMAV_ACTION],
      status: "blocked",
      evidence: { dockerDaemonReachable: dockerReachable, clamavHost: host, clamavPort: port }
    });
    console.log(`\nBLOCKED: clamd svarer ikke på ${host}:${port}. EICAR-testen ble ikke kjørt.`);
    process.exitCode = 2;
    return;
  }

  let fixturePath: string | undefined;
  try {
    fixturePath = await createEicarFixture(repoRoot);
    const response = await scanFileWithClamd(fixturePath, host, port);
    const eicarRejected = eicarWasRejectedByClamd(response);
    await writeGateArtifacts(repoRoot, {
      ...previous,
      clamdReachable: true,
      eicarRejected,
      realClientDataAllowed: false,
      operatorActionRequired: eicarRejected ? previous.operatorActionRequired.filter((a) => a.component !== CLAMAV_ACTION.component) : [CLAMAV_ACTION],
      status: eicarRejected ? "blocked" : "fail",
      evidence: {
        ...previous.evidence,
        dockerDaemonReachable: dockerReachable,
        clamavHost: host,
        clamavPort: port,
        clamdResponse: response
      }
    });
    console.log(eicarRejected ? "PASS: clamd avviste EICAR runtime-fixturen." : `FAIL: clamd avviste ikke EICAR (${response}).`);
    if (!eicarRejected) process.exitCode = 1;
  } finally {
    if (fixturePath) await removeEicarFixture(fixturePath);
  }
}

main().catch((error) => {
  console.error(`FAIL: ClamAV runtime-test feilet kontrollert: ${(error as Error).message}`);
  process.exitCode = 1;
});
