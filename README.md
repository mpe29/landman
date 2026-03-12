# LANDMAN

A map-centric system for managing land, infrastructure, livestock, and operational observations on large properties.

## What It Is

LANDMAN is built around a single organizing principle: **land is the ontology**. Every piece of information — assets, observations, events, photos — is anchored to a specific location on the ground. Instead of folders and spreadsheets, users navigate by geography and time.

Primary users are people responsible for large tracts of land where spatial context matters: ranchers, game ranch operators, and national park managers.

## Core Concept

The map is the primary interface to the database, not a list or a spreadsheet. A land manager uses LANDMAN to:

- Define property boundaries and subdivide land into paddocks, grazing blocks, or ecological zones
- Map infrastructure — fences, boreholes, kraals, roads, gates
- Attach field observations to specific places and times
- Record operations like veterinary visits, fence building, or grazing rotations
- Upload field photos and have them automatically geolocated via EXIF metadata
- Build a historical visual record of land state over time

## Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL + PostGIS (hosted on Supabase) |
| Backend API | FastAPI (Python) |
| Frontend | React + Mapbox GL JS |
| Media Storage | Object storage (later phase) |

## Database Schema

Seven core tables, all spatially indexed:

| Table | Geometry | Description |
|---|---|---|
| `properties` | Polygon | Top-level land unit |
| `areas` | Polygon | Paddocks, grazing blocks, habitat zones |
| `linear_assets` | LineString | Fences, roads, pipelines |
| `point_assets` | Point | Boreholes, tanks, kraals, gates, sensors |
| `operations` | — | Vaccination campaigns, patrols, inspections |
| `observations` | Point | Field observations with tags and notes |
| `media` | Point | Images/video with EXIF geolocation |

All geometry uses SRID 4326 (WGS84 / standard GPS coordinates).

## Setup

1. Create a PostgreSQL + PostGIS database (Supabase free tier recommended)
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Fill in your database connection string in `.env`
4. Run the schema:
   ```bash
   psql $DATABASE_URL -f database/schema.sql
   ```
5. Verify:
   ```bash
   psql $DATABASE_URL -c "\dt"
   psql $DATABASE_URL -c "SELECT PostGIS_Version();"
   ```

## Project Structure

```
landman/
├── backend/          # FastAPI application (coming soon)
├── frontend/         # React + Mapbox UI (coming soon)
├── database/
│   ├── schema.sql          # PostgreSQL + PostGIS schema
│   └── schema_diagram.dbml # DB diagram (dbdiagram.io)
└── docs/             # Architecture and design notes
```
