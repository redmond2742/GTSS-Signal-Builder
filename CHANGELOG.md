# Changelog

All notable changes to OpenSignal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-02-01

### Major Changes
- **BREAKING**: Complete architecture conversion from server-based APIs to browser localStorage
- Application now runs entirely in the browser without requiring a server or database
- All data persists locally in the user's browser across sessions

### Added
- Comprehensive localStorage service with full CRUD operations for all data types
- Custom React hooks (useAgency, useSignals, usePhases, useDetectors) replacing React Query patterns
- Browser-based data persistence with automatic JSON serialization
- Standalone operation - no server dependency for production deployment
- Client-side ZIP generation for GTSS exports
- Complete GitHub deployment documentation and setup files

### Changed
- Converted all major components to use localStorage instead of API calls
- Removed React Query dependencies throughout the application
- Updated all modal components (signal, detector, bulk signal) for localStorage integration
- Streamlined build process for static hosting deployment

### Removed
- Server dependency for production operation
- React Query and QueryClientProvider from main application
- All API request logic replaced with direct localStorage operations
- Database connection requirements

### Technical Details
- Maintained all existing functionality while eliminating server dependency
- Preserved type safety with shared Zod schemas
- Enhanced error handling for client-side operations
- Optimized for static hosting platforms (Netlify, Vercel, GitHub Pages)

## [1.0.0] - 2025-01-31

### Added
- Initial release of OpenSignal traffic signal configuration tool
- Agency management with location-based setup
- Interactive signal location management with map integration
- Visual phase editor with map-based bearing selection
- Detector configuration with smart phase dropdowns
- GTSS-compliant CSV export functionality
- Bulk signal creation with map-based placement
- Responsive design with mobile support
- Dark mode theme support

### Features
- React 18 frontend with TypeScript
- Leaflet maps with reverse geocoding
- Real-time form validation with Zod schemas
- Zustand state management
- shadcn/ui component library
- Tailwind CSS styling
- Express.js development server
- PostgreSQL database integration (development)

### Map Integration
- Interactive signal placement
- Reverse geocoding for automatic street name population
- Agency-centered map positioning
- Click-to-draw phase directions with bearing calculation
- Bulk signal creation workflow

### Data Management
- Four main entities: Agencies, Signals, Phases, Detectors
- Type-safe database operations with Drizzle ORM
- CSV export following GTSS specification
- Comprehensive form validation

### User Experience
- Tabbed interface for organized workflow
- Visual phase editor with compass bearing selection
- Inline editing capabilities in map popups
- Auto-save functionality for quick edits
- Enhanced delete confirmation for data safety
- Toast notifications for user feedback

---

## Release Notes Format

### Version Number Guidelines
- **Major (X.0.0)**: Breaking changes, major new features, architecture changes
- **Minor (X.Y.0)**: New features, significant improvements, backwards compatible
- **Patch (X.Y.Z)**: Bug fixes, minor improvements, security updates

### Change Categories
- **Added**: New features
- **Changed**: Changes in existing functionality  
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements