import { useState } from 'react';
import { Download, RefreshCw, ExternalLink, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, PenLine } from 'lucide-react';
import { ReviewResult, PlagiarismResult, PlagiarismMatch, GrammarResult, CitationValidationResult } from '../types/review';
import { ScoreRing, getColor, getVerdict } from './ScoreRing';
import { SectionCard } from './SectionCard';

// ── Plagiarism Panel ──────────────────────────────────────────────────────────

const RISK_CONFIG = {
  Low:    { color: '#22c55e', bg: '#22c55e15', border: '#22c55e40', Icon: ShieldCheck,  label: 'Low Risk'    },
  Medium: { color: '#f59e0b', bg: '#f59e0b15', border: '#f59e0b40', Icon: ShieldAlert,  label: 'Medium Risk' },
  High:   { color: '#ef4444', bg: '#ef444415', border: '#ef444440', Icon: ShieldX,      label: 'High Risk'   },
};

function PassageCard({ match }: { match: PlagiarismMatch }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(match.similarity_score * 100);
  const barColor = pct >= 40 ? '#ef4444' : pct >= 20 ? '#f59e0b' : '#22c55e';

  return (
    <div className="bg-slate-800/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${barColor}20`, color: barColor }}
          >
            {pct}%
          </span>
          <span className="text-xs text-slate-400 truncate">{match.section}</span>
          <span className="text-xs text-slate-500 truncate hidden sm:block">
            — {match.passage.slice(0, 60)}…
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Paper passage</p>
            <p className="text-sm text-slate-300 bg-slate-900/60 rounded-lg p-3 leading-relaxed">
              {match.passage}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Matched source</p>
            <a
              href={match.matched_source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-3 bg-slate-900/60 rounded-lg hover:bg-slate-900 transition-colors group"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-cyan-400 text-xs font-medium truncate">{match.matched_source.title}</p>
                <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{match.matched_source.snippet}</p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PlagiarismPanel({ plagiarism }: { plagiarism: PlagiarismResult }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RISK_CONFIG[plagiarism.risk_level] ?? RISK_CONFIG.Low;
  const { Icon } = cfg;
  const barWidth = Math.min(plagiarism.overall_similarity, 100);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 shrink-0" style={{ color: cfg.color }} />
          <div>
            <h3 className="font-semibold text-white">Plagiarism Check</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {plagiarism.checked_chunks} passage{plagiarism.checked_chunks !== 1 ? 's' : ''} checked
              · {plagiarism.flagged_passages.length} flagged
            </p>
          </div>
        </div>

        {/* Risk badge */}
        <div
          className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
        >
          <Icon className="w-3.5 h-3.5" />
          {cfg.label}
        </div>
      </div>

      {/* Similarity bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Overall similarity</span>
          <span style={{ color: cfg.color }}>{plagiarism.overall_similarity.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${barWidth}%`, backgroundColor: cfg.color }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>0%</span>
          <span className="text-yellow-600">20% Medium</span>
          <span className="text-red-600">40% High</span>
          <span>100%</span>
        </div>
      </div>

      {/* Flagged passages */}
      {plagiarism.flagged_passages.length === 0 ? (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            No significant matches found across checked passages.
          </div>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-3"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'Show'} {plagiarism.flagged_passages.length} flagged passage{plagiarism.flagged_passages.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <div className="space-y-2">
              {plagiarism.flagged_passages.map((match, i) => (
                <PassageCard key={i} match={match} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReviewDisplayProps {
  result: ReviewResult;
  onReset: () => void;
}

// ── Grammar & Clarity Panel ───────────────────────────────────────────────────

const GRAMMAR_CATEGORIES = [
  { key: 'passive_voice_instances' as const, label: 'Passive Voice',        color: 'text-orange-400',  dot: 'bg-orange-400' },
  { key: 'complex_sentences'       as const, label: 'Complex Sentences',    color: 'text-yellow-400',  dot: 'bg-yellow-400' },
  { key: 'undefined_acronyms'      as const, label: 'Undefined Acronyms',   color: 'text-red-400',     dot: 'bg-red-400'    },
  { key: 'hedging_phrases'         as const, label: 'Hedging Phrases',      color: 'text-slate-400',   dot: 'bg-slate-400'  },
];

function GrammarPanel({ grammar }: { grammar: GrammarResult }) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpenCats(s => ({ ...s, [key]: !s[key] }));

  const totalIssues = GRAMMAR_CATEGORIES.reduce((n, c) => n + grammar[c.key].length, 0);
  const scoreColor = grammar.clarity_score >= 7 ? '#22c55e' : grammar.clarity_score >= 5 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PenLine className="w-5 h-5 shrink-0" style={{ color: scoreColor }} />
          <div>
            <h3 className="font-semibold text-white">Grammar & Clarity</h3>
            <p className="text-xs text-slate-500 mt-0.5">Abstract + Introduction analysed · {totalIssues} issue{totalIssues !== 1 ? 's' : ''} found</p>
          </div>
        </div>
        <div
          className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold"
          style={{ backgroundColor: `${scoreColor}15`, border: `1px solid ${scoreColor}40`, color: scoreColor }}
        >
          {grammar.clarity_score.toFixed(1)} / 10
        </div>
      </div>

      {/* Score bar */}
      <div className="px-5 pb-4">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${grammar.clarity_score * 10}%`, backgroundColor: scoreColor }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>0</span><span className="text-yellow-600">5 Needs work</span><span className="text-green-600">8 Good</span><span>10</span>
        </div>
      </div>

      {/* Issue categories */}
      <div className="px-5 pb-5 space-y-2">
        {GRAMMAR_CATEGORIES.map(cat => {
          const items = grammar[cat.key];
          if (items.length === 0) return null;
          const isOpen = openCats[cat.key];
          return (
            <div key={cat.key} className="bg-slate-800/50 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(cat.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cat.dot}`} />
                  <span className={`text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                  <span className="text-xs text-slate-500">({items.length})</span>
                </div>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              {isOpen && (
                <ul className="px-4 pb-3 space-y-1.5 border-t border-slate-700/50 pt-2">
                  {items.map((item, i) => (
                    <li key={i} className="text-xs text-slate-300 bg-slate-900/60 rounded-lg px-3 py-2 leading-relaxed">
                      "{item}"
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {/* Suggestions */}
        {grammar.suggestions.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle('suggestions')}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-400" />
                <span className="text-xs font-semibold text-violet-400">Suggestions</span>
                <span className="text-xs text-slate-500">({grammar.suggestions.length})</span>
              </div>
              {openCats['suggestions'] ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {openCats['suggestions'] && (
              <ul className="px-4 pb-3 space-y-1.5 border-t border-slate-700/50 pt-2">
                {grammar.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {totalIssues === 0 && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            No significant writing issues detected. Well done!
          </div>
        )}
      </div>
    </div>
  );
}

// ── Citation Panel ────────────────────────────────────────────────────────────

function CitationPanel({ citations }: { citations: CitationValidationResult }) {
  const [expanded, setExpanded] = useState(false);
  const pct = citations.total_parsed > 0
    ? Math.round((citations.verified_count / citations.total_parsed) * 100)
    : 100;
  const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: barColor }} />
          <div>
            <h3 className="font-semibold text-white">Citation Validator</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {citations.total_parsed} reference{citations.total_parsed !== 1 ? 's' : ''} checked
            </p>
          </div>
        </div>
        <div
          className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold"
          style={{ backgroundColor: `${barColor}15`, border: `1px solid ${barColor}40`, color: barColor }}
        >
          {citations.verified_count} / {citations.total_parsed} verified
        </div>
      </div>

      {/* Verification bar */}
      {citations.total_parsed > 0 && (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Verification rate</span>
            <span style={{ color: barColor }}>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      )}

      {citations.total_parsed === 0 ? (
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 italic">No References section found or no citations could be parsed.</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-3"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'Show'} all {citations.total_parsed} citation{citations.total_parsed !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <div className="space-y-2">
              {citations.citations.map((entry, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-3 flex items-start gap-3 ${
                    entry.verified ? 'bg-green-500/5 border border-green-500/20' : 'bg-red-500/5 border border-red-500/20'
                  }`}
                >
                  {entry.verified
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{entry.raw_text}</p>
                    {entry.verified && entry.search_result && (
                      <a
                        href={entry.search_result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 mt-1 text-xs text-cyan-400 hover:text-cyan-300 truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{entry.search_result.title}</span>
                      </a>
                    )}
                    {!entry.verified && (
                      <p className="text-xs text-red-400 mt-1">Could not verify — check this reference manually.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ReviewDisplay({ result, onReset }: ReviewDisplayProps) {
  const [showPerspective, setShowPerspective] = useState(false);

  const overallColor = getColor(result.overall_score);
  const verdict = getVerdict(result.overall_score);

  function downloadReport() {
    const lines: string[] = [
      `ReviewX — Review Report`,
      `${'='.repeat(60)}`,
      `Paper: ${result.paper_title}`,
      `Domain: ${result.detected_domain}`,
      `Overall Score: ${result.overall_score.toFixed(1)}/10 — ${verdict}`,
      ``,
      `SUMMARY`,
      `-------`,
      result.review_summary,
      ``,
      `SUB-SCORES`,
      `----------`,
      `Writing Quality: ${result.writing_quality_score.toFixed(1)}/10`,
      `Technical Rigor: ${result.technical_rigor_score.toFixed(1)}/10`,
      `Novelty:         ${result.novelty_score.toFixed(1)}/10`,
      ``,
    ];

    if (result.critical_issues.length) {
      lines.push('CRITICAL ISSUES', '-'.repeat(20));
      result.critical_issues.forEach(i => lines.push(`• ${i}`));
      lines.push('');
    }
    if (result.major_issues.length) {
      lines.push('MAJOR ISSUES', '-'.repeat(20));
      result.major_issues.forEach(i => lines.push(`• ${i}`));
      lines.push('');
    }
    if (result.minor_issues.length) {
      lines.push('MINOR ISSUES', '-'.repeat(20));
      result.minor_issues.forEach(i => lines.push(`• ${i}`));
      lines.push('');
    }

    lines.push('SECTION REVIEWS', '='.repeat(60));
    result.sections.forEach(s => {
      lines.push(`\n${s.name} — Score: ${s.present ? s.score.toFixed(1) + '/10' : 'MISSING'}`);
      lines.push(s.feedback);
      if (s.issues.length) {
        lines.push('\nIssues:');
        s.issues.forEach(i => lines.push(`  - ${i}`));
      }
      if (s.suggestions.length) {
        lines.push('\nSuggestions:');
        s.suggestions.forEach(sg => lines.push(`  - ${sg}`));
      }
    });

    if (result.venue_suggestions.length) {
      lines.push('', 'VENUE SUGGESTIONS', '-'.repeat(20));
      result.venue_suggestions.forEach(v => lines.push(`• ${v}`));
    }

    if (result.plagiarism) {
      const p = result.plagiarism;
      lines.push('', 'PLAGIARISM CHECK', '-'.repeat(20));
      lines.push(`Risk Level: ${p.risk_level}`);
      lines.push(`Overall Similarity: ${p.overall_similarity.toFixed(1)}%`);
      lines.push(`Passages Checked: ${p.checked_chunks}`);
      if (p.flagged_passages.length) {
        lines.push(`Flagged Passages: ${p.flagged_passages.length}`);
        p.flagged_passages.forEach(m => {
          lines.push(`  [${Math.round(m.similarity_score * 100)}%] ${m.section}: ${m.passage.slice(0, 100)}…`);
          lines.push(`    Source: ${m.matched_source.url}`);
        });
      } else {
        lines.push('No significant matches found.');
      }
    }

    if (result.grammar) {
      const g = result.grammar;
      lines.push('', 'GRAMMAR & CLARITY', '-'.repeat(20));
      lines.push(`Clarity Score: ${g.clarity_score.toFixed(1)}/10`);
      if (g.passive_voice_instances.length)
        lines.push('Passive Voice:', ...g.passive_voice_instances.map(i => `  - "${i}"`));
      if (g.complex_sentences.length)
        lines.push('Complex Sentences:', ...g.complex_sentences.map(i => `  - "${i}"`));
      if (g.undefined_acronyms.length)
        lines.push('Undefined Acronyms:', ...g.undefined_acronyms.map(i => `  - ${i}`));
      if (g.hedging_phrases.length)
        lines.push('Hedging Phrases:', ...g.hedging_phrases.map(i => `  - "${i}"`));
      if (g.suggestions.length)
        lines.push('Suggestions:', ...g.suggestions.map(s => `  • ${s}`));
    }

    if (result.citations && result.citations.total_parsed > 0) {
      const c = result.citations;
      lines.push('', 'CITATION VALIDATION', '-'.repeat(20));
      lines.push(`Verified: ${c.verified_count} / ${c.total_parsed}`);
      lines.push(`Unverified: ${c.unverified_count}`);
      c.citations.forEach(entry => {
        const status = entry.verified ? '[OK]' : '[UNVERIFIED]';
        lines.push(`  ${status} ${entry.raw_text.slice(0, 120)}`);
      });
    }

    lines.push('', `REVIEWER PERSPECTIVE`, '-'.repeat(20), result.reviewer_perspective);
    lines.push('', `Generated by ReviewX — ${new Date().toLocaleString()}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewx-review-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const issueLevels = [
    { label: 'Critical Issues', items: result.critical_issues, color: 'red', dot: 'bg-red-400' },
    { label: 'Major Issues', items: result.major_issues, color: 'orange', dot: 'bg-orange-400' },
    { label: 'Minor Issues', items: result.minor_issues, color: 'yellow', dot: 'bg-yellow-400' },
  ].filter(l => l.items.length > 0);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          New review
        </button>
        <button
          onClick={downloadReport}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Report
        </button>
      </div>

      {/* Hero card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500 bg-slate-800 rounded px-2 py-1">{result.detected_domain}</span>
            </div>
            <h2 className="text-xl font-bold text-white leading-tight mb-3">{result.paper_title}</h2>
            <p className="text-slate-400 text-sm leading-relaxed">{result.review_summary}</p>
          </div>

          {/* Score cluster */}
          <div className="flex gap-4 shrink-0">
            <ScoreRing score={result.overall_score} size={100} />
          </div>
        </div>

        {/* Verdict banner */}
        <div
          className="mt-4 rounded-xl px-4 py-2.5 text-center font-semibold text-sm"
          style={{ backgroundColor: `${overallColor}15`, border: `1px solid ${overallColor}40`, color: overallColor }}
        >
          📋 Reviewer Decision: {verdict}
        </div>

        {/* Sub-scores */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: 'Writing', score: result.writing_quality_score },
            { label: 'Rigor', score: result.technical_rigor_score },
            { label: 'Novelty', score: result.novelty_score },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-lg font-bold" style={{ color: getColor(s.score) }}>{s.score.toFixed(1)}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${s.score * 10}%`, backgroundColor: getColor(s.score) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Issues panel */}
      {issueLevels.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">Issues Summary</h3>
          {issueLevels.map(level => (
            <div key={level.label}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider text-${level.color}-400 mb-2`}>
                {level.label}
              </h4>
              <ul className="space-y-1.5">
                {level.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${level.dot}`}></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Plagiarism check */}
      {result.plagiarism && <PlagiarismPanel plagiarism={result.plagiarism} />}

      {/* Grammar & Clarity */}
      {result.grammar && <GrammarPanel grammar={result.grammar} />}

      {/* Citation Validator */}
      {result.citations && <CitationPanel citations={result.citations} />}

      {/* Section reviews */}
      <div>
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <span>Section-by-Section Review</span>
          <span className="text-xs text-slate-500 font-normal">({result.sections.filter(s => s.present).length} sections found)</span>
        </h3>
        <div className="space-y-3">
          {result.sections.map((section, i) => (
            <SectionCard key={section.name} section={section} index={i} />
          ))}
        </div>
      </div>

      {/* Venue suggestions */}
      {result.venue_suggestions.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-semibold text-white mb-3">🎯 Suggested Submission Venues</h3>
          <ul className="space-y-2">
            {result.venue_suggestions.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended citations */}
      {result.recommended_citations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-semibold text-white mb-3">📚 Recommended Citations</h3>
          <div className="space-y-2">
            {result.recommended_citations.map((src, i) => (
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

      {/* Meta-reviewer perspective */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowPerspective(p => !p)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors"
        >
          <h3 className="font-semibold text-white">🧑‍⚖️ Area Chair Perspective</h3>
          {showPerspective ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showPerspective && (
          <div className="px-5 pb-5 border-t border-slate-800">
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line mt-4">
              {result.reviewer_perspective}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
