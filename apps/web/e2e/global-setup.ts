import { execSync } from "node:child_process";

/** In the compose stack every request reaches the API from the web container's address, so
 * per-IP rate limits are shared by all tests (and by earlier runs). Start from zero. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync(
    'docker compose -f ../../compose.yml exec -T db psql -U autopoint -d autopoint -q -c "DELETE FROM rate_limit_counters"',
    { stdio: "inherit" },
  );
}
