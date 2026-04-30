import { useRef, useState, DragEvent } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function UploadZone({ onFileSelect, isLoading }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  function handleFile(file: File) {
    setError('');
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File size must be under 20 MB.');
      return;
    }
    onFileSelect(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
      {/* Hero text */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-violet-400 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
          RAG-Powered Review System
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
          Meet{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
            ReviewX
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-md mx-auto">
          Your AI peer reviewer. Upload your research paper and get structured, expert-level feedback before submission — powered by RAG and live literature retrieval.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onClick={() => !isLoading && inputRef.current?.click()}
        className={`
          w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-12
          flex flex-col items-center gap-4 text-center
          ${dragging
            ? 'border-violet-400 bg-violet-500/10 scale-[1.01]'
            : 'border-slate-700 bg-slate-900/50 hover:border-violet-600 hover:bg-violet-500/5'
          }
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <div className={`
          w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
          ${dragging ? 'bg-violet-500/20' : 'bg-slate-800'}
        `}>
          {dragging ? (
            <FileText className="w-8 h-8 text-violet-400" />
          ) : (
            <Upload className="w-8 h-8 text-slate-400" />
          )}
        </div>
        <div>
          <p className="text-white font-semibold text-lg">
            {dragging ? 'Drop to upload' : 'Drag & drop your paper'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            or <span className="text-violet-400 font-medium">browse files</span> — PDF only, max 20 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Features row */}
      <div className="grid grid-cols-3 gap-4 w-full text-center">
        {[
          { icon: '🔍', title: 'RAG Analysis', desc: 'Semantic search over your paper' },
          { icon: '🌐', title: 'Live Literature', desc: 'Web-retrieved related work' },
          { icon: '📋', title: 'Structured Feedback', desc: 'Section-by-section review' },
        ].map(f => (
          <div key={f.title} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-2xl mb-2">{f.icon}</div>
            <div className="text-white text-sm font-medium">{f.title}</div>
            <div className="text-slate-500 text-xs mt-1">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
