import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Document {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  created_at: string;
}

export interface MatchDocumentsResult {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export async function matchDocuments(
  queryEmbedding: number[],
  queryText: string,
  matchThreshold: number = 0.2,
  matchCount: number = 10
): Promise<MatchDocumentsResult[]> {
  const { data, error } = await supabase.rpc('match_documents_hybrid', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error('Error matching documents:', error);
    throw error;
  }

  return data || [];
}

export async function insertDocument(
  content: string,
  metadata: Record<string, unknown>,
  embedding: number[]
): Promise<void> {
  const { error } = await supabase.from('documents').insert({
    content,
    metadata,
    embedding,
  });

  if (error) {
    console.error('Error inserting document:', error);
    throw error;
  }
}

export async function getDocumentsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error getting documents count:', error);
    return 0;
  }

  return count || 0;
}
