import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UseTemplatePreviewProps {
  templateUuid: string | null;
  fieldValues: Record<string, string>;
  debounceMs?: number;
}

interface PreviewResponse {
  html: string;
  fields: Array<{
    name: string;
    value: string;
  }>;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useTemplatePreview({ 
  templateUuid, 
  fieldValues, 
  debounceMs = 300 
}: UseTemplatePreviewProps) {
  const debouncedFieldValues = useDebouncedValue(fieldValues, debounceMs);
  
  const previewQuery = useQuery({
    queryKey: ['/api/documents/preview-template', templateUuid, debouncedFieldValues],
    queryFn: async () => {
      if (!templateUuid) return null;
      
      const response = await fetch('/api/documents/preview-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateUuid,
          fieldValues: debouncedFieldValues,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      return response.json() as Promise<PreviewResponse>;
    },
    enabled: !!templateUuid,
    staleTime: 1000 * 60, // 1 minute
  });

  const previewHtml = useMemo(() => {
    if (!previewQuery.data?.html) return '';
    
    // Enhanced HTML processing with line break preservation
    let processedHtml = previewQuery.data.html
      .replace(/{{([^}]+)}}/g, (match, fieldName) => {
        const value = debouncedFieldValues[fieldName.trim()];
        if (value) {
          // Preserve line breaks in field values
          const processedValue = value
            .replace(/\r\n/g, '<br>')
            .replace(/\n/g, '<br>')
            .replace(/\r/g, '<br>');
          return `<span class="preview-field filled">${processedValue}</span>`;
        }
        return `<span class="preview-field empty">${match}</span>`;
      });
    
    return processedHtml;
  }, [previewQuery.data?.html, debouncedFieldValues]);

  return {
    previewHtml,
    isLoading: previewQuery.isLoading,
    error: previewQuery.error,
    refetch: previewQuery.refetch,
  };
}