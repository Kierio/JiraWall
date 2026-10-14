export type TemplateVars = Partial<Record<'person' | 'key' | 'summary' | 'priority' | 'type' | 'status' | 'rule' | 'count', string | number>>;

/** Replaces {placeholders}; unknown placeholders are left as typed so mistakes are visible. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name as keyof TemplateVars];
    return value === undefined || value === '' ? match : String(value);
  });
}
