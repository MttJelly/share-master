const fs = require("node:fs");
const path = require("node:path");
const { version } = require("../package.json");

const releaseRoot = path.resolve(__dirname, "..", "release");

function renameArtifact(sourceName, targetName) {
  const source = path.join(releaseRoot, sourceName);
  const target = path.join(releaseRoot, targetName);
  if (!fs.existsSync(source)) return false;
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  fs.renameSync(source, target);
  return true;
}

renameArtifact(
  `Share-Master-${version}-win-x64.zip`,
  `Share-Master-${version}-portable-win-x64.zip`,
);
renameArtifact(
  `Share-Master-${version}-win-x64.msi`,
  `Share-Master-${version}-setup-win-x64.msi`,
);
