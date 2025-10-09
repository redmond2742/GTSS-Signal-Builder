# Building GTSS Builder as a Desktop App

Your GTSS Builder web app now has Electron support! This allows you to package it as a downloadable desktop application for Windows, Mac, and Linux.

## Quick Start

### 1. Add Required Scripts to package.json

Since package.json is protected, you'll need to manually add these scripts to the `"scripts"` section:

```json
"scripts": {
  "electron:dev": "cross-env NODE_ENV=development electron .",
  "electron:build": "npm run build && electron-builder",
  "package:win": "npm run build && electron-builder --win --x64",
  "package:mac": "npm run build && electron-builder --mac",
  "package:linux": "npm run build && electron-builder --linux"
}
```

Also add this line at the top level of package.json (after "license"):
```json
"main": "electron/main.js",
```

### 2. Test the Electron App Locally

First, make sure your web app is built:
```bash
npm run build
```

Then run the Electron app in development mode:
```bash
npm run electron:dev
```

This will open your GTSS Builder in a desktop window!

### 3. Build Desktop Installers

#### For Windows (on any OS):
```bash
npm run package:win
```
This creates:
- `GTSS Builder Setup.exe` (installer)
- `GTSS Builder.exe` (portable version)

#### For macOS (requires macOS):
```bash
npm run package:mac
```
This creates:
- `GTSS Builder.dmg` (installer)
- `GTSS Builder.zip` (portable version)

#### For Linux:
```bash
npm run package:linux
```
This creates:
- `GTSS Builder.AppImage` (universal Linux app)
- `gtss-builder_*.deb` (Debian/Ubuntu package)

### 4. Find Your Built Apps

All desktop installers will be in the `electron-dist/` folder.

## What Was Added

1. **electron/main.js** - The main Electron process that creates the desktop window
2. **electron/preload.js** - Security layer for the Electron app
3. **electron-builder.json** - Configuration for building installers
4. **This guide** - Instructions for building desktop apps

## Features of Your Desktop App

- ✅ Works completely offline (uses localStorage)
- ✅ Native desktop menus (File, Edit, View, Help)
- ✅ All your existing functionality works exactly the same
- ✅ Keyboard shortcuts (Ctrl/Cmd+Q to quit, etc.)
- ✅ Window state management
- ✅ Auto-updates ready (can be configured)

## File Sizes

- **Web app**: Runs in browser (0 MB download)
- **Desktop app**: ~80-120 MB installer (includes Chromium browser)

## Distribution

Your desktop installers are ready to share:
- **Windows users**: Send them the `.exe` file
- **Mac users**: Send them the `.dmg` file  
- **Linux users**: Send them the `.AppImage` or `.deb` file

## Notes

- The web app continues to work normally at your existing URL
- The desktop app is completely independent
- Both share the same codebase - any updates you make to the web app automatically apply to the desktop version when you rebuild
- localStorage data is isolated per app (web vs desktop have separate storage)

## Customization

To change the app icon, replace `public/icon.png` with your custom icon (512x512 PNG recommended).

To modify the app menu or window behavior, edit `electron/main.js`.
