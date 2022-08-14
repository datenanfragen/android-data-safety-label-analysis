import { join } from 'path';
import { readFile } from 'fs/promises';
// @ts-ignore
import dirname from 'es-dirname';
import { base64Regex } from 'base64-search';
import type { Request } from './tracking-adapters';

const dataDir = join(dirname(), '../../data');

export const indicators = {
    contacts: ['JGKfozntbF', 'TBFFZbBYea', '57543434', 'RYnlSPbEYh', 'q8phlLSJgq', 'N2AsWEMI5D', 'p0GdKDTbYV'],
    location: ['52.23', '10.56', '37.42', '-122.08'],
    messages: ['9FBqD2CNIJ', '75734343'],
    clipboard: ['LDDsvPqQdT'],
    ssid: ['AndroidWifi'],
    device_name: ['R2Gl5OLv20'],
    os: ['Android 11'],
    model: ['sdk_gphone_x86_64_arm64'],

    serial_number: ['EMULATOR31X3X10X0'],
    mac_address: [
        // WiFi
        '02:15:b2:00:00:00',
        // Bluetooth
        '3c:5a:b4:01:02:03',
    ],
    imei: ['358240051111110'],
    idfa: ['fffe8a97-a504-4d14-89ab-c2025fbaf065'],
    hashed_idfa: [
        '53cc56dda0de1669b2580c9edd233409',
        '89b9f59fa603517ff38588230e38a32158780471',
        '127d2bc3da85674e9b79c27952a9c3be89de6c682caa3b0e675131f8916ba1cc',
        'd9bc26584ab3a450f06bf909e97070917bb08349ac836abbba4279b8cc140f60c7006ff6eb70c8fc037620d5e79f9a92',
        '260f5af4706b905b0c60b4ae6925e9e9a7a849b7a595e95e228d1dd9a1c9290a1d7e287f760013791cf22e7ec85d82da711985f9395cad64ab02893e8ce7430a',
    ],
    local_ips: [
        '10.0.0.68',
        '10.0.2.16',
        'fe80::4e55:e70e:eced:4607',
        '2001:2::5ede:5895:3080:2caa',
        '2001:2::5d08:c1f8:cc42:b520',
    ],
};

export const requestHasIndicator = (r: Request, indicators: string[]) => {
    const plainIndicators = indicators.map((i) => i.toLowerCase());
    const base64Indicators = plainIndicators.map((i) => new RegExp(base64Regex(i), 'i'));
    for (const property of ['content', 'content_raw', 'path'] as const) {
        if (indicators.some((i) => r[property]?.toString().toLowerCase().includes(i))) return true;
        if (base64Indicators.some((i) => i.test(r[property]?.toString() || ''))) return true;
    }
    return false;
};

export const hasPseudonymousData = (dataTypes: Set<string> | string[]) =>
    ['idfa', 'idfv', 'hashed_idfa', 'other_uuids', 'public_ip'].some((type) =>
        Array.isArray(dataTypes) ? dataTypes.includes(type) : dataTypes.has(type)
    );

// Maps from Google's label data types
// (https://support.google.com/googleplay/android-developer/answer/10787469#zippy=%2Cdata-types) to our data types.
export const labelDataTypeMapping = {
    Location: ['lat', 'long', 'location'],
    'SMS or MMS': ['messages'],
    Contacts: ['contacts'],
    // 'App interactions': ['viewed_page', 'in_foreground'],
    // 'Other user-generated content': ['clipboard'],
    Diagnostics: [
        'rooted',
        'emulator',
        'roaming',
        'network_connection_type',
        'signal_strength_cellular',
        'signal_strength_wifi',
        'is_charging',
        'battery_percentage',
        'accelerometer_x',
        'accelerometer_y',
        'accelerometer_z',
        'rotation_x',
        'rotation_y',
        'rotation_z',
        'ram_total',
        'ram_free',
        'disk_total',
        'disk_free',
        'uptime',
        'volume',
    ],
    'Other app performance data': ['device_name', 'carrier', 'local_ips', 'bssid'],
    'Device or other IDs': ['idfa', 'hashed_idfa', 'other_uuids', 'imei', 'mac_address', 'public_ip'],
};

export const getFilterList = (list: 'easylist' | 'easyprivacy') =>
    readFile(join(dataDir, 'upstream', `${list}.txt`), 'utf-8').then((f) =>
        f.split('\n').filter((l) => !l.startsWith('#'))
    );
