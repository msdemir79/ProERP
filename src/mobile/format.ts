export function formatTRY(v: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(v || 0);
}

export function formatNum(v: number): string {
  return new Intl.NumberFormat('tr-TR').format(v || 0);
}

export function formatDate(d: Date | string | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '-';
  return x.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
