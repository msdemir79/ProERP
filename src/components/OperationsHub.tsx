import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardCheck, PackageCheck, ShoppingCart } from 'lucide-react';
import { api, callOp, getWorkflowSummary } from '../api/client';
import { useApiQuery, useApiQueryFull, useApiQueryIf } from '../hooks/useApiQuery';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../lib/feedback';
import Tabs from './Common/Tabs';
import Button from './Common/Button';
import { Field, Input, Select } from './Common/Field';
import DataGrid, { StatusPill } from './Common/DataGrid';
import Modal from './Modal';
import { quantityDecimals } from '../lib/inventoryCalculator';
import type { PurchaseRequestRow } from '../lib/workflowTypes';
import StockControl from './Inventory/StockControl';

let purchaseLineSequence = 0;
const newPurchaseLine = () => ({ key: String(++purchaseLineSequence), productId: '', quantity: '', unitPrice: '', taxRate: '20' });

const labels = { active: 'Aktif', released: 'Serbest bırakıldı', consumed: 'Kullanıldı', pending: 'Onay bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };
export default function OperationsHub({ initialTab }: { initialTab?: 'reservations' | 'quality' | 'purchasing' }) {
  const { hasPermission } = useAuth();
  const { pathname } = useLocation();
  const tabs = [
    { key: 'reservations', label: 'Stok Rezervasyonları', module: 'inventory' as const, icon: <PackageCheck className="w-4 h-4" /> },
    { key: 'counts', label: 'Stok Sayımı', module: 'inventory' as const, icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'reconciliation', label: 'Rezervasyon Uzlaştırma', module: 'inventory' as const, icon: <PackageCheck className="w-4 h-4" /> },
    { key: 'quality', label: 'Kalite Kontrolleri', module: 'production' as const, icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'purchasing', label: 'Satın Alma Talepleri', module: 'orders' as const, icon: <ShoppingCart className="w-4 h-4" /> },
  ].filter(tab => hasPermission(tab.module, 'view'));
  const [selected, setSelected] = useState(initialTab || (pathname.startsWith('/production') ? 'quality' : pathname.startsWith('/orders') ? 'purchasing' : 'reservations'));
  const active = tabs.find(tab => tab.key === selected)?.key ?? tabs[0]?.key;
  const summary = useApiQueryFull(getWorkflowSummary, [], ['stockReservations', 'qualityChecks', 'purchaseRequests', 'orders']);
  const products = useApiQuery(() => api.products.list({ select: ['id', 'code', 'name', 'unit'], orderBy: 'name' }), [], ['products']) || [];
  const workOrders = useApiQueryIf(hasPermission('production', 'view'), () => api.workOrders.list({ where: { status: ['pending', 'in_progress'] } }), [], ['workOrders']) || [];
  const orders = useApiQueryIf(hasPermission('orders', 'view'), () => api.orders.list({ where: { type: 'sales', status: ['confirmed', 'partially_shipped'] } }), [], ['orders']) || [];
  const contacts = useApiQuery(() => api.contacts.list({ select: ['id', 'name', 'type'] }), [], ['contacts']) || [];
  const [productId, setProductId] = useState(''); const [quantity, setQuantity] = useState('');
  const [orderId, setOrderId] = useState(''); const [workOrderId, setWorkOrderId] = useState('');
  const [color, setColor] = useState(''); const [size, setSize] = useState('');
  const [qualityOrder, setQualityOrder] = useState(''); const [inspected, setInspected] = useState(''); const [rejected, setRejected] = useState('0'); const [qualityNotes, setQualityNotes] = useState('');
  const [supplierId, setSupplierId] = useState(''); const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseLines, setPurchaseLines] = useState(() => [newPurchaseLine()]);
  const [detailRequest, setDetailRequest] = useState<PurchaseRequestRow | null>(null);
  const patchLine = (key: string, patch: Partial<ReturnType<typeof newPurchaseLine>>) => setPurchaseLines(lines => lines.map(line => line.key === key ? { ...line, ...patch } : line));
  const lineTotal = (line: { quantity: string | number; unitPrice: string | number; taxRate: string | number }) => {
    const net = Math.round(Number(line.quantity) * Number(line.unitPrice) * 100) / 100;
    return net + Math.round(net * Number(line.taxRate) / 100 * 100) / 100;
  };
  const formatMoney = (amount: number) => amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [busy, setBusy] = useState(false); const [decision, setDecision] = useState<{ id: number; verdict: string } | null>(null); const [reason, setReason] = useState('');
  async function perform(op: string, body: object) {
    setBusy(true);
    try { await callOp(op, body); showToast('İşlem kaydedildi.', 'success'); summary.refetch(); return true; }
    catch (error) { showToast((error as Error).message, 'error'); return false; }
    finally { setBusy(false); }
  }
  const prevent = (event: FormEvent) => event.preventDefault();
  if (!tabs.length) return <p className="p-6 text-fg-muted">Operasyon görüntüleme yetkiniz bulunmuyor.</p>;
  return <div className="max-w-[1500px] mx-auto space-y-5">
    <div><h1 className="text-xl font-bold text-fg-strong">Operasyon ve onay merkezi</h1><p className="mt-1 text-sm text-fg-muted">Stok ayırın, kalite sonuçlarını onaylayın ve satın alma taleplerini siparişe dönüştürün.</p></div>
    <Tabs items={tabs} value={active} onChange={setSelected} ariaLabel="Operasyon süreçleri" />
    {(active === 'counts' || active === 'reconciliation') && <div role="tabpanel" id={`tabpanel-${active}`} aria-labelledby={`tab-${active}`}><StockControl mode={active} /></div>}
    {summary.error && <div role="alert" className="rounded-xl bg-danger-soft text-danger p-4">{summary.error.message} <Button onClick={summary.refetch}>Tekrar dene</Button></div>}
    {summary.loading && !summary.data && <p role="status" className="p-4 text-fg-muted">Süreçler yükleniyor…</p>}
    {active === 'reservations' && <div role="tabpanel" id="tabpanel-reservations" aria-labelledby="tab-reservations" className="space-y-4">
      {hasPermission('inventory', 'edit') && <form className="rounded-2xl border border-line bg-surface p-5 space-y-4" onSubmit={async event => { prevent(event); if (await perform('reserve-stock', { productId: Number(productId), quantity: Number(quantity), orderId: orderId ? Number(orderId) : undefined, workOrderId: workOrderId ? Number(workOrderId) : undefined, color, size })) setQuantity(''); }}>
        <h2 className="font-bold text-fg-strong">Yeni stok rezervasyonu</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="Ürün" htmlFor="reserve-product"><Select id="reserve-product" required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Ürün seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}</Select></Field>
          <Field label="Miktar" htmlFor="reserve-quantity"><Input id="reserve-quantity" type="number" required min="0.0001" step="0.0001" value={quantity} onChange={event => setQuantity(event.target.value)} /></Field>
          <Field label="Satış siparişi" htmlFor="reserve-order"><Select id="reserve-order" value={orderId} onChange={event => { setOrderId(event.target.value); setWorkOrderId(''); }}><option value="">Sipariş seçin</option>{orders.map(order => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</Select></Field>
          <Field label="Veya iş emri" htmlFor="reserve-work"><Select id="reserve-work" value={workOrderId} onChange={event => { setWorkOrderId(event.target.value); setOrderId(''); }}><option value="">İş emri seçin</option>{workOrders.map(order => <option key={order.id} value={order.id}>{order.barcode}</option>)}</Select></Field>
          <Field label="Renk (siparişle aynı)" htmlFor="reserve-color"><Input id="reserve-color" value={color} onChange={event => setColor(event.target.value)} /></Field>
          <Field label="Beden (siparişle aynı)" htmlFor="reserve-size"><Input id="reserve-size" value={size} onChange={event => setSize(event.target.value)} /></Field>
        </div><p className="text-xs text-fg-muted">Rezervasyon fiziksel stoğu değiştirmez. İlgili sevkiyatta kullanılır; diğer işlemler ayrılmış stoğu tüketemez.</p><Button type="submit" variant="primary" loading={busy}>Stoğu ayır</Button>
      </form>}
      <DataGrid data={summary.data?.reservations || []} rowKey={row => row.id} columns={[
        { key: 'productName', title: 'Ürün' }, { key: 'orderNumber', title: 'Sipariş / İş Emri', render: row => row.orderNumber || row.workOrderBarcode || '—' },
        { key: 'color', title: 'Renk' }, { key: 'size', title: 'Beden' }, { key: 'remainingQuantity', title: 'Kalan rezervasyon' },
        { key: 'status', title: 'Durum', render: row => <StatusPill tone={row.status === 'active' ? 'blue' : 'slate'}>{labels[row.status]}</StatusPill> },
        { key: 'actions', title: 'İşlem', sortable: false, render: row => row.status === 'active' && hasPermission('inventory', 'edit') ? <Button size="sm" disabled={busy} onClick={() => void perform('release-reservation', { reservationId: row.id })}>Serbest bırak</Button> : null },
      ]} />
    </div>}
    {active === 'quality' && <div role="tabpanel" id="tabpanel-quality" aria-labelledby="tab-quality" className="space-y-4">
      {hasPermission('production', 'edit') && <form className="rounded-2xl border border-line bg-surface p-5 space-y-4" onSubmit={async event => { prevent(event); if (await perform('quality-check', { workOrderId: Number(qualityOrder), inspectedQuantity: Number(inspected), rejectedQuantity: Number(rejected), notes: qualityNotes })) { setQualityNotes(''); setInspected(''); } }}>
        <h2 className="font-bold text-fg-strong">Kalite kontrol kaydı</h2><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="İş emri" htmlFor="quality-work"><Select id="quality-work" required value={qualityOrder} onChange={event => { setQualityOrder(event.target.value); setInspected(String(workOrders.find(order => order.id === Number(event.target.value))?.quantity || '')); }}><option value="">İş emri seçin</option>{workOrders.map(order => <option key={order.id} value={order.id}>{order.barcode} · {order.quantity} çift</option>)}</Select></Field>
          <Field label="Kontrol edilen" htmlFor="quality-inspected"><Input id="quality-inspected" required type="number" min="1" step="1" value={inspected} onChange={event => setInspected(event.target.value)} /></Field>
          <Field label="Reddedilen" htmlFor="quality-rejected"><Input id="quality-rejected" type="number" min="0" step="1" value={rejected} onChange={event => setRejected(event.target.value)} /></Field>
          <Field label="Kontrol bulgusu" htmlFor="quality-notes"><Input id="quality-notes" required value={qualityNotes} onChange={event => setQualityNotes(event.target.value)} placeholder="Kontrol ölçütleri ve sonuç" /></Field>
        </div><p className="text-xs text-fg-muted">Üretim tamamlama için yeterli miktarda onaylı başarılı kontrol gerekir. Ret sonrası yeniden kontrol kaydı oluşturun.</p><Button type="submit" variant="primary" loading={busy}>Kontrolü kaydet</Button>
      </form>}
      <DataGrid data={summary.data?.qualityChecks || []} rowKey={row => row.id} columns={[
        { key: 'barcode', title: 'İş emri' }, { key: 'productName', title: 'Ürün' }, { key: 'inspectedQuantity', title: 'Kontrol' }, { key: 'rejectedQuantity', title: 'Ret' },
        { key: 'result', title: 'Sonuç', render: row => <StatusPill tone={row.result === 'pass' ? 'green' : 'red'}>{row.result === 'pass' ? 'Uygun' : 'Uygunsuz'}</StatusPill> },
        { key: 'status', title: 'Onay', render: row => labels[row.status] }, { key: 'notes', title: 'Bulgu' },
        { key: 'actions', title: 'İşlem', sortable: false, render: row => row.status === 'pending' && hasPermission('production', 'approve') ? <Button size="sm" disabled={busy} onClick={() => void perform('approve-quality', { qualityCheckId: row.id })}>Sonucu onayla</Button> : null },
      ]} />
    </div>}
    {active === 'purchasing' && <div role="tabpanel" id="tabpanel-purchasing" aria-labelledby="tab-purchasing" className="space-y-4">
      {hasPermission('orders', 'create') && <form className="rounded-2xl border border-line bg-surface p-5 space-y-4" onSubmit={async event => { prevent(event); if (await perform('purchase-request', { supplierId: Number(supplierId), items: purchaseLines.map(line => ({ productId: Number(line.productId), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxRate: Number(line.taxRate) })), notes: purchaseNotes })) { setPurchaseNotes(''); setPurchaseLines([newPurchaseLine()]); } }}>
        <h2 className="font-bold text-fg-strong">Satın alma talebi</h2><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="Tedarikçi" htmlFor="purchase-supplier"><Select id="purchase-supplier" required value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">Tedarikçi seçin</option>{contacts.filter(contact => contact.type === 'supplier' || contact.type === 'both').map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></Field>
          <Field label="Satın alma gerekçesi" htmlFor="purchase-notes" className="sm:col-span-2"><Input id="purchase-notes" required value={purchaseNotes} onChange={event => setPurchaseNotes(event.target.value)} /></Field>
        </div>
        <div className="space-y-3">{purchaseLines.map((line, index) => {
          const product = products.find(product => product.id === Number(line.productId));
          const step = product && quantityDecimals(product.unit) === 0 ? '1' : '0.0001';
          return <fieldset key={line.key} disabled={busy} className="rounded-xl border border-line p-4"><legend className="px-2 text-sm font-bold">Kalem {index + 1}</legend><div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <Field label="Ürün" htmlFor={`purchase-product-${line.key}`}><Select id={`purchase-product-${line.key}`} required value={line.productId} onChange={event => patchLine(line.key, { productId: event.target.value })}><option value="">Ürün seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}</Select></Field>
            <Field label={`Miktar${product ? ` (${product.unit})` : ''}`} htmlFor={`purchase-quantity-${line.key}`}><Input id={`purchase-quantity-${line.key}`} type="number" min={step} step={step} required value={line.quantity} onChange={event => patchLine(line.key, { quantity: event.target.value })} /></Field>
            <Field label="Birim fiyat (TRY, KDV hariç)" htmlFor={`purchase-price-${line.key}`}><Input id={`purchase-price-${line.key}`} type="number" min="0" step="0.0001" required value={line.unitPrice} onChange={event => patchLine(line.key, { unitPrice: event.target.value })} /></Field>
            <Field label="KDV (%)" htmlFor={`purchase-tax-${line.key}`}><Input id={`purchase-tax-${line.key}`} type="number" min="0" max="100" step="0.01" required value={line.taxRate} onChange={event => patchLine(line.key, { taxRate: event.target.value })} /></Field>
            <div className="flex items-end justify-between gap-2"><span className="text-sm font-bold pb-2">{formatMoney(lineTotal(line))} TRY</span><Button type="button" variant="ghost" disabled={purchaseLines.length === 1} aria-label={`Kalem ${index + 1} sil`} onClick={() => setPurchaseLines(lines => lines.filter(item => item.key !== line.key))}>Sil</Button></div>
          </div></fieldset>;
        })}</div>
        <div className="flex flex-wrap justify-between items-center gap-3"><Button type="button" disabled={busy || purchaseLines.length >= 1000} onClick={() => setPurchaseLines(lines => [...lines, newPurchaseLine()])}>Kalem ekle</Button><strong>Genel toplam: {formatMoney(purchaseLines.reduce((sum, line) => sum + lineTotal(line), 0))} TRY</strong></div>
        <p className="text-xs text-fg-muted">Onaylanan talep, tüm kalemleriyle alış siparişine dönüşür. Ret ve onay kararları gerekçesiyle izlenir.</p><Button type="submit" variant="primary" loading={busy}>Onaya gönder</Button>
      </form>}
      <DataGrid data={summary.data?.purchaseRequests || []} rowKey={row => row.id} columns={[
        { key: 'requestNumber', title: 'Talep no' }, { key: 'supplierName', title: 'Tedarikçi' }, { key: 'totalAmount', title: 'Toplam (TRY)', render: row => Number(row.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) },
        { key: 'status', title: 'Durum', render: row => labels[row.status] }, { key: 'notes', title: 'Gerekçe' }, { key: 'orderId', title: 'Sipariş ID' },
        { key: 'details', title: 'Kalemler', sortable: false, render: row => <Button size="sm" onClick={() => setDetailRequest(row)}>İncele</Button> },
        { key: 'actions', title: 'Karar', sortable: false, render: row => row.status === 'pending' && hasPermission('orders', 'approve') ? <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { setReason(''); setDecision({ id: row.id, verdict: 'approved' }); }}>Onayla</Button><Button size="sm" disabled={busy} variant="danger" onClick={() => { setReason(''); setDecision({ id: row.id, verdict: 'rejected' }); }}>Reddet</Button></div> : null },
      ]} />
    </div>}
    <p className="text-xs text-fg-muted">{active === 'counts' ? 'Sayımlar 100 kayıtlık sayfalar halinde gösterilir.' : active === 'reconciliation' ? 'Aktif rezervasyonlar 200 kayıtlık gruplar halinde taranır.' : 'Listelerde son 200 kayıt gösterilir.'}</p>
    <Modal isOpen={!!detailRequest} onClose={() => setDetailRequest(null)} title={detailRequest?.requestNumber || 'Satın alma kalemleri'} size="3xl"><div className="space-y-4"><p>{detailRequest?.supplierName} · {detailRequest?.notes}</p><DataGrid<PurchaseRequestRow['items'][number] & { rowId: number }> data={(detailRequest?.items || []).map((item, index) => ({ ...item, rowId: index }))} rowKey="rowId" columns={[
      { key: 'productName', title: 'Ürün' }, { key: 'quantity', title: 'Miktar' }, { key: 'unit', title: 'Birim' }, { key: 'unitPrice', title: 'Birim fiyat', render: row => formatMoney(Number(row.unitPrice)) }, { key: 'taxRate', title: 'KDV (%)' }, { key: 'total', title: 'Toplam (TRY)', render: row => formatMoney(Number(row.total)) },
    ]} /><p className="font-bold text-right">Toplam: {formatMoney(Number(detailRequest?.totalAmount || 0))} TRY</p></div></Modal>
    <Modal isOpen={!!decision} onClose={() => setDecision(null)} title="Satın alma kararı"><form className="space-y-4" onSubmit={async event => { prevent(event); if (decision && await perform('decide-purchase', { requestId: decision.id, decision: decision.verdict, reason })) setDecision(null); }}><Field label="Karar gerekçesi" htmlFor="decision-reason"><Input id="decision-reason" required value={reason} onChange={event => setReason(event.target.value)} /></Field><Button type="submit" variant="primary" loading={busy}>Kararı kaydet</Button></form></Modal>
  </div>;
}
