## Setup for downloading APKs

```sh
git clone https://github.com/89z/googleplay.git
cd googleplay/cmd/googleplay
go build

./googleplay -email <email> -password <app password>
./googleplay -device -p 1 # armeabi-v7a
```

## Setup for traffic collection

```sh
# Fetch image.
sdkmanager "system-images;android-30;google_apis;x86_64"
# Create AVD.
avdmanager create avd --abi google_apis/x86_64 --device "pixel_2" --force --name "dsl" --package "system-images;android-30;google_apis;x86_64"

# Start emu for the first time.
emulator -avd "dsl" -no-audio -no-boot-anim -writable-system -http-proxy 127.0.0.1:8080

# --- Installing our CA cert. ---

# Yields <hash>.
openssl x509 -inform PEM -subject_hash_old -in ~/.mitmproxy/mitmproxy-ca-cert.pem | head -1
cp ~/.mitmproxy/mitmproxy-ca-cert.pem <hash>.0

adb root
adb shell avbctl disable-verification
adb disable-verity
adb reboot
adb root
adb remount

adb push <hash>.0 /system/etc/security/cacerts/
adb shell chmod 644 /system/etc/security/cacerts/<hash>.0
adb reboot
adb root

# Disable captive portal.
adb shell 'settings put global captive_portal_detection_enabled 0'
adb shell 'settings put global captive_portal_server localhost'
adb shell 'settings put global captive_portal_mode 0'

# Uninstall unnecessary Google apps to avoid their background traffic.
adb shell 'pm uninstall --user 0 com.android.chrome'
adb shell 'pm uninstall --user 0 com.google.android.apps.docs'
adb shell 'pm uninstall --user 0 com.google.android.apps.maps'
adb shell 'pm uninstall --user 0 com.google.android.apps.messaging'
adb shell 'pm uninstall --user 0 com.google.android.apps.photos'
adb shell 'pm uninstall --user 0 com.google.android.apps.pixelmigrate'
adb shell 'pm uninstall --user 0 com.google.android.apps.wellbeing'
adb shell 'pm uninstall --user 0 com.google.android.apps.youtube.music'
adb shell 'pm uninstall --user 0 com.google.android.gm'
adb shell 'pm uninstall --user 0 com.google.android.googlequicksearchbox'
adb shell 'pm uninstall --user 0 com.google.android.videos'
adb shell 'pm uninstall --user 0 com.google.android.youtube'
adb shell 'pm uninstall --user 0 com.google.mainline.telemetry'

# Set up Frida.
adb shell getprop ro.product.cpu.abi # should be x86_64
wget https://github.com/frida/frida/releases/download/15.1.12/frida-server-15.1.12-android-x86_64.xz
7z x frida-server-15.1.12-android-x86_64.xz

adb push frida-server-15.1.12-android-x86_64 /data/local/tmp/frida-server
adb shell chmod 777 /data/local/tmp/frida-server

adb shell "nohup /data/local/tmp/frida-server >/dev/null 2>&1 &"
frida-ps -U | grep frida # should have `frida-server`

# Set up honey data.

adb emu avd snapshot save dsl-honey-data

# Stop the emulator by pressing the X button (no shutdown).
```
