# Worrying confessions: A look at data safety labels on Android

> Source code for reproducing our [analysis on the data safety labels on Android](https://www.datarequests.org/blog/android-data-safety-labels-analysis/).

![Stylized photo with a blue tint of food containers, above that the text: “Analysis: Data safety labels on Android”](https://www.datarequests.org/blog/android-data-safety-labels-analysis/analysis-data-safety-labels-on-android.jpg)

We [analyzed the new data safety section on the Google Play Store](https://www.datarequests.org/blog/android-data-safety-labels-analysis/) and found popular apps admitting to collecting and sharing highly sensitive data for advertising and tracking. More than one quarter of apps transmitted tracking data not declared in their data safety label. 

This repository contains the source code for reproducing this analysis. It includes scripts for downloading data safety labels and APKs of Android apps, automated traffic collection of apps, and generating statistics and graphs of the results. 

## Steps for running an analysis

The following steps are necessary for running the analysis:

1. Install and setup [`googleplay`](https://github.com/89z/googleplay) (see below).
2. Setup emulator for traffic collection (see below).
3. Create a PostgreSQL database according to `schema.sql` and copy `.env.sample` to `.env`, filling in the correct values.
4. Install the Node dependencies using `yarn`. Create a Python venv and install the dependencies from `requirements.txt`.
5. Download data safety labels: `npx tsm src/fetch.ts`
6. Download APKs: `./src/download.sh <path_to_googleplay_binary> <app_list> <out_dir>`
7. Run apps and collect traffic: `npx tsm src/traffic.ts --appsDir <dir_with_apks> --avdName <avd_name> --avdSnapshotName <avd_snapshot_name>`
8. Compile statistics on labels: `npx tsm src/data.ts <label_date>`
9. Compile statistics on recorded traffic: `npx tsm src/traffic-analysis.ts <label_date>`
10. Generate graphs using `src/graphs.ipynb`.

## Setup for downloading APKs

We’re using [`googleplay`](https://github.com/89z/googleplay) to download APKs of Android apps. You need to compile that and log in:

```sh
git clone https://github.com/89z/googleplay.git
cd googleplay/cmd/googleplay
go build

./googleplay -email <email> -password <app_password>
./googleplay -device -p 1 # armeabi-v7a
```

## Setup for traffic collection

We’re using an emulator running Android 11 for the traffic collection. The emulator needs to be set up to accept mitmproxy’s root CA, minimize unrelated background traffic, and [Frida](https://github.com/frida/frida) needs to be installed so we can use [objection](https://github.com/sensepost/objection) to bypass certificate pinning. Then, we create a snapshot that the emulator is reset to after each app.

You’ll need the [Android command line tools](https://developer.android.com/studio/command-line/). You’ll also need to install [mitmproxy](https://mitmproxy.org/), Frida, and objection. Then, you can create and prepare the emulator like this:

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

## License

This code is licensed under the MIT license, see the [`LICENSE`](/LICENSE) file for details.

The [data set of our analysis](https://doi.org/10.5281/zenodo.7088557) is also available.
