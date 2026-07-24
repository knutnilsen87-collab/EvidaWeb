import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately assembled at runtime so no permanent EICAR sample is committed.
const EICAR_PARTS = [
  "X5O!P%@AP[4\\PZX54(P^)",
  "7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
];

export async function createEicarFixture(repoRoot: string): Promise<string> {
  const target = path.join(repoRoot, "artifacts", "first-user", "tmp", "eicar-test.txt");
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, EICAR_PARTS.join(""), { encoding: "ascii", flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }
  return target;
}

export async function removeEicarFixture(target: string): Promise<void> {
  await rm(target, { force: true }).catch(() => undefined);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  createEicarFixture(repoRoot)
    .then((target) => console.log(`EICAR runtime fixture opprettet: ${target}`))
    .catch((error) => {
      console.error(`EICAR-fixture kunne ikke opprettes: ${(error as Error).message}`);
      process.exitCode = 1;
    });
}
