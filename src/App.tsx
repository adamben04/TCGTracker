import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { HeroSection } from './components/common/HeroSection';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { BottomTabBar } from './components/layout/BottomTabBar';
import { CommandPalette } from './components/common/CommandPalette';
import { OnboardingChecklist } from './components/common/OnboardingChecklist';
import { CardModalProvider } from './contexts/CardModalContext';
import { GameProvider } from './contexts/GameContext';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { BrowsePage } from './pages/BrowsePage';
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

  useEffect(() => {
    const onUnauthorized = () => {
      if (location.pathname === '/login' || location.pathname === '/register') return;
      navigate('/login', { state: { from: location.pathname } });
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [navigate, location.pathname]);

  return null;
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
    <div className="animate-fade-in">
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
    <div className="animate-fade-in">
      <VaultView onOpenSet={(setId) => navigate(`/sets/${setId}`)} />
    </div>
  );
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
};

const PAGE_CONTAINER = 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8';

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="popLayout">
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
              <Route path="*" element={<Navigate to="/" replace />} />
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
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
              <a
                href="#main-content"
                className="sr-only z-[95] rounded-none bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wider text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
              >
                Skip to content
              </a>

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
          </div>
        </CardModalProvider>
      </GameProvider>
    </MotionConfig>
  );
}

export default App;
