import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, Lightbulb, XCircle, CheckCircle2 } from 'lucide-react';
import { SectionFeedback } from '../types/review';
import { getColor } from './ScoreRing';

interface SectionCardProps {
  section: SectionFeedback;
  index: number;
}

export function SectionCard({ section, index }: SectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getColor(section.score);

  const scoreBarWidth = `${(section.score / 10) * 100}%`;

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition-all duration-200 hover:border-slate-700 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-800/50 transition-colors"
      >
        {/* Present/Absent badge */}
        <div className="shrink-0">
          {section.present ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400" />
          )}
        </div>

        {/* Section name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{section.name}</span>
            {!section.present && (
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-0.5">
                Missing
              </span>
            )}
          </div>
          {/* Score bar */}
          {section.present && (
            <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: scoreBarWidth, backgroundColor: color }}
              />
            </div>
          )}
        </div>

        {/* Score */}
        <div className="shrink-0 text-right">
          {section.present ? (
            <span className="text-lg font-bold" style={{ color }}>{section.score.toFixed(1)}</span>
          ) : (
            <span className="text-lg font-bold text-red-400">—</span>
          )}
          <span className="text-slate-500 text-sm">/10</span>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-800 p-5 space-y-5">
          {/* Feedback */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reviewer Feedback</h4>
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{section.feedback}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Issues */}
            {section.issues.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Issues
                </h4>
                <ul className="space-y-1.5">
                  {section.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {section.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Suggestions
                </h4>
                <ul className="space-y-1.5">
                  {section.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Web sources */}
          {section.sources.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
                🌐 Retrieved Context
              </h4>
              <div className="space-y-2">
                {section.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-3 bg-slate-800 rounded-xl hover:bg-slate-750 transition-colors group"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 group-hover:text-cyan-300" />
                    <div className="min-w-0">
                      <p className="text-cyan-400 text-xs font-medium truncate group-hover:text-cyan-300">{src.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{src.snippet}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
