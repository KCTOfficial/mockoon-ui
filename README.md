# Mockoon CLI UI

<p align="center">
  <img src="images/logo.png" alt="Mockoon CLI UI Logo" width="200" />
</p>

<p align="center">
  A modern web-based UI for managing Mockoon mock API environments. Built with Next.js 16, React 19, and Tailwind CSS.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#api-reference">API Reference</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1.6-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2.3-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Bun-Runtime-000000?style=flat-square&logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## Features

- 🎨 **Modern UI** - Clean, dark-themed interface with real-time log streaming
- 🚀 **Mockoon Powered** - Built on top of [Mockoon](https://mockoon.com/) for reliable API mocking
- 📝 **Environment Management** - Create, edit, and manage multiple mock API environments
- 🔀 **Route Configuration** - Full support for HTTP methods, headers, responses, and callbacks
- 📊 **Data Buckets** - Create and manage reusable data buckets for your mocks
- 📋 **OpenAPI Import** - Import OpenAPI/Swagger specifications to auto-generate mock environments
- 🔄 **Real-time Logs** - Server-Sent Events (SSE) powered live log streaming
- 🐳 **Docker Ready** - Includes Dockerfile and docker-compose for containerized deployment
- 🌙 **Dark Mode** - Built-in theme support with dark mode by default

## Screenshots

### Dashboard - Route Editor
![Dashboard](images/screenshot-dashboard.png)

### Create New Environment
![Create Environment](images/screenshot-create-environment.png)

### Data Buckets Management
![Data Buckets](images/screenshot-data-buckets.png)

### Environment Settings
![Settings](images/screenshot-settings.png)

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0 (recommended) or Node.js >= 18
- PM2 (installed as dependency)

## Installation

### Clone the repository

```bash
git clone https://github.com/yourusername/mockoon-cli-ui.git
cd mockoon-cli-ui
```

### Install dependencies

```bash
bun install
```

### Start the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to access the UI.

## Usage

### Creating an Environment

1. Click the "+" button in the sidebar to create a new environment
2. Configure the environment name, hostname, and port
3. Add routes, responses, and data buckets as needed

### Importing OpenAPI Specifications

1. Click the import button in the sidebar
2. Paste your OpenAPI/Swagger JSON specification
3. The environment will be automatically created with all routes

### Managing Mock Servers

- Use the play/stop buttons to start and stop individual mock servers
- View real-time logs in the log panel at the bottom
- Monitor server status in the sidebar

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run test` | Run tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |

### Project Structure

```
mockoon-cli-ui/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── action/        # PM2 process control
│   │   ├── environments/  # CRUD operations
│   │   └── logs/          # Log streaming (SSE)
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── Dashboard.tsx      # Main application component
│   ├── RouteEditor.tsx    # Route configuration editor
│   ├── RouteList.tsx      # Route listing component
│   ├── Sidebar.tsx        # Environment sidebar
│   ├── LogPanel.tsx       # Real-time log viewer
│   └── ...
├── data/                  # Environment JSON files
├── lib/                   # Utility libraries
├── scripts/               # Server scripts
├── types/                 # TypeScript definitions
└── images/                # Static images
```

### Key Technologies

- **[Next.js 16](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - Code editor for responses
- **[Mockoon](https://mockoon.com/)** - API mocking engine
- **[PM2](https://pm2.keymetrics.io/)** - Process manager for mock servers

## API Reference

### Environment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/environments` | List all environments |
| `POST` | `/api/environments/create` | Create new environment |
| `POST` | `/api/environments/import` | Import environment from JSON |
| `POST` | `/api/environments/import-openapi` | Import from OpenAPI spec |
| `PUT` | `/api/environments/update` | Update environment settings |
| `DELETE` | `/api/environments?filename=` | Delete environment |

### Route Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/environments/routes` | Get routes for environment |
| `POST` | `/api/environments/routes` | Add new route |
| `PUT` | `/api/environments/routes` | Update route |
| `DELETE` | `/api/environments/routes` | Delete route |

### Action Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/action` | Get server status |
| `POST` | `/api/action` | Start/stop servers |

### Logs Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/logs/stream` | SSE stream for real-time logs |

## Docker Deployment

### Using Docker Compose

```bash
docker-compose up -d
```

### Using Dockerfile

```bash
docker build -t mockoon-cli-ui .
docker run -p 3000:3000 mockoon-cli-ui
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |

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
- [Next.js](https://nextjs.org/) - The React framework for production
- [Tailwind CSS](https://tailwindcss.com/) - For the beautiful styling

---

<p align="center">
  Made with ❤️ by the Mockoon CLI UI contributors
</p>
