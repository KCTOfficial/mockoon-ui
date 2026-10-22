const { MockoonServer } = require('@mockoon/commons-server');
const { EnvironmentSchema, HighestMigrationId, Migrations, repairRefs } = require('@mockoon/commons');
const fs = require('fs');
const path = require('path');

const dataFile = process.argv[2];

if (!dataFile) {
    console.error('Usage: node server.js <data-file>');
    process.exit(1);
}

// Same preparation as the Mockoon CLI (see server/lib/normalize-env.ts): migrate, fill schema
// defaults such as tlsOptions, repair refs. Files missing those fields would otherwise crash on start.
function normalizeEnvironment(environment) {
    if (environment.lastMigration > HighestMigrationId) {
        throw new Error('Environment was saved by a newer Mockoon version; update @mockoon/commons');
    }
    try {
        Migrations.forEach((migration) => {
            if (migration.id > environment.lastMigration) {
                migration.migrationFunction(environment);
            }
        });
    } catch {
        environment.lastMigration = HighestMigrationId;
    }
    const validated = EnvironmentSchema.validate(environment).value;
    if (!validated) {
        throw new Error('Invalid Mockoon environment');
    }
    return repairRefs(validated);
}

/**
 * Hot reload: when the UI saves the environment file, apply its routes, responses, data buckets and
 * headers to the running server without a restart. Port, hostname and TLS still need a restart.
 * Watches the directory (not the file) so it keeps working if the file is replaced instead of rewritten.
 */
function watchForChanges(server, filePath, initial, initialContent) {
    const listen = (env) => JSON.stringify([env.port, env.hostname, env.tlsOptions]);
    const initialListen = listen(initial);
    // Compare against what was loaded at start, so saves made during the (slow) startup are not missed
    let lastContent = initialContent;
    let timer = null;

    const reload = () => {
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            return; // file briefly missing while being replaced; the next event retries
        }
        if (content === lastContent) return;

        let updated;
        try {
            updated = normalizeEnvironment(JSON.parse(content));
        } catch (error) {
            // Usually a partially written file; keep serving the previous version
            console.error(`Reload skipped: ${error.message}`);
            return;
        }

        lastContent = content;
        server.updateEnvironment(updated);
        console.log(`Mockoon environment "${updated.name}" reloaded (${updated.routes.length} routes)`);
        if (listen(updated) !== initialListen) {
            console.log('Port, hostname or TLS settings changed: restart this server to apply them');
        }
    };

    fs.watch(path.dirname(filePath), (_event, changed) => {
        if (changed && changed !== path.basename(filePath)) return;
        // Debounce: one save can emit several events
        clearTimeout(timer);
        timer = setTimeout(reload, 300);
    });

    // Pick up anything saved while the server was starting
    reload();
}

try {
    const absolutePath = path.resolve(process.cwd(), dataFile);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const environment = normalizeEnvironment(JSON.parse(content));

    const server = new MockoonServer(environment, {
        environmentDirectory: path.dirname(absolutePath),
    });

    server.on('started', () => {
        console.log(`Mockoon environment "${environment.name}" started on port ${environment.port}`);
        watchForChanges(server, absolutePath, environment, content);
    });

    server.on('transaction-complete', (transaction) => {
        // Log the full transaction object as a single JSON line
        console.log(JSON.stringify(transaction));
    });

    server.on('error', (errorCode, originalError) => {
        console.error(`Mockoon error ${errorCode}: ${originalError?.message}`);
        // Exit if port is already used, etc.
        if (errorCode === 'PORT_ALREADY_USED') {
            process.exit(1);
        }
    });

    server.on('stopped', () => {
        console.log('Mockoon environment stopped');
    });

    server.start();

    // Clean exit handling
    process.on('SIGINT', () => {
        server.stop();
        process.exit(0);
    });
} catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
