'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: number;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>;
}

interface ChatInterfaceProps {
  initialQuestion?: string;
  onClearInitial?: () => void;
}

export default function ChatInterface({ initialQuestion, onClearInitial }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasProcessedInitialQuestion = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      let fullContent = '';
      let sources: Message['sources'] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'sources') {
                  sources = data.data;
                } else if (data.type === 'chunk') {
                  fullContent += data.data;
                  setStreamingContent(fullContent);
                } else if (data.type === 'done') {
                  // Streaming complete
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullContent,
        sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'عذراً، حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مرة أخرى.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Handle initial question - only once
  useEffect(() => {
    if (initialQuestion && !hasProcessedInitialQuestion.current) {
      hasProcessedInitialQuestion.current = true;
      sendMessage(initialQuestion);
      onClearInitial?.();
    }
  }, [initialQuestion, onClearInitial, sendMessage]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-rose-500 to-purple-500 text-white'
                  : 'bg-white/80 backdrop-blur-sm border border-stone-200/50 text-stone-800'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed" dir="rtl">
                {message.content}
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-stone-200/50">
                  <p className="text-xs text-stone-500 mb-2">المصادر ({message.sources.length}):</p>
                  <div className="space-y-2">
                    {message.sources.slice(0, 3).map((source, idx) => {
                      const programName = source.metadata?.program_name as string | undefined;
                      return (
                        <div
                          key={idx}
                          className="text-xs bg-stone-50 rounded-lg p-2 text-stone-600"
                        >
                          <span className="text-rose-500 font-medium">
                            {(source.similarity * 100).toFixed(0)}% تطابق
                          </span>
                          {programName && (
                            <span className="text-stone-400 mr-2">
                              • {programName}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isLoading && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm border border-stone-200/50 text-stone-800">
              <div className="whitespace-pre-wrap text-sm leading-relaxed" dir="rtl">
                {streamingContent}
                <span className="inline-block w-2 h-4 bg-rose-400 animate-pulse mr-1" />
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-white/80 backdrop-blur-sm border border-stone-200/50 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-stone-500">جاري البحث والتحليل...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-stone-200/50 bg-white/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب سؤالك هنا..."
            rows={1}
            className="w-full px-5 py-4 pr-14 rounded-2xl bg-white border border-stone-200 focus:border-rose-300 focus:ring-2 focus:ring-rose-100 outline-none resize-none text-stone-800 placeholder-stone-400 text-sm"
            dir="rtl"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-gradient-to-r from-rose-500 to-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-rose-200/50 transition-all duration-300"
          >
            <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
