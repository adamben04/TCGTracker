import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { useToast } from '../../../components/common/Toast';
import { useGame } from '../../../contexts/GameContext';
import {
  checkGradingBackendHealth,
  getGradingHistory,
  gradeCard,
} from '../../../services/gradingService';
import { vaultService } from '../../../services/vaultService';
import { GradingResult, gradeToVaultCondition } from '../../../types/grading';
import { PokemonCard } from '../../../types/pokemon';
import { GradingCapture } from './GradingCapture';
import { GradingHistory } from './GradingHistory';
import { GradingResultView } from './GradingResultView';

export const GradingPage: React.FC = () => {
  const { game } = useGame();
  const { showToast } = useToast();

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [history, setHistory] = useState<GradingResult[]>([]);
  const [captureKey, setCaptureKey] = useState(0);
  const healthRequestRef = useRef(0);

  const refreshHistory = useCallback(async () => {
    const h = await getGradingHistory();
    setHistory(h);
  }, []);

  const wakeGradingService = useCallback(async () => {
    const requestId = ++healthRequestRef.current;
    setBackendOk(null);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (healthRequestRef.current !== requestId) return;
      const healthy = await checkGradingBackendHealth();
      if (healthRequestRef.current !== requestId) return;
      if (healthy) {
        setBackendOk(true);
        return;
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
    if (healthRequestRef.current === requestId) setBackendOk(false);
  }, []);

  useEffect(() => {
    void wakeGradingService();
    void refreshHistory();
    return () => {
      healthRequestRef.current += 1;
    };
  }, [refreshHistory, wakeGradingService]);

  const handleCapture = async (image: File | string, backImage?: File | string) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    try {
      const grading = await gradeCard(image, {
        game,
        cardName: 'Graded Card',
        backImage,
      });
      setResult(grading);
      await refreshHistory();
      showToast(`Graded ${grading.gradeLabel} (${grading.grade}/10)`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Grading failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToVault = (grading: GradingResult) => {
    // Open card picker via browse modal if available; otherwise create a stub vault entry prompt
    const stub: PokemonCard = {
      id: grading.cardId || grading.id,
      name: grading.cardName || 'Graded Card',
      number: '',
      images: {
        small: grading.imageUrl || '',
        large: grading.imageUrl || '',
      },
      set: { id: '', name: 'Unknown Set', releaseDate: '', total: 0 },
      marketPrice: grading.estimatedGradedValue,
    };

    const condition = (grading.suggestedCondition ||
      gradeToVaultCondition(grading.grade)) as import('../../../types/pokemon').CardCondition;

    const price = grading.estimatedGradedValue || 0;
    const entry = vaultService.addToVault(
      stub,
      price,
      1,
      condition,
      `PSA-style Grade ${grading.grade} ${grading.gradeLabel}`,
      game
    );
    vaultService.updateVaultCard(entry.id, { gradingResult: grading }, game);
    showToast('Added graded card to vault', 'success');
  };

  const handleGradeAnother = () => {
    setResult(null);
    setError(null);
    setCaptureKey((k) => k + 1);
  };

  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="page-accent-strip" />
      <div className="mb-6">
        <SectionLabel className="text-accent/90">Tools</SectionLabel>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-h2 font-display font-bold">Card condition estimate</h1>
          {backendOk === true && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gain/30 bg-gain-muted px-2 py-0.5 text-[10px] font-medium text-gain">
              Online
            </span>
          )}
          {backendOk === null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Waking service
            </span>
          )}
          {backendOk === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Analysis unavailable
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Computer-vision estimate for centering, corners, edges, and surface on a 10-point scale.
          Photo quality limits what can be measured; this is not a professional grade.
        </p>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-border-default bg-surface-inset p-4 text-xs leading-5 text-ink-muted sm:grid-cols-2">
        <p>
          <span className="font-medium text-ink-primary">Measures:</span> visible centering, corner,
          edge, and surface condition candidates from front/back photos.
        </p>
        <p>
          <span className="font-medium text-ink-primary">Cannot verify:</span> authenticity,
          trimming, thickness, pressing, restoration, or defects hidden by glare.
        </p>
      </div>

      {backendOk === false && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-ink-primary">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">The grading service is temporarily unavailable.</p>
              <p className="mt-1 text-ink-muted">
                Existing grading history remains available. New analysis will unlock automatically
                when the deployed service is healthy.
              </p>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={() => void wakeGradingService()}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!result && (
            <GradingCapture
              key={captureKey}
              onCapture={handleCapture}
              isProcessing={isProcessing}
              disabled={isProcessing || backendOk !== true}
            />
          )}

          {isProcessing && (
            <div className="card-glass-scene relative overflow-hidden py-12">
              <div className="animate-shimmer-accent absolute inset-0" />
              <div className="relative flex flex-col items-center justify-center gap-3 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  <Sparkles className="h-6 w-6 text-accent" />
                </motion.div>
                <p className="text-sm font-medium text-ink-primary">
                  Analyzing centering, corners, edges & surface…
                </p>
                <p className="text-xs text-ink-muted">This takes a few seconds</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {result && (
            <GradingResultView
              result={result}
              rawPrice={undefined}
              onAddToVault={handleAddToVault}
              onGradeAnother={handleGradeAnother}
            />
          )}
        </div>

        <aside>
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Grading history</h2>
          <GradingHistory
            history={history}
            selectedId={result?.id}
            onSelect={(r) => {
              setResult(r);
              setError(null);
            }}
          />
        </aside>
      </div>
    </div>
  );
};
