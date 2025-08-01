# Contributing to OpenSignal

Thank you for your interest in contributing to OpenSignal! This document outlines the process for contributing to this traffic signal configuration tool.

## Development Setup

### Prerequisites
- Node.js 18.0 or higher  
- npm or yarn package manager
- Git for version control

### Setup Instructions
1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/opensignal.git
   cd opensignal
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:5000 in your browser

## Development Guidelines

### Code Style
- Use TypeScript for all new code
- Follow existing naming conventions and file structure
- Use functional components with hooks for React components
- Maintain consistent indentation (2 spaces)
- Add proper TypeScript types for all functions and components

### Component Architecture
- Place reusable UI components in `client/src/components/ui/`
- Place domain-specific components in `client/src/components/gtss/`
- Use shadcn/ui components as base building blocks
- Follow the existing pattern for form handling with React Hook Form + Zod

### Data Management
- All data operations should use the localStorage service (`client/src/lib/localStorage.ts`)
- Create corresponding React hooks in `client/src/lib/localStorageHooks.ts`
- Update Zustand store for UI state management
- Maintain type safety with shared schemas in `shared/schema.ts`

### Testing Your Changes
- Test functionality across different browsers (Chrome, Firefox, Safari, Edge)
- Verify responsive design on mobile devices
- Test data persistence across browser sessions
- Ensure all forms validate properly
- Test export functionality generates valid GTSS files

## Contribution Process

### Creating Issues
- Use GitHub Issues to report bugs or request features
- Provide clear reproduction steps for bugs
- Include browser version and operating system information
- Attach screenshots or screen recordings when helpful

### Submitting Pull Requests
1. Create a feature branch from main:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the guidelines above
3. Test thoroughly across different scenarios
4. Commit with descriptive messages:
   ```bash
   git commit -m "Add visual phase editor improvements"
   ```
5. Push to your fork and create a pull request
6. Fill out the pull request template completely
7. Respond to code review feedback promptly

### Pull Request Guidelines
- Keep changes focused and atomic
- Include screenshots or GIFs for UI changes
- Update documentation if you change functionality
- Ensure backwards compatibility with existing data
- Add comments for complex logic

## Areas for Contribution

### High Priority
- **Browser Compatibility**: Testing and fixes for various browsers
- **Mobile Responsiveness**: Improvements for touch interfaces
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Performance**: Optimizations for large datasets
- **User Experience**: Interface improvements based on user feedback

### Medium Priority  
- **Data Validation**: Enhanced form validation and error messages
- **Export Formats**: Additional export formats beyond GTSS CSV
- **Documentation**: Tutorials, guides, and API documentation
- **Internationalization**: Multi-language support

### Future Features
- **Collaborative Editing**: Multiple users working on same project
- **Version Control**: Data versioning and rollback capabilities
- **Import Functionality**: Import from other traffic signal systems
- **Advanced Analytics**: Signal timing analysis and optimization

## Code Review Process

### Review Criteria
- Code follows established patterns and conventions
- Changes are well-tested and don't break existing functionality
- Documentation is updated for new features
- TypeScript types are properly defined
- Responsive design principles are followed

### Review Timeline
- Initial review within 48-72 hours
- Follow-up reviews within 24 hours
- Merging after approval from maintainers

## Community Guidelines

### Behavior Standards
- Be respectful and inclusive in all interactions
- Provide constructive feedback in code reviews
- Help newcomers get started with development
- Focus on technical merit rather than personal preferences

### Communication Channels
- GitHub Issues for bug reports and feature requests
- GitHub Discussions for general questions and ideas
- Pull Request comments for code-specific discussions

## Recognition

Contributors will be acknowledged in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributor statistics

## Questions?

If you have questions about contributing:
1. Check existing GitHub Issues and Discussions
2. Create a new Discussion for general questions
3. Create an Issue for specific bugs or feature requests

Thank you for helping make OpenSignal better for the traffic engineering community!