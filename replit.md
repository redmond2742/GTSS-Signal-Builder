# GTSS Builder

## Overview

GTSS Builder is a web application for configuring and exporting traffic signal system data in a GTFS-like format (GTSS = General Traffic Signal Specification). The application allows users to manage agency information, signal locations, phases, and detectors through an intuitive tabbed interface, with the ability to export all data as a downloadable ZIP file containing CSV files.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (February 1, 2025)

✓ **MAJOR SCHEMA MIGRATION COMPLETED**: Updated all data models to match exact CSV export requirements
✓ Agency schema simplified: removed contactPerson/contactEmail fields, added agencyEmail field only
✓ Signal schema updated: cntLat/cntLon → latitude/longitude, removed cabinet and equipment fields
✓ Phase schema updated: isPedestrian removed, numberOfLanes → numOfLanes, postedSpeedLimit → postedSpeed
✓ Detector schema updated: detectorChannel → channel, detTechnologyType → technologyType, stopbarSetback → stopbarSetbackDist
✓ Fixed all CSV export headers to match exact specification (agency.csv, signals.csv, phases.csv, detection.csv)
✓ Updated all component forms, tables, and modals to use new field names throughout application
✓ All localStorage operations adapted to work with new schema structure
✓ Resolved all TypeScript compilation errors and LSP diagnostics
✓ Application maintains full functionality with simplified, standardized data model

## Latest Improvements (February 1, 2025)
✓ Visual phase editor: Removed success popup after deleting phases
✓ Signal modal: Auto-populates agency ID from agency info page
✓ Signal dialog: Removed manual entry tabs, added editable coordinate fields below map
✓ Map consistency: Signal edit dialog now centers on existing signal coordinates
✓ Export validation: Added validation checks for latitude, longitude, signal ID, and street names
✓ All coordinate data properly saved to localStorage and exported to CSV files

## Previous Major Changes
✓ **MAJOR ARCHITECTURE CHANGE**: Complete conversion from server-based APIs to localStorage
✓ Built comprehensive localStorage service with full CRUD operations for all data types
✓ Created custom localStorage hooks to replace React Query patterns throughout application
✓ Converted all major components to use browser-based storage: agency, signals, phases, detectors, export
✓ Removed all React Query dependencies and QueryClientProvider from main App component
✓ Fixed all modal components (signal, detector, bulk signal) to use localStorage instead of API calls
✓ Application now works entirely in browser without requiring any server or database
✓ All traffic signal data persists locally in user's browser across sessions
✓ Maintained all existing functionality while eliminating server dependency
✓ Created comprehensive README.md with installation instructions and GitHub deployment guide

## Previous Major Features (January 2025)
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
✓ Enhanced agency coordinate integration - all signal maps now use saved agency lat/lon as center point
✓ Simplified signal modal map picker to prioritize agency coordinates over complex city name mapping
✓ Added duplicate phase button with auto-incremented phase numbers for rapid phase creation
✓ Enhanced delete button security with double confirmation (warning + typed "DELETE" confirmation)
✓ Added smart phase dropdown in detector modal showing actual phases from selected signal
✓ Removed duplicate X close buttons from detector modal for cleaner interface

## System Architecture

The application follows a client-side architecture optimized for browser-based operation:

- **Frontend**: React-based single-page application built with Vite
- **Storage**: Browser localStorage with custom service layer and React hooks
- **Data Persistence**: Client-side JSON serialization with automatic type conversion
- **Build System**: Vite for frontend bundling, esbuild for backend compilation (development only)
- **Server**: Express.js server used only for development hosting (not required for production)

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

### Data Management Architecture
- **localStorage Service**: Custom TypeScript service with full CRUD operations
- **React Integration**: Custom hooks (useAgency, useSignals, usePhases, useDetectors)
- **Data Validation**: Zod schemas for runtime type checking and serialization
- **File Processing**: Client-side ZIP generation using browser APIs
- **Type Safety**: End-to-end TypeScript with shared schemas

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