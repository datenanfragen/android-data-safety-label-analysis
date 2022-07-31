import { join } from 'path';
import yargs from 'yargs';
// @ts-ignore
import dirname from 'es-dirname';

export const argv = yargs(process.argv.slice(2))
    .options({
        appsDir: { type: 'string', demandOption: true, group: 'Required options:' },

        avdName: {
            type: 'string',
            describe: 'Name of the Android emulator AVD',
            group: 'Android options:',
            demandOption: true,
        },
        avdSnapshotName: {
            type: 'string',
            describe:
                'Name of snapshot to reset the Android emulator to after each app (hint: `adb emu avd snapshot save <name>`)',
            group: 'Android options:',
            demandOption: true,
        },

        mitmdumpPath: {
            type: 'string',
            default: join(dirname(), '../../venv/bin/mitmdump'),
            group: 'Optional options:',
        },
        fridaPsPath: {
            type: 'string',
            default: join(dirname(), '../../venv/bin/frida-ps'),
            group: 'Optional options:',
        },
        objectionPath: {
            type: 'string',
            default: join(dirname(), '../../venv/bin/objection'),
            group: 'Optional options:',
        },
    })
    .parseSync();
export type ArgvType = typeof argv;
