import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Award } from 'lucide-react';
import { CardInvestmentData } from '../../../types/pokemon';

interface InvestmentBadgeProps {
  investmentData: CardInvestmentData;
  compact?: boolean;
}

export const InvestmentBadge: React.FC<InvestmentBadgeProps> = ({ investmentData, compact = false }) => {
  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'BUY': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'HOLD': return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
      case 'SELL': return 'bg-red-500/10 text-red-300 border-red-500/20';
      case 'WATCH': return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      default: return 'bg-surface-inset text-ink-primary border-border-default';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return <TrendingUp className="w-3 h-3" />;
      case 'BEARISH': return <TrendingDown className="w-3 h-3" />;
      default: return <Minus className="w-3 h-3" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-emerald-400';
      case 'MEDIUM': return 'text-amber-400';
      case 'HIGH': return 'text-red-400';
      default: return 'text-ink-secondary';
    }
  };

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRecommendationColor(investmentData.recommendation)}`}>
          {investmentData.recommendation}
        </span>
        <span className="px-2 py-1 bg-violet-500/10 text-violet-300 rounded-full text-xs font-medium flex items-center gap-1">
          <Target className="w-3 h-3" />
          {investmentData.investmentScore}
        </span>
        {investmentData.psaData.popReport.lowPop && (
          <span className="px-2 py-1 bg-amber-500/10 text-amber-300 rounded-full text-xs font-medium flex items-center gap-1">
            <Award className="w-3 h-3" />
            Low Pop
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRecommendationColor(investmentData.recommendation)}`}>
          {investmentData.recommendation}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-secondary">Score:</span>
          <span className="font-bold text-violet-400">{investmentData.investmentScore}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          {getTrendIcon(investmentData.marketAnalysis.trend)}
          <span className="text-ink-secondary">Trend:</span>
          <span className="font-medium">{investmentData.marketAnalysis.trend}</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className={`w-3 h-3 ${getRiskColor(investmentData.riskLevel)}`} />
          <span className="text-ink-secondary">Risk:</span>
          <span className={`font-medium ${getRiskColor(investmentData.riskLevel)}`}>
            {investmentData.riskLevel}
          </span>
        </div>
      </div>

      {(investmentData.marketAnalysis.isUndervalued || investmentData.marketAnalysis.isOvervalued) && (
        <div className="text-xs">
          {investmentData.marketAnalysis.isUndervalued && (
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-300 rounded-full">
              💎 Undervalued
            </span>
          )}
          {investmentData.marketAnalysis.isOvervalued && (
            <span className="px-2 py-1 bg-red-500/10 text-red-300 rounded-full">
              ⚠️ Overvalued
            </span>
          )}
        </div>
      )}
    </div>
  );
};