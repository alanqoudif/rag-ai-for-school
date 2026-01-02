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
    chunk_type: 'organizational_notes' | 'program' | 'section_header';
    chunk_index: number;
  };
}

// Extract program name from text block
function extractProgramName(text: string): string | undefined {
  // Try multiple patterns for program name
  const patterns = [
    /اسم البرنامج[:\s]*([^\n*•]+)/,
    /البرنامج[:\s]*([^\n*•]+)/,
    /\d+\.\s*اسم البرنامج[:\s]*([^\n*•]+)/,
    /\*\s*اسم البرنامج[:\s]*([^\n*•]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim().replace(/^\d+\.\s*/, '').replace(/^\*\s*/, '');
      // If name is too long or contains "رمز البرنامج", it's probably a failed match
      if (name.length > 200 || name.includes('رمز البرنامج')) continue;
      return name;
    }
  }
  return undefined;
}

// Extract program code from text block
function extractProgramCode(text: string): string | undefined {
  const patterns = [
    /رمز البرنامج[:\s]*([^\n•]+)/,
    /الرمز[:\s]*([A-Z]{2}\d{3})/,
    /\*\s*رمز البرنامج[:\s]*([^\n•]+)/,
    /([A-Z]{2}\d{3})/g,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const code = match[1] || match[0];
      const trimmedCode = code.trim().replace(/^\*\s*/, '');
      if (trimmedCode.length > 50 || trimmedCode.includes('الحد الأدنى')) continue;
      return trimmedCode;
    }
  }
  return undefined;
}

// Extract institution from text block
function extractInstitution(text: string): string | undefined {
  const patterns = [
    /المؤسسة التعليمية[:\s]*([^\n•]+)/,
    /المؤسســــة التعليميـــة[:\s]*([^\n•]+)/,
    /جامعة\s+([^\n\-–•]+)/,
    /كلية\s+([^\n\-–•]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const inst = match[1].trim();
      if (inst.length > 100 || inst.includes('اسم البرنامج')) continue;
      return inst;
    }
  }
  return undefined;
}

// Split text into program chunks - each program as one complete unit
function splitIntoChunks(text: string): ProgramChunk[] {
  const chunks: ProgramChunk[] = [];
  let chunkIndex = 0;
  let currentSection = '';

  // First, extract the organizational notes at the beginning
  const orgNotesPattern = /^(ملاحظة تنظيمية مهمة[\s\S]*?)(?=قسم\s+|اسم البرنامج|\d+\.\s*اسم)/;
  const orgNotesMatch = text.match(orgNotesPattern);
  
  if (orgNotesMatch) {
    chunks.push({
      content: orgNotesMatch[1].trim(),
      metadata: {
        chunk_type: 'organizational_notes',
        section: 'ملاحظات تنظيمية',
        chunk_index: chunkIndex++,
      },
    });
  }

  // Split by program blocks
  // Programs are typically separated by underscores or start with "اسم البرنامج" or numbered items
  const programSeparators = /(?=(?:^|\n)(?:\d+\.\s*)?(?:\*\s*)?(?:اسم البرنامج|البرنامج)[:\s])|(?=(?:^|\n)قسم\s+[^\n]+)|(?:_{5,})/;
  
  const blocks = text.split(programSeparators);

  for (const block of blocks) {
    const trimmedBlock = block.trim();
    
    // Skip empty or very short blocks
    if (trimmedBlock.length < 50) continue;
    
    // Skip if it's just underscores
    if (/^_+$/.test(trimmedBlock)) continue;

    // Check if this is a section header
    const sectionMatch = trimmedBlock.match(/^قسم\s+([^\n]+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      // Include section header as a chunk for context
      chunks.push({
        content: trimmedBlock,
        metadata: {
          chunk_type: 'section_header',
          section: currentSection,
          chunk_index: chunkIndex++,
        },
      });
      continue;
    }

    // Check if this is a program block
    const programName = extractProgramName(trimmedBlock);
    const programCode = extractProgramCode(trimmedBlock);
    const institution = extractInstitution(trimmedBlock);

    // If we have program info, create a chunk
    if (programName || programCode) {
      chunks.push({
        content: trimmedBlock,
        metadata: {
          program_name: programName,
          program_code: programCode,
          institution: institution,
          section: currentSection,
          chunk_type: 'program',
          chunk_index: chunkIndex++,
        },
      });
    }
  }

  // If we got very few chunks, try alternative splitting
  if (chunks.length < 10) {
    console.log('⚠️ Few chunks detected, trying line-by-line program detection...');
    return splitByProgramBlocks(text);
  }

  return chunks;
}

// Alternative splitting method - more aggressive program detection
function splitByProgramBlocks(text: string): ProgramChunk[] {
  const chunks: ProgramChunk[] = [];
  const lines = text.split('\n');
  let chunkIndex = 0;
  let currentSection = '';
  let currentBlock: string[] = [];
  let currentProgramName: string | undefined;
  let currentProgramCode: string | undefined;
  let currentInstitution: string | undefined;

  // First add organizational notes
  const orgNotesEnd = text.indexOf('قسم');
  if (orgNotesEnd > 0) {
    const orgNotes = text.substring(0, orgNotesEnd).trim();
    if (orgNotes.length > 100) {
      chunks.push({
        content: orgNotes,
        metadata: {
          chunk_type: 'organizational_notes',
          section: 'ملاحظات تنظيمية',
          chunk_index: chunkIndex++,
        },
      });
    }
  }

  const flushBlock = () => {
    if (currentBlock.length > 0) {
      const content = currentBlock.join('\n').trim();
      if (content.length > 50 && (currentProgramName || currentProgramCode)) {
        chunks.push({
          content,
          metadata: {
            program_name: currentProgramName,
            program_code: currentProgramCode,
            institution: currentInstitution,
            section: currentSection,
            chunk_type: 'program',
            chunk_index: chunkIndex++,
          },
        });
      }
    }
    currentBlock = [];
    currentProgramName = undefined;
    currentProgramCode = undefined;
    currentInstitution = undefined;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for section
    const sectionMatch = trimmedLine.match(/^قسم\s+(.+)$/);
    if (sectionMatch) {
      flushBlock();
      currentSection = sectionMatch[1].trim();
      continue;
    }

    // Check for separator (underscores indicate end of program)
    if (/^_{3,}$/.test(trimmedLine)) {
      flushBlock();
      continue;
    }

    // Check for program name start
    const programNameMatch = trimmedLine.match(/(?:\d+\.\s*)?(?:\*\s*)?اسم البرنامج[:\s]*(.+)$/);
    if (programNameMatch) {
      flushBlock();
      currentProgramName = programNameMatch[1].trim();
      currentBlock.push(trimmedLine);
      continue;
    }

    // Also check for البرنامج: pattern
    const programMatch = trimmedLine.match(/^(?:\*\s*)?البرنامج[:\s]*(.+)$/);
    if (programMatch && !currentProgramName) {
      flushBlock();
      currentProgramName = programMatch[1].trim();
      currentBlock.push(trimmedLine);
      continue;
    }

    // Check for program code
    const codeMatch = trimmedLine.match(/(?:\*\s*)?رمز البرنامج[:\s]*(.+)$/);
    if (codeMatch) {
      currentProgramCode = codeMatch[1].trim();
    }
    const altCodeMatch = trimmedLine.match(/(?:\*\s*)?الرمز[:\s]*([A-Z]{2}\d{3})/);
    if (altCodeMatch) {
      currentProgramCode = altCodeMatch[1];
    }

    // Check for institution
    const instMatch = trimmedLine.match(/المؤسسة التعليمية[:\s]*(.+)$/);
    if (instMatch) {
      currentInstitution = instMatch[1].trim();
    }

    // Add line to current block
    if (trimmedLine.length > 0) {
      currentBlock.push(trimmedLine);
    }
  }

  // Don't forget the last block
  flushBlock();

  return chunks;
}

async function ingestTextFile(filePath: string) {
  console.log('📄 Reading text file...');
  
  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }
  
  const text = fs.readFileSync(absolutePath, 'utf-8');
  
  console.log(`📝 File contains ${text.length} characters`);
  console.log(`📊 File contains ${text.split('\n').length} lines`);
  
  console.log('✂️ Splitting text into program chunks...');
  const chunks = splitIntoChunks(text);
  console.log(`📦 Created ${chunks.length} chunks`);
  
  // Show some statistics
  const programChunks = chunks.filter(c => c.metadata.chunk_type === 'program');
  const withName = programChunks.filter(c => c.metadata.program_name);
  const withCode = programChunks.filter(c => c.metadata.program_code);
  
  console.log(`   📋 Program chunks: ${programChunks.length}`);
  console.log(`   ✅ With name: ${withName.length}`);
  console.log(`   ✅ With code: ${withCode.length}`);
  
  // Show first few chunks for verification
  console.log('\n📝 Sample chunks:');
  chunks.slice(0, 3).forEach((chunk, i) => {
    console.log(`\n--- Chunk ${i + 1} ---`);
    console.log(`Type: ${chunk.metadata.chunk_type}`);
    console.log(`Program: ${chunk.metadata.program_name || 'N/A'}`);
    console.log(`Code: ${chunk.metadata.program_code || 'N/A'}`);
    console.log(`Institution: ${chunk.metadata.institution || 'N/A'}`);
    console.log(`Content preview: ${chunk.content.substring(0, 150)}...`);
  });

  console.log('\n🧠 Creating embeddings and storing in Supabase...');
  
  // Clear existing documents first
  console.log('🧹 Clearing existing documents from database...');
  const { error: deleteError } = await supabase.from('documents').delete().neq('id', 0);
  if (deleteError) {
    console.error('❌ Error clearing database:', deleteError.message);
    process.exit(1);
  }
  console.log('✅ Database cleared.');

  let successCount = 0;
  let errorCount = 0;
  
  // Process in batches to avoid rate limits
  const batchSize = 5;
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
    console.log(`⏳ Progress: ${progress}% (${Math.min(i + batch.length, chunks.length)}/${chunks.length} chunks)`);
    
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
const textFilePath = process.argv[2] || './data.text';
ingestTextFile(textFilePath).catch(console.error);
