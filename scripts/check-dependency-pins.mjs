import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const sections = ["dependencies", "devDependencies"];
const forbidden = /^(?:\^|~|>|<|=|\*|latest$|next$|beta$|alpha$|canary$|git\+|https?:|file:|workspace:)/i;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const failures = [];

for (const section of sections) {
  for (const [name, version] of Object.entries(pkg[section] ?? {})) {
    if (typeof version !== "string" || forbidden.test(version) || !semver.test(version)) {
      failures.push(`${section}.${name}=${String(version)}`);
    }
  }
}

if (failures.length) {
  console.error("Unpinned dependencies detected:\n" + failures.map((value) => ` - ${value}`).join("\n"));
  process.exit(1);
}

console.log("All runtime and development dependencies are pinned to exact versions.");
