# GTSS Builder - Traffic Signal Configuration Tool

A comprehensive web application for configuring and exporting traffic signal system data in a standardized GTSS (General Traffic Signal Specification) format. GTSS Builder provides an intuitive interface for managing traffic signal agencies, locations, timing phases, and detection equipment with advanced mapping capabilities and local browser storage.

## 🚦 Features

### Core Functionality
- **Agency Management**: Configure traffic signal agencies with location-based setup
- **Signal Location Management**: Interactive map-based signal placement and editing
- **Phase Configuration**: Visual phase editor with map-based bearing selection
- **Detector Management**: Configure vehicle and pedestrian detection equipment
- **Data Export**: Generate standardized GTSS TXT packages for interoperability

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
- **TXT file generation** for standardized data export

### Development Tools
- **TypeScript** for static type checking
- **ESBuild** for fast compilation
- **PostCSS** with Autoprefixer for CSS processing

## 📋 Prerequisites

Before installing GTSS Builder, ensure you have the following installed on your system:

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
git clone https://github.com/your-username/gtss-builder.git
cd gtss-builder
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

This creates an optimized production build in the `dist` folder.

## 🌐 Server Deployment

GTSS Builder is a client-side application that runs entirely in the browser. It can be deployed to any web server that can serve static files.

### Option 1: Static Web Server (Nginx)

#### Prerequisites
- Ubuntu/Debian or similar Linux distribution
- Root or sudo access
- Domain name (optional)

#### Step 1: Install Nginx
```bash
sudo apt update
sudo apt install nginx
```

#### Step 2: Build the Application
```bash
npm run build
```

#### Step 3: Copy Build Files to Web Server
```bash
# Create application directory
sudo mkdir -p /var/www/gtss-builder

# Copy build files
sudo cp -r dist/* /var/www/gtss-builder/

# Set correct permissions
sudo chown -R www-data:www-data /var/www/gtss-builder
sudo chmod -R 755 /var/www/gtss-builder
```

#### Step 4: Configure Nginx
Create a new Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/gtss-builder
```

Add the following configuration:
```nginx
server {
    listen 80;
    listen [::]:80;
    
    server_name your-domain.com;  # Replace with your domain or server IP
    
    root /var/www/gtss-builder;
    index index.html;
    
    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Step 5: Enable the Site
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/gtss-builder /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### Step 6: Configure Firewall (if applicable)
```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Your application is now accessible at `http://your-domain.com` or `http://your-server-ip`

### Option 2: Apache Server

#### Step 1: Install Apache
```bash
sudo apt update
sudo apt install apache2
```

#### Step 2: Build and Deploy
```bash
npm run build
sudo mkdir -p /var/www/gtss-builder
sudo cp -r dist/* /var/www/gtss-builder/
sudo chown -R www-data:www-data /var/www/gtss-builder
```

#### Step 3: Configure Apache
```bash
sudo nano /etc/apache2/sites-available/gtss-builder.conf
```

Add configuration:
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/gtss-builder
    
    <Directory /var/www/gtss-builder>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # Enable SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Enable compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
    </IfModule>
</VirtualHost>
```

#### Step 4: Enable and Restart
```bash
sudo a2enmod rewrite
sudo a2ensite gtss-builder.conf
sudo systemctl restart apache2
```

### Option 3: Docker Deployment

#### Create Dockerfile
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Create nginx.conf
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

#### Build and Run
```bash
# Build Docker image
docker build -t gtss-builder .

# Run container
docker run -d -p 80:80 --name gtss-builder gtss-builder

# Or use docker-compose
docker-compose up -d
```

#### docker-compose.yml
```yaml
version: '3.8'
services:
  gtss-builder:
    build: .
    ports:
      - "80:80"
    restart: unless-stopped
```

### Option 4: Cloud Platforms

#### Netlify
1. Connect your GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Deploy automatically on git push

#### Vercel
1. Import project from GitHub
2. Vercel auto-detects Vite configuration
3. Deploy with zero configuration

#### AWS S3 + CloudFront
1. Build: `npm run build`
2. Create S3 bucket and enable static website hosting
3. Upload `dist` folder contents to S3
4. Configure CloudFront distribution for HTTPS and caching
5. Update DNS to point to CloudFront

### SSL/HTTPS Configuration

#### Using Let's Encrypt (Certbot)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain and install certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## 📁 Project Structure

```
gtss-builder/
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
5. **Export Data**: Generate GTSS-compliant TXT packages

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
- Download as ZIP file or individual TXT files

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run check        # Run TypeScript type checking
```

### Environment Configuration
The application uses browser localStorage for data persistence. No environment variables or external databases are required for basic functionality.

## 📊 Data Format

### GTSS Export Structure
GTSS Builder generates standardized TXT files following GTSS specification:

- **agency.txt**: Agency information and contact details
- **signals.txt**: Signal location and equipment data
- **phases.txt**: Timing phase configurations with movement type encoding (T, L, LT, etc.)
- **detectors.txt**: Detection equipment specifications

### Data Persistence
All application data is stored in browser localStorage with automatic serialization. Data persists across browser sessions and survives application updates.

## 🔒 Security Considerations

### Production Deployment Best Practices
1. **Always use HTTPS** in production environments
2. **Set proper security headers** in your web server configuration:
   ```nginx
   add_header X-Frame-Options "SAMEORIGIN" always;
   add_header X-Content-Type-Options "nosniff" always;
   add_header X-XSS-Protection "1; mode=block" always;
   ```
3. **Regular updates**: Keep dependencies updated with `npm audit`
4. **Backup strategy**: Since data is stored in browser localStorage, educate users to regularly export their data

## 🆘 Support & Troubleshooting

### Common Issues

**Application Not Loading**
- Check web server logs: `sudo tail -f /var/log/nginx/error.log`
- Verify file permissions are correct
- Ensure JavaScript files are served with correct MIME type

**Map Not Loading**
- Verify internet connection for OpenStreetMap tiles
- Check if server allows outbound HTTPS connections
- Ensure CSP headers allow map tile domains

**Export Not Working**
- Modern browsers required for ZIP file generation
- Check browser console for JavaScript errors
- Verify sufficient browser storage available

### Server Logs
```bash
# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Apache logs
sudo tail -f /var/log/apache2/access.log
sudo tail -f /var/log/apache2/error.log
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔄 Version History

### Current Version
- Complete localStorage conversion for offline functionality
- Enhanced visual phase editor with map-based bearing selection
- TXT file export format (agency.txt, signals.txt, phases.txt, detectors.txt)
- Movement type encoding in phase exports
- Improved agency setup with location picker integration
- Streamlined bulk signal creation workflow
- Removed server dependency for standalone browser operation

---

**GTSS Builder** - Making traffic signal configuration accessible and standardized.
