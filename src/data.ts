import { join } from 'path';
import { writeFile } from 'fs/promises';
import Papa from 'papaparse';
import dirname from 'es-dirname';
import { omit } from 'filter-anything';
import { DataSafetyLabel, TopChartsEntry } from 'parse-play';
import { db, pg } from './common/db';

const date = process.argv[2];
if (!date) throw new Error('You need to provide the date as the only argument.');

const dataDir = join(dirname(), '..', 'data');

(async () => {
    const labels = await db.many<
        Pick<DataSafetyLabel, 'name' | 'app_id' | 'data_shared' | 'data_collected' | 'security_practices'> &
            Pick<TopChartsEntry, 'price' | 'category' | 'rating' | 'downloads'> & { date: string }
    >(
        'select name, labels.app_id, price, category, rating, downloads, data_shared, data_collected, security_practices from labels join (select distinct on (app_id) * from top_charts) tc on tc.app_id = labels.app_id where labels.date=${date};',
        { date }
    );

    const declaredData = labels.flatMap((l) =>
        (['data_shared', 'data_collected'] as const).flatMap(
            (type) =>
                l[type]?.flatMap((d) =>
                    d.purposes.flatMap((p) => ({
                        name: l.name,
                        app_id: l.app_id,
                        price: l.price,
                        paid: l.price !== '€0.00',
                        genre: l.category,
                        rating: l.rating,
                        downloads: l.downloads,
                        downloads_lower: +l.downloads.replace(/[^\d]/g, ''),
                        type,
                        category: d.category,
                        data_type: d.type,
                        purpose: p,
                    }))
                ) || []
        )
    );
    await writeFile(join(dataDir, 'declared_data.csv'), Papa.unparse(declaredData));

    for (const groupByPurpose of [true, false]) {
        for (const attribute of ['data_type', 'category', 'purpose'] as const) {
            if (groupByPurpose && attribute === 'purpose') continue;

            const declaredDataCounts = declaredData.reduce<
                Record<
                    string,
                    {
                        type: string;
                        data_type?: string;
                        category?: string;
                        purpose?: string;
                        app_ids: Set<string>;
                    }
                >
            >((acc, cur) => {
                const key = `${cur.type}::${cur[attribute]}${groupByPurpose ? `::${cur.purpose}` : ''}`;
                if (!acc[key])
                    acc[key] = {
                        type: cur.type,
                        [attribute]: cur[attribute],
                        ...(groupByPurpose ? { purpose: cur.purpose } : {}),
                        app_ids: new Set(),
                    };
                acc[key].app_ids.add(cur.app_id);
                return acc;
            }, {});
            await writeFile(
                join(dataDir, `declared_${attribute}${groupByPurpose ? '_purpose' : ''}_counts.csv`),
                Papa.unparse(
                    Object.values(declaredDataCounts).map((r) => ({ ...omit(r, ['app_ids']), count: r.app_ids.size }))
                )
            );
        }
    }

    const securityPractices = labels
        .filter((l) => l.security_practices)
        .map((l) => ({
            name: l.name,
            app_id: l.app_id,
            price: l.price,
            paid: l.price !== '€0.00',
            genre: l.category,
            rating: l.rating,
            downloads: l.downloads,
            downloads_lower: +l.downloads.replace(/[^\d]/g, ''),
            data_encrypted_in_transit: l.security_practices?.data_encrypted_in_transit,
            can_request_data_deletion: l.security_practices?.can_request_data_deletion,
            committed_to_play_families_policy: l.security_practices?.committed_to_play_families_policy,
            independent_security_review: l.security_practices?.independent_security_review,
        }));
    await writeFile(join(dataDir, 'security_practices.csv'), Papa.unparse(securityPractices));

    pg.end();
})();

process.on('unhandledRejection', (err) => {
    console.error('An unhandled promise rejection occurred:', err);
    pg.end();
    process.exit(1);
});
