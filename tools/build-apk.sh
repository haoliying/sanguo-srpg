#!/usr/bin/env bash
#
# 数独 App —— APK 构建脚本（无需 Gradle / Android Studio）
#
# 依赖：JDK 17+、Android SDK（build-tools;34.0.0 + platforms;android-34）
# 用法：bash tools/build-apk.sh [--clean]
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/android"
BUILD="$APP/build"
OUT="$ROOT/dist"
PY="${PYTHON:-python3}"

# ---- SDK 位置：优先用 ANDROID_HOME，其次本机 .cache ----
SDK="${ANDROID_HOME:-$(cd "$ROOT/.." && pwd)/.cache/sdk}"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-34"

VERSION_CODE=1
VERSION_NAME=1.0.0
KEY_PASS=sanguo-app

JAVA_OK() { command -v "$1" >/dev/null 2>&1 || { echo "缺少 $1"; exit 1; }; }

echo "==> 0/8 环境检查"
for tool in javac keytool; do JAVA_OK "$tool"; done
for f in "$BT/aapt2.exe" "$BT/zipalign.exe" "$BT/lib/d8.jar" "$BT/lib/apksigner.jar" "$PLAT/android.jar"; do
  [ -f "$f" ] || { echo "缺少 SDK 组件: $f （需 build-tools;34.0.0 和 platforms;android-34）"; exit 1; }
done
[ -f "$PY" ] || PY=python3

# ---- 1. 同步 Web 资源到 assets/www（覆盖式同步，逐个清理过时文件，不整目录删） ----
echo "==> 1/8 同步 Web 资源"
"$PY" - "$APP" "$ROOT" << 'PYSYNC'
import os, shutil, sys
app, root = sys.argv[1], sys.argv[2]
www = os.path.join(app, 'assets', 'www')
os.makedirs(www, exist_ok=True)
src = set()
for f in ('index.html', 'manifest.webmanifest', 'sw.js'):
    shutil.copy2(os.path.join(root, f), www)
    src.add(f)
srcRoot = os.path.join(root, 'assets')
dstRoot = os.path.join(www, 'assets')
for dirpath, _, files in os.walk(srcRoot):
    rel = os.path.relpath(dirpath, srcRoot)
    tgt = dstRoot if rel == '.' else os.path.join(dstRoot, rel)
    os.makedirs(tgt, exist_ok=True)
    for f in files:
        shutil.copy2(os.path.join(dirpath, f), os.path.join(tgt, f))
        src.add(os.path.normpath(os.path.join('assets', rel, f)).replace('\\', '/'))
stale = 0
for dirpath, _, files in os.walk(www):
    for f in files:
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, www).replace('\\', '/')
        if rel not in src:
            os.remove(p); stale += 1
print('    www 已同步:', sum(len(fs) for _, _, fs in os.walk(www)), '个文件（清理过时', stale, '个）')
PYSYNC
mkdir -p "$OUT"

# ---- 2. 生成图标（缺失时）----
if [ ! -f "$APP/res/mipmap-xxxhdpi/ic_launcher.png" ]; then
  echo "==> 2/8 生成启动图标"
  "$PY" "$ROOT/tools/make-icon.py"
else
  echo "==> 2/8 启动图标已存在，跳过"
fi

# ---- 3. aapt2 编译资源 ----
echo "==> 3/8 aapt2 编译资源"
mkdir -p "$BUILD"
"$BT/aapt2" compile --dir "$APP/res" -o "$BUILD/res.zip"

# ---- 4. aapt2 链接 APK（含 assets）----
echo "==> 4/8 aapt2 链接 APK"
"$BT/aapt2" link \
  -I "$PLAT/android.jar" \
  --manifest "$APP/AndroidManifest.xml" \
  -A "$APP/assets" \
  --min-sdk-version 26 \
  --target-sdk-version 34 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  -o "$BUILD/app-unsigned.apk" \
  "$BUILD/res.zip"

# ---- 5. javac 编译 Java ----
echo "==> 5/8 编译 Java"
mkdir -p "$BUILD/obj"
javac --release 17 -encoding UTF-8 \
  -cp "$PLAT/android.jar" \
  -d "$BUILD/obj" \
  "$APP/src/com/haoly/sanguo/MainActivity.java"

# ---- 6. d8 转 dex 并并入 APK ----
echo "==> 6/8 d8 生成 classes.dex"
# 优先用 cmdline-tools 里的 r8.jar（新版），build-tools 34 的 d8.jar 有匿名类 NPE bug
D8_JAR="$SDK/cmdline-tools/latest/lib/r8.jar"
if [ ! -f "$D8_JAR" ]; then D8_JAR="$BT/lib/d8.jar"; fi
java -cp "$D8_JAR" com.android.tools.r8.D8 --release \
  --lib "$PLAT/android.jar" \
  --min-api 26 \
  --output "$BUILD" \
  $(find "$BUILD/obj" -name "*.class")

"$PY" - "$BUILD/app-unsigned.apk" "$BUILD/classes.dex" <<'PYEOF'
import sys, zipfile
apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, 'a') as z:
    z.write(dex, 'classes.dex', compress_type=zipfile.ZIP_STORED)
print('   classes.dex 已并入 APK (STORED)')
PYEOF

# ---- 7. zipalign ----
echo "==> 7/8 zipalign"
"$BT/zipalign" -f -p 4 "$BUILD/app-unsigned.apk" "$BUILD/app-aligned.apk"

# ---- 8. 签名 ----
echo "==> 8/8 生成签名密钥（首次）并签名"
KS="$OUT/sanguo.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias sanguo \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
    -dname "CN=Sanguo, OU=App, O=Haoly, C=CN"
  echo "   已生成 $KS （请妥善保管，用于后续版本更新签名）"
fi
APK_FINAL="$OUT/sanguo-v$VERSION_NAME.apk"
java -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool sign \
  --ks "$KS" --ks-key-alias sanguo \
  --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
  --out "$APK_FINAL" \
  "$BUILD/app-aligned.apk"

java -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool verify --print-certs "$APK_FINAL" | head -4

echo
ls -lh "$APK_FINAL"
echo "构建完成: $APK_FINAL"
