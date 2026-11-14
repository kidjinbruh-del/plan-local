#!/bin/bash
# Сборка «ПЛАН» под Windows x64 из готового dist/.
# Требуется: curl, unzip, zip, makensis (NSIS), Python 3 + Pillow (для .ico).
#
#   ./build-windows.sh
#
# Результат: release/ПЛАН-Setup-1.6.0.exe и release/ПЛАН-portable-1.6.0-win-x64.zip
set -euo pipefail

VERSION="1.6.0"
ELECTRON_VERSION="44.7.2"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d /tmp/plan-build-XXXXXX)"
STAGE="$WORK/app-stage"
RELEASE="$HERE/release"
trap 'rm -rf "$WORK"' EXIT

echo "==> Electron $ELECTRON_VERSION (win32-x64)"
curl -L -o "$WORK/electron-win.zip" \
  "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"
unzip -q "$WORK/electron-win.zip" -d "$STAGE"
mv "$STAGE/electron.exe" "$STAGE/ПЛАН.exe"
rm -f "$STAGE/resources/default_app.asar"

echo "==> Код приложения"
mkdir -p "$STAGE/resources/app"
cp -r "$HERE/electron" "$STAGE/resources/app/"
cp -r "$HERE/dist"     "$STAGE/resources/app/"
cp "$HERE/package.json" "$STAGE/resources/app/"
cp "$HERE/build/icon.png" "$STAGE/icon.png"
cp "$HERE/build/plan.ico" "$STAGE/plan.ico"

echo "==> Портативный ZIP"
mkdir -p "$RELEASE"
( cd "$STAGE" && zip -rq "$RELEASE/ПЛАН-portable-${VERSION}-win-x64.zip" . )

echo "==> Установщик NSIS"
( cd "$WORK" && cp "$HERE/build/installer.nsi" . && cp "$HERE/build/plan.ico" . \
  && makensis installer.nsi && cp "ПЛАН-Setup-${VERSION}.exe" "$RELEASE/" )

echo "==> Готово:"
ls -lh "$RELEASE"
