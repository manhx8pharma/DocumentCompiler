export type FieldStatus = 'default' | 'modified' | 'empty';

export interface FieldMetaForStatus {
  defaultValue?: string | null;
  fieldType?: string | null;
}

export function getFieldStatus(fieldMeta: FieldMetaForStatus, currentValue: any): FieldStatus {
  const defaultVal = fieldMeta.defaultValue;
  const isChecklist = fieldMeta.fieldType === 'checklist';
  
  if (isChecklist) {
    const selectedArray = Array.isArray(currentValue) ? currentValue : [];
    if (selectedArray.length === 0) return 'empty';
    if (defaultVal && selectedArray.length === 1 && selectedArray[0] === defaultVal) return 'default';
    return 'modified';
  }
  
  const strValue = String(currentValue || '');
  if (!strValue) return 'empty';
  if (defaultVal && strValue === defaultVal) return 'default';
  return 'modified';
}

export function getFieldColorClasses(status: FieldStatus): string {
  switch (status) {
    case 'default': 
      return 'bg-blue-50 border-blue-200 focus-within:border-blue-400';
    case 'modified': 
      return 'bg-green-50 border-green-200 focus-within:border-green-400';
    default: 
      return '';
  }
}

export function getInlineFieldColorClasses(status: FieldStatus): string {
  switch (status) {
    case 'default': 
      return 'field-status-default';
    case 'modified': 
      return 'field-status-modified';
    default: 
      return '';
  }
}
