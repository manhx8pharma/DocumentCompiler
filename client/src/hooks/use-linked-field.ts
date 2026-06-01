import { useState, useCallback, useMemo } from 'react';

export interface FieldValue {
  value: string;
  occurrenceCount: number;
}

export interface LinkedFieldsState {
  [fieldName: string]: FieldValue;
}

export interface UseLinkedFieldsReturn {
  fieldValues: LinkedFieldsState;
  getFieldValue: (fieldName: string) => string;
  setFieldValue: (fieldName: string, value: string) => void;
  setAllFieldValues: (values: Record<string, string>) => void;
  getFieldsArray: () => { fieldName: string; fieldValue: string }[];
  hasChanges: boolean;
  resetChanges: () => void;
}

export function useLinkedFields(
  initialValues: Record<string, string> = {},
  fieldOccurrences: Record<string, number> = {}
): UseLinkedFieldsReturn {
  const [fieldValues, setFieldValues] = useState<LinkedFieldsState>(() => {
    const initial: LinkedFieldsState = {};
    Object.entries(initialValues).forEach(([name, value]) => {
      initial[name] = {
        value: value || '',
        occurrenceCount: fieldOccurrences[name] || 1,
      };
    });
    return initial;
  });
  
  const [originalValues] = useState<Record<string, string>>(initialValues);
  const [hasChanges, setHasChanges] = useState(false);

  const getFieldValue = useCallback((fieldName: string): string => {
    return fieldValues[fieldName]?.value || '';
  }, [fieldValues]);

  const setFieldValue = useCallback((fieldName: string, value: string) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldName]: {
        value,
        occurrenceCount: prev[fieldName]?.occurrenceCount || 1,
      },
    }));
    setHasChanges(true);
  }, []);

  const setAllFieldValues = useCallback((values: Record<string, string>) => {
    setFieldValues(prev => {
      const updated: LinkedFieldsState = {};
      Object.entries(values).forEach(([name, value]) => {
        updated[name] = {
          value: value || '',
          occurrenceCount: prev[name]?.occurrenceCount || fieldOccurrences[name] || 1,
        };
      });
      return updated;
    });
  }, [fieldOccurrences]);

  const getFieldsArray = useCallback((): { fieldName: string; fieldValue: string }[] => {
    return Object.entries(fieldValues).map(([fieldName, fieldData]) => ({
      fieldName,
      fieldValue: fieldData.value,
    }));
  }, [fieldValues]);

  const resetChanges = useCallback(() => {
    setAllFieldValues(originalValues);
    setHasChanges(false);
  }, [originalValues, setAllFieldValues]);

  return {
    fieldValues,
    getFieldValue,
    setFieldValue,
    setAllFieldValues,
    getFieldsArray,
    hasChanges,
    resetChanges,
  };
}

export interface LinkedFieldInputProps {
  fieldName: string;
  occurrenceIndex: number;
  value: string;
  onChange: (value: string) => void;
  fieldType?: 'text' | 'textarea' | 'number' | 'email' | 'date';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  className?: string;
}
