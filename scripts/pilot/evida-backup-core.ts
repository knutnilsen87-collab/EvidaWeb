import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { once } from "node:events";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  type ReadStream,
} from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const MAGIC = Buffer.from("EVIDABK1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const PASSPHRASE_ENV = "EVIDA_BACKUP_PASSPHRASE";

export type BackupManifestEntry = {
  path: string;
  size: number;
  sha256: string;
};

export type BackupManifest = {
  schema: "evida-backup-manifest-v1";
  created_at: string;
  database: string;
  files: BackupManifestEntry[];
};

type BackupOptions = {
  repoRoot: string;
  output: string;
  container: string;
  database: string;
  runtimeRoot?: string;
};

type RestoreOptions = {
  repoRoot: string;
  input: string;
  container: string;
  targetDatabase: string;
  restoreRoot: string;
  drillOnly: boolean;
  keepDrillDatabase: boolean;
  runtimeRoot?: string;
};

function requirePassphrase(): string {
  const passphrase = process.env[PASSPHRASE_ENV] ?? "";
  if (passphrase.length < 16) {
    throw new Error(`${PASSPHRASE_ENV} must contain at least 16 characters.`);
  }
  return passphrase;
}

function assertSafeDatabaseName(database: string, drillOnly: boolean): void {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(database)) {
    throw new Error(`Unsafe PostgreSQL database name: ${database}`);
  }
  if (drillOnly && !database.startsWith("evida_restore_drill_")) {
    throw new Error("Drill databases must use the evida_restore_drill_ prefix.");
  }
}

function assertUnder(parent: string, candidate: string): string {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes controlled root: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

async function command(
  executable: string,
  args: string[],
  options: { cwd?: string; stdin?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(executable, args, {
    cwd: options.cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  if (options.stdin !== undefined) child.stdin.end(options.stdin);
  else child.stdin.end();
  const [code] = await once(child, "close") as [number];
  if (code !== 0) {
    throw new Error(`${executable} ${args[0] ?? ""} failed (${code}): ${stderr.trim() || stdout.trim()}`);
  }
  return { stdout, stderr };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = assertUnder(root, path.join(current, entry.name));
      if (entry.isSymbolicLink()) throw new Error(`Backup refuses symbolic link: ${full}`);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  await visit(root);
  return result.sort();
}

async function buildManifest(staging: string, database: string): Promise<BackupManifest> {
  const files = (await listFiles(staging)).filter((file) => path.basename(file) !== "manifest.json");
  const entries: BackupManifestEntry[] = [];
  for (const file of files) {
    const fileStat = await stat(file);
    entries.push({
      path: path.relative(staging, file).split(path.sep).join("/"),
      size: fileStat.size,
      sha256: await sha256File(file),
    });
  }
  return {
    schema: "evida-backup-manifest-v1",
    created_at: new Date().toISOString(),
    database,
    files: entries,
  };
}

async function verifyManifest(staging: string): Promise<BackupManifest> {
  const manifestPath = assertUnder(staging, path.join(staging, "manifest.json"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
  if (manifest.schema !== "evida-backup-manifest-v1" || !Array.isArray(manifest.files)) {
    throw new Error("Unsupported or invalid backup manifest.");
  }
  const declared = new Set(manifest.files.map((entry) => entry.path));
  const actual = (await listFiles(staging))
    .map((file) => path.relative(staging, file).split(path.sep).join("/"))
    .filter((entry) => entry !== "manifest.json");
  for (const actualPath of actual) {
    if (!declared.has(actualPath)) throw new Error(`Undeclared file in backup: ${actualPath}`);
  }
  for (const entry of manifest.files) {
    const filePath = assertUnder(staging, path.join(staging, ...entry.path.split("/")));
    const fileStat = await stat(filePath);
    if (fileStat.size !== entry.size) throw new Error(`Backup size mismatch: ${entry.path}`);
    if (await sha256File(filePath) !== entry.sha256) throw new Error(`Backup hash mismatch: ${entry.path}`);
  }
  return manifest;
}

async function waitForChild(child: ReturnType<typeof spawn>, label: string): Promise<void> {
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "close") as [number];
  if (code !== 0) throw new Error(`${label} failed (${code}): ${stderr.trim()}`);
}

async function encryptTar(staging: string, output: string, passphrase: string): Promise<void> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const outputPath = path.resolve(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const writer = createWriteStream(outputPath, { flags: "wx" });
  writer.write(Buffer.concat([MAGIC, salt, iv]));
  const tar = spawn("tar.exe", ["-cf", "-", "-C", staging, "."], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarDone = waitForChild(tar, "tar archive");
  await pipeline(tar.stdout, cipher, writer, { end: false });
  await tarDone;
  writer.end(cipher.getAuthTag());
  await once(writer, "close");
}

async function readHeader(input: string): Promise<{ salt: Buffer; iv: Buffer; tag: Buffer; size: number }> {
  const fileStat = await stat(input);
  if (fileStat.size <= HEADER_BYTES + TAG_BYTES) throw new Error("Backup file is truncated.");
  const handle = await open(input, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an EVIDA encrypted backup.");
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, fileStat.size - TAG_BYTES);
    return {
      salt: header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES),
      iv: header.subarray(MAGIC.length + SALT_BYTES),
      tag,
      size: fileStat.size,
    };
  } finally {
    await handle.close();
  }
}

async function decryptTar(input: string, staging: string, passphrase: string): Promise<void> {
  const header = await readHeader(input);
  const key = scryptSync(passphrase, header.salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, header.iv);
  decipher.setAuthTag(header.tag);
  const source: ReadStream = createReadStream(input, {
    start: HEADER_BYTES,
    end: header.size - TAG_BYTES - 1,
  });
  const tar = spawn("tar.exe", ["-xf", "-", "-C", staging], {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
  });
  const tarDone = waitForChild(tar, "tar extraction");
  await pipeline(source, decipher, tar.stdin);
  await tarDone;
}

async function copyStorage(repoRoot: string, staging: string): Promise<void> {
  const dataRoot = path.join(repoRoot, "evida-core", "services", "saksrom-api", "data");
  const storageRoot = path.join(staging, "storage");
  await mkdir(storageRoot, { recursive: true });
  for (const name of ["quarantine", "uploads"]) {
    const source = path.join(dataRoot, name);
    if (existsSync(source)) await cp(source, path.join(storageRoot, name), { recursive: true, errorOnExist: true });
  }
}

export async function createEncryptedBackup(options: BackupOptions): Promise<Record<string, unknown>> {
  const passphrase = requirePassphrase();
  const repoRoot = path.resolve(options.repoRoot);
  const runtimeRoot = path.resolve(options.runtimeRoot ?? path.join(repoRoot, ".codex-runtime", "backup-work"));
  const output = path.resolve(options.output);
  if (existsSync(output)) throw new Error(`Refusing to overwrite existing backup: ${output}`);
  await mkdir(runtimeRoot, { recursive: true });
  const staging = await mkdtemp(path.join(runtimeRoot, "backup-"));
  try {
    const databaseDir = path.join(staging, "database");
    await mkdir(databaseDir, { recursive: true });
    const containerDump = `/tmp/evida-${randomBytes(8).toString("hex")}.dump`;
    try {
      await command("docker", [
        "exec", options.container, "pg_dump",
        "-U", "evida", "-d", options.database,
        "--format=custom", "--no-owner", "--no-acl",
        `--file=${containerDump}`,
      ]);
      await command("docker", ["cp", `${options.container}:${containerDump}`, path.join(databaseDir, "evida.dump")]);
    } finally {
      await command("docker", ["exec", options.container, "rm", "-f", containerDump]).catch(() => undefined);
    }
    await copyStorage(repoRoot, staging);
    const manifest = await buildManifest(staging, options.database);
    await writeFile(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await encryptTar(staging, output, passphrase);
    return {
      status: "pass",
      backup_path: output,
      backup_sha256: await sha256File(output),
      encrypted: true,
      encryption: "AES-256-GCM",
      manifest_entries: manifest.files.length,
      created_at: manifest.created_at,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function terminateDatabaseConnections(container: string, database: string): Promise<void> {
  const sql = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}' AND pid <> pg_backend_pid();`;
  await command("docker", ["exec", optionsSafe(container), "psql", "-U", "evida", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function optionsSafe(value: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value)) throw new Error(`Unsafe container name: ${value}`);
  return value;
}

async function recreateDatabase(container: string, database: string): Promise<void> {
  await terminateDatabaseConnections(container, database);
  await command("docker", ["exec", container, "dropdb", "-U", "evida", "--if-exists", database]);
  await command("docker", ["exec", container, "createdb", "-U", "evida", database]);
}

async function restoreDatabase(container: string, database: string, dumpPath: string): Promise<void> {
  const containerDump = `/tmp/evida-restore-${randomBytes(8).toString("hex")}.dump`;
  try {
    await command("docker", ["cp", dumpPath, `${container}:${containerDump}`]);
    await recreateDatabase(container, database);
    await command("docker", [
      "exec", container, "pg_restore",
      "-U", "evida", "-d", database,
      "--no-owner", "--no-acl", "--exit-on-error",
      containerDump,
    ]);
  } finally {
    await command("docker", ["exec", container, "rm", "-f", containerDump]).catch(() => undefined);
  }
}

async function restoreStorage(staging: string, restoreRoot: string): Promise<number> {
  const source = path.join(staging, "storage");
  await rm(restoreRoot, { recursive: true, force: true });
  await mkdir(restoreRoot, { recursive: true });
  if (existsSync(source)) await cp(source, restoreRoot, { recursive: true, errorOnExist: false });
  return (await listFiles(restoreRoot)).length;
}

export async function restoreEncryptedBackup(options: RestoreOptions): Promise<Record<string, unknown>> {
  const passphrase = requirePassphrase();
  assertSafeDatabaseName(options.targetDatabase, options.drillOnly);
  const repoRoot = path.resolve(options.repoRoot);
  const runtimeRoot = path.resolve(options.runtimeRoot ?? path.join(repoRoot, ".codex-runtime", "backup-work"));
  const input = path.resolve(options.input);
  await access(input);
  await mkdir(runtimeRoot, { recursive: true });
  const staging = await mkdtemp(path.join(runtimeRoot, "restore-"));
  let databaseCreated = false;
  try {
    await decryptTar(input, staging, passphrase);
    const manifest = await verifyManifest(staging);
    const dumpPath = path.join(staging, "database", "evida.dump");
    await restoreDatabase(options.container, options.targetDatabase, dumpPath);
    databaseCreated = true;
    const restoredStorageFiles = await restoreStorage(staging, path.resolve(options.restoreRoot));
    return {
      status: "pass",
      drill_only: options.drillOnly,
      target_database: options.targetDatabase,
      restore_root: path.resolve(options.restoreRoot),
      restored_storage_files: restoredStorageFiles,
      verified_manifest_entries: manifest.files.length,
      backup_sha256: await sha256File(input),
      restored_at: new Date().toISOString(),
    };
  } finally {
    if (options.drillOnly && databaseCreated && !options.keepDrillDatabase) {
      await terminateDatabaseConnections(options.container, options.targetDatabase).catch(() => undefined);
      await command("docker", ["exec", options.container, "dropdb", "-U", "evida", "--if-exists", options.targetDatabase]).catch(() => undefined);
    }
    await rm(staging, { recursive: true, force: true });
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const repoRoot = String(args["repo-root"] ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".."));
  const container = String(args.container ?? "evida-postgres");
  if (mode === "backup") {
    const output = String(args.output ?? "");
    if (!output) throw new Error("--output is required.");
    console.log(JSON.stringify(await createEncryptedBackup({
      repoRoot,
      output,
      container,
      database: String(args.database ?? "evida"),
    }), null, 2));
    return;
  }
  if (mode === "restore") {
    const input = String(args.input ?? "");
    const targetDatabase = String(args["target-database"] ?? "");
    const restoreRoot = String(args["restore-root"] ?? "");
    if (!input || !targetDatabase || !restoreRoot) {
      throw new Error("--input, --target-database and --restore-root are required.");
    }
    console.log(JSON.stringify(await restoreEncryptedBackup({
      repoRoot,
      input,
      container,
      targetDatabase,
      restoreRoot,
      drillOnly: args.drill === true,
      keepDrillDatabase: args["keep-drill-database"] === true,
    }), null, 2));
    return;
  }
  throw new Error("Usage: evida-backup-core.ts <backup|restore> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
