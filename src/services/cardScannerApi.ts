import axios from 'axios';
import { buildApiUrl } from '../config/env';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_BASE64_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// The Node API is always the primary browser path. This direct scanner origin is
// only a fallback for local development or deployments that explicitly expose it.
function getScannerBaseUrl(): string {
  const configured = import.meta.env.VITE_CARD_SCANNER_API_URL;
  if (import.meta.env.DEV) {
    // Dev: route through Vite's /api/scanner proxy → localhost:5001.
    return '/api/scanner';
  }
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  // Production does not guess a scanner host or try the user's localhost.
  return '';
}

const API_BASE_URL = getScannerBaseUrl();

const scannerAxios = axios.create({
  withCredentials: false,
  timeout: 90_000,
});

export interface ScanResult {
  success: boolean;
  card?: {
    name: string;
    set: string;
    number: string;
    confidence: number;
    id: string | null;
    image?: {
      small: string;
      large: string;
    };
  };
  message?: string;
  error?: string;
}

export interface AvailableSets {
  success: boolean;
  sets?: string[];
  error?: string;
}

function scannerHealthIsReady(payload: Record<string, unknown>): boolean {
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const scanner = (data.scanner as Record<string, unknown> | undefined) ?? data;
  const fastMatcher = scanner.fast_matcher as Record<string, unknown> | undefined;
  const features = scanner.features as Record<string, unknown> | undefined;
  const ready = fastMatcher?.ready ?? features?.fast_matcher_ready;
  return data.status === 'ok' && ready !== false;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB.`;
  }
  return null;
}

function shouldTryDirectScanner(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response?.status === 404) return true;
  if (error.response) return false;
  return !['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(error.code || '');
}

export async function scanCardFromFile(file: File): Promise<ScanResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await scannerAxios.post<ScanResult>(
      buildApiUrl('/api/grading/scan-card'),
      formData
    );
    return response.data;
  } catch (proxyError) {
    if (API_BASE_URL && shouldTryDirectScanner(proxyError)) {
      try {
        const response = await scannerAxios.post<ScanResult>(
          `${API_BASE_URL}/api/scan-card`,
          formData
        );
        return response.data;
      } catch {
        // Use the normalized error below.
      }
    }
    const error = proxyError;
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw new Error('Card recognition is temporarily unavailable. Try catalog search instead.');
  }
}

export async function scanCardFromBase64(base64Image: string): Promise<ScanResult> {
  const encoded = base64Image.includes(',')
    ? base64Image.slice(base64Image.indexOf(',') + 1)
    : base64Image;
  const decodedBytes = Math.ceil((encoded.length * 3) / 4);
  if (decodedBytes > MAX_BASE64_IMAGE_BYTES) {
    return { success: false, error: 'Camera image data too large. Max: 8MB.' };
  }

  try {
    const response = await scannerAxios.post<ScanResult>(
      buildApiUrl('/api/grading/scan-card'),
      { image: base64Image },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data;
  } catch (proxyError) {
    if (API_BASE_URL && shouldTryDirectScanner(proxyError)) {
      try {
        const response = await scannerAxios.post<ScanResult>(
          `${API_BASE_URL}/api/scan-card`,
          { image: base64Image },
          { headers: { 'Content-Type': 'application/json' } }
        );
        return response.data;
      } catch {
        // Use the normalized error below.
      }
    }
    const error = proxyError;
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw new Error('Card recognition is temporarily unavailable. Try catalog search instead.');
  }
}

export async function getAvailableSets(): Promise<AvailableSets> {
  try {
    const response = await scannerAxios.get<AvailableSets>(`${API_BASE_URL}/api/available-sets`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw error;
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await scannerAxios.get(buildApiUrl('/api/grading/health'), {
      timeout: 12_000,
    });
    if (scannerHealthIsReady(response.data as Record<string, unknown>)) return true;
  } catch {
    // Fall through to the direct scanner only when it is configured.
  }
  if (!API_BASE_URL) return false;
  try {
    const response = await scannerAxios.get(`${API_BASE_URL}/health`, {
      timeout: 12_000,
    });
    return scannerHealthIsReady(response.data as Record<string, unknown>);
  } catch {
    return false;
  }
}
