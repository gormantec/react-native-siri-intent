// scripts/postinstall.js
const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.lstatSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child =>
      copyRecursiveSync(path.join(src, child), path.join(dest, child))
    );
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Find the consumer project's ios directory
const projectRoot = process.env.INIT_CWD || process.cwd();
const iosDest = path.join(projectRoot, 'ios', 'SimpleHealthSiriIntent');
const iosSrc = path.join(__dirname, '..', 'ios', 'SimpleHealthSiriIntent');
console.log(`Copying Siri Intent extension from ${iosSrc} to ${iosDest}...`);
copyRecursiveSync(iosSrc, iosDest);
console.log('Done. Please open your Xcode project and ensure the extension is added to the workspace.');