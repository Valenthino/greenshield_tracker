import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env.local")) {
  console.error(
    ".env.local already exists. It was not changed. Back it up and follow README to rotate the password.",
  );
  process.exit(1);
}
const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
writeFileSync(
  ".env.local",
  `# Keep private. Never commit this file.\nCRM_PASSWORD_HASH=${salt}:${hash}\nCRM_DATABASE_PATH=data/crm.json\nCRM_COOKIE_SECURE=false\n`,
  { mode: 0o600 },
);
if (process.argv.includes("--json"))
  console.log(JSON.stringify({ password, configured: true }));
else
  console.log(
    `Workspace authentication configured.\n\nYour generated password (save it now):\n${password}\n\nStart with npm run dev. Keep the app on localhost. Before network use, add HTTPS, secure cookies and review deployment security.\nNo plaintext password was written to disk.`,
  );
