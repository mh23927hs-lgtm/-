import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Order, StoreSettings } from '../types';
import {
  formatDateTime,
  formatPrice,
  FULFILLMENT_LABELS,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../utils/storeHelpers';
import { BrandLogo } from './BrandLogo';

interface InvoiceModalProps {
  order: Order | null;
  storeSettings: StoreSettings;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, storeSettings, onClose }) => {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-2xl">
        <div className="no-print px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
          <h2 className="font-display font-bold text-zinc-900">فاتورة الطلب #{order.orderNumber}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-200"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 text-sm" dir="rtl">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-zinc-200">
            <BrandLogo
              logoUrl={storeSettings.logoUrl}
              nameAr={storeSettings.nameAr}
              nameEn={storeSettings.nameEn}
            />
            <div className="text-left space-y-1">
              <div className="font-mono font-bold text-base text-zinc-900">#{order.orderNumber}</div>
              <div className="text-xs text-zinc-500">{formatDateTime(order.createdAt)}</div>
              <div className="text-xs font-bold text-zinc-700">{ORDER_STATUS_META[order.status].label}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-zinc-50 rounded-2xl p-4 border border-zinc-200">
            <div className="space-y-1">
              <p className="font-bold text-zinc-900 text-sm">بيانات العميل</p>
              <p className="text-zinc-700">الاسم: {order.customerName}</p>
              <p className="text-zinc-700 tabular-nums">الهاتف: {order.customerPhone}</p>
              {order.customerEmail && <p className="text-zinc-600">{order.customerEmail}</p>}
            </div>
            <div className="space-y-1">
              <p className="font-bold text-zinc-900 text-sm">تفاصيل الاستلام والدفع</p>
              <p className="text-zinc-700">
                الطريقة: {FULFILLMENT_LABELS[order.fulfillmentType]}
                {order.fulfillmentType === 'dine_in' && order.tableNumber ? ` (طاولة ${order.tableNumber})` : ''}
              </p>
              {order.fulfillmentType === 'delivery' && order.deliveryAddress && (
                <p className="text-zinc-600">
                  {order.deliveryAddress.governorate}، {order.deliveryAddress.city}، {order.deliveryAddress.area} — {order.deliveryAddress.street}
                </p>
              )}
              {order.fulfillmentType === 'pickup' && order.pickupTime && (
                <p className="text-zinc-600">موعد الاستلام: {order.pickupTime}</p>
              )}
              <p className="text-zinc-700">
                الدفع: {PAYMENT_METHOD_LABELS[order.paymentMethod]} ({PAYMENT_STATUS_LABELS[order.paymentStatus]})
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                  <th className="py-2.5 font-bold">الصنف</th>
                  <th className="py-2.5 font-bold text-center">الكمية</th>
                  <th className="py-2.5 font-bold text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3">
                      <div className="font-bold text-zinc-900">{item.productName}</div>
                      {item.selectedOptions?.length > 0 && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {item.selectedOptions.map((o) => `${o.groupName}: ${o.choiceName}`).join(' · ')}
                        </div>
                      )}
                      {item.selectedAddons?.length > 0 && (
                        <div className="text-xs text-zinc-500">
                          إضافات: {item.selectedAddons.map((a) => a.name).join('، ')}
                        </div>
                      )}
                      {item.note && <div className="text-xs text-amber-700 mt-0.5">ملاحظة: {item.note}</div>}
                    </td>
                    <td className="py-3 text-center tabular-nums font-medium">{item.quantity}</td>
                    <td className="py-3 text-left tabular-nums font-bold">
                      {formatPrice(item.lineTotal, storeSettings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-zinc-200 pt-4 space-y-2 text-sm max-w-xs mr-auto">
            <div className="flex justify-between text-zinc-600">
              <span>المجموع الفرعي</span>
              <span className="tabular-nums">{formatPrice(order.subtotal, storeSettings.currency)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>الخصم {order.couponCode ? `(${order.couponCode})` : ''}</span>
                <span className="tabular-nums">-{formatPrice(order.discountAmount, storeSettings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>رسوم التوصيل</span>
              <span className="tabular-nums">{formatPrice(order.deliveryFee, storeSettings.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-zinc-900 pt-2 border-t border-zinc-200">
              <span>الإجمالي النهائي</span>
              <span className="tabular-nums text-[#E94F36]">{formatPrice(order.total, storeSettings.currency)}</span>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 text-center text-xs text-zinc-500 space-y-1">
            <p>{storeSettings.nameAr} ({storeSettings.nameEn})</p>
            {(storeSettings.phone || storeSettings.address) && (
              <p>
                {[storeSettings.phone, storeSettings.address].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
