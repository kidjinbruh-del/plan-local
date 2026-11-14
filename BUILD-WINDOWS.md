# Сборка «ПЛАН» под Windows

Сборка выполняется из готового `dist/` плюс официальный Electron для Windows.
Node.js, npm и Visual Studio **не нужны** — интерфейс уже собран в `dist/`.

## Что нужно

- Linux (x64) или Windows
- `curl`, `unzip`, `zip`
- `makensis` (NSIS 3.x) — для установщика
- Python 3 + Pillow — для генерации `.ico` (только один раз)

## Шаги

### 1. Скачать Electron

```bash
ELECTRON_VERSION=44.7.2
curl -L -o electron-win.zip \
  "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"
unzip -q electron-win.zip -d app-stage
mv app-stage/electron.exe "app-stage/ПЛАН.exe"
rm -f app-stage/resources/default_app.asar
```

### 2. Положить код приложения

```bash
mkdir -p app-stage/resources/app
cp -r electron app-stage/resources/app/
cp -r dist app-stage/resources/app/
cp package.json app-stage/resources/app/
cp build/icon.png app-stage/icon.png
cp build/plan.ico  app-stage/plan.ico
```

### 3. Портативный ZIP

```bash
cd app-stage
zip -rq ../ПЛАН-portable-1.6.0-win-x64.zip .
cd ..
```

### 4. Установщик NSIS

```bash
makensis installer.nsi      # из этого каталога, см. build/installer.nsi
```

## Установщик

- **Тип:** per-user, без прав администратора
- **Путь:** `%LOCALAPPDATA%\Programs\ПЛАН`
- **Ярлыки:** рабочий стол и меню «Пуск», иконка `plan.ico`
- **Удаление:** сохраняет `data/` (план не теряется при переустановке)

Выбор `%LOCALAPPDATA%` не случаен: приложение пишет `data/` рядом с `.exe`,
поэтому установка в `Program Files` без прав записи сломала бы сохранение.

## Иконка

`plan.ico` генерируется из `build/icon.png` (256×256) один раз:

```python
from PIL import Image
img = Image.open("build/icon.png").convert("RGBA")
img.save("build/plan.ico", format="ICO",
         sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
```

Иконка `.exe` остаётся стандартной от Electron; ярлыки используют `plan.ico`.
