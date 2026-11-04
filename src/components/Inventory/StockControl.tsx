import { useState, type FormEvent } from 'react';
import { api, callOp } from '../../api/client';
import { useApiQuery, useApiQueryFull } from '../../hooks/useApiQuery';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../lib/feedback';
import { quantityDecimals } from '../../lib/inventoryCalculator';
import type { CountProduct, StockCount, ReservationIssue } from '../../lib/stockCountTypes';
import Button from '../Common/Button';
import { Field, Input, Select } from '../Common/Field';
import DataGrid, { StatusPill } from '../Common/DataGrid';
import Modal from '../Modal';

type Draft = { product: CountProduct; counted: string; variants: string[] };
const number = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
const states = { pending: 'Onay bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };
export default function StockControl({ mode }: { mode: 'counts' | 'reconciliation' }) {
  const { hasPermission } = useAuth();
  const [cursor, setCursor] = useState(0);
  const [countCursor, setCountCursor] = useState(0);
  const summary = useApiQueryFull(() => callOp<{ counts: StockCount[]; issues: ReservationIssue[]; scanned: number; nextCursor: number | null; nextCountCursor: number | null }>('stock-count-summary', { afterId: cursor, beforeCountId: countCursor }), [cursor, countCursor], ['stockCounts', 'stockReservations', 'products', 'orders', 'workOrders']);
  const products = useApiQuery(() => api.products.list({ select: ['id', 'code', 'name'], orderBy: 'name' }), [], ['products']) || [];
  const [productId, setProductId] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<StockCount | null>(null);
  const [issue, setIssue] = useState<ReservationIssue | null>(null);
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('approved');
  async function perform(op: string, payload: object) {
    setBusy(true);
    try { await callOp(op, payload); summary.refetch(); showToast('İşlem kaydedildi.', 'success'); return true; }
    catch (error) { showToast((error as Error).message, 'error'); summary.refetch(); return false; }
    finally { setBusy(false); }
  }
  async function addProduct() {
    if (!productId || drafts.some(draft => draft.product.id === Number(productId))) return;
    setBusy(true);
    try {
      const product = await callOp<CountProduct>('stock-count-product', { productId: Number(productId) });
      setDrafts(list => [...list, { product, counted: '', variants: product.variantBarcodes.map(() => '') }]); setProductId('');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await perform('create-stock-count', { notes, items: drafts.map(d => ({ productId: d.product.id, expectedVersion: d.product.version, countedQuantity: d.counted, variants: d.product.variantBarcodes.map((v, index) => ({ color: v.color, size: v.size, stock: d.variants[index] })) })) })) { setDrafts([]); setNotes(''); setCountCursor(0); }
  }
  return <div className="space-y-5">
    {summary.error && <div role="alert" className="text-danger">{summary.error.message} <Button onClick={summary.refetch}>Tekrar dene</Button></div>}
    {mode === 'counts' ? <>
      <div><h2 className="font-bold text-fg-strong">Stok sayımı ve fark onayı</h2><p className="text-sm text-fg-muted mt-1">Ürünleri sayım listesine ekleyin, fiziksel miktarları girin ve onaya gönderin. Stok yalnız onayla değişir. Sayım sırasında stok kartı değişirse yeniden sayım gerekir.</p></div>
      {hasPermission('inventory', 'edit') && <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 space-y-4"><fieldset disabled={busy} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3"><Field label="Sayılacak ürün" htmlFor="count-product" className="flex-1 min-w-48"><Select id="count-product" value={productId} onChange={event => setProductId(event.target.value)}><option value="">Ürün seçin</option>{products.filter(p => !drafts.some(d => d.product.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field><Button type="button" disabled={!productId || drafts.length >= 100} onClick={() => void addProduct()}>Sayıma ekle</Button></div>
        {drafts.map(draft => <section key={draft.product.id} className="rounded-xl border border-line p-4 space-y-3"><div className="flex justify-between gap-3"><div><h3 className="font-bold">{draft.product.code} · {draft.product.name}</h3><p className="text-sm text-fg-muted">Kayıtlı: {number(draft.product.stock)} {draft.product.unit}</p></div><Button type="button" variant="ghost" onClick={() => setDrafts(list => list.filter(d => d.product.id !== draft.product.id))}>Çıkar</Button></div>
          {draft.product.variantBarcodes.length ? <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{draft.product.variantBarcodes.map((variant, index) => <div key={index}><Field label={`${variant.color || 'Genel'} / ${variant.size || '—'} · Kayıtlı ${number(Number(variant.stock))}`} htmlFor={`count-${draft.product.id}-${index}`}><Input id={`count-${draft.product.id}-${index}`} type="number" required min="0" step={quantityDecimals(draft.product.unit) === 0 ? '1' : '0.0001'} value={draft.variants[index]} onChange={event => setDrafts(list => list.map(d => d.product.id === draft.product.id ? { ...d, variants: d.variants.map((value, i) => i === index ? event.target.value : value) } : d))} /></Field></div>)}</div> : <Field label={`Sayılan miktar (${draft.product.unit})`} htmlFor={`count-${draft.product.id}`}><Input id={`count-${draft.product.id}`} type="number" required min="0" step={quantityDecimals(draft.product.unit) === 0 ? '1' : '0.0001'} value={draft.counted} onChange={event => setDrafts(list => list.map(d => d.product.id === draft.product.id ? { ...d, counted: event.target.value } : d))} /></Field>}
        </section>)}
        <Field label="Sayım açıklaması" htmlFor="count-notes"><Input id="count-notes" required maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Sayım kapsamı ve gözlemler" /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!drafts.length}>Sayımı onaya gönder</Button>
      </fieldset></form>}
      <DataGrid<StockCount> loading={summary.loading} data={summary.data?.counts || []} rowKey="id" columns={[
        { key: 'countNumber', title: 'Sayım no' }, { key: 'createdAt', title: 'Tarih', render: row => new Date(row.createdAt).toLocaleString('tr-TR') },
        { key: 'status', title: 'Durum', render: row => <StatusPill tone={row.status === 'approved' ? 'green' : row.status === 'rejected' ? 'red' : 'blue'}>{states[row.status]}</StatusPill> },
        { key: 'notes', title: 'Açıklama' }, { key: 'detail', title: 'İşlem', sortable: false, render: row => <Button size="sm" onClick={() => { setDetail(row); setReason(''); setDecision('approved'); }}>İncele / Karar</Button> },
      ]} /><div className="flex flex-wrap gap-3"><Button disabled={busy || summary.loading || countCursor === 0} onClick={() => setCountCursor(0)}>En yeni sayımlar</Button><Button disabled={busy || summary.loading || !summary.data?.nextCountCursor} onClick={() => setCountCursor(summary.data!.nextCountCursor!)}>Önceki 100 sayım</Button></div><p className="text-xs text-fg-muted">Sayım farkları fiziksel stok hareketi oluşturur; maliyet muhasebesi fişi oluşturmaz.</p>
    </> : <>
      <div><h2 className="font-bold text-fg-strong">Rezervasyon uzlaştırma</h2><p className="text-sm text-fg-muted mt-1">Kapalı süreçlere bağlı veya mevcut stok/sipariş miktarını aşan rezervasyonları inceleyin. Serbest bırakma fiziksel stoğu değiştirmez; yeniden ayırma gerekiyorsa rezervasyon sekmesini kullanın.</p></div>
      <DataGrid<ReservationIssue> loading={summary.loading} data={summary.data?.issues || []} rowKey="id" emptyMessage="İncelenen rezervasyonlarda uzlaştırma sorunu bulunmadı." columns={[
        { key: 'productName', title: 'Ürün' }, { key: 'orderNumber', title: 'Bağlı belge', render: row => row.orderNumber || row.workOrderBarcode || '—' },
        { key: 'remainingQuantity', title: 'Ayrılmış miktar' }, { key: 'reasons', title: 'Tespit', render: row => row.reasons.join(' ') },
        { key: 'actions', title: 'İşlem', sortable: false, render: row => hasPermission('inventory', 'approve') ? <Button size="sm" disabled={busy} onClick={() => { setIssue(row); setReason(''); }}>Gerekçeli serbest bırak</Button> : null },
      ]} /><div className="flex flex-wrap items-center gap-3"><p className="text-xs text-fg-muted">Bu bölümde {summary.data?.scanned || 0} aktif rezervasyon tarandı. İşlemden önce sorun tekrar kontrol edilir.</p><Button disabled={busy || summary.loading || cursor === 0} onClick={() => setCursor(0)}>Başa dön</Button><Button disabled={busy || summary.loading || !summary.data?.nextCursor} onClick={() => setCursor(summary.data!.nextCursor!)}>Sonraki 200 kaydı tara</Button></div>
    </>}
    <Modal isOpen={!!detail} onClose={() => { if (!busy) setDetail(null); }} title={detail?.countNumber || 'Sayım'} size="3xl"><div className="space-y-4"><p>{detail?.notes}</p>
      {detail?.items.map(item => <div key={item.productId} className="border border-line rounded-xl p-3"><h3 className="font-bold">{item.code} · {item.name}</h3><p className="text-sm">Kayıtlı {number(item.expectedQuantity)} → Sayılan {number(item.countedQuantity)} · Fark {number(item.countedQuantity - item.expectedQuantity)} {item.unit}</p>{item.countedVariants.map((v, index) => <p className="text-sm text-fg-muted" key={index}>{v.color || 'Genel'} / {v.size || '—'}: {number(Number(item.expectedVariants[index].stock))} → {number(Number(v.stock))}</p>)}</div>)}
      {detail?.decisionReason && <p>Karar gerekçesi: {detail.decisionReason}</p>}
      {detail?.status === 'pending' && hasPermission('inventory', 'approve') && <form className="space-y-3" onSubmit={async event => { event.preventDefault(); if (await perform('decide-stock-count', { id: detail.id, expectedVersion: detail.version, decision, reason })) setDetail(null); }}><Field label="Karar" htmlFor="count-decision"><Select id="count-decision" disabled={busy} value={decision} onChange={event => setDecision(event.target.value)}><option value="approved">Onayla ve stok farklarını işle</option><option value="rejected">Reddet</option></Select></Field><Field label="Karar gerekçesi" htmlFor="count-reason"><Input id="count-reason" required maxLength={4000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button type="submit" variant="primary" loading={busy}>Kararı kaydet</Button></form>}
    </div></Modal>
    <Modal isOpen={!!issue} onClose={() => { if (!busy) setIssue(null); }} title="Rezervasyonu uzlaştır"><form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (issue && await perform('reconcile-reservation', { id: issue.id, expectedRemaining: issue.remainingQuantity, reason })) setIssue(null); }}><p>{issue?.productName} · {issue?.remainingQuantity} birim</p><p>{issue?.reasons.join(' ')}</p><Field label="Serbest bırakma gerekçesi" htmlFor="reconcile-reason"><Input id="reconcile-reason" required maxLength={4000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button type="submit" variant="primary" loading={busy}>Rezervasyonu serbest bırak</Button></form></Modal>
  </div>;
}
