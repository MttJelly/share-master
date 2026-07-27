const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function directorySnapshot(root) {
  const snapshot = [];
  const visit = async (directory, relativeRoot = "") => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.join(relativeRoot, entry.name);
      const stat = entry.isSymbolicLink() ? await fsp.stat(absolute) : null;
      if (entry.isDirectory() || stat?.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile() || stat?.isFile()) {
        const fileStat = stat || await fsp.stat(absolute);
        snapshot.push(`${relative}\0${fileStat.size}\0${Math.round(fileStat.mtimeMs)}`);
      }
    }
  };
  await visit(root);
  return snapshot;
}

async function directoriesMatch(source, target) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return false;
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    directorySnapshot(source),
    directorySnapshot(target),
  ]);
  return sourceSnapshot.length === targetSnapshot.length
    && sourceSnapshot.every((entry, index) => entry === targetSnapshot[index]);
}

async function syncSkillRoots(sourceDirectories, targetDirectory) {
  const targetRoot = path.resolve(String(targetDirectory || ""));
  if (!targetDirectory) throw new Error("Share Master skill target is required.");
  await fsp.mkdir(targetRoot, { recursive: true });
  const result = { copied: 0, skipped: 0, skippedSources: 0, names: [] };
  const selectedSkills = new Map();

  for (const sourceDirectory of sourceDirectories || []) {
    const sourceRoot = path.resolve(String(sourceDirectory || ""));
    if (!sourceDirectory || sourceRoot === targetRoot
      || isInside(sourceRoot, targetRoot) || isInside(targetRoot, sourceRoot)
      || !fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
      result.skippedSources += 1;
      continue;
    }
    const entries = await fsp.readdir(sourceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name === ".system") continue;
      const source = path.join(sourceRoot, entry.name);
      if (!fs.existsSync(path.join(source, "SKILL.md")) || !fs.statSync(source).isDirectory()) continue;
      selectedSkills.set(entry.name, source);
    }
  }

  for (const [name, source] of selectedSkills) {
    const target = path.join(targetRoot, name);
    if (await directoriesMatch(source, target)) {
      result.skipped += 1;
    } else {
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.cp(source, target, {
        recursive: true,
        force: true,
        dereference: true,
        preserveTimestamps: true,
        filter: (candidate) => path.basename(candidate) !== ".git",
      });
      result.copied += 1;
    }
    result.names.push(name);
  }
  result.names.sort((a, b) => a.localeCompare(b, "zh-CN"));
  return result;
}

module.exports = { syncSkillRoots };
