import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { matchDocuments, MatchDocumentsResult } from './supabase';
import { SYSTEM_PROMPT, QUESTION_TEMPLATE } from './prompts';

// Initialize OpenAI embeddings
export const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
});

// Initialize OpenAI chat model
export const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4.1-nano',
  temperature: 0.1,
  streaming: true,
});

// Create embedding for a query
export async function createQueryEmbedding(query: string): Promise<number[]> {
  const embedding = await embeddings.embedQuery(query);
  return embedding;
}

// Retrieve relevant documents based on query
export async function retrieveRelevantDocs(
  query: string,
  threshold: number = 0.2,
  limit: number = 10
): Promise<MatchDocumentsResult[]> {
  const queryEmbedding = await createQueryEmbedding(query);
  const docs = await matchDocuments(queryEmbedding, query, threshold, limit);
  return docs;
}

// Format retrieved documents into context string
function formatContext(docs: MatchDocumentsResult[]): string {
  if (docs.length === 0) {
    return 'لا توجد معلومات متاحة في قاعدة البيانات للإجابة على هذا السؤال.';
  }

  return docs
    .map((doc, index) => {
      const metadata = doc.metadata as Record<string, string>;
      const programInfo = metadata.program_name
        ? `[${metadata.program_name} - ${metadata.institution || 'غير محدد'}]`
        : '';
      return `--- مقطع ${index + 1} ${programInfo} (تطابق: ${(doc.similarity * 100).toFixed(1)}%) ---\n${doc.content}`;
    })
    .join('\n\n');
}

// Create RAG chain for answering questions
export async function createRAGResponse(
  question: string
): Promise<{ answer: string; sources: MatchDocumentsResult[] }> {
  // Retrieve relevant documents
  const relevantDocs = await retrieveRelevantDocs(question);

  // Format context from documents
  const context = formatContext(relevantDocs);

  // Create prompt
  const fullPrompt = SYSTEM_PROMPT.replace('{context}', context);
  const questionPrompt = QUESTION_TEMPLATE.replace('{question}', question);

  // Create prompt template
  const prompt = PromptTemplate.fromTemplate(`${fullPrompt}\n\n${questionPrompt}`);

  // Create chain
  const chain = RunnableSequence.from([
    prompt,
    chatModel,
    new StringOutputParser(),
  ]);

  // Get response
  const answer = await chain.invoke({});

  return {
    answer,
    sources: relevantDocs,
  };
}

// Stream RAG response
export async function* streamRAGResponse(
  question: string
): AsyncGenerator<{ type: 'sources' | 'chunk' | 'done'; data: unknown }> {
  // First, retrieve relevant documents
  const relevantDocs = await retrieveRelevantDocs(question);

  // Yield sources first
  yield { type: 'sources', data: relevantDocs };

  // Format context from documents
  const context = formatContext(relevantDocs);

  // Create prompt
  const fullPrompt = SYSTEM_PROMPT.replace('{context}', context);
  const questionPrompt = QUESTION_TEMPLATE.replace('{question}', question);

  // Create prompt template
  const prompt = PromptTemplate.fromTemplate(`${fullPrompt}\n\n${questionPrompt}`);

  // Create chain
  const chain = RunnableSequence.from([prompt, chatModel]);

  // Stream the response
  const stream = await chain.stream({});

  for await (const chunk of stream) {
    if (typeof chunk === 'object' && 'content' in chunk) {
      yield { type: 'chunk', data: chunk.content };
    }
  }

  yield { type: 'done', data: null };
}
