import { isPublicReviewPath } from './lib/reviewPrivacy'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './AppRoutes'
import { ConvexProvider, ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { authEnabled } from './lib/convexApi'
import { AuthProvider, useFirebaseConvexAuth } from './lib/auth'
import InkFilters from './components/InkFilters'

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) || 'https://placeholder.convex.cloud'
const convex = new ConvexReactClient(convexUrl)

const routes = (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
)

// Firebase sign-in activates when its web config is set; Convex is always provided.
function Root() {
  if (!isPublicReviewPath(window.location.pathname) && authEnabled) {
    return (
      <AuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useFirebaseConvexAuth}>
          {routes}
        </ConvexProviderWithAuth>
      </AuthProvider>
    )
  }
  return <ConvexProvider client={convex}>{routes}</ConvexProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InkFilters />
    <Root />
  </StrictMode>,
)

// Analytics must not delay page rendering or prevent the app from starting.
if (!isPublicReviewPath(window.location.pathname)) void import('./lib/posthog').then(({ initPostHog }) => initPostHog()).catch(() => {});
