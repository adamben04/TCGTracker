import axios from 'axios';
import { buildApiUrl } from '../config/env';

import '../config/apiClient';

export interface SealedProduct {
  id: number;
  name: string;
  game: 'pokemon' | 'onepiece';
  product_type: string;
  set_name?: string;
  quantity: number;
  purchase_price: number;
  current_value?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SealedStats {
  itemCount: number;
  totalInvestment: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  byType: Record<string, { count: number; value: number; investment: number }>;
}

export type TransactionType = 'buy' | 'sell' | 'trade_in' | 'trade_out';

export interface Transaction {
  id: number;
  type: TransactionType;
  card_id?: string;
  card_name: string;
  game: 'pokemon' | 'onepiece';
  quantity: number;
  price_each: number;
  fees: number;
  transaction_date: string;
  notes?: string;
  created_at: string;
}

export interface LedgerSummary {
  totalInvested: number;
  totalRevenue: number;
  totalFees: number;
  realizedProfitLoss: number;
  realizedProfitLossPercentage: number;
  count: number;
  buyCount: number;
  sellCount: number;
}

const api = axios.create({ baseURL: buildApiUrl('') });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tcgtracker_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Sealed products ---

export async function fetchSealedProducts(): Promise<SealedProduct[]> {
  const response = await api.get<{ success: boolean; data: { items: SealedProduct[] } }>(
    '/api/collection-tools/sealed'
  );
  return response.data?.data?.items ?? [];
}

export async function fetchSealedStats(): Promise<SealedStats> {
  const response = await api.get<{ success: boolean; data: { stats: SealedStats } }>(
    '/api/collection-tools/sealed/stats'
  );
  return response.data?.data?.stats;
}

export async function addSealedProduct(input: {
  name: string;
  game: 'pokemon' | 'onepiece';
  productType: string;
  setName?: string;
  quantity: number;
  purchasePrice: number;
  currentValue?: number;
  notes?: string;
}): Promise<SealedProduct> {
  const response = await api.post<{ success: boolean; data: { item: SealedProduct } }>(
    '/api/collection-tools/sealed',
    input
  );
  return response.data?.data?.item;
}

export async function updateSealedProduct(
  id: number,
  input: Partial<{
    name: string;
    game: 'pokemon' | 'onepiece';
    productType: string;
    setName?: string;
    quantity: number;
    purchasePrice: number;
    currentValue?: number;
    notes?: string;
  }>
): Promise<SealedProduct> {
  const response = await api.put<{ success: boolean; data: { item: SealedProduct } }>(
    `/api/collection-tools/sealed/${id}`,
    input
  );
  return response.data?.data?.item;
}

export async function deleteSealedProduct(id: number): Promise<void> {
  await api.delete(`/api/collection-tools/sealed/${id}`);
}

// --- Transactions ledger ---

export async function fetchTransactions(): Promise<{
  items: Transaction[];
  summary: LedgerSummary;
}> {
  const response = await api.get<{
    success: boolean;
    data: { items: Transaction[]; summary: LedgerSummary };
  }>('/api/collection-tools/transactions');
  return (
    response.data?.data ?? {
      items: [],
      summary: {
        totalInvested: 0,
        totalRevenue: 0,
        totalFees: 0,
        realizedProfitLoss: 0,
        realizedProfitLossPercentage: 0,
        count: 0,
        buyCount: 0,
        sellCount: 0,
      },
    }
  );
}

export async function addTransaction(input: {
  type: TransactionType;
  cardId?: string;
  cardName: string;
  game: 'pokemon' | 'onepiece';
  quantity: number;
  priceEach: number;
  fees?: number;
  transactionDate: string;
  notes?: string;
}): Promise<{ item: Transaction; summary: LedgerSummary }> {
  const response = await api.post<{
    success: boolean;
    data: { item: Transaction; summary: LedgerSummary };
  }>('/api/collection-tools/transactions', input);
  return response.data?.data;
}

export async function deleteTransaction(id: number): Promise<LedgerSummary> {
  const response = await api.delete<{
    success: boolean;
    data: { removed: boolean; summary: LedgerSummary };
  }>(`/api/collection-tools/transactions/${id}`);
  return response.data?.data?.summary;
}

export function exportLedgerCsvUrl(): string {
  return `${buildApiUrl('/api/collection-tools/transactions/export')}?auth=${encodeURIComponent(localStorage.getItem('tcgtracker_token') ?? '')}`;
}
