import { join } from 'path';
import { execa, ExecaChildProcess } from 'execa';
import frida from 'frida';
// @ts-ignore
import dirname from 'es-dirname';
import { ArgvType } from './argv';
import { killProcess, delay } from './util';

type PlatformApi = {
    ensureDevice: () => Promise<void>;
    resetDevice: () => Promise<void>;
    clearStuckModals: () => Promise<void>;

    installApp: (appPath: string) => Promise<unknown>;
    uninstallApp: (appId: string) => Promise<unknown>;
    setAppPermissions: (appId: string) => Promise<unknown>;
    startApp: (appId: string) => Promise<unknown>;
    /** Uninstall, install, setup, start. */
    resetApp: (appId: string, appPath: string, onBeforeStart?: () => Promise<void>) => Promise<unknown>;

    getForegroundAppId: () => Promise<string | undefined>;
    getPidForAppId: (appId: string) => Promise<number | undefined>;
    setClipboard: (text: string) => Promise<void>;
    setGeolocation: (lon: number, lat: number, altitude: number) => Promise<unknown>;

    getAppVersion: (appPath: string) => Promise<string | undefined>;
};

const fridaScripts = {
    android: {
        setClipboard: (
            text: string
        ) => `var appCtx = Java.use('android.app.ActivityThread').currentApplication().getApplicationContext();
var cm = Java.cast(appCtx.getSystemService("clipboard"), Java.use("android.content.ClipboardManager"));
cm.setText(Java.use("java.lang.StringBuilder").$new("${text}"));
send({ name: "getObjFromFridaScript", payload: true });`,
    },
};

const getObjFromFridaScript = async (pid: number | undefined, script: string) => {
    try {
        if (!pid) throw new Error('Must provide pid.');
        const fridaDevice = await frida.getUsbDevice();
        const fridaSession = await fridaDevice.attach(pid);
        const fridaScript = await fridaSession.createScript(script);
        const resultPromise = new Promise<any>((res, rej) => {
            fridaScript.message.connect((message) => {
                if (message.type === 'send' && message.payload?.name === 'getObjFromFridaScript')
                    res(message.payload?.payload);
                else rej(message);
            });
        });
        await fridaScript.load();

        await fridaSession.detach();
        return await resultPromise; // We want this to be caught here if it fails, thus the `await`.
    } catch (err) {
        console.error("Couldn't get data from Frida script:", err);
    }
};
const resetApp = async (that: PlatformApi, appId: string, appPath: string, onBeforeStart?: () => Promise<void>) => {
    console.log('Resetting and installing app…');
    await that.uninstallApp(appId); // Won't fail if the app isn't installed anyway.
    await that.installApp(appPath);
    await that.setAppPermissions(appId);
    await that.clearStuckModals();
    await that.setClipboard('LDDsvPqQdT');
    if (onBeforeStart) await onBeforeStart();
    console.log('Starting app…');
    await that.startApp(appId);
};

export type PlatformApiAndroid = PlatformApi & {
    _internal: {
        ensureFrida: () => Promise<void>;

        emuProcess?: ExecaChildProcess;
        objectionProcesses: ExecaChildProcess[];
    };
};

export const platformApi = (argv: ArgvType): { android: PlatformApiAndroid } => ({
    android: {
        _internal: {
            emuProcess: undefined,
            objectionProcesses: [],

            ensureFrida: async () => {
                const fridaCheck = await execa(`${argv.fridaPsPath} -U | grep frida-server`, {
                    shell: true,
                    reject: false,
                });
                if (fridaCheck.exitCode === 0) return;

                await execa('adb', ['root']);
                let adbTries = 0;
                while ((await execa('adb', ['get-state'], { reject: false })).exitCode !== 0) {
                    if (adbTries > 100) throw new Error('Failed to connect via adb.');
                    await delay(250);
                    adbTries++;
                }

                await execa('adb shell "nohup /data/local/tmp/frida-server >/dev/null 2>&1 &"', { shell: true });
                let fridaTries = 0;
                while (
                    (await execa(`${argv.fridaPsPath} -U | grep frida-server`, { shell: true, reject: false }))
                        .exitCode !== 0
                ) {
                    if (fridaTries > 100) throw new Error('Failed to start Frida.');
                    await delay(250);
                    fridaTries++;
                }
            },
        },

        async resetDevice() {
            console.log('Resetting emulator…');
            await execa('adb', ['emu', 'avd', 'snapshot', 'load', argv.avdSnapshotName]);
            await this._internal.ensureFrida();
        },
        async ensureDevice() {
            console.log('Starting emulator…');
            if (this._internal.emuProcess) await killProcess(this._internal.emuProcess);
            this._internal.emuProcess = execa('emulator', [
                '-avd',
                argv.avdName,
                '-no-audio',
                '-no-boot-anim',
                '-writable-system',
                '-http-proxy',
                '127.0.0.1:8080',
                '-no-snapshot-save',
                '-phone-number',
                '4915585834346',
                '-no-window',
            ]);
            await execa(join(dirname(), '../await_emulator.sh'));

            await this._internal.ensureFrida();
        },
        clearStuckModals: async () => {
            // Press back button.
            await execa('adb', ['shell', 'input', 'keyevent', '4']);
            // Press home button.
            await execa('adb', ['shell', 'input', 'keyevent', '3']);
        },

        installApp: (apkPath) => execa('adb', ['install-multiple', '-g', apkPath], { shell: true }),
        uninstallApp: (appId) =>
            execa('adb', ['shell', 'pm', 'uninstall', '--user', '0', appId]).catch((err) => {
                // Don't fail if app wasn't installed.
                if (!err.stdout.includes('not installed for 0')) throw err;
            }),
        // Basic permissions are granted at install time, we only need to grant dangerous permissions, see:
        // https://android.stackexchange.com/a/220297.
        setAppPermissions: async (appId) => {
            const { stdout: permStr } = await execa('adb', ['shell', 'pm', 'list', 'permissions', '-g', '-d', '-u']);
            const dangerousPermissions = permStr
                .split('\n')
                .filter((l) => l.startsWith('  permission:'))
                .map((l) => l.replace('  permission:', ''));

            // We expect this to fail for permissions the app doesn't want.
            for (const permission of dangerousPermissions)
                await execa('adb', ['shell', 'pm', 'grant', appId, permission]).catch(() => {});
        },
        startApp(appId) {
            // We deliberately don't await that since Objection doesn't exit after the app is started.
            const process = execa(argv.objectionPath, [
                '--gadget',
                appId,
                'explore',
                '--startup-command',
                'android sslpinning disable',
            ]);
            this._internal.objectionProcesses.push(process);
            return Promise.resolve();
        },
        async resetApp(appId, apkPath, onBeforeStart) {
            // Kill leftover Objection processes.
            for (const proc of this._internal.objectionProcesses) await killProcess(proc);

            await resetApp(this, appId, apkPath, onBeforeStart);
        },

        // Adapted after: https://stackoverflow.com/a/28573364
        getForegroundAppId: async () => {
            const { stdout } = await execa('adb', ['shell', 'dumpsys', 'activity', 'recents']);
            const foregroundLine = stdout.split('\n').find((l) => l.includes('Recent #0'));
            const [, appId] = Array.from(foregroundLine?.match(/A=\d+:(.+?) U=/) || []);
            return appId ? appId.trim() : undefined;
        },
        getPidForAppId: async (appId) => {
            const { stdout } = await execa('adb', ['shell', 'pidof', '-s', appId]);
            return parseInt(stdout, 10);
        },
        async setClipboard(text) {
            const launcherPid = await this.getPidForAppId('com.google.android.apps.nexuslauncher');
            const res = await getObjFromFridaScript(launcherPid, fridaScripts.android.setClipboard(text));
            if (!res) throw new Error('Setting clipboard failed.');
        },
        setGeolocation: (lon, lat, altitude) => execa('adb', ['emu', 'geo', 'fix', `${lon}`, `${lat}`, `${altitude}`]),

        getAppVersion: async (apkPath) =>
            // These sometimes fail with `AndroidManifest.xml:42: error: ERROR getting 'android:icon' attribute: attribute value
            // reference does not exist` but still have the correct version in the output.
            (await execa('aapt', ['dump', 'badging', apkPath], { reject: false })).stdout.match(
                /versionName='(.+?)'/
            )?.[1],
    },
});
