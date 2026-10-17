import { PageMetadata } from './seo/PageMetadata';
import { guides } from './seo/guides';
import { lazy, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { PageBoundary } from './components/PageBoundary';
import BlankStrip from './components/BlankStrip';
import SkyBackdrop from './components/SkyBackdrop';
import { button } from './lib/ui';
import { authEnabled } from './lib/convexApi';

const Landing = lazy(() => import('./App'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Review = lazy(() => import('./pages/Review'));
const Clip = lazy(() => import('./pages/Clip'));
const Studio = lazy(() => import('./pages/Studio'));
const AssemblyStudio = lazy(() => import('./pages/AssemblyStudio'));
const Guides = lazy(() => import('./pages/Guides'));
const Guide = lazy(() => import('./pages/Guide'));
const Legal = lazy(() => import('./pages/Legal'));

function NoticePage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center px-5 py-24 text-ink">
    <div className="sheet w-full max-w-[520px] p-8 text-center sm:p-10">
      <BlankStrip frames={4} className="max-w-[220px]" />
      <p className="mt-8 text-[13px] font-medium text-muted">{eyebrow}</p>
      <h1 className="display mt-2 text-[32px]">{title}</h1>
      {children}
    </div>
  </main>;
}

// main.tsx mounts AuthProvider only when the Firebase web config is set; without it the private pages cannot render.
function SignInUnavailable() {
  return <NoticePage eyebrow="Setup needed" title="Sign-in is not set up">
    <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink2">The dashboard and Studio need a sign-in provider. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID for this deployment, then build and deploy the site again.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/guides" className={button("secondary", "lg")}>Read the guides</Link><Link to="/" className={button("primary", "lg")}>Go to the home page</Link></div>
  </NoticePage>;
}

export function AppRoutes() {
  const location = useLocation();
  const url = location.pathname + location.search + location.hash;
  return <PageBoundary key={location.key} retryUrl={window.location.origin + url}>
    <SkyBackdrop calm={location.pathname !== '/'} />
    <PageMetadata />
    <Routes>
      <Route path="/guides" element={<Guides />} />
      {guides.map(guide => <Route key={guide.path} path={guide.path} element={<Guide />} />)}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing auth={authEnabled} />} />
      <Route path="/review" element={<Review />} />
      <Route path="/clip/:id" element={<Clip />} />
      <Route path="/create" element={authEnabled ? <Dashboard /> : <SignInUnavailable />} />
      <Route path="/studio/project/:projectId" element={authEnabled ? <AssemblyStudio /> : <SignInUnavailable />} />
      <Route path="/studio/:id" element={authEnabled ? <Studio /> : <SignInUnavailable />} />
      <Route path="/privacy" element={<Legal />} />
      <Route path="/terms" element={<Legal />} />
      <Route path="/acceptable-use" element={<Legal />} />
      <Route path="/copyright" element={<Legal />} />
      <Route path="/refund-policy" element={<Legal />} />
      <Route path="*" element={<NoticePage eyebrow="404" title="Page not found"><p className="mt-3 text-[15px] text-ink2">This address does not match a TakeOne page.</p><Link to="/create" className={`${button("primary", "lg")} mt-7`}>Go to your videos</Link></NoticePage>} />
    </Routes>
  </PageBoundary>;
}
