export const money = (n: number, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n); }
  catch { return `${n.toFixed(2)} ${currency}`; }
};
export const shortDate = (s: string | null | undefined) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z')).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
