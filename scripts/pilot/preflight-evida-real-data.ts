import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createEicarFixture, removeEicarFixture } from "./create-eicar-fixture.js";

const execFileAsync = promisify(execFile);
const TENANT_HEADER = "X-Evida-Tenant-ID";
const TERMINAL_INGESTION = new Set(["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"]);

export type CheckStatus = "pass" | "blocked" | "manual_required" | "skipped" | "error";

export interface GateCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  whyImportant: string;
  suggestedAction?: string;
  requiresInstall?: boolean;
  requiresManualApproval?: boolean;
  evidence?: Record<string, unknown>;
}

export interface OperatorAction {
  component: string;
  status: string;
  why_important: string;
  real_client_data_allowed: false;
  suggested_action: string;
  requires_download_or_install: boolean;
  requires_manual_approval: boolean;
}

export interface PreflightResult {
  generated_at: string;
  gate: "EVIDA-REAL-CLIENT-DATA-GATE";
  status: "pass" | "blocked" | "error";
  exit_code: 0 | 1 | 2 | 3;
  real_client_data_allowed: false;
  environment: Record<string, string>;
  checks: GateCheck[];
  operator_actions: OperatorAction[];
  fixture_upload: Record<string, unknown>;
  reason: string;
}

export interface CheckDefinition {
  name: string;
  whyImportant: string;
  suggestedAction: string;
  requiresInstall?: boolean;
  requiresManualApproval?: boolean;
  run: () => Promise<Omit<GateCheck, "name" | "whyImportant">>;
}

export async function runCheckDefinitions(definitions: CheckDefinition[]): Promise<GateCheck[]> {
  return Promise.all(definitions.map(async (definition) => {
    try {
      return {
        name: definition.name,
        whyImportant: definition.whyImportant,
        suggestedAction: definition.suggestedAction,
        requiresInstall: definition.requiresInstall ?? false,
        requiresManualApproval: definition.requiresManualApproval ?? false,
        ...(await definition.run())
      };
    } catch (error) {
      return {
        name: definition.name,
        status: "error",
        detail: `Kontrollen feilet kontrollert: ${safeError(error)}`,
        whyImportant: definition.whyImportant,
        suggestedAction: definition.suggestedAction,
        requiresInstall: definition.requiresInstall ?? false,
        requiresManualApproval: definition.requiresManualApproval ?? false
      };
    }
  }));
}

export function operatorActionsFor(checks: GateCheck[]): OperatorAction[] {
  return checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      component: check.name,
      status: check.status === "manual_required" ? "krever godkjenning" : check.status === "error" ? "mangler" : "kjører ikke",
      why_important: check.whyImportant,
      real_client_data_allowed: false,
      suggested_action: check.suggestedAction ?? "Undersøk kontrollen og dokumenter verifiserbart resultat.",
      requires_download_or_install: Boolean(check.requiresInstall),
      requires_manual_approval: Boolean(check.requiresManualApproval)
    }));
}

export function formatOperatorActions(actions: OperatorAction[]): string {
  return actions.map((action) => [
    "====================================================",
    "🚨 HANDLING KREVES AV KNUT",
    "====================================================",
    `Komponent: ${action.component}`,
    `Status: ${action.status}`,
    `Hvorfor viktig: ${action.why_important}`,
    "Ekte data tillatt: NEI",
    "Foreslått handling:",
    action.suggested_action,
    `Krever nedlasting/installasjon: ${action.requires_download_or_install ? "JA" : "NEI"}`,
    `Krever manuell godkjenning: ${action.requires_manual_approval ? "JA" : "NEI"}`,
    "===================================================="
  ].join("\n")).join("\n\n");
}

export function determineExitCode(checks: GateCheck[], realDataApproved = false): 0 | 1 | 2 | 3 {
  if (checks.some((check) => check.status === "error")) return 1;
  if (checks.some((check) => check.status !== "pass")) return 2;
  return realDataApproved ? 0 : 3;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ") : "ukjent feil";
}

async function exists(target: string): Promise<boolean> {
  return access(target, constants.F_OK).then(() => true).catch(() => false);
}

async function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function httpOk(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status?: number; detail: string }> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    return { ok: response.ok, status: response.status, detail: `${response.status} ${response.statusText}`.trim() };
  } catch (error) {
    return { ok: false, detail: safeError(error) };
  }
}

async function readJson(target: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse((await readFile(target, "utf8")).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function clamdEicarProbe(repoRoot: string, host: string, port: number): Promise<{ cleanlyDetected: boolean; detail: string }> {
  let fixture = "";
  try {
    fixture = await createEicarFixture(repoRoot);
    const bytes = await readFile(fixture);
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      socket.setTimeout(5000);
      socket.once("connect", () => {
        socket.write("zINSTREAM\0");
        const size = Buffer.alloc(4);
        size.writeUInt32BE(bytes.length);
        socket.write(size);
        socket.write(bytes);
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      socket.once("timeout", () => reject(new Error("ClamAV runtime probe timed out")));
      socket.once("error", reject);
    });
    return { cleanlyDetected: response.includes("FOUND"), detail: response.replace(/\0/g, "").trim() };
  } catch (error) {
    return { cleanlyDetected: false, detail: safeError(error) };
  } finally {
    if (fixture) await removeEicarFixture(fixture);
  }
}

function configFrom(repoRoot: string): Record<string, string> {
  const localPath = path.join(repoRoot, ".env.local");
  const examplePath = path.join(repoRoot, ".env.example");
  const selected = existsSync(localPath) ? localPath : examplePath;
  const parsed = dotenv.config({ path: selected, override: false }).parsed ?? {};
  return { ...parsed, ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")) };
}

function gateCheck(
  name: string,
  whyImportant: string,
  suggestedAction: string,
  run: CheckDefinition["run"],
  flags: Pick<CheckDefinition, "requiresInstall" | "requiresManualApproval"> = {}
): CheckDefinition {
  return { name, whyImportant, suggestedAction, run, ...flags };
}

export function assertFixtureUploadAllowed(repoRoot: string, fixturePath: string, environment: string): string {
  if (!new Set(["local-dev", "test", "development"]).has(environment.toLowerCase())) {
    throw new Error("Fixture upload er deaktivert utenfor local-dev/test.");
  }
  const allowRoot = path.resolve(repoRoot, "test-fixtures", "uploads");
  const resolved = path.resolve(fixturePath);
  const relative = path.relative(allowRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !new Set([".pdf", ".txt"]).has(path.extname(resolved).toLowerCase())) {
    throw new Error("Fixture upload kan bare lese allowlistede PDF/TXT-filer fra test-fixtures/uploads.");
  }
  return resolved;
}

async function ensureCase(backendUrl: string, tenantId: string, title: string): Promise<string> {
  const headers = { [TENANT_HEADER]: tenantId, "Content-Type": "application/json" };
  const listed = await fetch(`${backendUrl}/api/v1/cases`, { headers });
  if (!listed.ok) throw new Error(`Kunne ikke liste saker (${listed.status})`);
  const cases = await listed.json() as Array<{ id: string; title: string }>;
  const existing = cases.find((item) => item.title === title);
  if (existing) return existing.id;
  const created = await fetch(`${backendUrl}/api/v1/cases`, { method: "POST", headers, body: JSON.stringify({ title }) });
  if (!created.ok) throw new Error(`Kunne ikke opprette syntetisk sak (${created.status})`);
  return ((await created.json()) as { id: string }).id;
}

async function runFixtureUpload(repoRoot: string, env: Record<string, string>): Promise<Record<string, unknown>> {
  const environment = env.EVIDA_ENVIRONMENT ?? "local-dev";
  const fixture = assertFixtureUploadAllowed(repoRoot, path.join(repoRoot, "test-fixtures", "uploads", "safe-test-document.txt"), environment);
  const backendUrl = env.EVIDA_BACKEND_URL;
  const tenantId = env.EVIDA_DEV_TENANT_ID;
  const primaryCaseId = await ensureCase(backendUrl, tenantId, "EVIDA preflight synthetic upload");
  const isolationCaseId = await ensureCase(backendUrl, tenantId, "EVIDA preflight isolation control");
  const form = new FormData();
  const fixturePayload = Buffer.concat([
    await readFile(fixture),
    Buffer.from(`\nEVIDA_SYNTHETIC_PREFLIGHT_RUN=${new Date().toISOString()}\n`, "utf8")
  ]);
  form.append("file", new Blob([fixturePayload], { type: "text/plain" }), path.basename(fixture));
  const upload = await fetch(`${backendUrl}/api/documents/upload`, {
    method: "POST",
    headers: { [TENANT_HEADER]: tenantId, "X-Evida-Case-ID": primaryCaseId },
    body: form
  });
  if (!upload.ok) throw new Error(`Fixture upload avvist (${upload.status})`);
  const document = await upload.json() as { id: string; status: string };
  const list = async (caseId: string) => {
    const response = await fetch(`${backendUrl}/api/documents?caseId=${encodeURIComponent(caseId)}`, { headers: { [TENANT_HEADER]: tenantId } });
    if (!response.ok) throw new Error(`Dokumentliste feilet (${response.status})`);
    return await response.json() as Array<{ id: string; status: string }>;
  };
  const primaryDocs = await list(primaryCaseId);
  const isolationDocs = await list(isolationCaseId);
  const inCorrectCase = primaryDocs.some((item) => item.id === document.id);
  const absentFromOtherCase = !isolationDocs.some((item) => item.id === document.id);
  if (!inCorrectCase || !absentFromOtherCase) throw new Error("Case-isolasjon feilet for fixture-dokumentet.");
  const approval = await fetch(`${backendUrl}/api/documents/${document.id}/approve`, { method: "POST", headers: { [TENANT_HEADER]: tenantId } });
  if (!approval.ok) throw new Error(`Ingestion kunne ikke startes (${approval.status})`);
  let job = await approval.json() as { id: string; status: string };
  const deadline = Date.now() + 45_000;
  while (!TERMINAL_INGESTION.has(job.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await fetch(`${backendUrl}/api/ingestion-jobs/${job.id}`, { headers: { [TENANT_HEADER]: tenantId } });
    if (!response.ok) throw new Error(`Ingestion-status feilet (${response.status})`);
    job = await response.json() as typeof job;
  }
  return {
    status: TERMINAL_INGESTION.has(job.status) && job.status !== "FAILED" ? "pass" : "blocked",
    fixture: path.relative(repoRoot, fixture),
    primary_case_id: primaryCaseId,
    isolation_case_id: isolationCaseId,
    document_id: document.id,
    in_correct_case: inCorrectCase,
    absent_from_other_case: absentFromOtherCase,
    ingestion_job_id: job.id,
    ingestion_status: job.status,
    pipeline_bypassed: false
  };
}

export async function runPreflight(options: { repoRoot?: string; env?: Record<string, string>; runFixture?: boolean } = {}): Promise<PreflightResult> {
  const repoRoot = options.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const env = options.env ?? configFrom(repoRoot);
  const backendUrl = requiredConfig(env, "EVIDA_BACKEND_URL");
  const frontendUrl = requiredConfig(env, "EVIDA_FRONTEND_URL");
  const postgresHost = env.EVIDA_POSTGRES_HOST ?? "127.0.0.1";
  const postgresPort = Number(env.EVIDA_POSTGRES_PORT ?? "5432");
  const clamHost = env.EVIDA_CLAMAV_HOST ?? "127.0.0.1";
  const clamPort = Number(env.EVIDA_CLAMAV_PORT ?? "3310");
  const tesseract = env.EVIDA_TESSERACT_PATH ?? "";
  const tessdata = env.EVIDA_TESSDATA_PATH ?? "";
  const tenantId = env.EVIDA_DEV_TENANT_ID ?? "00000000-0000-0000-0000-000000000101";

  const definitions: CheckDefinition[] = [
    gateCheck("Docker daemon", "Lokale avhengigheter og reproduserbar pilotdrift krever en tilgjengelig Docker daemon.", "Start Docker Desktop og kjør `docker info`.", async () => {
      try { await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 5000 }); return { status: "pass", detail: "Docker daemon svarer." }; }
      catch (error) { return { status: "blocked", detail: safeError(error) }; }
    }, { requiresInstall: true }),
    gateCheck("Postgres", "Saks-, dokument- og auditdata må ha tilgjengelig database.", `Start Postgres på ${postgresHost}:${postgresPort}.`, async () => ({ status: await tcpProbe(postgresHost, postgresPort) ? "pass" : "blocked", detail: `${postgresHost}:${postgresPort}` })),
    gateCheck("Backend", "Alle sikkerhets- og tenantgrenser håndheves av backend.", `Start saksrom-api og kontroller ${backendUrl}/actuator/health.`, async () => { const probe = await httpOk(`${backendUrl}/actuator/health`); return { status: probe.ok ? "pass" : "blocked", detail: probe.detail }; }),
    gateCheck("Frontend", "Piloten må kunne åpnes på forventet lokal adresse.", `Start webappen og kontroller ${frontendUrl}.`, async () => { const probe = await httpOk(frontendUrl); return { status: probe.ok ? "pass" : "blocked", detail: probe.detail }; }),
    gateCheck("API proxy via frontend", "Frontend og preflight må treffe samme backend uten skjult portdrift.", `Sett VITE_EVIDA_API_TARGET=${backendUrl} og restart Vite.`, async () => { const probe = await httpOk(`${frontendUrl}/api/v1/cases`, { [TENANT_HEADER]: tenantId }); return { status: probe.ok ? "pass" : "blocked", detail: probe.detail, evidence: { expected_target: backendUrl } }; }),
    gateCheck("ClamAV/clamd", "Dokumentinntak er P0 og må malware-skannes fail-closed.", `Installer/start ClamAV og eksponer clamd på ${clamHost}:${clamPort}.`, async () => ({ status: await tcpProbe(clamHost, clamPort) ? "pass" : "blocked", detail: `${clamHost}:${clamPort}` }), { requiresInstall: true }),
    gateCheck("EICAR runtime test", "Scannerens prosess må bevise at kjent malware-signatur stoppes i runtime.", "Start clamd, oppdater signaturer og kjør `npm run pilot:preflight` på nytt.", async () => {
      if (!(await tcpProbe(clamHost, clamPort))) return { status: "skipped", detail: "ClamAV er ikke tilgjengelig; EICAR ble ikke generert." };
      const probe = await clamdEicarProbe(repoRoot, clamHost, clamPort);
      return { status: probe.cleanlyDetected ? "pass" : "blocked", detail: probe.detail };
    }),
    gateCheck("Tesseract executable", "Skannede dokumenter kan ikke bli kildeklare uten verifisert OCR-runtime.", `Installer Tesseract eller korriger EVIDA_TESSERACT_PATH (${tesseract}).`, async () => ({ status: tesseract && await exists(tesseract) ? "pass" : "blocked", detail: tesseract || "EVIDA_TESSERACT_PATH mangler" }), { requiresInstall: true }),
    gateCheck("EVIDA_TESSDATA_PATH", "OCR må bruke eksplisitt, kontrollerbart språkdatagrunnlag.", `Sett EVIDA_TESSDATA_PATH til gyldig tessdata-mappe (${tessdata}).`, async () => ({ status: tessdata && await exists(tessdata) ? "pass" : "blocked", detail: tessdata || "mangler" })),
    gateCheck("nor.traineddata", "Norsk juridisk tekst krever norsk OCR-modell.", "Last ned nor.traineddata til EVIDA_TESSDATA_PATH.", async () => ({ status: tessdata && await exists(path.join(tessdata, "nor.traineddata")) ? "pass" : "blocked", detail: path.join(tessdata, "nor.traineddata") }), { requiresInstall: true }),
    gateCheck("eng.traineddata", "Engelske bilag må kunne OCR-behandles kontrollert.", "Last ned eng.traineddata til EVIDA_TESSDATA_PATH.", async () => ({ status: tessdata && await exists(path.join(tessdata, "eng.traineddata")) ? "pass" : "blocked", detail: path.join(tessdata, "eng.traineddata") }), { requiresInstall: true }),
    gateCheck("OCR runtime probe", "Filtilstedeværelse alene beviser ikke at OCR-prosessen kan starte med riktige språkdata.", "Rett Tesseract/tessdata-konfigurasjonen og kjør preflight på nytt.", async () => {
      if (!tesseract || !(await exists(tesseract)) || !tessdata) return { status: "skipped", detail: "OCR-forutsetninger mangler." };
      try { const { stdout, stderr } = await execFileAsync(tesseract, ["--version"], { env: { ...process.env, TESSDATA_PREFIX: tessdata }, timeout: 5000 }); return { status: "pass", detail: (stdout || stderr).split(/\r?\n/)[0] }; }
      catch (error) { return { status: "blocked", detail: safeError(error) }; }
    }),
    artifactDefinition("Native file picker signoff", path.join(repoRoot, "artifacts", "first-user", "native_file_picker_upload_signoff.json"), ["pass", "approved"], "Native Windows-picker må godkjennes manuelt på pilotmaskinen.", "Kjør native picker-smoke og oppdater signoff-artifakten med tester og evidens.", true),
    fileDefinition("Backup script", [path.join(repoRoot, "scripts", "pilot", "backup-evida-pilot.ps1"), path.join(repoRoot, "ops", "backup-evida.ps1")], "Restaurerbar backup er P0 før ekte klientdata.", "Implementer og dokumenter et eksplisitt backup-script."),
    fileDefinition("Restore script", [path.join(repoRoot, "scripts", "pilot", "restore-evida-pilot.ps1"), path.join(repoRoot, "ops", "restore-evida.ps1")], "Backup uten testbar restore gir ingen gjenopprettingsgaranti.", "Implementer restore-script og kjør syntetisk restore-drill."),
    artifactDefinition("Backup/restore drill", path.join(repoRoot, "artifacts", "first-user", "backup_restore_result.json"), ["pass"], "Backup må være kryptert og faktisk restaurerbar uten å overskrive live-data.", "Kjør scripts/pilot/test-backup-restore-drill.ps1 og rett alle feil."),
    artifactDefinition("Client-data storage encryption", path.join(repoRoot, "artifacts", "first-user", "encryption_verification.json"), ["pass", "approved"], "Rå saksdokumenter og kildeutdrag må være beskyttet ved lagring.", "Verifiser BitLocker på målmaskinen eller implementer applikasjonskryptering med forvaltet nøkkel."),
    artifactDefinition("Raw-storage marker inspection", path.join(repoRoot, "artifacts", "first-user", "raw_storage_inspection.json"), ["pass"], "Syntetiske klientmarkører skal ikke kunne leses direkte fra lagringsmediet.", "Kjør markerbasert rålagringsinspeksjon etter at lagringskryptering er verifisert."),
    artifactDefinition("Deletion/retention dry-run", path.join(repoRoot, "artifacts", "first-user", "deletion_retention_result.json"), ["pass", "available"], "Sletting og retention må være dokumentert og reversibelt verifisert.", "Kjør deletion/retention dry-run og oppdater artifakten."),
    artifactDefinition("Sensitive log scan", path.join(repoRoot, "artifacts", "first-user", "runtime_sensitive_log_scan.json"), ["pass"], "Rå klienttekst eller testmarkører må ikke lekke til logger.", "Kjør scripts/pilot/scan-evida-runtime-logs.ps1 og håndter alle funn."),
    artifactDefinition("Source-bound multi-document evaluation", path.join(repoRoot, "artifacts", "first-user", "ai_multi_doc_eval.json"), ["pass"], "AI-svar må være kildebundet og håndtere flere dokumenter og motstridende fakta.", "Kjør runtime-evalueringen for flere dokumenter, konflikter og kildehenvisninger."),
    artifactDefinition("Prompt-injection evaluation", path.join(repoRoot, "artifacts", "first-user", "prompt_injection_eval.json"), ["pass"], "Instruksjoner inne i dokumenter må aldri kunne overstyre system- eller kildepolicy.", "Kjør prompt-injection-evalueringen mot aktiv provider-rute."),
    artifactDefinition("Unsupported-claim evaluation", path.join(repoRoot, "artifacts", "first-user", "unsupported_claim_eval.json"), ["pass"], "Svar uten kildebelegg skal avvises eller merkes tydelig.", "Kjør unsupported-claim-evalueringen og verifiser tomme kildehenvisninger."),
    artifactDefinition("Audit coverage", path.join(repoRoot, "artifacts", "first-user", "audit_coverage_result.json"), ["pass"], "Import, AI, eksport, sletting og policyendring må ha etterprøvbar auditkjede.", "Lukk manglende audit-events og verifiser hashkjeden i runtime."),
    artifactDefinition("Export smoke", path.join(repoRoot, "artifacts", "first-user", "export_smoke_result.json"), ["pass"], "Eksport må være kildebasert, merket som utkast og auditert.", "Kjør kildebasert eksport-smoke på releasebygget."),
    artifactDefinition("Signed Windows deliverable", path.join(repoRoot, "artifacts", "first-user", "signature_verification.json"), ["pass", "approved"], "Distribusjonsartefakten må være signert med organisasjonens betrodde sertifikat.", "Bygg og signer godkjent Windows-pakke i forvaltet release-miljø."),
    artifactDefinition("Managed workstation smoke", path.join(repoRoot, "artifacts", "first-user", "windows_managed_workstation_smoke.json"), ["pass", "approved"], "Målmaskinens policy, installasjon, oppstart og dokumentflyt må verifiseres.", "Kjør smoke på Braathe/Jussys-forvaltet Windows-maskin.", true),
    artifactDefinition("Engineering approval", path.join(repoRoot, "artifacts", "first-user", "engineering_approval.json"), ["pass", "approved"], "Engineering må eksplisitt godkjenne den eksakte releasekandidaten.", "Innhent signert engineering-godkjenning.", true),
    artifactDefinition("Product approval", path.join(repoRoot, "artifacts", "first-user", "product_approval.json"), ["pass", "approved"], "Produkteier må eksplisitt godkjenne førstebrukeromfanget.", "Innhent signert produktgodkjenning.", true),
    artifactDefinition("Security/privacy approval", path.join(repoRoot, "artifacts", "first-user", "security_privacy_approval.json"), ["pass", "approved"], "Sikkerhet/personvern må godkjenne behandling av ekte klientdata.", "Innhent signert sikkerhets- og personverngodkjenning.", true),
    artifactDefinition("Braathe/Jussys approval", path.join(repoRoot, "artifacts", "first-user", "braathe_approval.json"), ["pass", "approved"], "Driftsmiljøet må godkjennes av ansvarlig IT-part.", "Innhent signert Braathe/Jussys-godkjenning.", true),
    artifactDefinition("Client/data-owner approval", path.join(repoRoot, "artifacts", "first-user", "client_data_pilot_approval.json"), ["pass", "approved"], "Dataeier må godkjenne bruk av ekte saksdokumenter.", "Innhent signert dataeiergodkjenning.", true),
    fileDefinition("Release gate artifacts", [path.join(repoRoot, "artifacts", "first-user", "status_bundle.first_user.final.json"), path.join(repoRoot, "MORTEN_PILOT_RELEASE_GATE.md")], "Beslutningen må bygge på synlig og sporbar release-evidens.", "Generer manglende status bundle og Morten-gate-evidens."),
  ];

  const checks = await runCheckDefinitions(definitions);
  let fixtureUpload: Record<string, unknown> = { status: "not_run", reason: "Sett EVIDA_RUN_FIXTURE_UPLOAD=true eller kjør pilot:real-data-gate." };
  if (options.runFixture || env.EVIDA_RUN_FIXTURE_UPLOAD === "true") {
    const clamOk = checks.find((check) => check.name === "ClamAV/clamd")?.status === "pass";
    if (!clamOk) fixtureUpload = { status: "blocked", reason: "ClamAV må være tilgjengelig; upload-smoke får ikke bypass sikkerhet." };
    else {
      try { fixtureUpload = await runFixtureUpload(repoRoot, { ...env, EVIDA_BACKEND_URL: backendUrl, EVIDA_DEV_TENANT_ID: tenantId }); }
      catch (error) { fixtureUpload = { status: "blocked", reason: safeError(error) }; }
    }
    checks.push({
      name: "Dev fixture upload",
      status: fixtureUpload.status === "pass" ? "pass" : "blocked",
      detail: String(fixtureUpload.reason ?? fixtureUpload.ingestion_status ?? fixtureUpload.status),
      whyImportant: "Den ekte upload-pipelinen og case-isolasjon må kunne testes uten native picker.",
      suggestedAction: "Start alle lokale sikkerhetsavhengigheter og kjør `npm run pilot:real-data-gate`.",
      evidence: fixtureUpload
    });
  }

  const actions = operatorActionsFor(checks);
  const exitCode = determineExitCode(checks, false);
  const result: PreflightResult = {
    generated_at: new Date().toISOString(),
    gate: "EVIDA-REAL-CLIENT-DATA-GATE",
    status: exitCode === 1 ? "error" : exitCode === 0 ? "pass" : "blocked",
    exit_code: exitCode,
    real_client_data_allowed: false,
    environment: {
      EVIDA_BACKEND_URL: backendUrl,
      EVIDA_FRONTEND_URL: frontendUrl,
      EVIDA_POSTGRES_HOST: postgresHost,
      EVIDA_POSTGRES_PORT: String(postgresPort),
      EVIDA_CLAMAV_HOST: clamHost,
      EVIDA_CLAMAV_PORT: String(clamPort),
      EVIDA_TESSERACT_PATH: tesseract,
      EVIDA_TESSDATA_PATH: tessdata,
      VITE_EVIDA_API_TARGET: env.VITE_EVIDA_API_TARGET ?? ""
    },
    checks,
    operator_actions: actions,
    fixture_upload: fixtureUpload,
    reason: actions.length > 0 ? `${actions.length} eksplisitte operatorhandlinger gjenstår.` : "Alle automatiske kontroller er grønne, men eksplisitt real-data-godkjenning er fortsatt påkrevd."
  };
  await writeArtifacts(repoRoot, result);
  return result;
}

function requiredConfig(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} mangler i .env.local/.env.example.`);
  return value.replace(/\/$/, "");
}

function artifactDefinition(name: string, target: string, accepted: string[], whyImportant: string, action: string, manual = false): CheckDefinition {
  return gateCheck(name, whyImportant, action, async () => {
    const json = await readJson(target);
    const status = String(json?.status ?? "missing").toLowerCase();
    return { status: accepted.includes(status) ? "pass" : manual ? "manual_required" : "blocked", detail: `${target}: ${status}`, evidence: json ?? undefined };
  }, { requiresManualApproval: manual });
}

function fileDefinition(name: string, candidates: string[], whyImportant: string, action: string): CheckDefinition {
  return gateCheck(name, whyImportant, action, async () => {
    const found = (await Promise.all(candidates.map(async (candidate) => await exists(candidate) ? candidate : null))).find(Boolean);
    return { status: found ? "pass" : "blocked", detail: found ?? `Mangler: ${candidates.join(" eller ")}` };
  });
}

async function writeArtifacts(repoRoot: string, result: PreflightResult): Promise<void> {
  const artifactDir = path.join(repoRoot, "artifacts", "first-user");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, "real_client_data_gate_latest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "operator_actions_required.json"), `${JSON.stringify({ generated_at: result.generated_at, real_client_data_allowed: false, actions: result.operator_actions }, null, 2)}\n`, "utf8");
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  runPreflight()
    .then((result) => {
      if (result.operator_actions.length) console.log(formatOperatorActions(result.operator_actions));
      else console.log("Alle automatiske preflight-kontroller er grønne. Ekte klientdata krever fortsatt eksplisitt godkjenning.");
      console.log(`\nGate artifact: artifacts/first-user/real_client_data_gate_latest.json`);
      process.exitCode = result.exit_code;
    })
    .catch((error) => {
      console.error(`Preflight script-feil: ${safeError(error)}`);
      process.exitCode = 1;
    });
}
