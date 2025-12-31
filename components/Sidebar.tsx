'use client';

import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  hideToggle?: boolean;
}

export default function Sidebar({ isOpen, onToggle, hideToggle }: SidebarProps) {
  const [conversations] = useState<{ id: string; title: string; date: string }[]>([]);

  return (
    <>
      {/* Toggle button - only show when sidebar is closed and not hidden by prop */}
      {!isOpen && !hideToggle && (
        <button
          onClick={onToggle}
          className="fixed top-4 right-4 z-50 p-2 rounded-xl bg-white/80 backdrop-blur-sm border border-stone-200/50 shadow-sm hover:bg-white transition-all duration-300"
          aria-label="فتح القائمة"
        >
          <svg
            className="w-5 h-5 text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full w-72 bg-stone-50/95 backdrop-blur-xl border-l border-stone-200/50 shadow-xl z-40 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full pt-6 pb-6 px-4">
          {/* Close button inside sidebar (mobile/desktop) */}
          <div className="flex justify-end mb-4">
            <button
              onClick={onToggle}
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors"
              aria-label="إغلاق القائمة"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* New Chat Button */}
          <button className="flex items-center gap-3 w-full p-3 rounded-xl bg-gradient-to-r from-rose-100 to-purple-100 hover:from-rose-200 hover:to-purple-200 text-stone-700 font-medium transition-all duration-300 mb-6">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            محادثة جديدة
          </button>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 px-2">
              المحادثات السابقة
            </h3>
            {conversations.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm text-stone-500">لا توجد محادثات بعد</p>
                <p className="text-xs text-stone-400 mt-1">ابدأ بطرح سؤالك الأول</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <button className="w-full text-right p-3 rounded-lg hover:bg-white text-stone-600 hover:text-stone-800 transition-colors">
                      <span className="block text-sm font-medium truncate">{conv.title}</span>
                      <span className="block text-xs text-stone-400 mt-1">{conv.date}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-stone-200/50 pt-4 mt-4 space-y-2">
            <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white text-stone-600 hover:text-stone-800 transition-colors text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              المساعدة
            </button>
            <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white text-stone-600 hover:text-stone-800 transition-colors text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              تسجيل الدخول
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
