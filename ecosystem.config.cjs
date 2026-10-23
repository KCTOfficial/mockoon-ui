module.exports = {
    apps: [
        {
            name: 'mockoon-ui',
            cwd: __dirname,
            // Jalankan server hasil build langsung (bukan lewat npm) supaya sinyal stop/restart diterima dengan benar
            script: 'dist/server/index.mjs',
            // Muat kredensial login dari .env / .env.local (env dari sistem tetap diutamakan)
            node_args: '--env-file-if-exists=.env --env-file-if-exists=.env.local',
            env: { NODE_ENV: 'production' },
            max_memory_restart: '512M',
        },
    ],
};
