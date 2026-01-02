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
  temperature: 0.1, // Lower temperature for more accurate, consistent answers
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
مهمتك هي تفكيك سؤال المستخدم لاستخراج عناصر البحث بدقة متناهية.
استخرج:
1. اسم البرنامج (مثلاً: الهندسة المعمارية، الطب، إدارة الأعمال، تربية تقنية معلومات)
2. اسم المؤسسة التعليمية (مثلاً: جامعة السلطان قابوس، جامعة صحار، كلية التقنية، جامعة ظفار)
3. رمز البرنامج إذا وجد (مثلاً: BS140، IG140)

قواعد التحليل:
- إذا كان هناك تخصص فرعي، ضمه لاسم البرنامج (مثلاً: "تربية تقنية معلومات" وليس فقط "تربية").
- استبعد الكلمات الزائدة مثل "ما هي"، "أريد"، "شروط"، "بكالوريوس" إلا إذا كانت جزءاً أصيلاً من مسمى التخصص.
- إذا لم يذكر المستخدم مؤسسة، اجعلها null.

أجب فقط بصيغة JSON كالتالي:
{
  "program": "اسم البرنامج الدقيق المستخرج (مثلاً: تقنية المعلومات)",
  "university": "اسم الجامعة المستخرج أو null",
  "code": "رمز البرنامج المستخرج أو null",
  "search_query": "سلسلة نصية مثالية للبحث تحتوي على (اسم البرنامج + الجامعة) بدون كلمات ربط"
}

السؤال: ${query}`;

  try {
    const response = await analysisModel.invoke(prompt);
    const content = response.content as string;
    // Handle potential markdown code blocks in response
    const jsonStr = content.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Error analyzing query:', e);
    return { search_query: query };
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
  matchThreshold: number = 0.2,
  matchCount: number = 10
): Promise<MatchDocumentsResult[]> {
  console.log('Calling match_documents_hybrid with query:', queryText);
  
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
    // Map match_score to similarity for frontend compatibility
    return (data || []).map((doc: any) => ({
      ...doc,
      similarity: doc.match_score || 0,
    }));
  } catch (err) {
    console.error('Match documents error:', err);
    return [];
  }
}

function formatContext(docs: MatchDocumentsResult[]): string {
  if (docs.length === 0) {
    return 'لا توجد معلومات متاحة في قاعدة البيانات للإجابة على هذا السؤال.';
  }

  return docs
    .map((doc, index) => {
      const metadata = doc.metadata as Record<string, string>;
      const programCode = metadata.program_code ? `(${metadata.program_code})` : '';
      const institution = metadata.institution || 'غير محدد';
      const programName = metadata.program_name || 'غير محدد';
      
      return `═══ مصدر ${index + 1} ═══
اسم المؤسسة التعليمية: ${institution}
اسم البرنامج الدراسي: ${programName} ${programCode}
القسم: ${metadata.section || 'عام'}
المحتوى والشروط:
${doc.content}
(نسبة التطابق مع البحث: ${(doc.similarity * 100).toFixed(0)}%)`;
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

    // 1. Analyze the query to understand intent and extract keywords
    const analysis = await analyzeQuery(message);
    const optimizedQuery = analysis.search_query || message;
    console.log('Optimized search query:', optimizedQuery);

    // 2. Create embedding for the optimized query
    const queryEmbedding = await embeddings.embedQuery(optimizedQuery);

    // 3. Multi-stage retrieval strategy
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

    // Stage 1: Full optimized query (Primary search)
    console.log('Stage 1: Searching for full query:', optimizedQuery);
    const stage1Docs = await matchDocuments(queryEmbedding, optimizedQuery, 0.1, 8);
    addDocs(stage1Docs);

    // Stage 2: Program name search (if available and we need more results or want broader context)
    if (analysis.program && analysis.program !== optimizedQuery) {
      console.log('Stage 2: Searching for program name only:', analysis.program);
      const progEmbedding = await embeddings.embedQuery(analysis.program);
      const stage2Docs = await matchDocuments(progEmbedding, analysis.program, 0.1, 5);
      addDocs(stage2Docs);
    }

    // Stage 3: Program code search (if available)
    if (analysis.code) {
      console.log('Stage 3: Searching for program code only:', analysis.code);
      const codeEmbedding = await embeddings.embedQuery(analysis.code);
      const stage3Docs = await matchDocuments(codeEmbedding, analysis.code, 0.05, 5);
      addDocs(stage3Docs);
    }

    // Stage 4: If still very few results, try university search
    if (relevantDocs.length < 5 && analysis.university) {
      console.log('Stage 4: Searching for university name only:', analysis.university);
      const uniEmbedding = await embeddings.embedQuery(analysis.university);
      const stage4Docs = await matchDocuments(uniEmbedding, analysis.university, 0.1, 5);
      addDocs(stage4Docs);
    }

    // Sort by similarity descending, but prioritize those that matched the program name if we have one
    relevantDocs.sort((a, b) => {
      // If we have a program name, check if it's in the content
      if (analysis.program) {
        const aMatchesProg = a.content.includes(analysis.program);
        const bMatchesProg = b.content.includes(analysis.program);
        if (aMatchesProg && !bMatchesProg) return -1;
        if (!aMatchesProg && bMatchesProg) return 1;
      }
      return b.similarity - a.similarity;
    });

    // Limit to top 12 results for context
    relevantDocs = relevantDocs.slice(0, 12);

    // 5. Format context
    const context = formatContext(relevantDocs);

    // 6. Create full prompt by combining system prompt and question template
    const fullSystemPrompt = SYSTEM_PROMPT.replace('{context}', context);
    const formattedQuestion = QUESTION_TEMPLATE.replace('{question}', message);
    const finalPrompt = `${fullSystemPrompt}\n\n${formattedQuestion}`;

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // First, send sources
          const sourcesData = JSON.stringify({
            type: 'sources',
            data: relevantDocs.map((doc) => ({
              id: doc.id,
              content: doc.content.substring(0, 200) + '...',
              metadata: doc.metadata,
              similarity: doc.similarity,
            })),
          });
          controller.enqueue(encoder.encode(`data: ${sourcesData}\n\n`));

          // Stream the response directly using the final string
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

// Non-streaming version for simple responses
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
    const optimizedQuery = analysis.search_query || question;
    const queryEmbedding = await embeddings.embedQuery(optimizedQuery);

    // 3. Multi-stage retrieval strategy
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

    // Stage 1: Full optimized query
    const stage1Docs = await matchDocuments(queryEmbedding, optimizedQuery, 0.1, 8);
    addDocs(stage1Docs);

    // Stage 2: Program name only
    if (analysis.program && analysis.program !== optimizedQuery) {
      const progEmbedding = await embeddings.embedQuery(analysis.program);
      const stage2Docs = await matchDocuments(progEmbedding, analysis.program, 0.1, 5);
      addDocs(stage2Docs);
    }

    // Stage 3: Program code
    if (analysis.code) {
      const codeEmbedding = await embeddings.embedQuery(analysis.code);
      const stage3Docs = await matchDocuments(codeEmbedding, analysis.code, 0.05, 5);
      addDocs(stage3Docs);
    }

    // Sort and format
    relevantDocs.sort((a, b) => {
      if (analysis.program) {
        const aMatchesProg = a.content.includes(analysis.program);
        const bMatchesProg = b.content.includes(analysis.program);
        if (aMatchesProg && !bMatchesProg) return -1;
        if (!aMatchesProg && bMatchesProg) return 1;
      }
      return b.similarity - a.similarity;
    });

    const context = formatContext(relevantDocs.slice(0, 12));

    const fullSystemPrompt = SYSTEM_PROMPT.replace('{context}', context);
    const formattedQuestion = QUESTION_TEMPLATE.replace('{question}', question);
    const finalPrompt = `${fullSystemPrompt}\n\n${formattedQuestion}`;

    const response = await chatModel.invoke(finalPrompt);

    return NextResponse.json({
      answer: response.content,
      sources: relevantDocs.map((doc) => ({
        id: doc.id,
        content: doc.content.substring(0, 200) + '...',
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
