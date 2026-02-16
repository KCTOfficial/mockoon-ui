# Project Debug Rules (Non-Obvious Only)

- PM2 process names are derived from environment filename (without `.json` extension) - check PM2 logs using `pm2 logs <name>`
- Mockoon server errors are emitted via `server.on('error')` in [`scripts/server.js`](scripts/server.js) - PORT_ALREADY_USED causes immediate exit
- Log streaming uses EventSource at `/api/logs/stream` - connection drops require reconnection handling
- Transaction logs are JSON-stringified single lines in [`scripts/server.js`](scripts/server.js:27) - parse with `JSON.parse()`
- **`mockoon/` directory is not part of this project** - it's upstream source for reference only, do not modify