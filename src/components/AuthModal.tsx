import React, { useState } from 'react';
import { LogIn, ShieldCheck, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => Promise<unknown>;
  title?: string;
  subtitle?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onGoogleLogin,
  title = 'تسجيل الدخول إلى زاد مهاوي',
  subtitle = 'سجّل الدخول بحساب Google لحفظ عناوينك، متابعة طلباتك لحظياً، وإتمام عملية الشراء بأمان.',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await onGoogleLogin();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول';
      if (msg.includes('popup-closed-by-user')) {
        setError('تم إغلاق نافذة تسجيل الدخول قبل الإتمام.');
      } else if (msg.includes('popup-blocked')) {
        setError('المتصفح منع النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.');
      } else {
        setError('تعذر إتمام تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-zinc-200 p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-xl font-extrabold text-zinc-900">{title}</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">{subtitle}</p>
        </div>

        {error && (
          <div className="rounded-xl border border-[#E94F36]/30 bg-[#E94F36]/10 px-4 py-3 text-xs font-medium text-[#E94F36]">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors min-h-[48px]"
        >
          <LogIn className="w-4 h-4 text-[#B8E638]" />
          <span>{loading ? 'جاري التحقق...' : 'المتابعة باستخدام حساب Google'}</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-[#65D9EA] shrink-0" />
          <span>مصادقة حقيقية ومشفّرة عبر Firebase Auth دون حفظ كلمات مرور.</span>
        </div>
      </div>
    </div>
  );
};
