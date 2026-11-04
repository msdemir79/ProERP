import React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Receipt,
  ShoppingBag,
  Edit,
  Trash2,
  Building2,
  CreditCard,
  MapPin
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Contact, Order, Transaction, Invoice } from '../../types';

export interface LedgerEntry {
  id: string;
  date: Date;
  docNo: string;
  type: 'sales_invoice' | 'purchase_invoice' | 'collection' | 'payment' | 'opening' | 'other';
  typeLabel: string;
  description: string;
  debit: number;   // Borç (Customer debt / Our receivable increase)
  credit: number;  // Alacak (Customer payment / Supplier debt increase)
  runningBalance: number;
  paymentMethod?: string;
  rawItem?: Invoice | Transaction;
}

const getPaymentMethodBadge = (method?: string) => {
  switch (method) {
    case 'bank_transfer':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-100 text-sky-800">Havale / EFT</span>;
    case 'credit_card':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-100 text-purple-800">Kredi Kartı</span>;
    case 'check':
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800">Çek / Senet</span>;
    case 'cash':
    default:
      return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800">Nakit</span>;
  }
};

export function LedgerTab({ filteredLedger, totalDebit, totalCredit, netBalance }: {
  filteredLedger: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}) {
  return (
    <div className="space-y-4">
      {/* Ledger Totals Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Toplam Borç (Satış/Çıkış)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Toplam Alacak (Tahsilat/Giriş)</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-xl border shadow-sm",
          netBalance > 0 
            ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
            : netBalance < 0 
            ? "bg-rose-50 border-rose-200 text-rose-950"
            : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        )}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
            <span>Dönem Sonu Bakiye</span>
            {netBalance >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
          <div className="text-xl font-black font-mono">
            ₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs ml-1 font-semibold">
              {netBalance > 0 ? '(Alacaklıyız)' : netBalance < 0 ? '(Borçluyuz)' : '(Sıfır)'}
            </span>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider w-24">Tarih</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider w-28">Evrak / No</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider w-32">İşlem Türü</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Açıklama</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right w-32">Borç (₺)</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right w-32">Alacak (₺)</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right w-36">Yürüyen Bakiye (₺)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                    Bu döneme ait herhangi bir hesap hareketi bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {row.date.toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-600 whitespace-nowrap">
                      {row.docNo}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider inline-block",
                        row.type === 'sales_invoice' ? "bg-indigo-100 text-indigo-800" :
                        row.type === 'purchase_invoice' ? "bg-amber-100 text-amber-800" :
                        row.type === 'collection' ? "bg-emerald-100 text-emerald-800" :
                        row.type === 'payment' ? "bg-rose-100 text-rose-800" :
                        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      )}>
                        {row.typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{row.description}</div>
                      {row.paymentMethod && (
                        <div className="mt-0.5">{getPaymentMethodBadge(row.paymentMethod)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                      {row.debit > 0 ? `₺${row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                      {row.credit > 0 ? `₺${row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-mono font-black whitespace-nowrap",
                      row.runningBalance > 0 ? "text-emerald-700 bg-emerald-50/40" : row.runningBalance < 0 ? "text-rose-700 bg-rose-50/40" : "text-slate-500 dark:text-slate-400"
                    )}>
                      ₺{Math.abs(row.runningBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-[10px] ml-1 opacity-70">
                        {row.runningBalance > 0 ? '(B)' : row.runningBalance < 0 ? '(A)' : ''}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 font-bold">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-slate-700 dark:text-slate-200 uppercase tracking-wider text-right">
                  Toplamlar ve Net Bakiye:
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-rose-700">
                  ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                  ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={cn(
                  "px-4 py-3 text-right font-mono font-black",
                  netBalance > 0 ? "text-emerald-700" : netBalance < 0 ? "text-rose-700" : "text-slate-800 dark:text-slate-200"
                )}>
                  ₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export function InvoicesTab({ invoices, onNewInvoice, contact }: {
  invoices: Invoice[];
  onNewInvoice?: (contact: Contact) => void;
  contact: Contact;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Cariye Kesilen & Alınan Faturalar ({invoices?.length || 0})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cari hesap bakiyesi bu faturalar ve tahsilat/ödeme hareketleri üzerinden oluşur.
          </p>
        </div>
        {onNewInvoice && (
          <button
            onClick={() => onNewInvoice(contact)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <Receipt className="w-3.5 h-3.5" />
            Yeni Fatura Kes
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Fatura No</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Tarih / Vade</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Tür & Senaryo</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">İlişkili Sipariş</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Durum</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">KDV</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Genel Toplam</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!invoices || invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                  Kayıtlı fatura bulunamadı.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    <div>{new Date(inv.date).toLocaleDateString('tr-TR')}</div>
                    {inv.dueDate && (
                      <div className="text-[10px] text-amber-700">Vade: {new Date(inv.dueDate).toLocaleDateString('tr-TR')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                      inv.type === 'sales' ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
                    )}>
                      {inv.type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1.5 capitalize">({inv.scenario})</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {inv.orderNumber ? (
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded font-bold">
                        {inv.orderNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                      inv.status === 'issued' ? "bg-emerald-100 text-emerald-800" :
                      inv.status === 'cancelled' ? "bg-rose-100 text-rose-800" :
                      "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                    )}>
                      {inv.status === 'issued' ? 'Kesildi' :
                       inv.status === 'cancelled' ? 'İptal Edildi' : 'Taslak'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    ₺{inv.taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right font-mono font-bold text-sm",
                    inv.type === 'sales' ? "text-rose-600" : "text-emerald-600"
                  )}>
                    ₺{inv.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrdersTab({ orders, onNewOrder, contact }: {
  orders: Order[];
  onNewOrder?: (contact: Contact) => void;
  contact: Contact;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Cariye Ait Siparişler & Faturalama Takibi ({orders?.length || 0})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sipariş tutarı cari bakiyeye doğrudan yansımaz. Fatura kesildiğinde bakiyeye geçer.
          </p>
        </div>
        {onNewOrder && (
          <button
            onClick={() => onNewOrder(contact)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Yeni Sipariş Başlat
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Sipariş No</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Tarih</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Tür</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Sipariş Durumu</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Faturalama Durumu</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Sipariş Tutarı</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Faturalanan</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Kalan Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!orders || orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-medium">
                  Kayıtlı sipariş bulunamadı.
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const invoicedAmt = ord.invoicedTotal || 0;
                const remainingAmt = Math.max(0, ord.grandTotal - invoicedAmt);
                const invStatus = ord.invoicingStatus || (invoicedAmt >= ord.grandTotal ? 'fully_invoiced' : invoicedAmt > 0 ? 'partially_invoiced' : 'not_invoiced');

                return (
                  <tr key={ord.id} className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                      {ord.orderNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {new Date(ord.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                        ord.type === 'sales' ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {ord.type === 'sales' ? 'Satış' : 'Satın Alma'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                        ord.status === 'completed' ? "bg-emerald-100 text-emerald-800" :
                        ord.status === 'confirmed' ? "bg-blue-100 text-blue-800" :
                        ord.status === 'cancelled' ? "bg-rose-100 text-rose-800" :
                        "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      )}>
                        {ord.status === 'confirmed' ? 'Onaylandı' :
                         ord.status === 'completed' ? 'Tamamlandı' :
                         ord.status === 'cancelled' ? 'İptal' : 'Taslak'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                        invStatus === 'fully_invoiced' ? "bg-emerald-100 text-emerald-800" :
                        invStatus === 'partially_invoiced' ? "bg-amber-100 text-amber-800" :
                        "bg-slate-100 dark:bg-slate-800 text-slate-600"
                      )}>
                        {invStatus === 'fully_invoiced' ? 'Tamamı Faturalandı' :
                         invStatus === 'partially_invoiced' ? 'Kısmi Faturalandı' : 'Faturalanmadı'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₺{ord.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">
                      ₺{invoicedAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-mono font-bold",
                      remainingAmt > 0 ? "text-amber-600" : "text-slate-400"
                    )}>
                      ₺{remainingAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TransactionsTab({ transactions, onQuickPayment, contact, setEditingTx, setIsTxModalOpen, setDeletingTx, setIsTxDeleteModalOpen }: {
  transactions: Transaction[];
  onQuickPayment?: (contact: Contact, defaultType: 'income' | 'expense') => void;
  contact: Contact;
  setEditingTx: React.Dispatch<React.SetStateAction<Transaction | null>>;
  setIsTxModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDeletingTx: React.Dispatch<React.SetStateAction<Transaction | null>>;
  setIsTxDeleteModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
          Finansal Hareketler & Kasa Kayıtları ({transactions?.length || 0})
        </h3>
        {onQuickPayment && (
          <div className="flex gap-2">
            <button
              onClick={() => onQuickPayment(contact, 'income')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Tahsilat Ekle
            </button>
            <button
              onClick={() => onQuickPayment(contact, 'expense')}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Ödeme Ekle
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Tarih</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Makbuz/Dekont No</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Hareket Türü</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Ödeme Şekli</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider">Açıklama</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-right">Tutar</th>
              <th className="px-4 py-3 font-bold text-slate-600 uppercase tracking-wider text-center w-24">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!transactions || transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                  Kayıtlı finansal hareket bulunamadı.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:bg-slate-800/50 transition-colors group">
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {new Date(tx.date).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">
                    {tx.documentNo || `TRX-${tx.id}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                      tx.type === 'income' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    )}>
                      {tx.type === 'income' ? 'Tahsilat (Giriş)' : 'Ödeme (Çıkış)'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {getPaymentMethodBadge(tx.paymentMethod)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {tx.description}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right font-mono font-bold text-sm",
                    tx.type === 'income' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {tx.type === 'income' ? '+' : '-'}₺{tx.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setEditingTx(tx);
                          setIsTxModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="İşlemi Düzenle"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingTx(tx);
                          setIsTxDeleteModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="İşlemi Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DetailsTab({ currentContact }: {
  currentContact: Contact;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Company & Official Details */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <Building2 className="w-4 h-4 text-indigo-600" />
          Resmi & İletişim Bilgileri
        </h3>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Cari Kodu:</span>
            <span className="col-span-2 font-mono font-bold text-slate-800 dark:text-slate-200">{currentContact.code || '-'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Ticari Ünvan:</span>
            <span className="col-span-2 font-bold text-slate-800 dark:text-slate-200">{currentContact.companyTitle || currentContact.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Yetkili Kişi:</span>
            <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">{currentContact.contactPerson || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Vergi Dairesi:</span>
            <span className="col-span-2 text-slate-800 dark:text-slate-200">{currentContact.taxOffice || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Vergi No / TCKN:</span>
            <span className="col-span-2 font-mono font-bold text-slate-800 dark:text-slate-200">{currentContact.taxNumber || currentContact.tcKimlik || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Telefon:</span>
            <span className="col-span-2 font-mono text-slate-800 dark:text-slate-200">{currentContact.phone || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">GSM / Cep:</span>
            <span className="col-span-2 font-mono text-slate-800 dark:text-slate-200">{currentContact.mobile || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">E-posta:</span>
            <span className="col-span-2 text-slate-800 dark:text-slate-200">{currentContact.email || 'Girilmemiş'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-400 font-bold uppercase">Web Sitesi:</span>
            <span className="col-span-2 text-indigo-600">{currentContact.website || 'Girilmemiş'}</span>
          </div>
        </div>
      </div>

      {/* Banking & Risk Details */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Banka & Hesap Bilgileri
          </h3>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-400 font-bold uppercase">Banka Adı:</span>
              <span className="col-span-2 font-bold text-slate-800 dark:text-slate-200">{currentContact.bankName || 'Tanımlanmamış'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-400 font-bold uppercase">Hesap Sahibi:</span>
              <span className="col-span-2 text-slate-800 dark:text-slate-200">{currentContact.bankAccountName || currentContact.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-400 font-bold uppercase">IBAN:</span>
              <span className="col-span-2 font-mono font-bold text-slate-900 dark:text-slate-100 tracking-wider">
                {currentContact.iban || 'Girilmemiş'}
              </span>
            </div>
          </div>
        </div>

        {/* Address & Logistics */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <MapPin className="w-4 h-4 text-amber-600" />
            Adres & Sevkiyat Lokasyonu
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase block mb-1">Fatura Adresi:</span>
              <p className="text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                {currentContact.address || 'Fatura adresi belirtilmemiş.'}
                {currentContact.city ? ` (${currentContact.city} / ${currentContact.district || ''})` : ''}
              </p>
            </div>
            {currentContact.shippingAddress && (
              <div>
                <span className="text-slate-400 font-bold uppercase block mb-1">Sevkiyat / Depo Adresi:</span>
                <p className="text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  {currentContact.shippingAddress}
                </p>
              </div>
            )}
          </div>
        </div>

        {currentContact.notes && (
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs">
            <span className="font-bold text-amber-900 uppercase block mb-1">Özel Cari Notları:</span>
            <p className="text-amber-800">{currentContact.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PrintableStatement({ dateFilter, currentContact, filteredLedger, totalDebit, totalCredit, netBalance }: {
  dateFilter: 'all' | '30days' | 'this_year';
  currentContact: Contact;
  filteredLedger: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}) {
  return (
    <div className="hidden print:block font-sans text-slate-900 dark:text-slate-100 pt-4">
      <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">RESMİ CARİ HESAP EKSTRESİ</h1>
          <p className="text-xs text-slate-600">Dönem: {dateFilter === '30days' ? 'Son 30 Gün' : dateFilter === 'this_year' ? 'Bu Yıl' : 'Tüm Hareketler'}</p>
          <p className="text-xs text-slate-600">Yazdırma Tarihi: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')}</p>
        </div>
        <div className="text-right">
          <h2 className="text-base font-black uppercase">{currentContact.name}</h2>
          <p className="text-xs font-mono font-bold">Kod: {currentContact.code || currentContact.id}</p>
          <p className="text-xs text-slate-600">VKN: {currentContact.taxNumber || currentContact.tcKimlik || '-'}</p>
        </div>
      </div>

      <table className="w-full text-left border-collapse text-[10px] mb-6">
        <thead>
          <tr className="border-b border-slate-900 font-bold bg-slate-100 dark:bg-slate-800">
            <th className="py-1.5 px-2">Tarih</th>
            <th className="py-1.5 px-2">Evrak No</th>
            <th className="py-1.5 px-2">İşlem Türü</th>
            <th className="py-1.5 px-2">Açıklama</th>
            <th className="py-1.5 px-2 text-right">Borç (₺)</th>
            <th className="py-1.5 px-2 text-right">Alacak (₺)</th>
            <th className="py-1.5 px-2 text-right">Bakiye (₺)</th>
          </tr>
        </thead>
        <tbody>
          {filteredLedger.map((row) => (
            <tr key={row.id} className="border-b border-slate-200 dark:border-slate-700">
              <td className="py-1 px-2">{row.date.toLocaleDateString('tr-TR')}</td>
              <td className="py-1 px-2 font-mono">{row.docNo}</td>
              <td className="py-1 px-2">{row.typeLabel}</td>
              <td className="py-1 px-2">{row.description}</td>
              <td className="py-1 px-2 text-right font-mono">{row.debit > 0 ? row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
              <td className="py-1 px-2 text-right font-mono">{row.credit > 0 ? row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
              <td className="py-1 px-2 text-right font-mono font-bold">{Math.abs(row.runningBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 font-bold">
            <td colSpan={4} className="py-2 px-2 text-right">TOPLAM VE BAKİYE:</td>
            <td className="py-2 px-2 text-right font-mono">₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2 px-2 text-right font-mono">₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2 px-2 text-right font-mono">₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>

      <div className="grid grid-cols-2 gap-8 pt-8 mt-8 border-t border-slate-300 text-center text-xs">
        <div>
          <div className="font-bold uppercase mb-12">Düzenleyen (Firma Yetkilisi)</div>
          <div className="border-t border-slate-400 pt-1 w-48 mx-auto text-slate-500 dark:text-slate-400">İmza / Kaşe</div>
        </div>
        <div>
          <div className="font-bold uppercase mb-12">Mutabık Kalan (Cari Yetkilisi)</div>
          <div className="border-t border-slate-400 pt-1 w-48 mx-auto text-slate-500 dark:text-slate-400">İmza / Kaşe</div>
        </div>
      </div>
    </div>
  );
}
