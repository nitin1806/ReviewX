export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface PlagiarismMatch {
  passage: string;
  section: string;
  matched_source: WebSource;
  similarity_score: number;
}

export interface PlagiarismResult {
  overall_similarity: number;
  risk_level: 'Low' | 'Medium' | 'High';
  flagged_passages: PlagiarismMatch[];
  checked_chunks: number;
}

export interface GrammarResult {
  clarity_score: number;
  passive_voice_instances: string[];
  complex_sentences: string[];
  undefined_acronyms: string[];
  hedging_phrases: string[];
  suggestions: string[];
}

export interface CitationEntry {
  raw_text: string;
  verified: boolean;
  search_result?: WebSource;
}

export interface CitationValidationResult {
  total_parsed: number;
  verified_count: number;
  unverified_count: number;
  citations: CitationEntry[];
}

export interface SectionFeedback {
  name: string;
  present: boolean;
  score: number;
  feedback: string;
  issues: string[];
  suggestions: string[];
  sources: WebSource[];
}

export interface ReviewResult {
  paper_title: string;
  detected_domain: string;
  overall_score: number;
  review_summary: string;
  sections: SectionFeedback[];
  critical_issues: string[];
  major_issues: string[];
  minor_issues: string[];
  missing_components: string[];
  recommended_citations: WebSource[];
  venue_suggestions: string[];
  reviewer_perspective: string;
  writing_quality_score: number;
  novelty_score: number;
  technical_rigor_score: number;
  plagiarism?: PlagiarismResult;
  grammar?: GrammarResult;
  citations?: CitationValidationResult;
}

export interface ProgressEvent {
  type: 'progress';
  step: string;
  detail: string;
}

export interface ResultEvent {
  type: 'result';
  data: ReviewResult;
}

export type StreamEvent = ProgressEvent | ResultEvent;
