import { fetchTopCharts, categories, fetchDataSafetyLabels } from 'parse-play';
import chunkify from '@sindresorhus/chunkify';
import { delay } from './common/util.js';
import { db, pg } from './common/db.js';

const country = 'DE';
const language = 'EN';
const date = new Date().toISOString().substring(0, 10);

(async () => {
    if ((await db.one('select count(1) from top_charts where date=${date};', { date })).count < 1) {
        // See: https://stackoverflow.com/a/37302557
        const chartCs = new pg.helpers.ColumnSet(
            ['chart', 'date', 'position', 'app_id', 'rating', 'category', 'price', 'downloads'],
            { table: 'top_charts' }
        );

        for (const chart of ['topselling_free', 'topselling_paid', 'topgrossing'] as const) {
            const requests = (Object.keys(categories) as (keyof typeof categories)[]).map((category) => ({
                category,
                chart,
                count: 1000,
            }));

            const data = await fetchTopCharts(requests, { country, language });
            for (const [idx, apps] of data.entries()) {
                if (!apps) continue;

                const insertQuery = pg.helpers.insert(
                    apps.map((app) => ({
                        chart: `${chart}::${requests[idx].category}`,
                        date,
                        position: app.position,
                        app_id: app.app_id,
                        rating: app.rating,
                        category: app.category,
                        price: app.price,
                        downloads: app.downloads,
                    })),
                    chartCs
                );
                await db.none(insertQuery);
            }
            await delay(1000);
        }
    }

    const apps = (
        await db.many(
            'select distinct app_id from top_charts where date=${date} and not exists (select 1 from labels where labels.app_id=top_charts.app_id and labels.date=${date});',
            { date }
        )
    ).map((r) => r.app_id);
    const labelCs = new pg.helpers.ColumnSet(
        [
            'app_id',
            'date',
            'name',
            'developer',
            'icon_url',
            'privacy_policy_url',
            'data_shared',
            'data_collected',
            'security_practices',
        ],
        { table: 'labels' }
    );

    for (const chunk of [...chunkify(apps, 250)]) {
        const requests = chunk.map((app_id) => ({ app_id }));

        const data = await fetchDataSafetyLabels(requests, { language });
        const insertQuery = pg.helpers.insert(
            data.map((d) => ({
                ...d,
                date,
                data_shared: JSON.stringify(d?.data_shared),
                data_collected: JSON.stringify(d?.data_collected),
                security_practices: JSON.stringify(d?.security_practices),
            })),
            labelCs
        );
        await db.none(insertQuery);
        await delay(500);
    }

    pg.end();
})();

process.on('unhandledRejection', (err) => {
    console.error('An unhandled promise rejection occurred:', err);
    pg.end();
    process.exit(1);
});
