import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlignLeft, Minus, RotateCcw, Save, Table2 } from 'lucide-react';
import { getFieldStatus, getInlineFieldColorClasses, FieldStatus } from '@/lib/field-state';

export interface TextToken {
  type: 'text';
  content: string;
}

export interface FieldToken {
  type: 'field';
  fieldName: string;
  value: string;
  isEmpty: boolean;
  occurrenceIndex: number;
}

export interface TableToken {
  type: 'table';
  tableName: string;
}

export type PreviewToken = TextToken | FieldToken | TableToken;

export interface TemplateFieldMeta {
  name: string;
  type: string;
  fieldType: string;
  required: boolean;
  options: string[] | null;
  defaultValue: string | null;
  placeholder: string | null;
}

export interface InteractivePreviewData {
  tokens: PreviewToken[];
  fieldOccurrences: Record<string, number>;
  templateFields: TemplateFieldMeta[];
  styles: string;
  template: {
    uuid: string;
    name: string;
    category: string;
  };
}

export type RenderMode = 'auto' | 'manual';

interface InteractivePreviewProps {
  templateUuid: string;
  fieldValues: Record<string, string>;
  onFieldChange: (fieldName: string, value: string) => void;
  documentName?: string;
  onNameChange?: (name: string) => void;
  renderMode?: RenderMode;
  onRenderModeChange?: (mode: RenderMode) => void;
  onManualRender?: () => void;
  isRendering?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  className?: string;
  /** If provided, table dialogs will save directly to this document via API. */
  documentUuid?: string;
  /** Called when user clicks "Nhập bảng" for a table field and no documentUuid is set. */
  onTableClick?: (tableName: string) => void;
}

interface InlineInputProps {
  fieldName: string;
  value: string;
  onChange: (value: string) => void;
  fieldMeta?: TemplateFieldMeta;
  occurrenceIndex: number;
  totalOccurrences: number;
}

function InlineInput({ fieldName, value, onChange, fieldMeta, occurrenceIndex, totalOccurrences }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [forceMultiline, setForceMultiline] = useState(false);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  }, [onChange]);

  const naturalMultiline = fieldMeta?.fieldType === 'textarea' || value.includes('\n');
  const isMultiline = forceMultiline || naturalMultiline;
  const isChecklist = fieldMeta?.fieldType === 'checklist';
  const options = fieldMeta?.options || [];

  const fieldStatus = useMemo(() => {
    return getFieldStatus(
      { defaultValue: fieldMeta?.defaultValue, fieldType: fieldMeta?.fieldType },
      isChecklist ? localValue.split('; ').filter(v => v) : localValue
    );
  }, [fieldMeta?.defaultValue, fieldMeta?.fieldType, localValue, isChecklist]);

  const statusColorClass = getInlineFieldColorClasses(fieldStatus);
  const hasDefault = !!fieldMeta?.defaultValue;
  const canReset = hasDefault && fieldStatus === 'modified';
  const showToggle = !isChecklist && fieldMeta?.type !== 'number' && fieldMeta?.type !== 'date' && fieldMeta?.type !== 'email';
  const showControls = (isHovered || isFocused) && (showToggle || canReset);

  const handleReset = useCallback(() => {
    if (fieldMeta?.defaultValue) {
      handleChange(fieldMeta.defaultValue);
    }
  }, [fieldMeta?.defaultValue, handleChange]);

  const baseClassName = `
    inline-field-input
    border-[0.5px] border-gray-300
    rounded-sm
    px-1 py-0
    text-inherit font-inherit
    leading-tight
    bg-white
    focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200
    transition-colors duration-150
    min-w-[2ch]
  `;

  const linkedIndicatorClass = totalOccurrences > 1 
    ? 'linked-field' 
    : '';

  const controlsOverlay = showControls ? (
    <span className="inline-field-controls">
      {showToggle && (
        <button
          type="button"
          onClick={() => setForceMultiline(!forceMultiline)}
          className="inline-control-btn"
          title={isMultiline ? "Chuyển về dòng đơn" : "Chuyển sang nhiều dòng"}
        >
          {isMultiline ? <Minus className="w-3 h-3" /> : <AlignLeft className="w-3 h-3" />}
        </button>
      )}
      {canReset && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-control-btn"
          title="Reset về giá trị mặc định"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </span>
  ) : null;

  if (isChecklist && options.length > 0) {
    const selectedValues = localValue ? localValue.split('; ').filter(v => v) : [];
    
    return (
      <span 
        className="inline-field-wrapper"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <span 
          className={`inline-checklist-field ${linkedIndicatorClass} ${statusColorClass}`}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {options.map((option: string, idx: number) => {
            const isChecked = selectedValues.includes(option);
            return (
              <label key={option} className="inline-checklist-option">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...selectedValues, option]
                      : selectedValues.filter(v => v !== option);
                    handleChange(newValues.join('; '));
                  }}
                  className="h-3 w-3 rounded border-gray-300 cursor-pointer accent-blue-600"
                />
                <span>{option}</span>
                {idx < options.length - 1 && <span className="mx-0.5">/</span>}
              </label>
            );
          })}
        </span>
        {controlsOverlay}
      </span>
    );
  }

  if (isMultiline) {
    return (
      <span 
        className="inline-field-wrapper"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={fieldMeta?.placeholder || fieldName}
          className={`${baseClassName} ${linkedIndicatorClass} ${statusColorClass} resize-none min-h-[1.5em]`}
          style={{
            width: `${Math.max(localValue.length + 2, 10)}ch`,
            height: `${Math.max((localValue.match(/\n/g) || []).length + 1, 1) * 1.5}em`,
          }}
          rows={Math.max((localValue.match(/\n/g) || []).length + 1, 2)}
        />
        {controlsOverlay}
      </span>
    );
  }

  return (
    <span 
      className="inline-field-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={fieldMeta?.type === 'number' ? 'number' : fieldMeta?.type === 'email' ? 'email' : fieldMeta?.type === 'date' ? 'date' : 'text'}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={fieldMeta?.placeholder || fieldName}
        className={`${baseClassName} ${linkedIndicatorClass} ${statusColorClass}`}
        style={{
          width: `${Math.max(localValue.length + 2, fieldMeta?.placeholder?.length || fieldName.length, 8)}ch`,
        }}
      />
      {controlsOverlay}
    </span>
  );
}

export function InteractivePreview({ 
  templateUuid, 
  fieldValues, 
  onFieldChange,
  documentName = '',
  onNameChange,
  renderMode = 'auto',
  onRenderModeChange,
  onManualRender,
  isRendering = false,
  onSave,
  isSaving = false,
  className = '',
  documentUuid,
  onTableClick,
}: InteractivePreviewProps) {
  const [data, setData] = useState<InteractivePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const fieldMetaMap = useMemo(() => {
    if (!data?.templateFields) return {};
    const map: Record<string, TemplateFieldMeta> = {};
    data.templateFields.forEach(field => {
      map[field.name] = field;
    });
    return map;
  }, [data?.templateFields]);

  const fetchInteractiveData = useCallback(async () => {
    if (!templateUuid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const fieldsArray = Object.entries(fieldValues).map(([fieldName, fieldValue]) => ({
        fieldName,
        fieldValue: fieldValue || '',
      }));

      const response = await fetch('/api/documents/interactive-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateUuid,
          fields: fieldsArray,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to load interactive preview');
      }

      const result: InteractivePreviewData = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [templateUuid, fieldValues]);

  useEffect(() => {
    fetchInteractiveData();
  }, [templateUuid]);

  const openingPunctPattern = /[(\[{«‹"']$/;
  const closingPunctPattern = /^[)\]}»›"'.,;:!?]/;

  const extractTrailingPunct = (html: string): { before: string; punct: string } => {
    const textOnly = html.replace(/<[^>]*>/g, '');
    const match = textOnly.match(/[(\[{«‹"']+$/);
    if (match) {
      const punctLen = match[0].length;
      const htmlMatch = html.match(new RegExp(`[(\[{«‹"']{${punctLen}}$`));
      if (htmlMatch) {
        return { before: html.slice(0, -punctLen), punct: match[0] };
      }
    }
    return { before: html, punct: '' };
  };

  const extractLeadingPunct = (html: string): { punct: string; after: string } => {
    const textOnly = html.replace(/<[^>]*>/g, '');
    const match = textOnly.match(/^[)\]}»›"'.,;:!?]+/);
    if (match) {
      const punctLen = match[0].length;
      const htmlMatch = html.match(new RegExp(`^[)\\\]}»›"'.,;:!?]{${punctLen}}`));
      if (htmlMatch) {
        return { punct: match[0], after: html.slice(punctLen) };
      }
    }
    return { punct: '', after: html };
  };

  const renderTokens = useCallback(() => {
    if (!data?.tokens) return null;
    
    const elements: React.ReactNode[] = [];
    const tokens = data.tokens;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === 'field') {
        const fieldMeta = fieldMetaMap[token.fieldName];
        const currentValue = fieldValues[token.fieldName] || token.value || '';
        const totalOccurrences = data.fieldOccurrences[token.fieldName] || 1;

        let leadingPunct = '';
        let trailingPunct = '';
        let modifiedPrevToken: string | null = null;
        let modifiedNextToken: string | null = null;

        if (i > 0 && tokens[i - 1].type === 'text') {
          const prevToken = tokens[i - 1] as TextToken;
          const { before, punct } = extractTrailingPunct(prevToken.content);
          if (punct) {
            leadingPunct = punct;
            modifiedPrevToken = before;
          }
        }

        if (i + 1 < tokens.length && tokens[i + 1].type === 'text') {
          const nextToken = tokens[i + 1] as TextToken;
          const { punct, after } = extractLeadingPunct(nextToken.content);
          if (punct) {
            trailingPunct = punct;
            modifiedNextToken = after;
          }
        }

        if (leadingPunct || trailingPunct) {
          if (modifiedPrevToken !== null && elements.length > 0) {
            elements.pop();
            if (modifiedPrevToken) {
              elements.push(
                <span 
                  key={`text-modified-${i-1}`} 
                  dangerouslySetInnerHTML={{ __html: modifiedPrevToken }}
                />
              );
            }
          }

          elements.push(
            <span key={`nobreak-${i}`} className="no-break-wrapper">
              {leadingPunct}
              <InlineInput
                fieldName={token.fieldName}
                value={currentValue}
                onChange={(newValue) => onFieldChange(token.fieldName, newValue)}
                fieldMeta={fieldMeta}
                occurrenceIndex={token.occurrenceIndex}
                totalOccurrences={totalOccurrences}
              />
              {trailingPunct}
            </span>
          );

          if (modifiedNextToken !== null) {
            i++;
            if (modifiedNextToken) {
              elements.push(
                <span 
                  key={`text-modified-${i}`} 
                  dangerouslySetInnerHTML={{ __html: modifiedNextToken }}
                />
              );
            }
          }
        } else {
          elements.push(
            <InlineInput
              key={`field-${token.fieldName}-${token.occurrenceIndex}-${i}`}
              fieldName={token.fieldName}
              value={currentValue}
              onChange={(newValue) => onFieldChange(token.fieldName, newValue)}
              fieldMeta={fieldMeta}
              occurrenceIndex={token.occurrenceIndex}
              totalOccurrences={totalOccurrences}
            />
          );
        }
      } else if (token.type === 'table') {
        // TableToken: render as a block-level "Nhập bảng" button
        elements.push(
          <span key={`table-${token.tableName}-${i}`} className="block my-2">
            <button
              type="button"
              onClick={() => {
                if (documentUuid) {
                  // Navigate to dedicated table data page
                  setLocation(`/document/${documentUuid}/table/${token.tableName}`);
                } else if (onTableClick) {
                  onTableClick(token.tableName);
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
              title={`Nhập dữ liệu cho bảng ${token.tableName}`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Nhập bảng: {token.tableName}
            </button>
          </span>
        );
      } else {
        elements.push(
          <span 
            key={`text-${i}`} 
            dangerouslySetInnerHTML={{ __html: (token as TextToken).content }}
          />
        );
      }

      i++;
    }

    return elements;
  }, [fieldMetaMap, fieldValues, onFieldChange, data?.tokens, data?.fieldOccurrences, documentUuid, onTableClick, setLocation]);

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-500">Loading interactive preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full">
        <div className="text-red-500 mb-4">Error loading preview</div>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-500">
        No preview data available
      </div>
    );
  }

  return (
    <div className={`w-full h-full flex flex-col bg-gray-100 ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <style>{`
        .inline-field-input {
          display: inline;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          vertical-align: baseline;
          box-sizing: border-box;
        }
        .inline-field-input:focus {
          background-color: #fef3c7;
        }
        .inline-field-input::placeholder {
          color: #9ca3af;
          font-style: italic;
        }
        /* Linked field indicator - subtle blue dot after input */
        .inline-field-input.linked-field {
          background-image: radial-gradient(circle at calc(100% - 3px) 50%, #60a5fa 2px, transparent 2px);
          padding-right: 10px;
        }
        /* Checklist inline styling */
        .inline-checklist-field {
          display: inline;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          vertical-align: baseline;
          border: 0.5px solid #d1d5db;
          border-radius: 2px;
          padding: 0 4px;
          background: white;
        }
        .inline-checklist-field.linked-field {
          background-image: radial-gradient(circle at calc(100% - 3px) 50%, #60a5fa 2px, transparent 2px);
          padding-right: 10px;
        }
        .inline-checklist-option {
          display: inline;
          cursor: pointer;
          font-size: 0.85em;
        }
        .inline-checklist-option input {
          margin-right: 2px;
          vertical-align: middle;
        }
        /* Field status colors - Default (using original value) */
        .inline-field-input.field-status-default,
        .inline-checklist-field.field-status-default {
          background-color: #eff6ff;
          border-color: #bfdbfe;
        }
        .inline-field-input.field-status-default:focus {
          background-color: #dbeafe;
          border-color: #3b82f6;
        }
        /* Field status colors - Modified (changed from default) */
        .inline-field-input.field-status-modified,
        .inline-checklist-field.field-status-modified {
          background-color: #f0fdf4;
          border-color: #bbf7d0;
        }
        .inline-field-input.field-status-modified:focus {
          background-color: #dcfce7;
          border-color: #22c55e;
        }
        /* Inline field wrapper for controls positioning */
        .inline-field-wrapper {
          display: inline;
          position: relative;
          vertical-align: baseline;
        }
        /* Inline controls overlay */
        .inline-field-controls {
          position: absolute;
          top: -16px;
          right: 0;
          display: flex;
          gap: 2px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 3px;
          padding: 1px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          z-index: 10;
          white-space: nowrap;
        }
        .inline-control-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border: none;
          background: transparent;
          color: #6b7280;
          cursor: pointer;
          border-radius: 2px;
          transition: all 0.15s;
        }
        .inline-control-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }
        .inline-control-btn:active {
          background: #e5e7eb;
        }
        /* No-break wrapper for punctuation + field grouping */
        .no-break-wrapper {
          display: inline-block;
          white-space: nowrap;
          vertical-align: baseline;
        }
      `}</style>
      
      {/* Header with Document Name and Render Mode Controls */}
      <div className="flex-shrink-0 bg-white border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Document Name Field */}
          {onNameChange && (
            <div className="flex-1 flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Document Name:</label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Enter document name..."
                className="flex-1 px-3 py-1.5 border-[0.5px] border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white"
              />
            </div>
          )}
          
          {/* Render Mode Controls */}
          {onRenderModeChange && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <div className="flex items-center bg-gray-100 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => onRenderModeChange('auto')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    renderMode === 'auto'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => onRenderModeChange('manual')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    renderMode === 'manual'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Manual
                </button>
              </div>
              
              {renderMode === 'manual' && onManualRender && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onManualRender}
                  disabled={isRendering}
                  className="gap-1.5 text-xs"
                >
                  {isRendering ? (
                    <><Loader2 className="h-3 w-3 animate-spin" />Rendering...</>
                  ) : (
                    <><RefreshCw className="h-3 w-3" />Render</>
                  )}
                </Button>
              )}
              
              {onSave && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving || !documentName?.trim()}
                  className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <><Loader2 className="h-3 w-3 animate-spin" />Saving...</>
                  ) : (
                    <><Save className="h-3 w-3" />Save</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Document Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="w-full max-w-3xl mx-auto">
          <div 
            ref={containerRef}
            className="bg-white border shadow-sm rounded overflow-hidden mx-auto"
            style={{
              width: '100%',
              maxWidth: '210mm',
              padding: '8mm',
              boxSizing: 'border-box',
              boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
            }}
          >
            <div className="document-content interactive-mode">
              {renderTokens()}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default InteractivePreview;
