const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function existingFile(value) {
  if (!value) return null;
  const resolved = path.resolve(String(value).trim().replace(/^"|"$/g, ""));
  try {
    return fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function pathMatches(command) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(finder, [command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 3000,
  });
  if (result.error || result.status !== 0) return [];
  return String(result.stdout || "").split(/\r?\n/).map(existingFile).filter(Boolean);
}

function wingetMatches(packagePrefix, executable) {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return [];
  const root = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(packagePrefix.toLowerCase()))
      .map((entry) => existingFile(path.join(root, entry.name, executable)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findExecutable({ override, candidates = [], commands = [], winget = null }) {
  const matches = [
    existingFile(override),
    ...candidates.map(existingFile),
    ...commands.flatMap(pathMatches),
    ...(winget ? wingetMatches(winget.packagePrefix, winget.executable) : []),
  ].filter(Boolean);
  return [...new Set(matches.map((match) => path.normalize(match)))][0] || null;
}

function userExecutableCandidates(name) {
  const home = os.homedir();
  const extension = process.platform === "win32" ? ".exe" : "";
  return [
    path.join(home, ".local", "bin", `${name}${extension}`),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", `${name}.cmd`) : null,
  ].filter(Boolean);
}

module.exports = { findExecutable, userExecutableCandidates };
