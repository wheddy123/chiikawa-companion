const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';

if (isMac) {
  console.log('[build-native] Compiling Swift desktop-helper (Media + Raycast) for macOS...');
  const srcSwift = path.join(__dirname, '../src/main/platform/desktop-helper.swift');
  const outDir = path.join(__dirname, '../dist/main/platform');
  const outBin = path.join(outDir, 'raycast-watcher');
  const helperBin = path.join(outDir, 'desktop-helper');
  const mainBin = path.join(__dirname, '../dist/main/raycast-watcher');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    execSync(`swiftc -O "${srcSwift}" -o "${outBin}"`, { stdio: 'inherit' });
    fs.copyFileSync(outBin, mainBin);
    fs.copyFileSync(outBin, helperBin);
    fs.chmodSync(outBin, 0o755);
    fs.chmodSync(mainBin, 0o755);
    fs.chmodSync(helperBin, 0o755);
    console.log('[build-native] desktop-helper & raycast-watcher compiled successfully.');
  } catch (err) {
    console.warn('[build-native] Warning: Could not compile native helper:', err.message);
  }
} else {
  console.log('[build-native] Non-macOS platform detected. Skipping Swift compilation.');
}
