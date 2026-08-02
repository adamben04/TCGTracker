/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'charts': ['recharts'],
          'motion': ['framer-motion'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/psa': {
        target: 'https://www.psacard.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/psa/, ''),
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/pwcc': {
        target: 'https://www.pwccmarketplace.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pwcc/, ''),
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/cardladder': {
        target: 'https://www.cardladder.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cardladder/, ''),
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/pokemonprice': {
        target: 'https://www.pokemonprice.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pokemonprice/, ''),
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/prices': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/cards': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/alerts': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/portfolio': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/packs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/market-insights': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000
      },
      '/api/pokemontcg': {
        target: 'https://api.pokemontcg.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pokemontcg/, ''),
        timeout: 60000, // 60 second timeout for proxy
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'backend/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
      ],
    },
  },
});