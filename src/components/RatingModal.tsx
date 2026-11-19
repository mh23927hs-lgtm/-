import React, { useEffect, useState } from 'react';
import { Loader2, Star, Store, Truck, X } from 'lucide-react';
import type { Order, OrderRating } from '../types';

interface RatingModalProps {
  order: Order | null;
  existingRating?: OrderRating | null;
  onClose: () => void;
  onSubmit: (
    order: Order,
    payload: { restaurantRating: number; driverRating?: number | null; comment: string },
  ) => Promise<void>;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const RATING_TEXT: Record<number, string> = {
  1: 'سيء جداً',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جداً',
  5: 'ممتاز',
};

export const RatingModal: React.FC<RatingModalProps> = ({
  order,
  existingRating,
  onClose,
  onSubmit,
}) => {
  const [restaurantRating, setRestaurantRating] = useState<number>(5);
  const [driverRating, setDriverRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    setRestaurantRating(existingRating?.restaurantRating || 5);
    setDriverRating(existingRating?.driverRating || 5);
    setComment(existingRating?.comment || '');
    setError('');
    setSubmitting(false);
  }, [order, existingRating]);

  if (!order) return null;

  const isDelivery = order.fulfillmentType === 'delivery';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(order, {
        restaurantRating,
        driverRating: isDelivery ? driverRating : null,
        comment,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التقييم، يرجى المحاولة مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4" dir="rtl">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 className="font-display font-extrabold text-lg text-zinc-900">
              {existingRating ? 'تعديل تقييم الطلب' : 'تقييم المطعم والتوصيل'}
            </h3>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">طلب #{order.orderNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full text-zinc-500 hover:bg-zinc-100 flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Restaurant Rating */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-[#E94F36]" />
                <span>تقييم المطعم وجودة الطعام</span>
              </span>
              <span className="text-xs font-bold text-[#E94F36]">
                {RATING_TEXT[restaurantRating]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              {STAR_VALUES.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRestaurantRating(val)}
                  className="flex-1 h-11 rounded-xl border border-zinc-200 bg-white flex items-center justify-center hover:border-[#E94F36] transition-colors"
                  aria-label={`${val} نجوم للمطعم`}
                >
                  <Star
                    className={`w-5 h-5 ${
                      val <= restaurantRating
                        ? 'fill-[#E94F36] text-[#E94F36]'
                        : 'text-zinc-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Driver Rating (Delivery orders only) */}
          {isDelivery && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#65D9EA]" />
                  <span>تقييم سائق التوصيل</span>
                </span>
                <span className="text-xs font-bold text-cyan-800">
                  {RATING_TEXT[driverRating]}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                {STAR_VALUES.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDriverRating(val)}
                    className="flex-1 h-11 rounded-xl border border-zinc-200 bg-white flex items-center justify-center hover:border-[#65D9EA] transition-colors"
                    aria-label={`${val} نجوم للسائق`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        val <= driverRating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-zinc-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700">
              ملاحظاتك حول التجربة (اختياري)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="شاركنا رأيك في جودة الطعام، النظافة، أو سرعة التوصيل..."
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#E94F36]"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-2.5 text-xs font-bold text-[#E94F36]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl bg-[#E94F36] text-white font-bold text-sm hover:bg-[#d54028] disabled:bg-zinc-300 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{existingRating ? 'حفظ التقييم المعدل' : 'إرسال التقييم'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
