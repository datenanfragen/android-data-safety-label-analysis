import { join } from 'path';
import fs from 'fs-extra';
import Papa from 'papaparse';
// @ts-ignore
import dirname from 'es-dirname';
import { db, pg } from './common/db';
import {
    hasPseudonymousData,
    indicators,
    requestHasIndicator,
    labelDataTypeMapping,
    getFilterList,
} from './common/query';
import { Request, processRequest } from './common/tracking-adapters';
import type { DataSafetyLabel } from 'parse-play';

const data_dir = join(dirname(), '../data');

/**
 * Maps from the app IDs to a map from tracker to a map from data type to whether the data is transmitted in conjunction
 * with a unique ID (i.e. pseudonymously) or without (i.e. anonymously).
 */
type AppTrackerData = Record<string, Record<string, Record<string, 'pseudonymously' | 'anonymously'>>>;

const dataTypeReplacers: Record<string, string> = {
    accelerometer_x: 'accelerometer',
    accelerometer_y: 'accelerometer',
    accelerometer_z: 'accelerometer',
    rotation_x: 'rotation',
    rotation_y: 'rotation',
    rotation_z: 'rotation',
    signal_strength_wifi: 'signal_strength',
    signal_strength_cellular: 'signal_strength',
    disk_total: 'disk_usage',
    disk_free: 'disk_usage',
    ram_total: 'ram_usage',
    ram_free: 'ram_usage',
    width: 'screen_size',
    height: 'screen_size',
    lat: 'location',
    long: 'location',
};

const computeAppTrackerData = async () => {
    const apps = await db.many<{ id: number; name: string; version: string }>('select * from apps;');
    const requests = await db.manyOrNone<Request>('select * from filtered_requests;');

    const appTrackerData = apps.reduce<AppTrackerData>((acc, cur) => ({ ...acc, [cur.name]: {} }), {});
    for (const r of requests) {
        const adapterData = processRequest(r);

        let dataTypes: string[];
        let tracker: string;

        // One of our adapters was able to process the request.
        if (adapterData) {
            dataTypes = Object.entries(adapterData)
                .filter(([key]) => key !== 'tracker')
                .flatMap(([_, d]) => Object.keys(d))
                .map((t) => dataTypeReplacers[t] || t);
            tracker = adapterData.tracker.name;
        }
        // None of our adapters could process the request, so we do indicator matching.
        else {
            dataTypes = Object.entries({ ...indicators, app_id: [r.name] })
                .filter(([_, strings]) => requestHasIndicator(r, strings))
                .map(([name]) => name);
            tracker = '<indicators>';
        }

        const isPseudonymous = hasPseudonymousData(dataTypes);
        if (!appTrackerData[r.name][tracker]) appTrackerData[r.name][tracker] = {};
        for (const data_type of dataTypes)
            appTrackerData[r.name][tracker][data_type] = isPseudonymous
                ? 'pseudonymously'
                : appTrackerData[r.name][tracker][data_type] || 'anonymously';
    }

    return appTrackerData;
};

type TransmissionType = 'no' | 'anonymously' | 'pseudonymously';
type DeclarationType = 'correctly_declared' | 'correctly_undeclared' | 'wrongly_undeclared' | 'unnecessarily_declared';
type DataTypeInstances = {
    data_type: string;
    our_data_types: Set<string>;
    transmitted: TransmissionType;
    declared: DeclarationType;
}[];
type PurposeInstance = { tracking_used: boolean; tracking_declared: boolean; ads_used: boolean; ads_declared: boolean };
const computeLabelData = async (appTrackerData: AppTrackerData) => {
    const labels = await db.many<DataSafetyLabel & { date: string }>('select * from labels;');
    const adsFilterList = await getFilterList('easylist');
    const trackingFilterList = await getFilterList('easyprivacy');

    const dataTypeInstances: Record<string, DataTypeInstances> = {};
    const purposeInstances: Record<string, PurposeInstance> = {};
    for (const app of labels) {
        // We don't distinguish between collected and shared data.
        const declared = [...(app.data_collected || []), ...(app.data_shared || [])].reduce(
            (acc, cur) => {
                for (const purpose of cur.purposes) acc.purposes.add(purpose);
                acc.dataTypes.add(
                    // Since the adapters can't distinguish between precise and approximate location, we can't do that
                    // here, either.
                    ['Precise location', 'Approximate location'].includes(cur.type) ? 'Location' : cur.type
                );
                return acc;
            },
            { purposes: new Set<string>(), dataTypes: new Set<string>() }
        );

        const transmittedDataPerTracker = appTrackerData[app.app_id];
        if (!transmittedDataPerTracker) continue;
        for (const [labelType, ourTypes] of Object.entries(labelDataTypeMapping)) {
            const { transmitted, matchedTypes } = Object.values(transmittedDataPerTracker).reduce(
                (acc, transmittedData) => {
                    const transmittedTypes = Object.keys(transmittedData);
                    const matchedTypes = ourTypes.filter((ourType) => transmittedTypes.includes(ourType));

                    const trackerReceivedDataInLabel = matchedTypes.length > 0;
                    const trackerReceivedId = hasPseudonymousData(transmittedTypes);

                    for (const types of matchedTypes) acc.matchedTypes.add(types);

                    if (trackerReceivedDataInLabel && trackerReceivedId) acc.transmitted = 'pseudonymously';
                    else if (trackerReceivedDataInLabel && !trackerReceivedId)
                        acc.transmitted = acc.transmitted === 'pseudonymously' ? 'pseudonymously' : 'anonymously';

                    return acc;
                },
                { transmitted: 'no' as TransmissionType, matchedTypes: new Set<string>() }
            );

            const isDeclared = declared.dataTypes.has(labelType);

            const declarationType: DeclarationType =
                transmitted === 'no'
                    ? isDeclared
                        ? 'unnecessarily_declared'
                        : 'correctly_undeclared'
                    : isDeclared
                    ? 'correctly_declared'
                    : 'wrongly_undeclared';

            if (!dataTypeInstances[app.app_id]) dataTypeInstances[app.app_id] = [];
            dataTypeInstances[app.app_id].push({
                data_type: labelType,
                our_data_types: matchedTypes,
                transmitted,
                declared: declarationType,
            });
        }

        const requests = await db.manyOrNone<{ host: string; endpoint_url: string }>(
            'select host, endpoint_url from filtered_requests where name = ${appId};',
            { appId: app.app_id }
        );
        purposeInstances[app.app_id] = {
            tracking_used: requests.some((r) => trackingFilterList.includes(r.host)),
            tracking_declared:
                declared.purposes.has('Analytics') ||
                // We are very generous towards the apps here!
                declared.purposes.has('Fraud prevention, security, and compliance') ||
                declared.purposes.has('Personalization'),
            ads_used: requests.some((r) => adsFilterList.includes(r.host)),
            ads_declared: declared.purposes.has('Advertising or marketing'),
        };
    }

    const dataTypeInstancesCsv = Object.entries(dataTypeInstances).flatMap(([app, data]) =>
        data.map((entry) => ({ app, data_type: entry.data_type, declared: entry.declared }))
    );
    await fs.writeFile(join(data_dir, 'data_type_truthfulness.csv'), Papa.unparse(dataTypeInstancesCsv));

    const purposesInstancesCsv = Object.entries(purposeInstances).flatMap(([app, data]) =>
        (['tracking', 'ads'] as const).map((type) => ({
            app,
            purpose: type,
            declared:
                !data[`${type}_used`] && !data[`${type}_declared`]
                    ? 'correctly_undeclared'
                    : !data[`${type}_used`] && data[`${type}_declared`]
                    ? 'unnecessarily_declared'
                    : data[`${type}_used`] && data[`${type}_declared`]
                    ? 'correctly_declared'
                    : 'wrongly_undeclared',
        }))
    );
    await fs.writeFile(join(data_dir, `purpose_truthfulness.csv`), Papa.unparse(purposesInstancesCsv));
};

(async () => {
    const appTrackerData = await computeAppTrackerData();
    await computeLabelData(appTrackerData);

    pg.end();
})();

process.on('unhandledRejection', (err) => {
    console.error('An unhandled promise rejection occurred:', err);
    pg.end();
    process.exit(1);
});
