import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface Step {
  key: string;
  label: string;
  icon: string;
}

const STEPS: Step[] = [
  { key: 'parsing',          label: 'Parsing PDF & extracting sections',    icon: '📄' },
  { key: 'embedding',        label: 'Building semantic vector index',        icon: '🧠' },
  { key: 'grammar_check',    label: 'Checking grammar & writing clarity',    icon: '✍️'  },
  { key: 'searching',        label: 'Retrieving web literature via RAG',     icon: '🌐' },
  { key: 'plagiarism',       label: 'Checking for plagiarism matches',       icon: '🔍' },
  { key: 'citation_check',   label: 'Verifying references & citations',      icon: '📚' },
  { key: 'reviewing_section',label: 'Reviewing each section',                icon: '🔬' },
  { key: 'overall',          label: 'Generating overall assessment',         icon: '📊' },
];

interface ProcessingStatusProps {
  currentStep: string;
  detail: string;
  filename: string;
}

export function ProcessingStatus({ currentStep, detail, filename }: ProcessingStatusProps) {
  const stepKeys = STEPS.map(s => s.key);
  // Find which step index is currently active.
  // -1 means not found → treat as step 0 so something is always shown as active.
  const rawIdx = stepKeys.indexOf(currentStep);
  const currentIdx = rawIdx === -1 ? 0 : rawIdx;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-8 animate-fade-in">
      {/* Animated icon */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <span className="text-4xl animate-pulse-slow">🔬</span>
        </div>
        <div className="absolute -right-1 -bottom-1 w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-white">Analyzing your paper</h2>
        <p className="text-slate-400 text-sm mt-1 font-mono truncate max-w-xs">{filename}</p>
      </div>

      {/* Steps */}
      <div className="w-full space-y-3">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;

          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 p-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-violet-500/10 border border-violet-500/20'
                  : isDone
                  ? 'opacity-60'
                  : 'opacity-30'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span>{step.icon}</span>
                  <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
                {isActive && detail && (
                  <p className="text-xs text-violet-400 mt-1 truncate">{detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">This may take a while depending on paper length — please keep this tab open</p>
    </div>
  );
}
