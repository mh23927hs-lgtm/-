import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'حدث خطأ غير متوقع في التطبيق.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed.error && parsed.operationType) {
        message = `تعذر تنفيذ العملية (${parsed.operationType}) على ${parsed.path || 'البيانات'}: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#E94F36]/10 text-[#E94F36] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-lg font-bold text-zinc-900">حدث خطأ في الاتصال أو الصلاحيات</h1>
            <p className="text-sm text-zinc-600 leading-relaxed break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#E94F36] text-white text-sm font-bold hover:bg-[#d54028] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
