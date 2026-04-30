import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { UploadZone } from './components/UploadZone';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ReviewDisplay } from './components/ReviewDisplay';
import { ReviewResult, StreamEvent } from './types/review';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type AppState = 'idle' | 'processing' | 'done' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [currentStep, setCurrentStep] = useState('');
  const [stepDetail, setStepDetail] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState('');

  async function handleFileSelect(file: File) {
    setFilename(file.name);
    setState('processing');
    setCurrentStep('parsing');
    setStepDetail('');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/api/review`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as StreamEvent;
            if (event.type === 'progress') {
              setCurrentStep(event.step);
              setStepDetail(event.detail);
            } else if (event.type === 'result') {
              setResult(event.data);
              setState('done');
            }
          } catch {
            // ignore malformed JSON lines
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
    }
  }

  function reset() {
    setState('idle');
    setResult(null);
    setCurrentStep('');
    setStepDetail('');
    setFilename('');
    setError('');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">ReviewX</span>
            <span className="text-xs text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">RAG</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-4xl">
          {state === 'idle' && (
            <UploadZone onFileSelect={handleFileSelect} isLoading={false} />
          )}

          {state === 'processing' && (
            <ProcessingStatus
              currentStep={currentStep}
              detail={stepDetail}
              filename={filename}
            />
          )}

          {state === 'done' && result && (
            <ReviewDisplay result={result} onReset={reset} />
          )}

          {state === 'error' && (
            <div className="max-w-lg mx-auto text-center space-y-4">
              <div className="text-6xl">⚠️</div>
              <h2 className="text-xl font-semibold text-white">Review Failed</h2>
              <p className="text-slate-400 text-sm bg-slate-900 border border-slate-800 rounded-xl p-4 text-left font-mono">
                {error}
              </p>
              <button
                onClick={reset}
                className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-6 py-2.5 font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-4 text-center text-slate-600 text-xs">
        ReviewX — Intelligent Pre-Submission Paper Review · Powered by RAG &amp; Live Literature Retrieval
      </footer>
    </div>
  );
}
