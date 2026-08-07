import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { HeroSection } from './components/common/HeroSection';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { BottomTabBar } from './components/layout/BottomTabBar';
import { CommandPalette } from './components/common/CommandPalette';
import { OnboardingChecklist } from './components/common/OnboardingChecklist';
import { useToast } from './components/common/Toast';
import { getDocumentTitle } from './config/navigation';
import { CardModalProvider } from './contexts/CardModalContext';
import { GameProvider } from './contexts/GameContext';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { BrowsePage } from './pages/BrowsePage';
import { MethodologyPage } from './pages/MethodologyPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { VIEW_PATHS, browseSearchPath } from './utils/routes';

const PriceTrackingDashboard = lazy(() =>
  import('./features/market/components/PriceTrackingDashboard').then((m) => ({
    default: m.PriceTrackingDashboard,
  }))
);
const MarketInsightsDashboard = lazy(() =>
  import('./features/market-insights/components/MarketInsightsDashboard').then((m) => ({
    default: m.MarketInsightsDashboard,
  }))
);
const VaultView = lazy(() =>
  import('./features/vault/components/VaultView').then((m) => ({ default: m.VaultView }))
);
const PackShop = lazy(() =>
  import('./features/packs/components/PackShop').then((m) => ({ default: m.PackShop }))
);
const CardScanner = lazy(() =>
  import('./features/scanner/components/CardScanner').then((m) => ({ default: m.CardScanner }))
);
const GradingPage = lazy(() =>
  import('./features/grading/components/GradingPage').then((m) => ({ default: m.GradingPage }))
);
const SetIndex = lazy(() =>
  import('./features/sets/components/SetIndex').then((m) => ({ default: m.SetIndex }))
);
const SetDetail = lazy(() =>
  import('./features/sets/components/SetDetail').then((m) => ({ default: m.SetDetail }))
);
const WishlistView = lazy(() =>
  import('./features/wishlist/components/WishlistView').then((m) => ({ default: m.WishlistView }))
);
const BindersIndex = lazy(() =>
  import('./features/binders/components/BindersIndex').then((m) => ({ default: m.BindersIndex }))
);
const SealedProductsView = lazy(() =>
  import('./features/sealed/components/SealedProductsView').then((m) => ({
    default: m.SealedProductsView,
  }))
);
const TransactionsLedger = lazy(() =>
  import('./features/ledger/components/TransactionsLedger').then((m) => ({
    default: m.TransactionsLedger,
  }))
);
const TradeAnalyzer = lazy(() =>
  import('./features/trade/components/TradeAnalyzer').then((m) => ({ default: m.TradeAnalyzer }))
);
const RipGradeCalculator = lazy(() =>
  import('./features/analysis/components/RipGradeCalculator').then((m) => ({
    default: m.RipGradeCalculator,
  }))
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

// Protects routes that hit authenticated backend endpoints. The rest of the app
// is local-first and stays open to everyone.
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

// Redirect to /login when a backend call 401s mid-session (e.g. expired token).
function UnauthorizedRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  useEffect(() => {
    const onUnauthorized = () => {
      if (location.pathname === '/login' || location.pathname === '/register') return;
      showToast('Your session expired. Please sign in again to continue.', 'info');
      navigate('/login', { state: { from: location.pathname } });
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [navigate, location.pathname, showToast]);

  return null;
}

function DocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    document.title = getDocumentTitle(location.pathname);
  }, [location.pathname]);

  return null;
}

function NotFoundPage() {
  return (
    <section
      className={`${PAGE_CONTAINER} flex min-h-[40vh] items-center justify-center text-center`}
    >
      <div className="max-w-md rounded-2xl border border-border-default bg-surface-raised p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink-primary">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          The link may be outdated. Return home or search the card catalog instead.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="btn-secondary">
            Go home
          </Link>
          <Link to="/browse" className="btn-primary">
            Browse cards
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomePage() {
  const navigate = useNavigate();
  return (
    <HeroSection
      onStartSearch={(query) => navigate(browseSearchPath(query))}
      onViewChange={(view) => navigate(VIEW_PATHS[view])}
    />
  );
}

function SetsPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  return (
    <div>
      {setId ? (
        <SetDetail setId={setId} onBack={() => navigate('/sets')} />
      ) : (
        <SetIndex onSelectSet={(id: string) => navigate(`/sets/${id}`)} />
      )}
    </div>
  );
}

function VaultPage() {
  const navigate = useNavigate();
  return (
    <div>
      <VaultView onOpenSet={(setId) => navigate(`/sets/${setId}`)} />
    </div>
  );
}

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.16, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } },
};

const PAGE_CONTAINER = 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8';

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
      >
        <Suspense fallback={<RouteFallback />}>
          <ErrorBoundary>
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/methodology" element={<MethodologyPage />} />
              <Route
                path="/prices"
                element={
                  <div className={PAGE_CONTAINER}>
                    <PriceTrackingDashboard />
                  </div>
                }
              />
              <Route
                path="/market-insights"
                element={
                  <div className={PAGE_CONTAINER}>
                    <MarketInsightsDashboard />
                  </div>
                }
              />
              <Route path="/vault" element={<VaultPage />} />
              <Route
                path="/wishlist"
                element={
                  <div className={PAGE_CONTAINER}>
                    <WishlistView />
                  </div>
                }
              />
              <Route
                path="/binders"
                element={
                  <div className={PAGE_CONTAINER}>
                    <RequireAuth>
                      <BindersIndex />
                    </RequireAuth>
                  </div>
                }
              />
              <Route path="/sets" element={<SetsPage />} />
              <Route path="/sets/:setId" element={<SetsPage />} />
              <Route
                path="/packs"
                element={
                  <div className={PAGE_CONTAINER}>
                    <PackShop />
                  </div>
                }
              />
              <Route
                path="/scanner"
                element={
                  <div className={PAGE_CONTAINER}>
                    <CardScanner />
                  </div>
                }
              />
              <Route
                path="/grading"
                element={
                  <div className={PAGE_CONTAINER}>
                    <GradingPage />
                  </div>
                }
              />
              <Route
                path="/sealed"
                element={
                  <div className={PAGE_CONTAINER}>
                    <RequireAuth>
                      <SealedProductsView />
                    </RequireAuth>
                  </div>
                }
              />
              <Route
                path="/ledger"
                element={
                  <div className={PAGE_CONTAINER}>
                    <RequireAuth>
                      <TransactionsLedger />
                    </RequireAuth>
                  </div>
                }
              />
              <Route
                path="/trade"
                element={
                  <div className={PAGE_CONTAINER}>
                    <TradeAnalyzer />
                  </div>
                }
              />
              <Route
                path="/rip-grade"
                element={
                  <div className={PAGE_CONTAINER}>
                    <RipGradeCalculator />
                  </div>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <GameProvider>
        <CardModalProvider>
          <div className="flex min-h-screen min-w-0 bg-surface-base text-ink-primary">
            <a
              href="#main-content"
              className="sr-only z-[95] rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[color:var(--accent-foreground)] shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Skip to content
            </a>
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
              <Header />

              <main id="main-content" className="relative min-w-0 flex-1 pb-20 md:pb-0">
                <AppRoutes />
              </main>

              <OnboardingChecklist />
              <Footer />
            </div>

            <BottomTabBar />
            <CommandPalette />
            <UnauthorizedRedirect />
            <DocumentTitle />
          </div>
        </CardModalProvider>
      </GameProvider>
    </MotionConfig>
  );
}

export default App;
