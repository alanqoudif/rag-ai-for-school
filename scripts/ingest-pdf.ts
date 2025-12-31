import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseAnonKey || !openaiApiKey) {
  console.error('❌ Missing environment variables!');
  console.error('Please make sure .env.local contains:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('  - OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: openaiApiKey,
  modelName: 'text-embedding-3-small',
});

interface ProgramChunk {
  content: string;
  metadata: {
    program_name?: string;
    program_code?: string;
    institution?: string;
    section?: string;
    chunk_index: number;
  };
}

// Function to extract text from PDF using pdfjs-dist
async function extractTextFromPDF(pdfPath: string): Promise<{ text: string; numPages: number }> {
  // Dynamic import for pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  
  let fullText = '';
  const numPages = pdf.numPages;
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: { str?: string }) => item.str || '')
      .join(' ');
    fullText += pageText + '\n';
    
    // Progress indicator for large PDFs
    if (i % 50 === 0) {
      console.log(`   📖 Reading page ${i}/${numPages}...`);
    }
  }
  
  return { text: fullText, numPages };
}

// Function to split text into meaningful chunks
function splitIntoChunks(text: string): ProgramChunk[] {
  const chunks: ProgramChunk[] = [];
  
  // First, extract the important organizational notes at the beginning
  const orgNotesMatch = text.match(/ملاحظة تنظيمية مهمة[\s\S]*?(?=قسم|اسم البرنامج)/i);
  if (orgNotesMatch) {
    chunks.push({
      content: orgNotesMatch[0].trim(),
      metadata: {
        section: 'ملاحظات تنظيمية',
        chunk_index: 0,
      },
    });
  }

  // Split by sections (قسم)
  const sections = text.split(/(?=قسم\s+[^\n]+)/);
  
  let chunkIndex = 1;
  
  for (const section of sections) {
    if (section.trim().length < 50) continue;
    
    // Try to extract section name
    const sectionMatch = section.match(/^قسم\s+([^\n]+)/);
    const sectionName = sectionMatch ? sectionMatch[1].trim() : undefined;
    
    // Split section into program blocks
    const programBlocks = section.split(/(?=\d+\.\s*اسم البرنامج|اسم البرنامج[:\s])/);
    
    for (const block of programBlocks) {
      if (block.trim().length < 100) continue;
      
      // Extract program name
      const programNameMatch = block.match(/اسم البرنامج[:\s]*([^\n*]+)/);
      const programName = programNameMatch ? programNameMatch[1].trim() : undefined;
      
      // Extract program code
      const programCodeMatch = block.match(/رمز البرنامج[:\s]*([^\n]+)/);
      const programCode = programCodeMatch ? programCodeMatch[1].trim() : undefined;
      
      // Extract institution
      const institutionMatch = block.match(/المؤسسة التعليمية[:\s]*([^\n]+)/);
      const institution = institutionMatch ? institutionMatch[1].trim() : undefined;
      
      // If block is too long, split it further
      if (block.length > 2000) {
        const subChunks = splitLongBlock(block, 1500, 200);
        for (const subChunk of subChunks) {
          chunks.push({
            content: subChunk,
            metadata: {
              program_name: programName,
              program_code: programCode,
              institution: institution,
              section: sectionName,
              chunk_index: chunkIndex++,
            },
          });
        }
      } else {
        chunks.push({
          content: block.trim(),
          metadata: {
            program_name: programName,
            program_code: programCode,
            institution: institution,
            section: sectionName,
            chunk_index: chunkIndex++,
          },
        });
      }
    }
  }
  
  return chunks;
}

// Split long blocks with overlap
function splitLongBlock(text: string, maxLength: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxLength;
    
    // Try to find a good breaking point (end of sentence or paragraph)
    if (end < text.length) {
      const breakPoints = ['\n\n', '\n', '。', '.', '،', ','];
      for (const bp of breakPoints) {
        const lastBreak = text.lastIndexOf(bp, end);
        if (lastBreak > start + maxLength / 2) {
          end = lastBreak + bp.length;
          break;
        }
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  
  return chunks;
}

async function ingestPDF(pdfPath: string) {
  console.log('📄 Reading PDF file...');
  
  const absolutePath = path.resolve(pdfPath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }
  
  const { text, numPages } = await extractTextFromPDF(absolutePath);
  
  console.log(`📊 PDF contains ${numPages} pages`);
  console.log(`📝 Extracted ${text.length} characters`);
  
  console.log('✂️ Splitting text into chunks...');
  const chunks = splitIntoChunks(text);
  console.log(`📦 Created ${chunks.length} chunks`);
  
  console.log('🧠 Creating embeddings and storing in Supabase...');
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const promises = batch.map(async (chunk) => {
      try {
        // Create embedding
        const embedding = await embeddings.embedQuery(chunk.content);
        
        // Insert into Supabase
        const { error } = await supabase.from('documents').insert({
          content: chunk.content,
          metadata: chunk.metadata,
          embedding: embedding,
        });
        
        if (error) {
          console.error(`❌ Error inserting chunk ${chunk.metadata.chunk_index}:`, error.message);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Error processing chunk ${chunk.metadata.chunk_index}:`, err);
        errorCount++;
      }
    });
    
    await Promise.all(promises);
    
    // Progress update
    const progress = Math.min(100, Math.round(((i + batch.length) / chunks.length) * 100));
    console.log(`⏳ Progress: ${progress}% (${i + batch.length}/${chunks.length} chunks)`);
    
    // Small delay to avoid rate limits
    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n✅ Ingestion complete!');
  console.log(`   ✓ Successfully inserted: ${successCount} chunks`);
  console.log(`   ✗ Failed: ${errorCount} chunks`);
}

// Run the ingestion
const pdfPath = process.argv[2] || '../ملف ادمشن جديد 2.docx.pdf';
ingestPDF(pdfPath).catch(console.error);
