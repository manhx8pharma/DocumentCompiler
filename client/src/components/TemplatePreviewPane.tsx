import { useTemplatePreview } from '../hooks/useTemplatePreview';

interface TemplatePreviewPaneProps {
  templateUuid: string | null;
  fieldValues: Record<string, string>;
  className?: string;
}

export function TemplatePreviewPane({ 
  templateUuid, 
  fieldValues, 
  className = '' 
}: TemplatePreviewPaneProps) {
  const { previewHtml, isLoading, error } = useTemplatePreview({
    templateUuid,
    fieldValues,
  });

  if (!templateUuid) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">
          <svg className="mx-auto h-12 w-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-medium">Select a template to see preview</p>
          <p className="text-sm">Choose a template from the dropdown to start creating your document</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 ${className}`}>
        <div className="flex items-center">
          <svg className="h-5 w-5 text-red-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Preview Error</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Unable to generate document preview. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center mb-4">
            <div className="h-4 w-4 bg-blue-500 rounded-full animate-spin border-2 border-blue-200 border-t-blue-500"></div>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Generating preview...</span>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Document Preview
        </h3>
      </div>
      
      <div className="p-6">
        <div 
          className="preview-content"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
          style={{
            minHeight: '400px',
            lineHeight: '1.6',
            fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
        />
      </div>
      
      <style dangerouslySetInnerHTML={{
        __html: `
        .preview-content {
          /* Preserve original document formatting */
          text-align: inherit;
          margin: inherit;
          padding: inherit;
        }
        
        .preview-content p.normal,
        .preview-content p.paragraph {
          text-align: center !important;
          margin: 6px 0;
          padding: 0;
          white-space: pre-wrap;
        }
        
        .preview-content h1.title,
        .preview-content h1.heading {
          text-align: center !important;
          font-weight: bold;
          margin: 12px 0 6px 0;
        }
        
        .preview-content h2.heading {
          text-align: center !important;
          font-weight: bold;
          margin: 10px 0 4px 0;
        }
        
        .preview-content .preview-field {
          padding: 2px 4px;
          border-radius: 3px;
          font-weight: 500;
          display: inline;
          white-space: pre-wrap;
        }
        
        .preview-content .preview-field.filled {
          background-color: #dbeafe;
          color: #1e40af;
          border: 1px solid #3b82f6;
        }
        
        .preview-content .preview-field.empty {
          background-color: #fef3c7;
          color: #92400e;
          border: 1px dashed #f59e0b;
        }
        
        /* Preserve original Word document styling */
        .preview-content [style*="text-align"] {
          /* Don't override existing text-align from document */
        }
        
        .preview-content [style*="margin"] {
          /* Don't override existing margins from document */
        }
        
        .dark .preview-content .preview-field.filled {
          background-color: #1e3a8a;
          color: #93c5fd;
          border: 1px solid #3b82f6;
        }
        
        .dark .preview-content .preview-field.empty {
          background-color: #92400e;
          color: #fbbf24;
          border: 1px dashed #f59e0b;
        }
        `
      }} />
    </div>
  );
}