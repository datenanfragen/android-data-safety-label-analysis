import { promisify } from 'util';
import dns from 'dns';
import type { ExecaChildProcess } from 'execa';
import { timeout } from 'promise-timeout';

export const shuffle = <T>(arr: T[]) => arr.sort(() => Math.random() - 0.5);
// Taken from: https://stackoverflow.com/a/65556422
export const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
export const delay = (ms: number) => new Promise((res) => setTimeout(res, random(ms - ms / 10, ms + ms / 10)));

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
