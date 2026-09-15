import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, request } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import { verifyAppHttp } from "./verify-app-http.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `saluni-qa-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const secret = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  SALUNI_QA_PASSWORD: password,
  SALUNI_QA_JWT_SECRET: secret,
  NEXT_TELEMETRY_DISABLED: "1",
};
const composeArgs = ["compose", "-p", project, "-f", "docker-compose.test.yml"];
let authProxy;

function run(command, args, extraEnv = {}, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...env, ...extraEnv },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let output = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
    }
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${command} exited with code ${code}${capture ? `: ${output}` : ""}`)),
    );
  });
}

function token(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, iss: "saluni-qa", exp: Math.floor(Date.now() / 1000) + 7200 }),
  ).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

try {
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    throw new Error(
      "Run npm run build before npm run test:database (HTTP checks use the production build).",
    );
  }
  console.log(`Starting disposable QA project ${project}. Existing salon stacks are not used.`);
  await run("docker", [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "120"]);
  const databaseAddress = await run(
    "docker",
    [...composeArgs, "port", "postgres", "5432"],
    {},
    true,
  );
  const authAddress = await run("docker", [...composeArgs, "port", "gotrue", "9999"], {}, true);
  if (!/^127\.0\.0\.1:\d+$/.test(databaseAddress) || !/^127\.0\.0\.1:\d+$/.test(authAddress))
    throw new Error("Expected isolated loopback test ports.");

  // Supabase clients use /auth/v1; GoTrue's standalone endpoints are rooted at /.
  authProxy = createServer((incoming, outgoing) => {
    const upstream = request(
      `http://${authAddress}${(incoming.url ?? "/").replace(/^\/auth\/v1/, "") || "/"}`,
      { method: incoming.method, headers: incoming.headers },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    authProxy.once("error", reject);
    authProxy.listen(0, "127.0.0.1", resolve);
  });
  const authUrl = `http://127.0.0.1:${authProxy.address().port}`;
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(`${authUrl}/auth/v1/health`)
      .then((response) => response.ok)
      .catch(() => false);
    if (ready) break;
    if (attempt >= 59) throw new Error("QA Auth did not become healthy.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const adminUrl = `postgresql://postgres:${password}@${databaseAddress}/saluni_qa`;
  const testEnv = {
    SALUNI_DISPOSABLE_TEST: "1",
    DATABASE_URL: `postgresql://app_runtime:${password}@${databaseAddress}/saluni_qa`,
    ADMIN_DATABASE_URL: adminUrl,
    DIRECT_URL: adminUrl,
    LOCAL_APP_RUNTIME_PASSWORD: password,
    AUTH_JWT_SECRET: secret,
    GOTRUE_JWT_SECRET: secret,
    SUPABASE_INTERNAL_URL: authUrl,
    SUPABASE_PUBLIC_URL: authUrl,
    NEXT_PUBLIC_SUPABASE_URL: authUrl,
    SUPABASE_ANON_KEY: token("anon"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: token("anon"),
    SUPABASE_SERVICE_ROLE_KEY: token("service_role"),
  };
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], testEnv);
  await run(process.execPath, ["scripts/local-stack/set-app-runtime-password.mjs"], testEnv);
  await run(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.database.config.ts"],
    testEnv,
  );
  await run(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.rls.config.ts"],
    testEnv,
  );
  await verifyAppHttp(testEnv, root);
  console.log("Disposable database and real Auth/RLS checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database QA failed.");
  process.exitCode = 1;
} finally {
  if (authProxy) await new Promise((resolve) => authProxy.close(resolve));
  // Only the random QA project is removed. Its database lives in container tmpfs.
  await run("docker", [...composeArgs, "down", "--remove-orphans"]).catch(() => {
    process.exitCode = 1;
  });
}
