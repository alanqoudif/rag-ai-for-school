'use client';

interface SuggestionCardsProps {
  onSelectSuggestion: (question: string) => void;
  category: string;
}

const suggestions: Record<string, { question: string; description?: string }[]> = {
  inspiration: [
    { question: 'ما هي أفضل البرامج المتاحة للبعثات الخارجية؟', description: 'اكتشف فرص الدراسة بالخارج' },
    { question: 'كيف أختار التخصص المناسب لي؟', description: 'نصائح لاختيار التخصص' },
    { question: 'ما هي شروط القبول العامة للجامعات؟', description: 'معلومات شاملة عن القبول' },
  ],
  architecture: [
    { question: 'ما هي شروط القبول لبرنامج الهندسة المعمارية؟', description: 'جامعة البريمي' },
    { question: 'ما الفرق بين برنامج العمارة والتصميم الداخلي؟', description: 'مقارنة البرامج' },
    { question: 'ما هي المواد المطلوبة لبرنامج مسح الكميات؟', description: 'شروط التقديم' },
  ],
  engineering: [
    { question: 'ما هي شروط القبول في برنامج الهندسة بجامعة التقنية؟', description: 'متطلبات البرنامج' },
    { question: 'ما هو الحد الأدنى للرياضيات في برامج الهندسة؟', description: 'النسب المطلوبة' },
    { question: 'ما هي برامج الهندسة المتاحة للإناث؟', description: 'الفرص المتاحة' },
  ],
  medicine: [
    { question: 'ما هي شروط القبول في كلية الطب؟', description: 'متطلبات القبول' },
    { question: 'ما هي البرامج الصحية المتاحة؟', description: 'التخصصات الطبية' },
    { question: 'ما هو الحد الأدنى للأحياء والكيمياء للطب؟', description: 'النسب المطلوبة' },
  ],
  business: [
    { question: 'ما هي شروط القبول في إدارة الأعمال؟', description: 'متطلبات البرنامج' },
    { question: 'ما هي التخصصات التجارية المتاحة؟', description: 'فرص الدراسة' },
    { question: 'ما هو الحد الأدنى للرياضيات الأساسية؟', description: 'النسب المطلوبة' },
  ],
  technology: [
    { question: 'ما هي شروط القبول في تقنية المعلومات؟', description: 'متطلبات البرنامج' },
    { question: 'ما هي برامج الحاسوب المتاحة؟', description: 'التخصصات التقنية' },
    { question: 'ما الفرق بين رمز البعثة ورمز المنحة؟', description: 'معلومات مهمة' },
  ],
};

export default function SuggestionCards({ onSelectSuggestion, category }: SuggestionCardsProps) {
  const currentSuggestions = suggestions[category] || suggestions.inspiration;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
      {currentSuggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelectSuggestion(suggestion.question)}
          className="group relative p-5 rounded-2xl bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-sm border border-stone-200/50 hover:border-rose-200/50 hover:shadow-lg hover:shadow-rose-100/20 transition-all duration-300 text-right"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-rose-50/0 to-purple-50/0 group-hover:from-rose-50/50 group-hover:to-purple-50/50 transition-all duration-300" />
          <div className="relative">
            <p className="text-stone-800 font-medium text-sm leading-relaxed mb-2">
              {suggestion.question}
            </p>
            {suggestion.description && (
              <p className="text-stone-400 text-xs">{suggestion.description}</p>
            )}
          </div>
          <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}
