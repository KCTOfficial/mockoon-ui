# Mockoon CLI UI

<p align="center">
  <img src="images/logo.png" alt="Mockoon CLI UI Logo" width="200" />
</p>

<p align="center">
  A modern web-based UI for managing Mockoon mock API environments. Built with React 19, Vite, Hono, and Tailwind CSS.
</p>

<p align="center">
  This repository is forked from <a href="https://github.com/oniharnantyo/mockoon-ui">oniharnantyo/mockoon-ui</a>.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#first-run-setup">First-Run Setup</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#api-reference">API Reference</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2.3-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## Features

- **Account Management** - Change the username and password from the UI, or run the setup again; a forgotten password can be reset from `.env`
- **Data Buckets** - Create and manage reusable data buckets for your mocks
- **Delete Confirmations** - Environments, routes, responses and data buckets are only deleted after confirming in a dialog
- **Docker Ready** - Includes Dockerfile and docker-compose for containerized deployment
- **Environment Export** - Download any environment as a Mockoon environment file, ready to import again or open in Mockoon
- **Environment Management** - Create, edit, and manage multiple mock API environments
- **Firewall Hints** - The setup shows the exact commands to open the ports for ufw, firewalld or Windows Firewall
- **First-Run Setup** - A setup page on first start sets the login, the UI port and the mock server port range; no `.env` needed
- **GitHub-style UI** - Follows GitHub's Primer design system (colors, buttons, tabs) with a collapsible, resizable sidebar
- **Light & Dark Themes** - Follows the system theme, or pick light/dark manually
- **Login Authentication** - Protects the dashboard with username/password sign-in (password stored as a scrypt hash) and session-based access control
- **Mockoon Powered** - Built on top of [Mockoon](https://mockoon.com/) for reliable API mocking
- **OpenAPI Import** - Import OpenAPI/Swagger specifications to auto-generate mock environments
- **Port Range & Port Picker** - Mock servers only use ports from an allowed range, each port at most once; ports are picked from a list showing which are taken
- **Real-time Logs** - Server-Sent Events (SSE) powered live log streaming
- **Route Configuration** - Full support for HTTP methods, headers, responses, and callbacks
- **Server Status at a Glance** - The sidebar shows for every environment whether its mock server is running, starting, crashed or stopped

## Screenshots

### Login

![Login](images/screenshot-login.png)

### Dashboard - Route Editor

![Dashboard](images/screenshot-dashboard.png)

### Create New Environment

![Create Environment](images/screenshot-create-environment.png)

### Data Buckets Management

![Data Buckets](images/screenshot-data-buckets.png)

### Environment Settings

![Settings](images/screenshot-settings.png)

## Prerequisites

- [mockoon-cli](https://www.npmjs.com/package/@mockoon/cli) (installed as dependency)
- [Node.js](https://nodejs.org/) >= 22.9 (uses `--env-file-if-exists`) and [Yarn](https://classic.yarnpkg.com/) 1.x
- PM2 (installed as dependency)

## Installation

### Clone the repository

```bash
git clone https://github.com/yourusername/mockoon-cli-ui.git
cd mockoon-cli-ui
```

### Install dependencies

```bash
yarn install
```

### Start the development server

```bash
yarn dev
```

Open [http://localhost:7001](http://localhost:7001) with your browser to access the UI. The dev command runs the Vite dev server and the API server (port 7099, proxied under `/api`) together.

On first run the UI opens the [setup page](#first-run-setup). In development the API port is fixed by the dev script (`--port 7099`, Vite serves the UI on 7001), so the setup shows the UI port as locked and only asks for the login and the mock server port range.

### Production

```bash
yarn build
yarn start           # UI + API on the setup port, 7001 by default (PORT or --port override it)
```

With PM2 (recommended for servers):

```bash
yarn build
pm2 start ecosystem.config.cjs
pm2 logs mockoon-ui  # startup messages, e.g. "First-run setup required"
```

### Upgrading an existing installation

- **`ecosystem.config.cjs` no longer passes `--port 7001`**, so the port chosen in the setup is used. `pm2 restart` keeps the old arguments, so reload the app once: `pm2 delete mockoon-ui && pm2 start ecosystem.config.cjs`
- **`.env` is now optional.** If it still sets `MOCKOON_UI_USERNAME` / `MOCKOON_UI_PASSWORD`, those keep working and win over the setup (the setup then only asks for the ports). Comment them out to manage the login from the UI instead
- **Existing environments keep their ports.** Starting one whose port is outside the new range or shared with another environment is refused with a message; pick a new port in its **Settings**
- **`data/` is no longer committed** except the `demo-*.json` samples (see `.gitignore`), so your own environments stay local

## First-Run Setup

The first time the UI starts (no `config/settings.json` yet) it opens a setup page instead of the login. The server log prints `First-run setup required` until it is done.

The page has two columns:

| Section    | Field                  | Notes                                                                                                                                                 |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Access** | Username               | 1-64 characters                                                                                                                                       |
|            | Password / Confirm     | At least 8 characters. The eye icon shows or hides the value; a mismatch is flagged while typing and blocks saving. Hidden when `.env` sets the login |
| **Ports**  | Mockoon UI port        | Port of this dashboard (default 7001). Locked when `PORT` or `--port` is set                                                                          |
|            | Mock server port range | Ports mock servers may use, e.g. `7002`-`7020`. Must not include the UI port. Locked when `MOCKOON_PORT_RANGE` is set                                 |
|            | Firewall               | Commands to open the UI port and the range, each with a copy button (see [Firewall](#firewall)). Only shown, never run                                |

After **Save and continue**:

- The answers are saved in `config/settings.json`: the password as a salted scrypt hash and a random secret for session cookies. The file is written with owner-only permissions and is ignored by Git and Docker builds
- You are signed in right away
- If the UI port changed, the server starts listening on the new port, closes the old one and the browser follows to the new address. No restart is needed
- The setup page is locked (`409`) until the setup is reset

> **Security:** until the setup is completed, anyone who can reach the UI can fill it in and choose the admin password. Complete it right after the first start, before opening the UI port to other machines.

### Configuration priority

Values in `.env` (or the process environment) always win over the setup, which is how a forgotten password is reset:

| Setting           | Taken from (first match)                                      |
| ----------------- | ------------------------------------------------------------- |
| Login             | `MOCKOON_UI_USERNAME` + `MOCKOON_UI_PASSWORD` → setup         |
| Session secret    | `MOCKOON_UI_AUTH_SECRET` → setup (generated)                  |
| UI port           | `--port` → `PORT` → setup → `7001`                            |
| Mock port range   | `MOCKOON_PORT_RANGE` → setup → any port (1-65535)             |
| Firewall commands | `MOCKOON_FIREWALL` → detected from the OS (`windows` / `ufw`) |

## Usage

### Account & Login

Open **Account** with the person icon in the header (next to **Sign out**).

**Change username or password**

1. Edit **Username** and/or type a **New password** with its confirmation (leave the new password empty to keep the current one)
2. Enter your **Current password** and click **Save login**
3. A new password signs out every other browser; this one stays signed in

The form is read-only while `.env` sets the login.

**Forgot the password?**

1. Set `MOCKOON_UI_USERNAME` and `MOCKOON_UI_PASSWORD` in `.env` on the server
2. Restart the UI and sign in with them
3. To go back to the login from the setup, remove both lines and restart (or keep them; `.env` simply wins)

**Run the setup again**

1. In **Account**, in the red box, click **Run setup again…**
2. Type your username and password to confirm, then click **Reset and run setup**
3. `config/settings.json` is deleted, everyone is signed out and the [setup page](#first-run-setup) opens, prefilled with the port the UI is running on

Environments and running mock servers are not touched. As with the first run, complete the setup right away. Deleting `config/settings.json` and restarting does the same from the server.

### Creating an Environment

1. Click **New environment** at the bottom of the sidebar
2. Enter the environment name and pick the port from the list (the next free port is preselected)
3. Add routes, responses, and data buckets as needed

### Mock Server Ports

Two mock servers cannot listen on the same port: the second one fails to start and requests reach the first one (typically answering `404` for routes of the other environment). Mockoon UI therefore enforces:

- **One port per environment.** Creating, importing, editing or starting an environment with a port already used by another environment is refused
- **Ports from the allowed range only** (setup, or `MOCKOON_PORT_RANGE` such as `7002-7020`). Without a range any port is accepted, but still only once
- **Never the UI port**

**Port picker.** In **New environment** and in an environment's **Settings → Port**, the port is chosen from a list of every port in the range:

- free ports can be selected; the next free one is preselected for new environments
- taken ports are shown but disabled, with their owner, e.g. `7003 (used by Demo Auth API)` or `7001 (used by Mockoon UI)`
- an older environment whose port is outside the range shows it as `(outside 7002-7020, pick another)`
- in **Settings** the new port is saved as soon as it is picked; restart the mock server to apply it
- without a range (or with a range larger than 1000 ports) the picker falls back to a number field

**Imports** keep the port from the file when it is free and inside the range; otherwise they get the next free port automatically. If the range is full, the import is refused.

#### Firewall

Open the UI port and the mock range once on the server. The setup page shows the matching commands for the firewall set in `MOCKOON_FIREWALL`: `ufw`, `firewalld`, `windows`, or `none` to hide them. When unset it follows the OS (Windows Firewall on Windows, `ufw` on Linux). Mockoon UI never changes the firewall itself, so it does not need root or administrator rights.

```bash
# ufw
sudo ufw allow 7001/tcp
sudo ufw allow 7002:7020/tcp

# firewalld
sudo firewall-cmd --permanent --add-port=7001/tcp --add-port=7002-7020/tcp
sudo firewall-cmd --reload

# Windows (PowerShell as Administrator)
New-NetFirewallRule -DisplayName "Mockoon UI" -Direction Inbound -Protocol TCP -LocalPort 7001 -Action Allow
New-NetFirewallRule -DisplayName "Mockoon mock servers" -Direction Inbound -Protocol TCP -LocalPort 7002-7020 -Action Allow
```

A port that is allowed in the firewall but has no mock server running simply refuses connections, so opening the whole range once is safe. Restart the UI after changing `MOCKOON_PORT_RANGE` or `MOCKOON_FIREWALL`.

### Importing Environments

- **JSON** (sidebar) - upload an existing Mockoon environment file (`.json`)
- **OpenAPI** (sidebar) - upload an OpenAPI/Swagger specification (`.json`, `.yaml`, `.yml`); routes are generated automatically

### Exporting an Environment

1. Hover an environment in the sidebar
2. Click the download icon (next to the trash icon)
3. The browser saves `<name>.json`

The download is the environment file exactly as stored in `data/`, including every edit made in the UI, in the Mockoon environment format. It can be imported again here (**JSON** button) or opened in Mockoon desktop/CLI.

Exporting right after importing returns the uploaded file unchanged, except:

- `uuid`: every import gets a new one, so the same file can be imported twice without conflicts
- `port`: only if the import had to move it into the allowed range or away from a taken port

### Managing Mock Servers

- Use **Start** / **Stop** / **Restart** in the header to control the selected environment's mock server (run by PM2)
- The **Running** / **Stopped** label next to the environment name shows its status
- Starting is refused with a clear message when the port is outside the range or used by another environment
- Open **Request logs** at the bottom to see incoming requests in real time

**Status in the sidebar.** Every environment's avatar has a status dot, so all mock servers are visible at once (also when the sidebar is collapsed; hover for the label):

| Dot    | Status   | Meaning                                             |
| ------ | -------- | --------------------------------------------------- |
| Green  | Running  | The mock server is online                           |
| Yellow | Starting | PM2 is starting or restarting it                    |
| Red    | Error    | It crashed, e.g. because its port is already in use |
| Grey   | Stopped  | Stopped, or never started                           |

The status refreshes every 10 seconds and immediately after **Start** / **Stop**.

### Deleting

Every delete asks for confirmation in a dialog (**Cancel** or clicking outside closes it without deleting):

| What        | Where                                                             | The dialog shows                                                        |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Environment | Trash icon on hover in the sidebar, or **Settings → Danger Zone** | Its port and where the file goes                                        |
| Route       | Trash icon on hover in the route list                             | Method, path and number of responses, e.g. `GET /users` and 2 responses |
| Response    | Trash icon next to the response tabs                              | The response label                                                      |
| Data bucket | × on hover in the data bucket list                                | The bucket name and the `{{data 'id'}}` reference that will break       |

Deleting an environment stops its mock server and removes it from PM2; the file is moved to `data/.deleted/` and can be restored by moving it back into `data/`. Routes, responses and data buckets are removed from the file and cannot be restored.

### Sidebar

- Click the sidebar icon at the top of the sidebar to collapse it to environment initials (hover for the full name and status) or expand it again
- **Resize** by dragging its right edge: right to widen, left to narrow, between **200 px** and **480 px** (default 256 px). Double-click the edge to reset
- With the keyboard: **Tab** to the edge, then **←** / **→** (hold **Shift** for bigger steps), **Home** for the minimum, **End** for the maximum
- Hover an environment for its **export** and **delete** buttons
- The width and the collapsed/expanded state are remembered per browser

### Theme

- The theme toggle in the header cycles through **system → light → dark**

## Development

### Available Scripts

| Command              | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `yarn dev`           | Start Vite dev server + API server                      |
| `yarn build`         | Build client (`dist/client`) and server (`dist/server`) |
| `yarn start`         | Start production server                                 |
| `yarn lint`          | Run ESLint                                              |
| `yarn test`          | Run tests                                               |
| `yarn test:watch`    | Run tests in watch mode                                 |
| `yarn test:coverage` | Run tests with coverage report                          |

### Project Structure

```
mockoon-cli-ui/
├── index.html             # Vite HTML entry
├── src/                   # Client entry (main.tsx, App.tsx) and global styles
├── server/                # Hono API server (Node)
│   ├── index.ts           # App wiring, auth, static serving, UI port switching
│   ├── auth.ts            # Login/logout/session + guard
│   ├── setup.ts           # First-run setup
│   ├── account.ts         # Change login, run setup again
│   ├── lib/
│   │   ├── settings.ts    # config/settings.json, password hashing, .env overrides
│   │   └── port-range.ts  # Allowed range and port conflict checks
│   └── api/               # API handlers
│       ├── action.ts      # PM2 process control
│       ├── environments/  # CRUD operations, import/export, ports
│       └── logs*.ts       # Logs and log streaming (SSE)
├── components/            # React components
│   ├── Dashboard.tsx      # Main application component
│   ├── RouteEditor.tsx    # Route configuration editor
│   ├── RouteList.tsx      # Route listing component
│   ├── Sidebar.tsx        # Environment sidebar
│   ├── LogPanel.tsx       # Real-time log viewer
│   ├── SetupPage.tsx      # First-run setup page
│   ├── AccountButton.tsx  # Account dialog
│   ├── shared/            # PortSelect, PasswordInput, ConfirmDialog, ...
│   └── ...
├── config/                # settings.json from the setup (not committed)
├── data/                  # Environment JSON files (only demo-* are committed)
├── lib/                   # Utility libraries
├── scripts/               # Server scripts
├── types/                 # TypeScript definitions
├── public/                # Favicons and web manifest
└── images/                # Static images
```

### Key Technologies

- **[Vite](https://vite.dev/)** - Dev server and client build
- **[Hono](https://hono.dev/)** - API server on Node.js
- **[Primer Octicons](https://primer.style/octicons/)** - GitHub icon set
- **[React 19](https://react.dev/)** - UI library
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - Code editor for responses
- **[Mockoon](https://mockoon.com/)** - API mocking engine
- **[PM2](https://pm2.keymetrics.io/)** - Process manager for mock servers

## API Reference

All endpoints except `/api/auth/*` and `/api/setup` require a valid session cookie (`401 Unauthorized` otherwise). State-changing requests from another origin are rejected with `403`.

### Auth Endpoints

| Method | Endpoint            | Description                                                                       |
| ------ | ------------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/api/auth/session` | Whether the session is valid, login is configured and the setup is still required |
| `POST` | `/api/auth/login`   | Sign in with `{ username, password }` (sets an httpOnly session cookie)           |
| `POST` | `/api/auth/logout`  | Sign out                                                                          |

### Setup & Account Endpoints

| Method | Endpoint             | Description                                                                                                                        |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/setup`         | What the setup needs (`needsCredentials`, UI port, port range, which fields are locked, firewall); `{ required: false }` when done |
| `POST` | `/api/setup`         | Save the setup (`{ username, password, uiPort, mockPortMin, mockPortMax }`) and sign in; `409` once done                           |
| `GET`  | `/api/account`       | Current username and whether `.env` sets the login                                                                                 |
| `POST` | `/api/account`       | Change the login (`{ currentPassword, username, newPassword? }`); `409` while `.env` sets it                                       |
| `POST` | `/api/account/reset` | Run the setup again (`{ username, password }`): deletes `config/settings.json` and signs everyone out                              |

### Environment Endpoints

| Method | Endpoint                           | Description                                                                                                         |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/environments`                | List all environments in `data/`                                                                                    |
| `POST` | `/api/environments/create`         | Create new environment (`{ name, port }`)                                                                           |
| `POST` | `/api/environments/import`         | Import a Mockoon environment (multipart `file`)                                                                     |
| `GET`  | `/api/environments/export`         | Download an environment as a Mockoon file (`?filename=<name>.json`)                                                 |
| `POST` | `/api/environments/import-openapi` | Import an OpenAPI spec (multipart `file`)                                                                           |
| `GET`  | `/api/environments/ports`          | Allowed port range, next free port and taken ports (`{ min, max, suggested, uiPort, used }`)                        |
| `POST` | `/api/environments/update`         | Update environment settings (`{ filename, updatedEnv }`)                                                            |
| `POST` | `/api/environments/delete`         | Delete environment (`{ filename }`): stops its mock server, removes it from PM2, moves the file to `data/.deleted/` |

### Route, Response & Resource Endpoints

Each endpoint takes `{ filename, action, ... }` in the JSON body.

| Method | Endpoint                         | Actions                                                         |
| ------ | -------------------------------- | --------------------------------------------------------------- |
| `POST` | `/api/environments/routes`       | `create`, `delete`, `duplicate`                                 |
| `POST` | `/api/environments/update-route` | Update route metadata (`{ filename, routeUuid, updatedRoute }`) |
| `POST` | `/api/environments/responses`    | `create`, `update`, `delete`, `duplicate`                       |
| `POST` | `/api/environments/databuckets`  | `create`, `update`, `delete`                                    |
| `POST` | `/api/environments/callbacks`    | `create`, `update`, `delete`                                    |
| `POST` | `/api/environments/folders`      | `create`, `update`, `delete`                                    |

### Action Endpoints

| Method | Endpoint      | Description                                                 |
| ------ | ------------- | ----------------------------------------------------------- |
| `GET`  | `/api/action` | List PM2 processes and their status                         |
| `POST` | `/api/action` | `{ command: "start", file }` or `{ command: "stop", name }` |

### Logs Endpoints

| Method | Endpoint                 | Description                        |
| ------ | ------------------------ | ---------------------------------- |
| `GET`  | `/api/logs?name=`        | Last lines of a mock server's logs |
| `GET`  | `/api/logs/stream?name=` | SSE stream for real-time logs      |

## Docker Deployment

The image uses the official `node:22-slim` image and Yarn 1 (bundled with it), no Bun. It is a two-stage build:

1. **Builder** - `yarn install --frozen-lockfile` and `yarn build` (client to `dist/client`, API server to `dist/server`)
2. **Runner** - `yarn install --frozen-lockfile --production`, then copies `dist/`, `scripts/` and `data/`, and starts `node dist/server/index.mjs`

The UI and API listen on port **3000** inside the container. Mock servers are started by PM2 inside the same container on the ports defined in each environment.

`.dockerignore` keeps `node_modules`, `dist` and `.env*` files out of the build context, so credentials are never baked into the image. Pass them at runtime instead.

### Using Docker Compose (recommended)

1. Optional: copy `.env.example` to `.env` next to `docker-compose.yml` for overrides
2. Start it:

```bash
docker compose up -d --build
```

3. Open [http://localhost:3000](http://localhost:3000) and finish the setup right away. The UI port stays 3000 in Docker (set by `PORT`).

The compose file uses `network_mode: host` so every mock server port is reachable without listing ports, and mounts `./data` and `./config` so environments and the setup persist across rebuilds. `network_mode: host` is fully supported on Linux; on Docker Desktop (Windows/macOS) it needs host networking enabled in Docker Desktop settings, or switch to a `ports:` mapping (see the comments in `docker-compose.yml`).

### Using the Dockerfile directly

```bash
docker build -t mockoon-cli-ui .
docker run -d --name mockoon-ui   -p 3000:3000 -p 3001:3001   -v "$(pwd)/data:/app/data"   -v "$(pwd)/config:/app/config"   mockoon-cli-ui
```

Publish every port your mock environments use (`-p 3001:3001` above is an example), or use `--network host` on Linux.

### Behind a reverse proxy (HTTPS)

Forward `X-Forwarded-Proto: https` (and `X-Forwarded-Host` if the proxy changes the host) so the session cookie gets the `Secure` flag and same-origin checks pass. Alternatively set `MOCKOON_UI_COOKIE_SECURE=true`.

## Environment Variables

| Variable                                      | Description                         | Default                                              |
| --------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `PORT`                                        | UI/API port                         | setup value, else `7001` (`3000` in Docker)          |
| `HOST`                                        | Bind address                        | `0.0.0.0`                                            |
| `MOCKOON_UI_USERNAME` / `MOCKOON_UI_PASSWORD` | Dashboard login (overrides setup)   | setup value                                          |
| `MOCKOON_UI_AUTH_SECRET`                      | Secret used to sign session cookies | generated by the setup                               |
| `MOCKOON_PORT_RANGE`                          | Mock server ports, e.g. `7002-7020` | setup value, else any port                           |
| `MOCKOON_FIREWALL`                            | Firewall commands shown in setup    | by OS: `windows` or `ufw` (also `firewalld`, `none`) |
| `MOCKOON_UI_COOKIE_SECURE`                    | Force the Secure cookie flag        | auto (on when `x-forwarded-proto` is https)          |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mockoon](https://mockoon.com/) - The amazing API mocking tool this project is built upon
- [GitHub Primer](https://primer.style/) - Design system the UI styling is based on
- [Tailwind CSS](https://tailwindcss.com/) - For the beautiful styling

---

<p align="center">
  Maintained by the Mockoon CLI UI contributors
</p>
