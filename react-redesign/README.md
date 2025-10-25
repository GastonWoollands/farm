# LiveStock React Frontend

A modern React-based frontend for the LiveStock farm management system, built with TypeScript, TailwindCSS, and Firebase authentication.

## 🚀 Features

- **Modern React 18** with TypeScript and Vite
- **Firebase Authentication** with email/password and password reset
- **Real-time Database Integration** with production backend
- **Mobile-responsive Design** with TailwindCSS
- **Dark/Light Theme** support
- **Animal Registration** with all RP fields
- **Real-time Metrics** and analytics
- **Advanced Search** functionality
- **CSV Export** capabilities
- **Multi-tenant Architecture** support

## 🛠️ Tech Stack

- **React 18** + TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for styling
- **shadcn/ui** for UI components
- **Firebase v12** for authentication
- **Lucide React** for icons

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔧 Configuration

### Environment Variables

The React app uses the same environment variable naming convention as your existing backend and frontend:

```env
# API Configuration (same as backend/frontend)
VITE_API_BASE_URL=https://farm-production-d087.up.railway.app
```

### Default Configuration

- **API Base URL**: `https://farm-production-d087.up.railway.app` (production)
- **Firebase Project**: `farm-4d233` (same as original frontend config.js)
- **Environment Variables**: Uses same naming as existing backend (`API_BASE_URL`)

## 🌐 Backend Integration

The React app connects to the production backend at `https://farm-production-d087.up.railway.app` and supports:

- **Multi-tenant data isolation**
- **Firebase token authentication**
- **Real-time animal registration**
- **Statistics and metrics**
- **CSV data export**
- **User and company management**

## 📱 Mobile Responsive

The app is fully responsive and optimized for:
- **Mobile phones** (320px+)
- **Tablets** (768px+)
- **Desktop** (1024px+)

## 🎨 Theme Support

- **Light theme** (default)
- **Dark theme** (toggle in header)
- **System preference** detection
- **Persistent theme** selection

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Netlify

1. Build the project: `npm run build`
2. Deploy the `dist` folder to Netlify
3. Set environment variables in Netlify dashboard

### Manual Deployment

1. Build the project: `npm run build`
2. Upload the `dist` folder to your web server
3. Configure your web server to serve the React app

## 🔐 Authentication

The app uses Firebase Authentication with:
- **Email/Password** sign-in and sign-up
- **Password reset** functionality
- **Automatic token management**
- **Multi-tenant user context**

## 📊 Data Management

- **Animal Registration**: Complete form with all RP fields
- **Real-time Updates**: Data syncs with backend automatically
- **Search & Filter**: Advanced search capabilities
- **Export**: CSV download with all data
- **Statistics**: Real-time metrics and analytics

## 🛡️ Security

- **Firebase Authentication** for secure user management
- **JWT token** validation for API calls
- **CORS** properly configured
- **Environment variables** for sensitive data
- **HTTPS** enforced in production

## 📝 Development

### Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── AuthScreen.tsx  # Authentication
│   ├── AnimalsPage.tsx # Animal management
│   ├── MetricsPage.tsx # Analytics dashboard
│   ├── SearchPage.tsx  # Search functionality
│   └── SettingsPage.tsx # Configuration
├── services/           # API and auth services
├── contexts/           # React contexts
├── config/             # Configuration files
└── lib/                # Utility functions
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🚀 Vercel Deployment

### Environment Variables

To deploy to Vercel with the correct backend URL, set the following environment variable:

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add a new variable:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://farm-production-d087.up.railway.app`
   - **Environment**: Production, Preview, Development

### Deployment Steps

1. Push your code to the repository
2. Connect your repository to Vercel
3. Set the environment variable as described above
4. Deploy

The app will automatically use the Railway backend URL when deployed to Vercel.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is part of the LiveStock farm management system.