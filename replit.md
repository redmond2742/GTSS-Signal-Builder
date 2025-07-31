# GTSS Builder

## Overview

GTSS Builder is a web application for configuring and exporting traffic signal system data in a GTFS-like format (GTSS = General Traffic Signal Specification). The application allows users to manage agency information, signal locations, phases, and detectors through an intuitive tabbed interface, with the ability to export all data as a downloadable ZIP file containing CSV files.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (January 31, 2025)

✓ Changed default timezone from America/New_York to America/Los_Angeles
✓ Added bulk signal creation feature with dedicated map interface
✓ Fixed map layout issues - hides map when modal dialogs are open
✓ Added "Edit Full Details" button in map popup for comprehensive signal editing
✓ Enhanced map popup with inline editing for Signal ID and street names
✓ Implemented auto-save functionality for quick edits in map popup
✓ Removed toast success messages from bulk signal creation (table display is sufficient)
✓ Renamed application from "Traffic Signal Config" to "OpenSignal"
✓ Enhanced Phase dialog to pre-select signal when one is already filtered/selected
✓ Fixed duplicate close buttons (X) in all dialog boxes - now only shows system default
✓ Added Visual Phase Editor with interactive map-based bearing selection and phase configuration
✓ Implemented click-to-draw phase directions with automatic bearing calculation
✓ Enhanced agency-based map centering with comprehensive city/state geographic detection
✓ Removed intrusive "Location Added" toast messages from bulk signal creation for better UX
✓ Added phase number editing capability in Visual Phase Editor for flexible phase organization
✓ Implemented rapid multi-phase creation workflow - add up to 8 phases without closing dialog
✓ Enhanced agency form with state detection and location picker using IP geolocation
✓ Added map-based city selection with reverse geocoding for accurate agency location setup
✓ Integrated location picker directly into agency config with tabbed interface
✓ Added auto-population of agency name and ID based on selected map location
✓ Built location picker directly into agency config (removed tabs) with "Use My Location" button
✓ Updated signal maps to use agency coordinates as center point for better map positioning
✓ Enhanced Visual Phase Editor to remain open after creating phases for rapid multi-phase creation
✓ Removed success toast notifications from Visual Phase Editor for streamlined workflow
✓ Added display of existing phases for signal below Close button in Visual Phase Editor
✓ Flipped compass bearing calculation by 180° to represent traffic flow direction instead of raw geometric bearing

## System Architecture

The application follows a full-stack architecture with a clear separation between frontend and backend concerns:

- **Frontend**: React-based single-page application built with Vite
- **Backend**: Express.js REST API server
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Storage**: In-memory storage for development (with database schema ready for production)
- **Build System**: Vite for frontend bundling, esbuild for backend compilation

## Key Components

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with hot module replacement
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: Zustand for global state management
- **UI Components**: Radix UI primitives with shadcn/ui styling
- **Styling**: Tailwind CSS with CSS variables for theming
- **Forms**: React Hook Form with Zod validation
- **HTTP Client**: TanStack Query for server state management

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Validation**: Zod schemas for runtime type checking
- **File Processing**: Archiver for ZIP file generation
- **Session Management**: PostgreSQL session store ready for implementation

### Database Schema
The application uses four main entities:
- **Agencies**: Organization information (ID, name, contact details, timezone)
- **Signals**: Traffic signal locations (coordinates, street intersections, equipment details)
- **Phases**: Signal timing phases (movement types, pedestrian settings, detection)
- **Detectors**: Detection equipment (channels, types, positioning)

### API Structure
RESTful API endpoints for each entity:
- `GET/POST /api/agency` - Agency information management
- `GET/POST/PUT/DELETE /api/signals/:id` - Signal CRUD operations
- `GET/POST/PUT/DELETE /api/phases/:id` - Phase CRUD operations
- `GET/POST/PUT/DELETE /api/detectors/:id` - Detector CRUD operations
- `POST /api/export` - Generate and download GTSS package

## Data Flow

1. **User Input**: Forms collect and validate data using React Hook Form + Zod
2. **State Management**: Zustand stores maintain local state for immediate UI updates
3. **API Communication**: TanStack Query handles server synchronization and caching
4. **Data Persistence**: Express routes validate and store data via Drizzle ORM
5. **Export Process**: Backend generates CSV files from stored data and packages them into ZIP
6. **File Download**: Client receives and downloads the generated package

## External Dependencies

### Frontend Dependencies
- **UI Framework**: React, Radix UI primitives for accessibility
- **Styling**: Tailwind CSS, class-variance-authority for component variants
- **Forms & Validation**: React Hook Form, Zod, @hookform/resolvers
- **HTTP & State**: TanStack Query for server state management
- **Routing**: Wouter for lightweight routing
- **Date Handling**: date-fns for date formatting

### Backend Dependencies
- **Database**: @neondatabase/serverless (Neon PostgreSQL)
- **ORM**: Drizzle ORM with drizzle-kit for migrations
- **File Processing**: archiver for ZIP file creation
- **Session Store**: connect-pg-simple for PostgreSQL sessions
- **Validation**: Shared Zod schemas between frontend and backend

### Development Dependencies
- **Build Tools**: Vite, esbuild, TypeScript
- **Linting & Code Quality**: TypeScript compiler for type checking
- **Development Server**: Custom Vite middleware integration

## Deployment Strategy

### Development
- **Frontend**: Vite dev server with HMR on port 5173
- **Backend**: tsx for TypeScript execution with nodemon-like reloading
- **Database**: Neon PostgreSQL (serverless) for development
- **Environment**: NODE_ENV=development with development-specific middleware

### Production
- **Frontend**: Static build output served by Express
- **Backend**: Compiled JavaScript bundle via esbuild
- **Database**: Production PostgreSQL instance via DATABASE_URL
- **Deployment**: Single server deployment with static file serving

### Key Architectural Decisions

1. **Monorepo Structure**: Frontend, backend, and shared code in single repository for easier development and type sharing
2. **In-Memory Storage**: Development uses memory storage with interface design allowing easy database integration
3. **Type Safety**: End-to-end TypeScript with shared schemas between frontend and backend
4. **Component Architecture**: Modular UI components with shadcn/ui for consistency
5. **State Management**: Zustand chosen for simplicity over Redux complexity
6. **Validation Strategy**: Zod schemas shared between client and server for consistency
7. **Build Strategy**: Separate frontend and backend builds with Express serving both