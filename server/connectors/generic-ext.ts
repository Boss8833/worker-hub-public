// server/connectors/generic-ext.ts
//
// أنواع إضافية للـ Generic Connector (claim, submit, balance, status).
// كلها Config-Driven: بتُقرأ من settings_json تحت مفتاح "generic".

export type GenericMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type GenericEndpoint = {
  method?: GenericMethod;
  path: string; // مثال: /tasks/{id}/claim
  body?: unknown; // JSON template (يُدعم {id} و {text} و {artifacts})
};

export type GenericExtendedConfig = {
  // endpoints للعمليات الجديدة
  endpoints?: {
    claim?: GenericEndpoint;
    submit?: GenericEndpoint;
    status?: GenericEndpoint;
    balance?: GenericEndpoint;
    payouts?: GenericEndpoint;
  };
  // خرائط الحقول للاستجابات
  mappings?: {
    claimId?: string;
    submissionId?: string;
    status?: string;
    balanceAmount?: string;
    balanceCurrency?: string;
  };
};

/** أنواع Pagination المدعومة. */
export type PaginationType = 'none' | 'page' | 'offset' | 'cursor';

export type PaginationConfig = {
  type: PaginationType;
  // اسم المعامل في الـ query (مثلاً: page, offset, cursor)
  param?: string;
  // الحد الأقصى للمهام في كل صفحة
  pageSize?: number;
  // الحد الأقصى لعدد الصفحات اللي نسحبها (حماية من الحلقة اللانهائية)
  maxPages?: number;
  // مسار الـ cursor في الـ response (لو type=cursor)
  cursorPath?: string;
  // مسار العدد الإجمالي في الـ response (اختياري)
  totalPath?: string;
};

/** يستبدل {id} و {text} و {artifacts} في المسار أو الـ body. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}
