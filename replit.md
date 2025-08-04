# GTSS Builder

## Overview
GTSS Builder is a web application designed for configuring and exporting traffic signal system data in a GTFS-like format (GTSS = General Traffic Signal Specification). It enables users to manage agency information, signal locations, phases, and detectors through an intuitive tabbed interface. The core capability includes exporting all configured data as a downloadable ZIP file containing CSV files, streamlining data exchange for government workers and traffic engineers. The project aims to provide a robust, client-side solution for traffic signal data management without server dependencies.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application follows a client-side architecture optimized for browser-based operation, prioritizing local persistence over server-side interaction.

### Core Technologies:
- **Frontend**: React-based single-page application built with Vite.
- **Storage**: Browser localStorage with a custom service layer and React hooks, enabling complete client-side data persistence.
- **Data Persistence**: Client-side JSON serialization with automatic type conversion.
- **Build System**: Vite for frontend bundling.
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter for lightweight client-side routing.
- **State Management**: Zustand for global state management.
- **UI Components**: Radix UI primitives with shadcn/ui styling.
- **Styling**: Tailwind CSS with CSS variables for theming.
- **Forms**: React Hook Form with Zod validation.
- **Data Validation**: Zod schemas for runtime type checking and serialization.
- **File Processing**: Client-side ZIP generation using browser APIs.

### Design Principles & Features:
- **UI/UX Decisions**: Professional government-friendly design utilizing a navy blue primary color scheme, neutral grays, and compact layouts for efficiency. Features like clickable table rows, optimized spacing, and smaller font sizes enhance usability and data density.
- **Technical Implementations**:
    - **Client-Side Operation**: Complete conversion from server-based APIs to localStorage, making the application fully functional offline without server or database requirements.
    - **Signal Details Page**: Comprehensive management page for signals, phases, and detectors with inline editing and map integration.
    - **Visual Phase Editor**: Interactive map-based tool for configuring phases, including click-to-draw directions, rapid multi-phase creation, and automatic bearing calculation.
    - **Bulk Signal Creation**: Feature with a dedicated map interface for efficient creation of multiple signals.
    - **User Workflow Enhancements**: Features like "Duplicate to Left Turn" for phases, automatic phase number mapping, and interactive location editing on maps streamline configuration.
    - **Schema Standardization**: Data models are aligned with exact CSV export requirements for consistent data exchange.
- **System Design Choices**:
    - **Monorepo Structure**: Frontend, backend (development only), and shared code are co-located for simplified development and type sharing.
    - **Type Safety**: End-to-end TypeScript with shared schemas ensures data consistency and reduces errors.
    - **Component Architecture**: Modular UI components utilizing shadcn/ui for consistency and reusability.
    - **Validation Strategy**: Zod schemas are shared between client and (formerly) server for consistent validation logic.

## External Dependencies

### Frontend Dependencies:
- **UI Framework**: React, Radix UI primitives
- **Styling**: Tailwind CSS, `class-variance-authority`
- **Forms & Validation**: React Hook Form, Zod, `@hookform/resolvers`
- **Routing**: Wouter
- **Date Handling**: `date-fns`