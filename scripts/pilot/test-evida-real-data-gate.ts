import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatOperatorActions, runPreflight } from "./preflight-evida-real-data.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

runPreflight({ repoRoot, runFixture: true })
  .then((result) => {
    if (result.operator_actions.length) console.log(formatOperatorActions(result.operator_actions));
    console.log(`Real-client-data gate: ${result.status.toUpperCase()}`);
    console.log("Ekte data tillatt: NEI");
    process.exitCode = result.exit_code;
  })
  .catch((error) => {
    console.error(`Gate-runner script-feil: ${(error as Error).message}`);
    process.exitCode = 1;
  });
