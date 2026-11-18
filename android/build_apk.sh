#!/usr/bin/env bash
# Собирает APK без Android Studio и Gradle.
# Нужны пакеты (Ubuntu/Debian):
#   sudo apt-get install android-sdk-platform-23 aapt apksigner zipalign dalvik-exchange default-jdk
# Запуск из любой папки:  bash android/build_apk.sh
# Результат:              dist/tavern-duel.apk
set -euo pipefail

cd "$(dirname "$0")"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
OUT=../dist/tavern-duel.apk

rm -rf build
mkdir -p build/assets/game build/classes ../dist

echo "1/6 Копирую игру в assets"
cp -r ../index.html ../css ../js ../img ../fonts build/assets/game/

echo "2/6 Компилирую Java"
javac --release 8 -nowarn -Xlint:-options -cp "$ANDROID_JAR" -d build/classes \
  src/com/tavernduel/game/MainActivity.java

echo "3/6 Превращаю в DEX"
dalvik-exchange --dex --output=build/classes.dex build/classes

echo "4/6 Упаковываю ресурсы"
aapt package -f -M AndroidManifest.xml -S res -A build/assets -I "$ANDROID_JAR" -F build/unsigned.apk
(cd build && aapt add unsigned.apk classes.dex >/dev/null)

echo "5/6 Выравниваю"
zipalign -f -p 4 build/unsigned.apk build/aligned.apk

echo "6/6 Подписываю"
if [ ! -f debug.keystore ]; then
  keytool -genkeypair -keystore debug.keystore -storepass android -keypass android \
    -alias tavernduel -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Tavern Duel, O=Hobby, C=RU" >/dev/null
fi
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias tavernduel --out "$OUT" build/aligned.apk
apksigner verify "$OUT"

echo "Готово: dist/tavern-duel.apk ($(du -h "$OUT" | cut -f1))"
