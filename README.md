# OpenSignal - Traffic Signal Configuration Tool

A comprehensive web application for configuring and exporting traffic signal system data in a standardized GTSS (General Traffic Signal Specification) format. OpenSignal provides an intuitive interface for managing traffic signal agencies, locations, timing phases, and detection equipment with advanced mapping capabilities and local browser storage.

## 🚦 Features

### Core Functionality
- **Agency Management**: Configure traffic signal agencies with location-based setup
- **Signal Location Management**: Interactive map-based signal placement and editing
- **Phase Configuration**: Visual phase editor with map-based bearing selection
- **Detector Management**: Configure vehicle and pedestrian detection equipment
- **Data Export**: Generate standardized GTSS CSV packages for interoperability

### Advanced Capabilities
- **Interactive Mapping**: Leaflet-based maps with reverse geocoding
- **Bulk Signal Creation**: Click-to-add multiple signals on map interface
- **Visual Phase Editor**: Interactive direction selection with automatic bearing calculation
- **Local Storage**: Complete browser-based data persistence (no server required)
- **Responsive Design**: Mobile-friendly interface with dark mode support

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript for type-safe development
- **Vite** for fast development and optimized builds
- **Tailwind CSS** with shadcn/ui components for modern styling
- **React Hook Form + Zod** for robust form validation
- **Zustand** for lightweight state management
- **Leaflet** for interactive mapping capabilities
- **Wouter** for client-side routing

### Data Management
- **Browser localStorage** for client-side data persistence
- **Custom localStorage hooks** for React integration
- **Drizzle ORM schemas** for type-safe data structures
- **CSV generation** for standardized data export

### Development Tools
- **TypeScript** for static type checking
- **ESBuild** for fast compilation
- **PostCSS** with Autoprefixer for CSS processing

## 📋 Prerequisites

Before installing OpenSignal, ensure you have the following installed on your system:

- **Node.js** (version 18.0 or higher)
- **npm** (comes with Node.js) or **yarn**
- **Git** for version control

### Verify Installation
```bash
node --version  # Should show v18.0.0 or higher
npm --version   # Should show 8.0.0 or higher
git --version   # Should show git version info
```

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/opensignal.git
cd opensignal
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

### 4. Build for Production
```bash
npm run build
```

## 📁 Project Structure

```
opensignal/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/        # Base UI components (shadcn/ui)
│   │   │   └── gtss/      # Domain-specific components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities and configurations
│   │   │   ├── localStorage.ts      # localStorage service
│   │   │   └── localStorageHooks.ts # React hooks for localStorage
│   │   ├── pages/         # Application pages
│   │   ├── store/         # Zustand state management
│   │   └── App.tsx        # Main application component
│   └── index.html         # HTML entry point
├── server/                # Backend Express server (development only)
├── shared/                # Shared TypeScript schemas
│   └── schema.ts          # Drizzle ORM schemas and types
├── components.json        # shadcn/ui configuration
├── tailwind.config.ts     # Tailwind CSS configuration
├── vite.config.ts         # Vite build configuration
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## 🎯 Usage Guide

### Getting Started
1. **Configure Agency**: Set up your traffic signal agency with location details
2. **Add Signal Locations**: Use the interactive map to place signal locations
3. **Define Phases**: Configure signal timing phases with the visual editor
4. **Setup Detectors**: Add vehicle and pedestrian detection equipment
5. **Export Data**: Generate GTSS-compliant CSV packages

### Key Workflows

#### Agency Setup
- Navigate to the Agency tab
- Fill in agency details (name, contact information, timezone)
- Use the location picker to set agency coordinates
- Agency location will be used as the default map center

#### Signal Management
- **Individual Signals**: Use "Add Signal" for single signal creation
- **Bulk Creation**: Use "Bulk Add" for map-based multiple signal placement
- **Map Integration**: Signals automatically populate street names via reverse geocoding

#### Phase Configuration
- Access via the Phases tab
- Use Visual Phase Editor for interactive phase direction selection
- Click on map to draw phase directions with automatic bearing calculation
- Support for up to 8 phases per signal

#### Data Export
- Export tab generates complete GTSS package
- Includes agency.txt, signals.txt, phases.txt, and detectors.txt
- Download as ZIP file for distribution

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # Run TypeScript type checking
```

### Environment Configuration
The application uses browser localStorage for data persistence. No environment variables or external databases are required for basic functionality.

### Adding New Features
1. Define data schemas in `shared/schema.ts`
2. Create localStorage service methods in `client/src/lib/localStorage.ts`
3. Add React hooks in `client/src/lib/localStorageHooks.ts`
4. Build UI components in `client/src/components/`
5. Update state management in `client/src/store/`

## 🌐 Deployment Options

### Static Hosting (Recommended)
Since OpenSignal runs entirely in the browser, it can be deployed to any static hosting service:

**Netlify**
1. Connect your GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Deploy automatically on git push

**Vercel**
1. Import project from GitHub
2. Vercel auto-detects Vite configuration
3. Deploy with zero configuration

**GitHub Pages**
1. Enable GitHub Pages in repository settings
2. Use GitHub Actions for automated deployment
3. Set source to GitHub Actions

### Self-Hosted
1. Run `npm run build` to create production bundle
2. Serve the `dist` folder with any web server (nginx, Apache, etc.)
3. Ensure proper MIME types for JavaScript modules

## 📊 Data Format

### GTSS Export Structure
OpenSignal generates standardized CSV files following GTSS specification:

- **agency.txt**: Agency information and contact details
- **signals.txt**: Signal location and equipment data
- **phases.txt**: Timing phase configurations and movements
- **detectors.txt**: Detection equipment specifications

### Data Persistence
All application data is stored in browser localStorage with automatic serialization. Data persists across browser sessions and survives application updates.

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the existing code patterns
4. Test thoroughly across different browsers
5. Commit with descriptive messages
6. Push to your fork and submit a pull request

### Code Standards
- Use TypeScript for all new code
- Follow existing component patterns and naming conventions
- Ensure responsive design compatibility
- Add proper error handling and user feedback
- Update documentation for new features

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Common Issues

**Signal Creation Not Working**
- Ensure JavaScript is enabled in your browser
- Check browser console for error messages
- Try refreshing the page to reset application state

**Map Not Loading**
- Verify internet connection for OpenStreetMap tiles
- Check if browser blocks mixed content (HTTP/HTTPS)
- Ensure location services are enabled for geocoding

**Data Export Issues**
- Modern browsers required for ZIP file generation
- Ensure popup blockers aren't preventing downloads
- Check if sufficient data exists for export

### Getting Help
- Check the GitHub Issues page for known problems
- Review browser console for error messages
- Ensure you're using a supported browser (Chrome, Firefox, Safari, Edge)

## 🔄 Version History

### v2.0.0 (Current)
- Complete localStorage conversion for offline functionality
- Enhanced visual phase editor with map-based bearing selection
- Improved agency setup with location picker integration
- Streamlined bulk signal creation workflow
- Removed server dependency for standalone browser operation

### v1.0.0
- Initial release with server-based data persistence
- Basic signal, phase, and detector management
- GTSS export functionality
- Interactive mapping capabilities

---

**OpenSignal** - Making traffic signal configuration accessible and standardized.