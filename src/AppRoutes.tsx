import { PageMetadata } from './seo/PageMetadata';
import { guides } from './seo/guides';
import { lazy } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { PageBoundary } from './components/PageBoundary';

const Landing = lazy(() => import('./App'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Review = lazy(() => import('./pages/Review'));
const Studio = lazy(() => import('./pages/Studio'));
const AssemblyStudio = lazy(() => import('./pages/AssemblyStudio'));
const Guides = lazy(() => import('./pages/Guides'));
const Guide = lazy(() => import('./pages/Guide'));
const Legal = lazy(() => import('./pages/Legal'));

export function AppRoutes() {
  const location = useLocation();
  const url = location.pathname + location.search + location.hash;
  return <PageBoundary key={location.key} retryUrl={window.location.origin + url}>
    <PageMetadata />
    <Routes>
      <Route path="/guides" element={<Guides />} />
      {guides.map(guide => <Route key={guide.path} path={guide.path} element={<Guide />} />)}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/review" element={<Review />} />
      <Route path="/create" element={<Dashboard />} />
      <Route path="/studio/project/:projectId" element={<AssemblyStudio />} />
      <Route path="/studio/:id" element={<Studio />} />
      <Route path="/privacy" element={<Legal />} />
      <Route path="/terms" element={<Legal />} />
      <Route path="/acceptable-use" element={<Legal />} />
      <Route path="/copyright" element={<Legal />} />
      <Route path="/refund-policy" element={<Legal />} />
      <Route path="*" element={<main className="min-h-screen bg-paper px-6 py-24 text-center text-ink"><h1 className="font-display text-2xl font-bold">Page not found</h1><Link to="/create" className="mt-6 inline-block underline">Go to your dashboard</Link></main>} />
    </Routes>
  </PageBoundary>;
}
