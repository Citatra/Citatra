# Citatra - Open Source AI Visibility Monitor

Open-source AI visibility tracking platform. Monitor your brand's presence in Google AI Overviews, track competitors, and analyze sources - fully self-hostable.

All features are included. The open-source version is limited to **1 workspace**.

## Features

| Category | Features |
|----------|----------|
| **Core** | Dashboard, Prompt Tracking, Source Analysis, Competitor Monitoring |
| **Advanced Analytics** | Traffic Attribution, SoV & Sentiment, Competitive Gap, Backlinks, Historical Performance, SERP + AI Dashboard, Prompt Volumes |
| **Technical Analysis** | Semantic Map, Schema Generator, HTML Audit, GEO Audit |
| **Tools** | AI Recommendations, Forecasting, Keyword Explorer |
| **Management** | CMS Connectors, Team Management, Notifications, Settings |

## Quick Start

### 1. Clone & Install

`ash
cd open-source
npm install
`

### 2. Environment Variables

`ash
cp .env.example .env.local
`

**Required:**
- `MONGODB_URI` - MongoDB connection string
- `NEXTAUTH_SECRET` - Random secret for JWT signing
- `SERPAPI_API_KEY` - SerpApi API key ([get one here](https://serpapi.com/))

### 3. Run

`ash
npm run dev
`

Open [http://localhost:3000](http://localhost:3000) and create an account.

## Tech Stack

- **Next.js 16** (App Router, React 19)
- **MongoDB** (Mongoose ODM)
- **NextAuth v5** (Credentials auth)
- **SerpApi** ([serpapi.com](https://serpapi.com/)) for AI Overview fetching
- **Tailwind CSS v4** + **shadcn/ui**
- **Recharts** (Charts)
- **TypeScript**

## Project Structure

`
src/
+-- app/                     # Next.js App Router
|   +-- api/                 # REST API endpoints
|   |   +-- workspaces/      # Workspace-scoped API
|   +-- dashboard/           # Dashboard pages
|   +-- login/               # Auth pages
|   +-- signup/
|   +-- onboarding/
+-- components/
|   +-- app-sidebar.tsx      # Navigation sidebar
|   +-- command-palette.tsx  # Command palette (Ctrl+K)
|   +-- ui/                  # shadcn/ui components
+-- lib/
|   +-- auth.ts              # NextAuth configuration
|   +-- mongodb.ts           # Database connection
|   +-- serp-api.ts          # SerpApi integration
+-- middleware.ts            # API middleware
+-- models/                  # Mongoose models
`

## Core API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces` | List workspaces |
| POST | `/api/workspaces` | Create workspace (limit: 1) |
| GET | `/api/workspaces/:id/queries` | List queries |
| POST | `/api/workspaces/:id/queries` | Add query |
| POST | `/api/workspaces/:id/queries/:qid/fetch` | Fetch AI Overview |
| GET | `/api/workspaces/:id/stats` | Dashboard stats |
| GET/POST | `/api/workspaces/:id/competitors` | Manage competitors |
| GET | `/api/workspaces/:id/sources` | Source analysis |

## Cron Jobs

Set up a cron to call `POST /api/cron/fetch-all` on your preferred schedule (e.g., daily at 2 AM UTC) to auto-fetch AI Overviews for all active queries.

## License

MIT - see [LICENSE](LICENSE)
