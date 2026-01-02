import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT, QUESTION_TEMPLATE } from '@/lib/prompts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
});

const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o-mini',
  temperature: 0.3, // Slightly higher for more natural, helpful responses
  streaming: true,
});

// Helper to analyze the query and extract key search terms
async function analyzeQuery(query: string) {
  const analysisModel = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  const prompt = `أنت خبير في تحليل استفسارات القبول الموحد في سلطنة عمان.
مهمتك هي تفكيك سؤال المستخدم لاستخراج عناصر البحث.

استخرج:
1. اسم البرنامج أو التخصص (مثلاً: الهندسة المعمارية، الطب، تقنية المعلومات)
2. اسم المؤسسة التعليمية إذا ذُكرت (جامعة السلطان قابوس، جامعة صحار، إلخ)
3. رمز البرنامج إذا وجد (BS140، IG140، MT1001، إلخ)
4. نوع السؤال: هل هو عن برنامج محدد أم سؤال عام؟
5. كلمات مفتاحية إضافية للبحث

أجب بصيغة JSON:
{
  "program": "اسم البرنامج/التخصص أو null",
  "university": "اسم الجامعة أو null",
  "code": "رمز البرنامج أو null",
  "is_general_question": true/false,
  "keywords": ["كلمة1", "كلمة2"],
  "search_queries": ["استعلام بحث 1", "استعلام بحث 2"]
}

ملاحظات:
- إذا السؤال عام مثل "ما هي برامج الهندسة؟" اجعل is_general_question = true
- أضف عدة صيغ للبحث في search_queries (الاسم بصيغ مختلفة)
- مثال: للبحث عن "هندسة معمارية" أضف: ["هندسة معمارية", "الهندسة المعمارية", "العمارة", "معمارية"]

السؤال: ${query}`;

  try {
    const response = await analysisModel.invoke(prompt);
    const content = response.content as string;
    const jsonStr = content.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Error analyzing query:', e);
    return { 
      search_queries: [query],
      is_general_question: true,
      keywords: query.split(' ').filter(w => w.length > 2)
    };
  }
}

interface MatchDocumentsResult {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

async function matchDocuments(
  queryEmbedding: number[],
  queryText: string,
  matchThreshold: number = 0.05, // Lower threshold to get more results
  matchCount: number = 15
): Promise<MatchDocumentsResult[]> {
  console.log('Calling match_documents_hybrid with query:', queryText, 'threshold:', matchThreshold);
  
  try {
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error('RPC Error:', JSON.stringify(error));
      throw error;
    }

    console.log('Match results count:', data?.length || 0);
    return (data || []).map((doc: { id: number; content: string; metadata: Record<string, unknown>; match_score?: number; final_score?: number }) => ({
      ...doc,
      similarity: doc.match_score || doc.final_score || 0,
    }));
  } catch (err) {
    console.error('Match documents error:', err);
    return [];
  }
}

// Fallback: Direct text search when semantic search fails
async function directTextSearch(searchTerms: string[], limit: number = 10): Promise<MatchDocumentsResult[]> {
  console.log('Performing direct text search for:', searchTerms);
  
  try {
    let query = supabase
      .from('documents')
      .select('id, content, metadata');
    
    // Build OR conditions for each search term
    const orConditions = searchTerms.map(term => `content.ilike.%${term}%`).join(',');
    query = query.or(orConditions);
    
    const { data, error } = await query.limit(limit);

    if (error) {
      console.error('Direct search error:', error);
      return [];
    }

    return (data || []).map(doc => ({
      ...doc,
      similarity: 0.5, // Assign a medium similarity for text matches
    }));
  } catch (err) {
    console.error('Direct text search error:', err);
    return [];
  }
}

// Get random sample of documents when no specific search works
async function getRandomSample(limit: number = 8): Promise<MatchDocumentsResult[]> {
  console.log('Getting random sample of documents');
  
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, content, metadata')
      .not('metadata->program_name', 'is', null)
      .limit(limit);

    if (error) {
      console.error('Random sample error:', error);
      return [];
    }

    return (data || []).map(doc => ({
      ...doc,
      similarity: 0.3,
    }));
  } catch (err) {
    console.error('Random sample error:', err);
    return [];
  }
}

function formatContext(docs: MatchDocumentsResult[]): string {
  if (docs.length === 0) {
    return 'لا توجد معلومات متاحة حالياً.';
  }

  return docs
    .map((doc, index) => {
      const metadata = doc.metadata as Record<string, string>;
      const programCode = metadata.program_code ? `(${metadata.program_code})` : '';
      const institution = metadata.institution || metadata.program_name?.match(/\(([^)]+)\)/)?.[1] || 'غير محدد';
      const programName = metadata.program_name || 'برنامج دراسي';
      const section = metadata.section || '';
      
      return `═══ معلومة ${index + 1} ═══
🏫 المؤسسة: ${institution}
📚 البرنامج: ${programName} ${programCode}
${section ? `📂 القسم: ${section}` : ''}
📝 التفاصيل:
${doc.content}
(نسبة الصلة: ${(doc.similarity * 100).toFixed(0)}%)`;
    })
    .join('\n\n────────────────────────────────────\n\n');
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'الرجاء إدخال سؤال صحيح' },
        { status: 400 }
      );
    }

    console.log('=== New Question ===');
    console.log('User message:', message);

    // 1. Analyze the query
    const analysis = await analyzeQuery(message);
    console.log('Query analysis:', JSON.stringify(analysis, null, 2));

    // 2. Multi-strategy retrieval
    let relevantDocs: MatchDocumentsResult[] = [];
    const existingIds = new Set<number>();

    const addDocs = (docs: MatchDocumentsResult[]) => {
      for (const doc of docs) {
        if (!existingIds.has(doc.id)) {
          relevantDocs.push(doc);
          existingIds.add(doc.id);
        }
      }
    };

    // Strategy 1: Search with multiple query variations
    const searchQueries = analysis.search_queries || [message];
    for (const searchQuery of searchQueries.slice(0, 3)) {
      console.log('Strategy 1: Searching for:', searchQuery);
      const queryEmbedding = await embeddings.embedQuery(searchQuery);
      const docs = await matchDocuments(queryEmbedding, searchQuery, 0.05, 12);
      addDocs(docs);
      if (relevantDocs.length >= 15) break;
    }

    // Strategy 2: Search by program name specifically
    if (analysis.program && relevantDocs.length < 10) {
      console.log('Strategy 2: Searching for program:', analysis.program);
      const progEmbedding = await embeddings.embedQuery(analysis.program);
      const docs = await matchDocuments(progEmbedding, analysis.program, 0.05, 10);
      addDocs(docs);
    }

    // Strategy 3: Search by code if available
    if (analysis.code) {
      console.log('Strategy 3: Searching for code:', analysis.code);
      const codeEmbedding = await embeddings.embedQuery(analysis.code);
      const docs = await matchDocuments(codeEmbedding, analysis.code, 0.01, 5);
      addDocs(docs);
    }

    // Strategy 4: Direct text search if semantic search didn't find enough
    if (relevantDocs.length < 5) {
      const keywords = analysis.keywords || [];
      if (analysis.program) keywords.push(analysis.program);
      if (keywords.length > 0) {
        console.log('Strategy 4: Direct text search for:', keywords);
        const directDocs = await directTextSearch(keywords, 10);
        addDocs(directDocs);
      }
    }

    // Strategy 5: For general questions or when nothing found, get diverse sample
    if (relevantDocs.length < 3 && analysis.is_general_question) {
      console.log('Strategy 5: Getting diverse sample');
      const sampleDocs = await getRandomSample(10);
      addDocs(sampleDocs);
    }

    // Sort by similarity and relevance
    relevantDocs.sort((a, b) => {
      // Prioritize exact matches in content
      if (analysis.program) {
        const aMatchesProg = a.content.toLowerCase().includes(analysis.program.toLowerCase());
        const bMatchesProg = b.content.toLowerCase().includes(analysis.program.toLowerCase());
        if (aMatchesProg && !bMatchesProg) return -1;
        if (!aMatchesProg && bMatchesProg) return 1;
      }
      return b.similarity - a.similarity;
    });

    // Limit to top results
    relevantDocs = relevantDocs.slice(0, 15);

    console.log('Total relevant docs found:', relevantDocs.length);
    console.log('Doc IDs:', relevantDocs.map(d => d.id));

    // 3. Format context
    const context = formatContext(relevantDocs);

    // 4. Create full prompt
    const fullSystemPrompt = SYSTEM_PROMPT.replace('{context}', context);
    const formattedQuestion = QUESTION_TEMPLATE.replace('{question}', message);
    const finalPrompt = `${fullSystemPrompt}\n\n${formattedQuestion}`;

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send sources first
          const sourcesData = JSON.stringify({
            type: 'sources',
            data: relevantDocs.map((doc) => ({
              id: doc.id,
              content: doc.content.substring(0, 300) + '...',
              metadata: doc.metadata,
              similarity: doc.similarity,
            })),
          });
          controller.enqueue(encoder.encode(`data: ${sourcesData}\n\n`));

          // Stream the response
          const response = await chatModel.stream(finalPrompt);

          for await (const chunk of response) {
            const content = chunk.content;
            if (content) {
              const chunkData = JSON.stringify({
                type: 'chunk',
                data: content,
              });
              controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
            }
          }

          // Send done signal
          const doneData = JSON.stringify({ type: 'done' });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
        } catch (error) {
          console.error('Streaming error:', error);
          const errorData = JSON.stringify({
            type: 'error',
            data: 'حدث خطأ أثناء معالجة السؤال',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم' },
      { status: 500 }
    );
  }
}

// Non-streaming version
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const question = searchParams.get('q');

  if (!question) {
    return NextResponse.json(
      { error: 'الرجاء تقديم سؤال' },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeQuery(question);

    let relevantDocs: MatchDocumentsResult[] = [];
    const existingIds = new Set<number>();

    const addDocs = (docs: MatchDocumentsResult[]) => {
      for (const doc of docs) {
        if (!existingIds.has(doc.id)) {
          relevantDocs.push(doc);
          existingIds.add(doc.id);
        }
      }
    };

    // Multiple search strategies
    const searchQueries = analysis.search_queries || [question];
    for (const searchQuery of searchQueries.slice(0, 3)) {
      const queryEmbedding = await embeddings.embedQuery(searchQuery);
      const docs = await matchDocuments(queryEmbedding, searchQuery, 0.05, 12);
      addDocs(docs);
    }

    if (analysis.program) {
      const progEmbedding = await embeddings.embedQuery(analysis.program);
      const docs = await matchDocuments(progEmbedding, analysis.program, 0.05, 10);
      addDocs(docs);
    }

    if (relevantDocs.length < 5) {
      const keywords = analysis.keywords || [];
      if (analysis.program) keywords.push(analysis.program);
      if (keywords.length > 0) {
        const directDocs = await directTextSearch(keywords, 10);
        addDocs(directDocs);
      }
    }

    relevantDocs.sort((a, b) => {
      if (analysis.program) {
        const aMatchesProg = a.content.toLowerCase().includes(analysis.program.toLowerCase());
        const bMatchesProg = b.content.toLowerCase().includes(analysis.program.toLowerCase());
        if (aMatchesProg && !bMatchesProg) return -1;
        if (!aMatchesProg && bMatchesProg) return 1;
      }
      return b.similarity - a.similarity;
    });

    const context = formatContext(relevantDocs.slice(0, 15));

    const fullSystemPrompt = SYSTEM_PROMPT.replace('{context}', context);
    const formattedQuestion = QUESTION_TEMPLATE.replace('{question}', question);
    const finalPrompt = `${fullSystemPrompt}\n\n${formattedQuestion}`;

    const response = await chatModel.invoke(finalPrompt);

    return NextResponse.json({
      answer: response.content,
      sources: relevantDocs.map((doc) => ({
        id: doc.id,
        content: doc.content.substring(0, 300) + '...',
        metadata: doc.metadata,
        similarity: doc.similarity,
      })),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم' },
      { status: 500 }
    );
  }
}
