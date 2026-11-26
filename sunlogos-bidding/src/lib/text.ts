const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/** Prefer a Traditional Chinese font when the lot text contains CJK characters. */
export function textLang(value: string | null | undefined): "zh-Hant" | undefined {
  if (!value || !CJK.test(value)) return undefined;
  return "zh-Hant";
}
