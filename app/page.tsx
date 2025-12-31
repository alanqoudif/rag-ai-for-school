'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import CategoryTabs from '@/components/CategoryTabs';
import SuggestionCards from '@/components/SuggestionCards';
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('inspiration');
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleSuggestionSelect = (question: string) => {
    setCurrentQuestion(question);
    setHasStartedChat(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setCurrentQuestion(inputValue.trim());
      setHasStartedChat(true);
      setInputValue('');
    }
  };

  return (
    <main className="min-h-screen gradient-bg">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className={`min-h-screen flex flex-col transition-all duration-300 ${sidebarOpen ? 'lg:mr-72' : ''}`}>
        {!hasStartedChat ? (
          /* Landing View */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
            {/* Logo */}
            <div className="text-center mb-12 animate-float">
              <div className="flex items-center justify-center gap-3 mb-4">
                <h1 className="text-6xl md:text-7xl font-bold text-stone-800 tracking-tight">
                  ادمشن
                </h1>
                <span className="px-3 py-1 text-sm font-medium bg-stone-200/80 text-stone-600 rounded-full">
                  Beta
                </span>
              </div>
              <p className="text-stone-500 text-lg">مساعدك الذكي للقبول الموحد</p>
            </div>

            {/* Search Box */}
            <div className="w-full max-w-2xl mb-8">
              <form onSubmit={handleSubmit} className="relative">
                <div className="relative bg-white rounded-2xl shadow-lg shadow-stone-200/50 border border-stone-200/50 overflow-hidden">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="اسأل أي شيء..."
                    className="w-full px-6 py-5 pr-6 pl-32 text-stone-800 placeholder-stone-400 outline-none text-lg"
                    dir="rtl"
                  />
                  
                  {/* Mode buttons */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-100 to-purple-100 text-stone-700 text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      ذكي
                    </button>
                    
                    <button
                      type="submit"
                      disabled={!inputValue.trim()}
                      className="p-2 rounded-xl bg-gradient-to-r from-rose-500 to-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-rose-200/50 transition-all duration-300"
                    >
                      <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Category Tabs */}
            <CategoryTabs
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />

            {/* Suggestion Cards */}
            <SuggestionCards
              category={activeCategory}
              onSelectSuggestion={handleSuggestionSelect}
            />

            {/* Footer */}
            <div className="mt-16 text-center">
              <p className="text-stone-400 text-sm">
                مدعوم بالذكاء الاصطناعي • البيانات من دليل القبول الموحد
              </p>
            </div>
          </div>
        ) : (
          /* Chat View */
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-stone-200/50 px-4 py-3">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <button
                  onClick={() => setHasStartedChat(false)}
                  className="flex items-center gap-2 text-stone-600 hover:text-stone-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="text-sm font-medium">الرئيسية</span>
                </button>
                
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-stone-800">ادمشن</h1>
                  <span className="px-2 py-0.5 text-xs font-medium bg-stone-200/80 text-stone-600 rounded-full">
                    Beta
                  </span>
                </div>
                
                <button className="p-2 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Chat Interface */}
            <ChatInterface
              initialQuestion={currentQuestion || undefined}
              onClearInitial={() => setCurrentQuestion(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
