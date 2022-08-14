import { promisify } from 'util';
import dns from 'dns';
import type { ExecaChildProcess } from 'execa';
import { timeout } from 'promise-timeout';

export const shuffle = <T>(arr: T[]) => arr.sort(() => Math.random() - 0.5);
// Taken from: https://stackoverflow.com/a/65556422
export const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
export const delay = (ms: number) => new Promise((res) => setTimeout(res, random(ms - ms / 10, ms + ms / 10)));

export const base64Decode = (base64: string) => Buffer.from(base64, 'base64').toString();
export const str2Bool = (val?: string | boolean) => {
    if (typeof val === 'boolean' || val === undefined) return val;
    return ['true', 'yes', '1', 'y', 't'].includes(val.toString().toLowerCase());
};

export const concat = (...strs: (string | undefined | (string | undefined)[])[]) =>
    strs
        .filter((s) => s)
        .filter((s) => !Array.isArray(s) || s.every((s) => s))
        .map((s) => (Array.isArray(s) ? `(${s.join(' ')})` : s))
        .join(' ') || undefined;

// Adapted after: https://stackoverflow.com/a/51458052
export const isObject = (obj: any): obj is {} => obj && (obj as {}).constructor.name === 'Object';

export const isNotEmpty = (value: unknown): boolean =>
    value !== null &&
    value !== undefined &&
    !Number.isNaN(value) &&
    (isObject(value) ? Object.keys(value).length > 0 : true) &&
    (Array.isArray(value) ? value.filter((e) => isNotEmpty(e)).length > 0 : true) &&
    value !== '';

// Adapted after: https://stackoverflow.com/a/38340730
export const removeEmpty = <T extends Parameters<typeof Object.entries>[0]>(obj: T): Partial<T> =>
    Object.fromEntries(
        Object.entries(obj)
            .filter(([_, v]) => isNotEmpty(v))
            .map(([k, v]) => [
                k,
                isObject(v) ? removeEmpty(v as {}) : Array.isArray(v) ? v.filter((e) => isNotEmpty(e)) : v,
            ])
    ) as Partial<T>;

export const dnsLookup = promisify(dns.lookup);

export const awaitProcStart = (proc: ExecaChildProcess<string>, startMessage: string) => {
    return new Promise<true>((res) => {
        proc.stdout?.addListener('data', (chunk: string) => {
            if (chunk.includes(startMessage)) {
                proc.stdout?.removeAllListeners('data');
                res(true);
            }
        });
    });
};
export const killProcess = async (proc?: ExecaChildProcess) => {
    if (proc) {
        proc.kill();
        await timeout(proc, 5000).catch(() => proc.kill(9));
    }
};

export const jsonifyObjWithSets = (obj: unknown) =>
    JSON.stringify(obj, (_, v) => (v instanceof Set ? [...v].sort() : v), 4);
