import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './lib/auth'
import { ErrorBoundary } from './components/ErrorBoundary'
// Optional cloud providers: data stays local; connecting adds backup + sync.
import './utils/googleDriveProvider'
import { scheduleBareHashCleanup } from './utils/urlCleanup'
import './index.css'
import App from './App.tsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id.apps.googleusercontent.com';

// Supabase clears the OAuth fragment with `location.hash = ''`, which leaves a
// bare "#" in the address bar. Strip it once auth-js has had its turn.
scheduleBareHashCleanup();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
