const { MockoonServer } = require('@mockoon/commons-server');
const fs = require('fs');
const path = require('path');

const dataFile = process.argv[2];

if (!dataFile) {
    console.error('Usage: node server.js <data-file>');
    process.exit(1);
}

try {
    const absolutePath = path.resolve(process.cwd(), dataFile);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const environment = JSON.parse(content);

    const server = new MockoonServer(environment, {
        environmentDirectory: path.dirname(absolutePath),
    });

    server.on('started', () => {
        console.log(`Mockoon environment "${environment.name}" started on port ${environment.port}`);
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
