# Frontend - LiveStock

Progressive Web Application (PWA) for farm animal registration and management.

## Description

Modern web application built with vanilla JavaScript, featuring offline capabilities, Firebase authentication, and responsive design. Allows users to register, search, and manage cow records with real-time metrics and objectives tracking.

## Dependencies

### Core Technologies
- **HTML5** - Semantic markup and structure
- **CSS3** - Styling with custom properties and responsive design
- **Vanilla JavaScript** - ES6+ modules and modern JavaScript features
- **Firebase SDK** - Authentication and real-time database
- **IndexedDB** - Local storage for offline functionality

### External Services
- **Firebase Authentication** - User login and session management
- **Firebase Firestore** - Cloud database for data synchronization
- **Vercel Analytics** - Performance monitoring and insights

## File Structure

```
frontend/
├── index.html              # Main HTML structure and navigation
├── styles.css              # Global CSS styles and responsive design
├── manifest.json           # PWA manifest for app installation
├── service-worker.js       # Service worker for offline functionality
├── config.js              # Firebase configuration
├── db.js                  # IndexedDB operations and data management
├── app.js                 # Main application logic and form handling
├── icon-192.jpg           # PWA icon
└── app/                   # JavaScript modules
    ├── main.js            # Application initialization and navigation
    ├── auth.js            # Firebase authentication handling
    └── features/          # Feature-specific modules
        ├── metrics.js     # Metrics calculation and rendering
        ├── objectives.js  # Objectives management and configuration
        └── animal-search.js # Search functionality and edit modals
```

## File Interactions

### Core Files
- **`index.html`** - Main structure, navigation tabs, and form elements
- **`styles.css`** - Global styles, responsive design, and component styling
- **`app.js`** - Main application logic, form handling, and data operations
- **`main.js`** - Navigation management and feature initialization
- **`db.js`** - IndexedDB operations and local data storage
- **`auth.js`** - Firebase authentication and user session management

### Feature Modules
- **`metrics.js`** - Calculates and displays farm metrics and statistics
- **`objectives.js`** - Manages annual objectives and user configuration
- **`animal-search.js`** - Handles search functionality and record editing

### Configuration
- **`config.js`** - Firebase project configuration
- **`manifest.json`** - PWA settings and app metadata
- **`service-worker.js`** - Offline caching and background sync

## Application Features

### Navigation Tabs
- **Métricas** - Farm statistics and performance metrics
- **Vacas** - Cow registration and management
- **Buscar** - Search and edit animal records
- **Configuración** - Objectives and user preferences

### Key Functionality
- **Offline Support** - Works without internet connection
- **Data Sync** - Automatic synchronization with Firebase
- **Search & Edit** - Find and modify animal records
- **Objectives Tracking** - Set and monitor annual goals
- **Responsive Design** - Mobile-friendly interface

## Running the Application

### Development
```bash
# Serve with Python
python -m http.server 8000

# Or with Node.js
npx serve .

# Or with PHP
php -S localhost:8000
```

### Production
Deploy to any static hosting service (Vercel, Netlify, GitHub Pages, etc.)

## Configuration

1. Update `config.js` with your Firebase project details
2. Configure Firebase Authentication in your Firebase console
3. Set up Firestore database rules for data access

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Mobile browsers with ES6 support

