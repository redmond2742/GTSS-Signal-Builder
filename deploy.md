# Deployment Guide for OpenSignal

This guide provides step-by-step instructions for deploying OpenSignal to various hosting platforms. Since OpenSignal v2.0 runs entirely in the browser with localStorage, it can be deployed as a static website.

## Quick Start

OpenSignal requires only static file hosting since it operates entirely in the browser:

1. **Build the application**: `npm run build`
2. **Deploy the `dist` folder** to any static hosting service
3. **Configure proper MIME types** for JavaScript modules (most hosts do this automatically)

## Platform-Specific Deployment

### Netlify (Recommended)

Netlify provides excellent static hosting with automatic deployments from GitHub.

#### Automatic Deployment
1. **Connect Repository**:
   - Go to [Netlify](https://netlify.com) and sign in
   - Click "New site from Git"
   - Connect your GitHub account and select the OpenSignal repository

2. **Configure Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `18` (in Environment Variables: `NODE_VERSION = 18`)

3. **Deploy**:
   - Click "Deploy site"
   - Netlify will automatically build and deploy your site
   - Future pushes to the main branch will trigger automatic rebuilds

#### Manual Deployment
1. Build locally: `npm run build`
2. Drag and drop the `dist` folder to Netlify's deploy area
3. Your site will be live immediately

#### Custom Domain (Optional)
1. In your Netlify site dashboard, go to "Domain management"
2. Add your custom domain
3. Configure DNS settings as instructed by Netlify

### Vercel

Vercel offers seamless deployment with automatic optimizations.

#### Automatic Deployment
1. **Import Project**:
   - Go to [Vercel](https://vercel.com) and sign in
   - Click "New Project"
   - Import your OpenSignal repository from GitHub

2. **Configure Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Deploy**:
   - Click "Deploy"
   - Vercel automatically detects the Vite configuration
   - Site will be live at `your-project.vercel.app`

#### Manual Deployment
1. Install Vercel CLI: `npm i -g vercel`
2. Build project: `npm run build`
3. Deploy: `vercel --prod`
4. Follow the prompts to configure your deployment

### GitHub Pages

GitHub Pages provides free hosting directly from your repository.

#### Setup GitHub Actions Deployment
1. **Create Workflow File**:
   Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [ main ]
     pull_request:
       branches: [ main ]

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       
       steps:
       - name: Checkout
         uses: actions/checkout@v4

       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
           node-version: '18'
           cache: 'npm'

       - name: Install dependencies
         run: npm ci

       - name: Build application
         run: npm run build

       - name: Deploy to GitHub Pages
         uses: peaceiris/actions-gh-pages@v3
         if: github.ref == 'refs/heads/main'
         with:
           github_token: ${{ secrets.GITHUB_TOKEN }}
           publish_dir: ./dist
   ```

2. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `gh-pages` / `/ (root)`
   - Save settings

3. **Deploy**:
   - Push to main branch
   - GitHub Actions will automatically build and deploy
   - Site will be available at `https://your-username.github.io/opensignal`

### Self-Hosted Options

#### Nginx
1. Build the application: `npm run build`
2. Copy `dist` folder contents to your web server directory
3. Configure Nginx:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /path/to/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       # Enable gzip compression
       gzip on;
       gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
   }
   ```

#### Apache
1. Build and copy files to your web server directory
2. Create `.htaccess` file in the root:
   ```apache
   RewriteEngine On
   RewriteBase /

   # Handle client-side routing
   RewriteRule ^index\.html$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]

   # Enable compression
   <IfModule mod_deflate.c>
       AddOutputFilterByType DEFLATE text/plain
       AddOutputFilterByType DEFLATE text/html
       AddOutputFilterByType DEFLATE text/xml
       AddOutputFilterByType DEFLATE text/css
       AddOutputFilterByType DEFLATE application/xml
       AddOutputFilterByType DEFLATE application/xhtml+xml
       AddOutputFilterByType DEFLATE application/rss+xml
       AddOutputFilterByType DEFLATE application/javascript
       AddOutputFilterByType DEFLATE application/x-javascript
   </IfModule>
   ```

## Environment Configuration

### Production Build Optimization
The default build configuration is optimized for production:

- **Code Splitting**: Automatic chunking for better loading performance
- **Minification**: JavaScript and CSS are minified
- **Tree Shaking**: Unused code is removed
- **Asset Optimization**: Images and other assets are optimized

### Custom Build Configuration
If you need to customize the build:

1. **Base URL**: For subdirectory deployment, update `vite.config.ts`:
   ```typescript
   export default defineConfig({
     base: '/your-subdirectory/',
     // ... other config
   });
   ```

2. **Build Output**: Customize output directory:
   ```typescript
   export default defineConfig({
     build: {
       outDir: 'build', // instead of 'dist'
     },
   });
   ```

## Domain and SSL Configuration

### Custom Domain Setup
1. **DNS Configuration**:
   - Create a CNAME record pointing to your hosting provider
   - Or use A records for apex domains

2. **SSL Certificate**:
   - Most modern hosting platforms provide automatic SSL
   - Netlify and Vercel include free SSL certificates
   - For self-hosted: Use Let's Encrypt or purchase SSL certificate

### Subdomain Deployment
If deploying to a subdomain:
1. Update the base URL in `vite.config.ts`
2. Ensure routing handles the subdirectory correctly
3. Test all navigation and asset loading

## Performance Optimization

### CDN Configuration
For better global performance:
1. **Netlify**: Automatic global CDN
2. **Vercel**: Global Edge Network included
3. **Self-hosted**: Consider CloudFlare or AWS CloudFront

### Caching Strategy
Ensure proper caching headers:
```
index.html: no-cache
assets/*: 1 year cache with immutable filenames
```

Most static hosts configure this automatically.

## Monitoring and Analytics

### Basic Monitoring
- **Netlify**: Built-in analytics and performance monitoring
- **Vercel**: Analytics dashboard with Core Web Vitals
- **Google Analytics**: Add tracking code to `index.html`

### Error Monitoring
Consider adding error tracking:
- Sentry for JavaScript error monitoring
- LogRocket for session replay and debugging

## Troubleshooting

### Common Issues

**404 Errors on Page Refresh**
- Ensure client-side routing is configured properly
- Add fallback rules to serve `index.html` for SPA routes

**Assets Not Loading**
- Check base URL configuration in `vite.config.ts`
- Verify asset paths are relative and correct

**JavaScript Module Errors**
- Ensure hosting platform serves `.js` files with correct MIME type
- Modern browsers required for ES modules

**Performance Issues**
- Enable gzip/brotli compression
- Verify CDN is working properly  
- Check for large bundle sizes

### Getting Help
- Check hosting platform documentation
- Review browser console for specific error messages
- Test deployment locally with `npm run preview`
- Verify all environment variables and configurations

## Security Considerations

Since OpenSignal runs entirely in the browser:
- **Data Privacy**: All data stays in user's browser localStorage
- **HTTPS**: Always deploy with SSL/TLS encryption
- **Content Security Policy**: Consider adding CSP headers
- **Regular Updates**: Keep dependencies updated for security

## Backup and Migration

### Data Export
Users can export their GTSS data at any time:
1. Use the Export tab in the application
2. Download ZIP file containing all signal data
3. Store backups of exported data files

### Browser Data Migration
localStorage data is browser-specific:
- Data doesn't sync between devices automatically
- Users should export/import data when switching devices
- Consider adding import functionality in future versions