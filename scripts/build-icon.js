const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "build", "icon.svg");
const pngTarget = path.join(root, "build", "icon.png");
const icoTarget = path.join(root, "build", "icon.ico");
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function createIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}

async function run() {
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    width: 1024,
    height: 1024,
    useContentSize: true,
    webPreferences: { backgroundThrottling: false },
  });
  const svg = fs.readFileSync(source, "utf8");
  const html = `<!doctype html><html><head><style>html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await window.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const master = await window.webContents.capturePage();
  fs.writeFileSync(pngTarget, master.resize({ width: 256, height: 256, quality: "best" }).toPNG());
  const images = icoSizes.map((size) => ({
    size,
    buffer: master.resize({ width: size, height: size, quality: "best" }).toPNG(),
  }));
  fs.writeFileSync(icoTarget, createIco(images));
  window.destroy();
  console.log(JSON.stringify({ ok: true, source, pngTarget, icoTarget, icoSizes }));
}

let exitCode = 0;
run().catch((error) => {
  console.error(error.stack || error.message);
  exitCode = 1;
}).finally(() => app.exit(exitCode));
