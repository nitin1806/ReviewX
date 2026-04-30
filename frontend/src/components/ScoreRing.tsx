interface ScoreRingProps {
  score: number;
  size?: number;
  label?: string;
  sublabel?: string;
}

function getColor(score: number): string {
  if (score >= 8) return '#22c55e';   // green
  if (score >= 6) return '#f59e0b';   // amber
  if (score >= 4) return '#f97316';   // orange
  return '#ef4444';                    // red
}

function getVerdict(score: number): string {
  if (score >= 8) return 'Accept';
  if (score >= 6) return 'Major Revision';
  if (score >= 4) return 'Reject & Resubmit';
  return 'Reject';
}

export function ScoreRing({ score, size = 120, label, sublabel }: ScoreRingProps) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{score.toFixed(1)}</span>
          <span className="text-xs text-slate-400">/10</span>
        </div>
      </div>
      {label && <span className="text-sm font-medium text-slate-300">{label}</span>}
      {sublabel && <span className="text-xs text-slate-500">{sublabel}</span>}
      {!sublabel && !label && (
        <span className="text-xs font-semibold" style={{ color }}>{getVerdict(score)}</span>
      )}
    </div>
  );
}

export { getColor, getVerdict };
