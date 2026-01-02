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
    return data || [];
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
      const programInfo = metadata.program_name
        ? `[البرنامج: ${metadata.program_name} ${programCode}${metadata.institution ? ` - المؤسسة: ${metadata.institution}` : ''}]`
        : '';
      const sectionInfo = metadata.section ? `[القسم: ${metadata.section}]` : '';
      return `═══ مصدر ${index + 1} ${programInfo} ${sectionInfo} ═══\n${doc.content}\n(نسبة التطابق: ${(doc.similarity * 100).toFixed(0)}%)`;
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

    // Create embedding for the query
    const queryEmbedding = await embeddings.embedQuery(message);

    // Retrieve relevant documents - balanced threshold for accuracy
    const relevantDocs = await matchDocuments(queryEmbedding, message, 0.2, 10);

    // Format context
    const context = formatContext(relevantDocs);

    // Create full prompt by combining system prompt and question template
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
    const queryEmbedding = await embeddings.embedQuery(question);
    const relevantDocs = await matchDocuments(queryEmbedding, question, 0.2, 10);
    const context = formatContext(relevantDocs);

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
