import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEncryptedBackup, restoreEncryptedBackup } from "./evida-backup-core";

const created: string[] = [];

afterEach(async () => {
  delete process.env.EVIDA_BACKUP_PASSPHRASE;
  await Promise.all(created.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("EVIDA encrypted backup safety", () => {
  it("requires a strong passphrase before touching backup data", async () => {
    process.env.EVIDA_BACKUP_PASSPHRASE = "short";
    await expect(createEncryptedBackup({
      repoRoot: os.tmpdir(),
      output: path.join(os.tmpdir(), "must-not-exist.evidabk"),
      container: "not-used",
      database: "evida",
    })).rejects.toThrow("at least 16 characters");
  });

  it("rejects unsafe drill database names before decrypting", async () => {
    process.env.EVIDA_BACKUP_PASSPHRASE = "a-secure-test-passphrase";
    await expect(restoreEncryptedBackup({
      repoRoot: os.tmpdir(),
      input: path.join(os.tmpdir(), "missing.evidabk"),
      container: "not-used",
      targetDatabase: "evida",
      restoreRoot: path.join(os.tmpdir(), "restore"),
      drillOnly: true,
      keepDrillDatabase: false,
    })).rejects.toThrow("evida_restore_drill_");
  });

  it("does not accept an existing output path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "evida-backup-test-"));
    created.push(root);
    const data = path.join(root, "evida-core", "services", "saksrom-api", "data", "quarantine");
    await mkdir(data, { recursive: true });
    const output = path.join(root, "existing.evidabk");
    await writeFile(output, "do-not-overwrite");
    process.env.EVIDA_BACKUP_PASSPHRASE = "a-secure-test-passphrase";
    await expect(createEncryptedBackup({
      repoRoot: root,
      output,
      container: "not-used",
      database: "evida",
    })).rejects.toThrow("Refusing to overwrite");
    expect(await readFile(output, "utf8")).toBe("do-not-overwrite");
  });
});
