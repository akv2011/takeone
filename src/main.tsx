import { isPublicReviewPath } from './lib/reviewPrivacy'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './AppRoutes'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { authEnabled } from './lib/convexApi'
import { clerkAppearance, clerkLocalization } from './lib/clerkTheme'

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) || 'https://placeholder.convex.cloud'
const convex = new ConvexReactClient(convexUrl)

const routes = (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
)

// Clerk (Google sign-in) activates when the publishable key is set; Convex is always provided.
function Root() {
  if (!isPublicReviewPath(window.location.pathname) && authEnabled && pk) {
    return (
      <ClerkProvider publishableKey={pk} afterSignOutUrl="/" appearance={clerkAppearance} localization={clerkLocalization}
        signInForceRedirectUrl="/create" signUpForceRedirectUrl="/create">
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {routes}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    )
  }
  return <ConvexProvider client={convex}>{routes}</ConvexProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Analytics must not delay page rendering or prevent the app from starting.
if (!isPublicReviewPath(window.location.pathname)) void import('./lib/posthog').then(({ initPostHog }) => initPostHog()).catch(() => {});
