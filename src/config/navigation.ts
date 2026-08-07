import {
  Archive,
  BadgeCheck,
  BadgePercent,
  BookMarked,
  Box,
  Heart,
  Home,
  Layers3,
  LineChart,
  PackageOpen,
  ReceiptText,
  Scale,
  ScanLine,
  Search,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export type NavigationGroup = 'Overview' | 'Collection' | 'Market' | 'Tools';
export type MobileDestination = 'home' | 'browse' | 'scan' | 'vault' | 'more';

export interface NavigationItem {
  readonly path: string;
  readonly label: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly group: NavigationGroup;
  readonly mobile: MobileDestination;
  readonly requiresAuth?: boolean;
  readonly end?: boolean;
}

export const navigationItems = [
  {
    path: '/',
    label: 'Home',
    title: 'Home',
    icon: Home,
    group: 'Overview',
    mobile: 'home',
    end: true,
  },
  {
    path: '/browse',
    label: 'Browse',
    title: 'Browse cards',
    icon: Search,
    group: 'Collection',
    mobile: 'browse',
  },
  {
    path: '/binders',
    label: 'Binders',
    title: 'Binders',
    icon: BookMarked,
    group: 'Collection',
    mobile: 'more',
    requiresAuth: true,
  },
  {
    path: '/vault',
    label: 'Vault',
    title: 'Collection vault',
    icon: Archive,
    group: 'Collection',
    mobile: 'vault',
  },
  {
    path: '/sealed',
    label: 'Sealed',
    title: 'Sealed collection',
    icon: Box,
    group: 'Collection',
    mobile: 'more',
    requiresAuth: true,
  },
  {
    path: '/ledger',
    label: 'Ledger',
    title: 'Transaction ledger',
    icon: ReceiptText,
    group: 'Collection',
    mobile: 'more',
    requiresAuth: true,
  },
  {
    path: '/wishlist',
    label: 'Wishlist',
    title: 'Wishlist',
    icon: Heart,
    group: 'Collection',
    mobile: 'more',
  },
  {
    path: '/sets',
    label: 'Sets',
    title: 'Card sets',
    icon: Layers3,
    group: 'Collection',
    mobile: 'more',
  },
  {
    path: '/prices',
    label: 'Prices',
    title: 'Price tracking',
    icon: LineChart,
    group: 'Market',
    mobile: 'more',
  },
  {
    path: '/market-insights',
    label: 'Market insights',
    title: 'Market insights',
    icon: TrendingUp,
    group: 'Market',
    mobile: 'more',
  },
  {
    path: '/packs',
    label: 'Packs',
    title: 'Pack shop',
    icon: PackageOpen,
    group: 'Tools',
    mobile: 'more',
  },
  {
    path: '/trade',
    label: 'Trade analyzer',
    title: 'Trade analyzer',
    icon: Scale,
    group: 'Tools',
    mobile: 'more',
  },
  {
    path: '/rip-grade',
    label: 'Rip & grade',
    title: 'Rip & grade calculator',
    icon: BadgePercent,
    group: 'Tools',
    mobile: 'more',
  },
  {
    path: '/scanner',
    label: 'Scan',
    title: 'Card scanner',
    icon: ScanLine,
    group: 'Tools',
    mobile: 'scan',
  },
  {
    path: '/grading',
    label: 'Grading',
    title: 'Card grading',
    icon: BadgeCheck,
    group: 'Tools',
    mobile: 'more',
  },
] as const satisfies readonly NavigationItem[];

export const navigationGroups: readonly NavigationGroup[] = [
  'Overview',
  'Collection',
  'Market',
  'Tools',
];

export const mobileDestinationOrder: readonly MobileDestination[] = [
  'home',
  'browse',
  'scan',
  'vault',
];

export function isNavigationItemActive(item: NavigationItem, pathname: string) {
  return item.end
    ? pathname === item.path
    : pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function getDocumentTitle(pathname: string) {
  if (pathname.startsWith('/sets/')) return 'Set details · TCGTracker';

  const item = navigationItems.find((navigationItem) =>
    isNavigationItemActive(navigationItem, pathname)
  );
  if (item) return `${item.title} · TCGTracker`;

  if (pathname === '/login') return 'Sign in · TCGTracker';
  if (pathname === '/register') return 'Create account · TCGTracker';
  if (pathname === '/methodology') return 'Data methodology · TCGTracker';
  return 'Page not found · TCGTracker';
}
