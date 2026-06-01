import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, FileText, SplitSquareVertical, AlertCircle, Loader2, GripVertical, RotateCcw, AlignLeft, Minus, RefreshCw, Edit3, Eye, Table2, Layers } from 'lucide-react';
import { ChorusBlockSection } from '@/components/chorus-block-section';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useToast } from '@/hooks/use-toast';
import { Document, Template, TemplateField } from '@shared/schema';
import { InteractivePreview, RenderMode } from '@/components/interactive-preview';
import { getFieldStatus, getFieldColorClasses } from '@/lib/field-state';

const DocumentUpdatePage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/document-update/:documentUuid');
  const documentUuid = params?.documentUuid;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [autoRender, setAutoRender] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | number | null>(null);
  const [multilineFields, setMultilineFields] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState<'preview' | 'interactive'>('preview');
  const [interactiveRenderMode, setInteractiveRenderMode] = useState<RenderMode>('auto');
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleMultiline = (fieldName: string) => {
    setMultilineFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return newSet;
    });
  };

  // Fetch document details
  const { data: document, isLoading: documentLoading } = useQuery<Document>({
    queryKey: ['/api/documents', documentUuid],
    queryFn: async () => {
      if (!documentUuid) throw new Error('Document UUID is required');
      
      const response = await fetch(`/api/documents/${documentUuid}`);
      if (!response.ok) throw new Error('Failed to fetch document');
      
      return response.json();
    },
    enabled: !!documentUuid,
  });

  // Fetch document fields (already filled values)
  const { data: documentFields, isLoading: documentFieldsLoading } = useQuery<any[]>({
    queryKey: ['/api/documents/fields', documentUuid],
    queryFn: async () => {
      if (!documentUuid) throw new Error('Document UUID is required');
      
      const response = await fetch(`/api/documents/${documentUuid}/fields`);
      if (!response.ok) throw new Error('Failed to fetch document fields');
      
      return response.json();
    },
    enabled: !!documentUuid,
  });

  // Set templateId when document is loaded
  useEffect(() => {
    if (document) {
      setTemplateId(document.templateUuid);
    }
  }, [document]);

  // Fetch template details based on the document's templateId (UUID)
  const { data: template, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ['/api/templates', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      const response = await fetch(`/api/templates/${templateId}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
    enabled: !!templateId,
  });

  // Fetch template fields (UUID-based endpoint)
  const { data: templateFields, isLoading: templateFieldsLoading } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      const response = await fetch(`/api/templates/${templateId}/fields`);
      if (!response.ok) throw new Error('Failed to fetch template fields');
      return response.json();
    },
    enabled: !!templateId,
  });

  // Fetch template tables to detect chorus blocks
  const { data: templateTablesData } = useQuery<any[]>({
    queryKey: ['/api/templates', templateId, 'tables'],
    queryFn: () => fetch(`/api/templates/${templateId}/tables`).then(r => r.json()),
    enabled: !!templateId,
  });
  const blockDefs = useMemo(
    () => (templateTablesData || []).filter((t: any) => t.blockType === 'block'),
    [templateTablesData]
  );

  // Create empty default values
  const createEmptyDefaults = (): Record<string, string> => {
    const defaults: Record<string, string> = {
      name: '',
    };
    
    return defaults;
  };

  // Dynamically generate form schema based on fields
  const [formSchema, setFormSchema] = useState<z.ZodObject<any>>(z.object({
    name: z.string().min(1, "Document name is required"),
  }));

  // Create form with dynamic schema
  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyDefaults(),
    mode: 'onChange',
  });
  
  const isLoading = documentLoading || documentFieldsLoading || templateLoading || templateFieldsLoading;

  // Update schema when fields change
  useEffect(() => {
    if (templateFields) {
      const schemaFields: Record<string, any> = {
        name: z.string().min(1, "Document name is required"),
      };
      
      templateFields.forEach(field => {
        // row_group (table) fields are stored in document_table_data — exclude from form schema
        if (field.fieldType === 'row_group') return;

        const isChecklist = field.fieldType === 'checklist';
        
        if (isChecklist) {
          schemaFields[field.name] = field.required 
            ? z.array(z.string()).min(1, `${field.name} is required`)
            : z.array(z.string()).optional();
        } else if (field.required) {
          schemaFields[field.name] = field.type === 'number' 
            ? z.coerce.number({ required_error: `${field.name} is required` })
            : z.string({ required_error: `${field.name} is required` }).min(1, `${field.name} is required`);
        } else {
          schemaFields[field.name] = field.type === 'number' ? z.coerce.number().optional() : z.string().optional();
        }
      });
      
      setFormSchema(z.object(schemaFields));
    }
  }, [templateFields]);

  // Update form values when document fields are loaded
  useEffect(() => {
    if (document && documentFields && templateFields) {
      // Create values object starting with the document name
      const values: Record<string, any> = {
        name: document.name || '',
      };
      
      // Add all document field values, handling checklist fields
      documentFields.forEach(docField => {
        const templateField = templateFields.find(tf => tf.name === docField.fieldName);
        const isChecklist = templateField?.fieldType === 'checklist';
        
        if (isChecklist) {
          // Parse checklist value (semicolon-separated) back to array
          const strValue = docField.fieldValue || '';
          values[docField.fieldName] = strValue ? strValue.split(';').map((s: string) => s.trim()).filter((s: string) => s) : [];
        } else {
          values[docField.fieldName] = docField.fieldValue;
        }
      });
      
      // Set default values for fields not in documentFields (newly added template fields)
      templateFields.forEach(field => {
        if (!(field.name in values)) {
          const isChecklist = field.fieldType === 'checklist';
          if (isChecklist) {
            values[field.name] = field.defaultValue ? [field.defaultValue] : [];
          } else {
            values[field.name] = field.defaultValue || '';
          }
        }
      });
      
      form.reset(values);
    }
  }, [document, documentFields, templateFields]);

  // Redirect to documents if no document ID
  useEffect(() => {
    if (!documentUuid) {
      setLocation('/documents');
    }
  }, [documentUuid, setLocation]);

  // Auto-render when enabled
  useEffect(() => {
    if (!autoRender || !templateId || !showPreview || !templateFields || templateFields.length === 0) return;
    const subscription = form.watch((value, { name, type }) => {
      if (type === 'change' && name) {
        const timeoutId = setTimeout(() => generatePreview(), 500);
        return () => clearTimeout(timeoutId);
      }
    });
    return () => subscription.unsubscribe();
  }, [autoRender, templateId, showPreview, templateFields, form]);
  
  // Generate preview when first loaded (after document fields are ready)
  useEffect(() => {
    if (templateFields && templateFields.length > 0 && documentFields && !isLoading && templateId && showPreview) {
      generatePreview();
    }
  }, [templateFields, documentFields, isLoading, templateId, showPreview]);

  const formatChecklistValue = (value: any): string => {
    if (!Array.isArray(value)) return String(value || '');
    if (value.length === 0) return '';
    if (value.length === 1) return value[0];
    return value.join('; ');
  };

  // Function to generate preview
  const generatePreview = async () => {
    if (!templateId || !showPreview) return;
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const currentValues = form.getValues();
      const formFields = (templateFields || []).map(field => {
        const value = currentValues[field.name];
        const isChecklist = field.fieldType === 'checklist';
        return {
          fieldName: field.name, 
          fieldValue: isChecklist ? formatChecklistValue(value) : String(value || ''),
        };
      });
      const response = await fetch('/api/documents/preview-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateUuid: templateId,
          name: currentValues.name || (document?.name || 'Document Update'),
          fields: formFields,
        }),
      });
      if (!response.ok) throw new Error('Failed to generate document preview');
      const data = await response.json();
      setPreviewHtml(data.html || data.previewHtml || '');
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Toggle preview display
  const togglePreview = () => {
    setShowPreview(!showPreview);
    
    // If turning preview on, generate it
    if (!showPreview) {
      generatePreview();
    }
  };

  // Autosave function for interactive mode
  const performAutosave = useCallback(async () => {
    if (!templateId || !documentUuid) return;
    
    try {
      setIsAutosaving(true);
      const currentValues = form.getValues();
      const formFields = (templateFields || [])
        .filter(field => field.name !== 'name')
        .map(field => {
          const value = currentValues[field.name];
          const isChecklist = field.fieldType === 'checklist';
          return { 
            fieldName: field.name, 
            fieldValue: isChecklist ? formatChecklistValue(value) : String(value || '') 
          };
        });

      const response = await fetch(`/api/documents/${documentUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentValues.name, fields: formFields }),
      });

      if (response.ok) {
        setLastSavedAt(new Date());
        queryClient.invalidateQueries({ queryKey: ['/api/documents', documentUuid] });
      }
    } catch (error) {
      console.error('Autosave failed:', error);
    } finally {
      setIsAutosaving(false);
    }
  }, [templateId, documentUuid, form, templateFields, queryClient]);

  // Debounced autosave trigger for interactive mode
  const triggerAutosave = useCallback(() => {
    if (previewMode !== 'interactive') return;
    
    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    
    // Set new timeout (1.5 second debounce)
    autosaveTimeoutRef.current = setTimeout(() => {
      performAutosave();
    }, 1500);
  }, [previewMode, performAutosave]);

  // Cleanup autosave timeout on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  // Interactive mode callbacks
  const handleInteractiveFieldChange = useCallback((fieldName: string, value: string) => {
    form.setValue(fieldName, value);
    if (interactiveRenderMode === 'auto') {
      triggerAutosave();
    }
  }, [form, triggerAutosave, interactiveRenderMode]);

  const handleInteractiveNameChange = useCallback((name: string) => {
    form.setValue('name', name);
    if (interactiveRenderMode === 'auto') {
      triggerAutosave();
    }
  }, [form, triggerAutosave, interactiveRenderMode]);

  const handleInteractiveRenderModeChange = useCallback((mode: RenderMode) => {
    setInteractiveRenderMode(mode);
  }, []);

  const handleManualRender = useCallback(() => {
    performAutosave();
  }, [performAutosave]);

  const handleSaveFromInteractive = useCallback(() => {
    performAutosave();
  }, [performAutosave]);

  const getInteractiveFieldValues = useCallback((): Record<string, string> => {
    const currentValues = form.getValues();
    const result: Record<string, string> = {};
    (templateFields || []).forEach(field => {
      const value = currentValues[field.name];
      const isChecklist = field.fieldType === 'checklist';
      result[field.name] = isChecklist ? formatChecklistValue(value) : String(value || '');
    });
    return result;
  }, [templateFields, form]);

  // Handle form submission
  const onSubmit = async (data: any) => {
    if (!templateId || !documentUuid) return;
    try {
      setIsSubmitting(true);
      const formFields = (templateFields || [])
        .filter(field => field.name !== 'name')
        .map(field => {
          const value = data[field.name];
          const isChecklist = field.fieldType === 'checklist';
          return { 
            fieldName: field.name, 
            fieldValue: isChecklist ? formatChecklistValue(value) : String(value || '') 
          };
        });
      const response = await fetch(`/api/documents/${documentUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, fields: formFields }),
      });
      if (!response.ok) throw new Error('Failed to update document');
      toast({ title: "Success", description: "Document updated successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentUuid] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents/fields', documentUuid] });
      generatePreview();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update document.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToDefault = (fieldName: string, defaultValue: string | undefined, isChecklist: boolean) => {
    if (isChecklist) {
      form.setValue(fieldName, defaultValue ? [defaultValue] : []);
    } else {
      form.setValue(fieldName, defaultValue || '');
    }
  };

  const renderFormFields = () => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ));
    }
    if (!templateFields || templateFields.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">No fields found for this template</p>
        </div>
      );
    }
    return templateFields.map((field) => {
      // row_group (table) fields navigate to dedicated table data page
      if (field.fieldType === 'row_group') {
        return (
          <div key={field.uuid} className="border border-blue-200 rounded-md p-3 bg-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{field.name}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => setLocation(`/document/${documentUuid}/table/${field.name}`)}
              >
                <Table2 className="h-3.5 w-3.5 mr-1" />
                Nhập bảng
              </Button>
            </div>
          </div>
        );
      }

      const isChecklist = field.fieldType === 'checklist';
      const options = field.options ? JSON.parse(field.options) : [];
      
      return (
        <FormField
          key={field.uuid}
          control={form.control}
          name={field.name}
          render={({ field: formField }) => {
            const currentValue = formField.value;
            const status = getFieldStatus(field, currentValue);
            const colorClasses = getFieldColorClasses(status);
            const hasDefault = !!field.defaultValue;
            
            const isMultiline = multilineFields.has(field.name);
            const showToggle = !isChecklist && field.type !== 'number' && field.type !== 'date' && field.type !== 'email';
            
            return (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FormLabel>{field.name}</FormLabel>
                    {hasDefault && status === 'default' && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">mặc định</Badge>
                    )}
                    {hasDefault && status === 'modified' && (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">đã sửa</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {showToggle && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
                        onClick={() => toggleMultiline(field.name)}
                        title={isMultiline ? "Chuyển sang 1 dòng" : "Chuyển sang nhiều dòng"}
                      >
                        {isMultiline ? <Minus className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
                      </Button>
                    )}
                    {hasDefault && status === 'modified' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
                        onClick={() => handleResetToDefault(field.name, field.defaultValue || undefined, isChecklist)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
                <FormControl>
                  {isChecklist ? (
                    <div className={`p-3 rounded-md border ${colorClasses}`}>
                      <div className="flex flex-wrap gap-3">
                        {options.map((option: string) => {
                          const selectedValues = Array.isArray(formField.value) ? formField.value : [];
                          const isChecked = selectedValues.includes(option);
                          return (
                            <label 
                              key={option} 
                              className="flex items-center gap-2 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const newValues = e.target.checked
                                    ? [...selectedValues, option]
                                    : selectedValues.filter((v: string) => v !== option);
                                  formField.onChange(newValues);
                                }}
                                tabIndex={-1}
                                className="h-4 w-4 rounded border border-blue-400 cursor-pointer accent-blue-600"
                              />
                              <span className="text-sm">{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : field.type === 'textarea' || isMultiline ? (
                    <Textarea 
                      placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`} 
                      className={`min-h-[80px] ${colorClasses}`} 
                      {...formField} 
                    />
                  ) : field.type === 'number' ? (
                    <Input 
                      type="number" 
                      placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`} 
                      className={colorClasses}
                      {...formField} 
                      onChange={(e) => formField.onChange(e.target.value === "" ? "" : e.target.value)} 
                    />
                  ) : field.type === 'date' ? (
                    <Input type="date" className={colorClasses} {...formField} />
                  ) : field.type === 'email' ? (
                    <Input 
                      type="email" 
                      placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`} 
                      className={colorClasses}
                      {...formField} 
                    />
                  ) : (
                    <Input 
                      type="text" 
                      placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`} 
                      className={colorClasses}
                      {...formField} 
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      );
    });
  };

  const renderFormCard = (className = "") => (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader className="flex-shrink-0 pb-4">
        <CardTitle>Document Information</CardTitle>
        <CardDescription>Update the details for your document</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} ref={formRef} className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-hidden p-0">
            <div ref={scrollContainerRef} className="h-full overflow-auto space-y-4 p-6 pt-0" style={{ overflowAnchor: 'none' }}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Document Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter document name" className="w-full" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="border rounded-md p-4">
                <h3 className="font-medium text-sm mb-3 text-gray-500">Template Fields</h3>
                <div className="space-y-4">{renderFormFields()}</div>
              </div>
              {blockDefs.length > 0 && (
                <div className="border border-purple-200 rounded-md p-4 bg-purple-50/30">
                  <h3 className="font-medium text-sm mb-3 text-purple-700 flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Chorus Blocks
                  </h3>
                  <div className="space-y-3">
                    {blockDefs.map((block: any) => (
                      <div key={block.name} className="border border-purple-200 rounded-md p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">
                              {block.label || block.name}
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-purple-300 text-purple-700 hover:bg-purple-100"
                            onClick={() => setLocation(`/document/${documentUuid}/block/${block.name}`)}
                          >
                            <Layers className="h-3.5 w-3.5 mr-1" />
                            Nhập block
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4 flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => setLocation('/documents')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Documents
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoading} className="gap-2">
              {isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Updating...</>) : (<><Save className="h-4 w-4" />Update Document</>)}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );

  const renderPreviewContent = () => {
    if (previewLoading) {
      return (
        <div className="h-full flex items-center justify-center p-12">
          <div className="flex flex-col items-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600 mb-4"></div>
            <p className="text-gray-500">Generating preview...</p>
          </div>
        </div>
      );
    }
    if (previewError) {
      return (
        <div className="p-6 flex flex-col items-center justify-center text-center h-full">
          <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
          <h3 className="text-lg font-medium mb-2 text-red-600">Error Generating Preview</h3>
          <p className="text-sm text-gray-600">{previewError}</p>
        </div>
      );
    }
    return (
      <div className="w-full p-4 bg-gray-100 h-full overflow-auto">
        <div className="w-full max-w-3xl mx-auto">
          <div 
            className="bg-white border shadow-sm rounded overflow-hidden mx-auto"
            style={{
              width: '100%',
              maxWidth: '210mm',
              padding: '8mm',
              boxSizing: 'border-box',
              boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
            }}
          >
            <div className="document-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </div>
    );
  };

  const renderPreviewCard = (className = "") => (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader className="flex-shrink-0 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              {previewMode === 'interactive' ? 'Interactive Editor' : 'Document Preview'}
            </CardTitle>
            <CardDescription>
              {previewMode === 'interactive' 
                ? 'Edit fields directly in the document view' 
                : 'Preview how your document will look'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex items-center border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setPreviewMode('preview')}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                  previewMode === 'preview' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-white hover:bg-gray-100 text-gray-600'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('interactive')}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                  previewMode === 'interactive' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-white hover:bg-gray-100 text-gray-600'
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Interactive
              </button>
            </div>
            
            {/* Interactive mode autosave indicator */}
            {previewMode === 'interactive' && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {isAutosaving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</>
                ) : lastSavedAt ? (
                  <span className="text-green-600">Saved</span>
                ) : null}
              </div>
            )}
            
            {/* Preview-only controls */}
            {previewMode === 'preview' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                  <input
                    type="checkbox"
                    checked={autoRender}
                    onChange={(e) => setAutoRender(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-blue-600"
                  />
                  <span className="text-gray-600">Tự động</span>
                </label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={generatePreview}
                  disabled={previewLoading}
                  className="gap-2"
                >
                  {previewLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Rendering...</>
                  ) : (
                    <><RefreshCw className="h-4 w-4" />Render</>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 border-t overflow-hidden">
        {previewMode === 'interactive' && templateId ? (
          <InteractivePreview
            templateUuid={String(templateId)}
            fieldValues={getInteractiveFieldValues()}
            onFieldChange={handleInteractiveFieldChange}
            documentName={form.watch('name') || ''}
            onNameChange={handleInteractiveNameChange}
            renderMode={interactiveRenderMode}
            onRenderModeChange={handleInteractiveRenderModeChange}
            onManualRender={handleManualRender}
            isRendering={isAutosaving}
            onSave={handleSaveFromInteractive}
            isSaving={isAutosaving}
            documentUuid={documentUuid ?? undefined}
          />
        ) : (
          renderPreviewContent()
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="py-6 px-4 sm:px-6 md:px-8 h-screen flex flex-col">
      <div className="mb-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/documents">Documents</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink>Edit Document</BreadcrumbLink></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Edit Document</h1>
          {!isLoading && document && (
            <p className="mt-1 text-gray-500">Editing: <span className="font-medium">{document.name}</span></p>
          )}
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <Button variant="outline" onClick={togglePreview} className="gap-2">
            <SplitSquareVertical className="h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0">
        {/* Desktop: Resizable panels */}
        <div className="hidden md:block h-full">
          {previewMode === 'interactive' && showPreview ? (
            /* Interactive mode: Full-width preview, hide form panel */
            renderPreviewCard("h-full")
          ) : showPreview ? (
            <PanelGroup direction="horizontal" className="h-full gap-2">
              <Panel defaultSize={45} minSize={30} className="h-full">
                {renderFormCard()}
              </Panel>
              <PanelResizeHandle className="w-2 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors cursor-col-resize group">
                <GripVertical className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
              </PanelResizeHandle>
              <Panel defaultSize={55} minSize={30} className="h-full">
                {renderPreviewCard()}
              </Panel>
            </PanelGroup>
          ) : (
            renderFormCard("max-w-3xl")
          )}
        </div>

        {/* Mobile: Stack layout */}
        <div className="md:hidden flex flex-col gap-4 h-full overflow-auto">
          {previewMode === 'interactive' && showPreview ? (
            /* Interactive mode: Only preview on mobile */
            renderPreviewCard("min-h-[400px]")
          ) : (
            <>
              {renderFormCard()}
              {showPreview && renderPreviewCard("min-h-[400px]")}
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default DocumentUpdatePage;