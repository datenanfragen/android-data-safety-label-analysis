import { basename, join } from 'path';
import fs from 'fs-extra';
import glob from 'glob';
// @ts-ignore
import dirname from 'es-dirname';
import { execa, ExecaChildProcess } from 'execa';
import chalk from 'chalk';
import { timeout } from 'promise-timeout';
import { serializeError } from 'serialize-error';
import { argv } from './common/argv';
import { db, pg } from './common/db';
import { platformApi } from './common/platform';
import { shuffle, delay, awaitProcStart, killProcess, dnsLookup } from './common/util';

const appTimeout = 60;
const mitmdumpAddonPath = join(dirname(), 'mitm-addon.py');
const errDir = join(dirname(), '../data/failed-apps');

let mitmdump: ExecaChildProcess<string> = undefined as any;
let dbAppId: number;

const cleanup = async (failed = false) => {
    console.log('Cleaning up mitmproxy…');
    for (const proc of [mitmdump]) await killProcess(proc);

    if (failed && dbAppId) {
        console.log('Deleting from database…');
        await db.none('DELETE FROM apps WHERE id = ${dbAppId};', { dbAppId });
    }
};

async function main() {
    const api = platformApi(argv).android;

    const appIds = glob.sync(`*`, { absolute: false, cwd: argv.appsDir }).map((p) => basename(p, '.apk'));

    const fails = glob
        .sync('*.json', { cwd: errDir, absolute: true })
        .map((f) => fs.readFileSync(f, 'utf-8'))
        .map((j) => JSON.parse(j));
    const appPreviouslyFailed = (appId: string) => fails.some((f) => f?.appId === appId);

    await api.ensureDevice();

    for (const appId of shuffle(appIds)) {
        // Ensure that we can resolve tracker domains.
        const trackerDomains = ['doubleclick.net', 'graph.facebook.com', 'branch.io', 'app-measurement.com'];
        const res = await dnsLookup(shuffle(trackerDomains)[0]);
        if (['0.0.0.0', '127.0.0.1'].includes(res.address))
            throw new Error("Could not resolve tracker domain. Ensure that you don't have DNS blocking enabled.");

        try {
            const appPath = join(argv.appsDir, `${appId}.apk`);
            const version = await api.getAppVersion(appPath);

            if (appPreviouslyFailed(appId)) {
                console.log(chalk.underline(`Skipping ${appId}@${version} because it previously failed…`));
                console.log();
                continue;
            }

            const done = await db.any('SELECT 1 FROM apps WHERE name = ${appId} AND version = ${version};', {
                appId,
                version,
            });
            if (done.length > 0) {
                console.log(chalk.underline(`Skipping ${appId}@${version} because we already analyzed it…`));
                console.log();
                continue;
            }

            console.log(chalk.underline(`Analyzing ${appId}@${version}…`));

            dbAppId = (
                await db.one('INSERT INTO apps (name, version) VALUES(${appId}, ${version}) RETURNING id;', {
                    appId,
                    version,
                })
            ).id;

            const startMitmproxy = async (): Promise<number | undefined> => {
                if (mitmdump) {
                    console.log('Stopping existing mitmproxy instance…');
                    await killProcess(mitmdump);
                }

                console.log('Starting mitmproxy…');
                const { id: runId } = await db.one(
                    'INSERT INTO runs (start_time, app) VALUES(now(), ${dbAppId}) RETURNING id;',
                    { dbAppId }
                );
                mitmdump = execa(argv.mitmdumpPath, ['-s', mitmdumpAddonPath, '--set', `run=${runId}`]);
                await timeout(awaitProcStart(mitmdump, 'Proxy server listening'), 150000);
                return runId;
            };

            process.removeAllListeners('SIGINT');
            process.on('SIGINT', async () => {
                await cleanup(true);
                pg.end();
                process.exit();
            });

            await timeout(api.resetDevice(), 20000).catch(async () => {
                // Sometimes, the Android emulator gets stuck and doesn't accept any commands anymore. In this case, we
                // restart it.
                await timeout(api.ensureDevice(), 20000);
                await timeout(api.resetDevice(), 20000);
            });

            await api.setGeolocation(52.23528, 10.56437, 77.23);

            await api.resetApp(appId, appPath, async () => {
                await startMitmproxy();
            });

            const assertAppInForeground = async () => {
                if ((await api.getForegroundAppId()) !== appId) throw new Error("App isn't in foreground anymore.");
            };

            const pauseTime = appTimeout * 1000;
            console.log(`Waiting for ${pauseTime / 1000} seconds…`);
            await delay(pauseTime / 3);
            await assertAppInForeground();
            await delay(pauseTime - pauseTime / 3);

            // Ensure app is still running and in foreground after timeout.
            await assertAppInForeground();

            // Clean up.
            await cleanup();
            console.log();
        } catch (err) {
            console.error(`Analyzing ${appId} failed:`, err);

            const date = new Date().toISOString();
            await fs.ensureDir(errDir);
            await fs.writeFile(
                join(errDir, `${date}-${appId}.json`),
                JSON.stringify({ appId, date, error: serializeError(err) }, null, 4)
            );

            await cleanup(true);

            console.log();
        }
    }
    console.log('Done.');

    pg.end();
}

process.on('unhandledRejection', (err) => {
    console.error('An unhandled promise rejection occurred:', err);
    cleanup(true)
        .then(() => {
            pg.end();
            process.exit(1);
        })
        .catch(() => process.exit(1));
});

main();
