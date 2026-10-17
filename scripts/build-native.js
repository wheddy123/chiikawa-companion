const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';

if (isMac) {
  console.log('[build-native] Compiling Swift raycast-watcher for macOS...');
  const srcSwift = path.join(__dirname, '../src/main/platform/raycast-watcher.swift');
  const outDir = path.join(__dirname, '../dist/main/platform');
  const outBin = path.join(outDir, 'raycast-watcher');
  const mainBin = path.join(__dirname, '../dist/main/raycast-watcher');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    execSync(`swiftc -O "${srcSwift}" -o "${outBin}"`, { stdio: 'inherit' });
    fs.copyFileSync(outBin, mainBin);
    fs.chmodSync(outBin, 0o755);
    fs.chmodSync(mainBin, 0o755);
    console.log('[build-native] raycast-watcher compiled successfully.');
  } catch (err) {
    console.warn('[build-native] Warning: Could not compile raycast-watcher:', err.message);
  }
} else {
  console.log('[build-native] Non-macOS platform detected. Skipping Swift compilation.');
}
