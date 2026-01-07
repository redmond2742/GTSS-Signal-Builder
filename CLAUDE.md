# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GTSS Builder is a web application for configuring traffic signal systems and exporting data in the GTSS (General Traffic Signal Specification) format. It allows users to manage agencies, signal locations, timing phases, and detection equipment through an interactive interface with mapping capabilities.

## Build & Development Commands

```bash
npm run dev          # Start development server (port 5000)
npm run build        # Build for production (outputs to dist/)
npm run start        # Run production build
npm run check        # TypeScript type checking
npm run db:push      # Push Drizzle schema to database (if using server-side storage)
```

## Architecture

### Data Flow

The app has a **dual storage architecture**:
- **Primary (client-side)**: Browser localStorage via `client/src/lib/localStorage.ts` - all data persists locally
- **Server-side (development only)**: Express API routes exist in `server/` but the production app runs entirely client-side

### Key Directories

- `client/src/` - React frontend application
  - `components/gtss/` - Domain-specific components (agency-form, signal-modal, phase-modal, etc.)
  - `components/ui/` - shadcn/ui base components
  - `store/gtss-store.ts` - Zustand state management
  - `lib/localStorage.ts` - All localStorage CRUD operations and CSV/TXT export/import functions
  - `pages/gtss-builder.tsx` - Main application view with tab navigation
- `server/` - Express server (development only, serves Vite in dev mode)
- `shared/schema.ts` - Drizzle ORM schemas defining data types (Agency, Signal, Phase, Detector)

### State Management

Zustand store (`gtss-store.ts`) manages:
- GTSS data entities (agency, signals, phases, detectors)
- Navigation state (`currentView`, `currentSignalId`) for single-page navigation without URL routing

### Data Models

Four main entities defined in `shared/schema.ts`:
- **Agency**: Organization info (id, name, timezone, location)
- **Signal**: Traffic signal locations (signalId, street names, lat/lng)
- **Phase**: Signal timing phases (phase number, movement type, bearing, overlap flags)
- **Detector**: Detection equipment (channel, technology type, purpose, setback distance)

### Export Format

Data exports as TXT files (CSV format):
- `agency.txt`, `signals.txt`, `phases.txt`, `detectors.txt`
- Movement types are encoded (Through -> T, Left Turn -> L, etc.)
- Export as ZIP or individual files

### Path Aliases

```
@/     -> client/src/
@shared/ -> shared/
@assets/ -> attached_assets/
```

### UI Framework

- React 18 with TypeScript
- Tailwind CSS with shadcn/ui components
- Leaflet for interactive maps
- React Hook Form + Zod for form validation
