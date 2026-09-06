import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.example");
const exampleValues = parseEnv(readFileSync(envFile, "utf8"));
const env = { ...process.env, ...exampleValues };

function compose(args, timeout = 90_000) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name", "n64-toys-smoke",
      "--project-directory", root,
      "--env-file", envFile,
      "-f", resolve(root, "compose.yaml"),
      ...args,
    ],
    { cwd: root, env, stdio: "inherit", timeout },
  );
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `compose ${args.join(" ")} killed by ${result.signal}`);
  assert.equal(result.status, 0, `compose ${args.join(" ")} exited ${result.status}`);
}

async function checkResponse(path, status, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:3001${path}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, status, `${options.method ?? "GET"} ${path}`);
  assert.deepEqual(await response.json(), body);
}

let failure;
try {
  compose(["up", "--build", "-d", "--wait", "--wait-timeout", "120", "api"], 900_000);
  compose(["exec", "-T", "api", "node", "dist/db/verify.js"]);
  await checkResponse("/api/health", 200, { status: "ok" });
  await checkResponse("/api/auth/get-session", 200, null);
  await checkResponse(
    "/api/toys",
    403,
    { error: { code: "forbidden", message: "Forbidden" } },
    { method: "POST", headers: { Origin: "https://untrusted.invalid" }, body: "" },
  );
} catch (error) {
  failure = error;
  for (const args of [["ps", "--all"], ["logs", "--no-color", "--tail", "100"]]) {
    try {
      compose(args);
    } catch (diagnosticError) {
      console.error("Compose diagnostics failed:", diagnosticError);
    }
  }
  throw error;
} finally {
  try {
    compose(["down", "--timeout", "30"]);
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], "Compose smoke and teardown failed");
    throw error;
  }
}

console.log("Compose smoke passed.");
