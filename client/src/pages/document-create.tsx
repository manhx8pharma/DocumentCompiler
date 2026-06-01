import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, SplitSquareVertical, AlertCircle, Loader2, GripVertical, RotateCcw, AlignLeft, Minus, RefreshCw, Edit3, Eye, Table2, Layers, Download, Upload } from 'lucide-react';
import { TableDataDialog } from '@/components/table-data-dialog';
import { ChorusBlockSection } from '@/components/chorus-block-section';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useToast } from '@/hooks/use-toast';
import { Template, TemplateField } from '@shared/schema';
import { InteractivePreview, RenderMode } from '@/components/interactive-preview';
import { getFieldStatus, getFieldColorClasses } from '@/lib/field-state';

const DocumentCreatePage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/document-create/:templateUuid');
  const templateUuid = params?.templateUuid || null;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [autoRender, setAutoRender] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [multilineFields, setMultilineFields] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState<'preview' | 'interactive'>('preview');
  const [interactiveRenderMode, setInteractiveRenderMode] = useState<RenderMode>('auto');
  const [localTableData, setLocalTableData] = useState<Record<string, Array<Record<string, string>>>>({});
  const [localBlockData, setLocalBlockData] = useState<Record<string, Array<Record<string, string>>>>({});
  const [blockImporting, setBlockImporting] = useState<Record<string, boolean>>({});
  const [openTableDialog, setOpenTableDialog] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const blockFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});


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

  const { data: template, isLoading: templateLoading, error: templateError } = useQuery<Template>({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      const response = await fetch(`/api/templates/${templateUuid}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error('Template not found');
        throw new Error('Failed to fetch template');
      }
      return response.json();
    },
    enabled: !!templateUuid,
  });

  const { data: fields, isLoading: fieldsLoading, error: fieldsError } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      const response = await fetch(`/api/templates/${templateUuid}/fields`);
      if (!response.ok) throw new Error('Failed to fetch template fields');
      return response.json();
    },
    enabled: !!templateUuid,
  });

  const { data: templateTablesData } = useQuery<any[]>({
    queryKey: ['/api/templates', templateUuid, 'tables'],
    queryFn: () => fetch(`/api/templates/${templateUuid}/tables`).then(r => r.json()),
    enabled: !!templateUuid,
  });
  const blockDefs = useMemo(
    () => (templateTablesData || []).filter((t: any) => t.blockType === 'block'),
    [templateTablesData]
  );

  const createEmptyDefaults = (templateName?: string): Record<string, any> => {
    return {
      name: templateName ? `${templateName} - New Document` : '',
      clientName: '', projectTitle: '', projectDescription: '',
      startDate: '', endDate: '', budget: '', deliverables: '', timeline: '',
      firstName: '', lastName: '', email: '', address: '', company: '',
      position: '', phone: '', description: '', amount: '', date: '', notes: '',
    };
  };

  const [formSchema, setFormSchema] = useState<z.ZodObject<any>>(z.object({
    name: z.string().min(1, "Document name is required"),
  }));

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyDefaults(template?.name),
    mode: 'onChange',
  });
  
  const isLoading = templateLoading || fieldsLoading;

  useEffect(() => {
    if (fields) {
      const schemaFields: Record<string, any> = {
        name: z.string().min(1, "Document name is required"),
      };
      fields.forEach(field => {
        // row_group fields are handled via TableDataDialog — skip form validation
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
  }, [fields]);

  useEffect(() => {
    if (template) {
      const defaultValues = createEmptyDefaults(template.name);
      if (fields && fields.length > 0) {
        fields.forEach(field => {
          // row_group fields are not in the form
          if (field.fieldType === 'row_group') return;
          const isChecklist = field.fieldType === 'checklist';
          if (isChecklist) {
            if (field.defaultValue) {
              defaultValues[field.name] = [field.defaultValue];
            } else {
              defaultValues[field.name] = [];
            }
          } else {
            defaultValues[field.name] = field.defaultValue || ''; 
          }
        });
      }
      form.reset(defaultValues);
    }
  }, [template, fields, form]);

  useEffect(() => {
    if (!templateUuid) {
      setLocation('/templates');
      return;
    }
    if (templateError && templateError instanceof Error) {
      toast({ title: "Template Not Found", description: "Redirecting to templates page.", variant: "destructive" });
      setLocation('/templates');
    }
  }, [templateUuid, templateError, setLocation, toast]);

  useEffect(() => {
    if (fields && fields.length > 0 && !isLoading && showPreview) generatePreview();
  }, [fields, isLoading, showPreview]);

  // Auto-render when enabled
  useEffect(() => {
    if (!autoRender || !templateUuid || !showPreview || !fields || fields.length === 0) return;
    const subscription = form.watch((value, { name, type }) => {
      if (type === 'change' && name) {
        const timeoutId = setTimeout(() => generatePreview(), 500);
        return () => clearTimeout(timeoutId);
      }
    });
    return () => subscription.unsubscribe();
  }, [autoRender, templateUuid, showPreview, fields, form]);

  const formatChecklistValue = (value: any): string => {
    if (!Array.isArray(value)) return String(value || '');
    if (value.length === 0) return '';
    if (value.length === 1) return value[0];
    return value.join('; ');
  };

  const generatePreview = async () => {
    if (!templateUuid || !showPreview) return;
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const currentValues = form.getValues();
      const formFields = (fields || []).map(field => {
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
          templateUuid, name: currentValues.name || 'New Document', fields: formFields,
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

  const togglePreview = () => {
    setShowPreview(!showPreview);
    if (!showPreview) generatePreview();
  };

  const handleInteractiveFieldChange = useCallback((fieldName: string, value: string) => {
    form.setValue(fieldName, value);
  }, [form]);

  const handleInteractiveNameChange = useCallback((name: string) => {
    form.setValue('name', name);
  }, [form]);

  const handleInteractiveRenderModeChange = useCallback((mode: RenderMode) => {
    setInteractiveRenderMode(mode);
  }, []);

  const handleManualRender = useCallback(() => {
    generatePreview();
  }, []);

  const getInteractiveFieldValues = useCallback((): Record<string, string> => {
    const currentValues = form.getValues();
    const result: Record<string, string> = {};
    (fields || []).forEach(field => {
      const value = currentValues[field.name];
      const isChecklist = field.fieldType === 'checklist';
      result[field.name] = isChecklist ? formatChecklistValue(value) : String(value || '');
    });
    return result;
  }, [fields, form]);

  const onSubmit = async (data: any) => {
    if (!templateUuid) return;
    try {
      setIsSubmitting(true);
      const formFields = (fields || [])
        .filter(field => field.name !== 'name' && field.fieldType !== 'row_group')
        .map(field => {
          const value = data[field.name];
          const isChecklist = field.fieldType === 'checklist';
          return { 
            fieldName: field.name, 
            fieldValue: isChecklist ? formatChecklistValue(value) : String(value || '') 
          };
        });
      // Build tableData payload from localTableData
      const tableData: Record<string, Array<Record<string, string>>> = {};
      Object.entries(localTableData).forEach(([name, rows]) => {
        if (rows.length > 0) tableData[name] = rows;
      });
      // Build blockData payload from localBlockData
      const blockData: Record<string, Array<Record<string, string>>> = {};
      Object.entries(localBlockData).forEach(([name, instances]) => {
        if (instances.length > 0) blockData[name] = instances;
      });
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateUuid, name: data.name, fields: formFields, tableData, blockData }),
      });
      if (!response.ok) throw new Error('Failed to create document');
      const savedDocument = await response.json();
      toast({ title: "Success", description: "Document created and saved!" });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setLocation(`/document-preview/${savedDocument.uuid || savedDocument.id}`);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create document.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveFromInteractive = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form, onSubmit]);

  const handleBlockDownloadExcel = (blockName: string) => {
    if (!templateUuid) return;
    const a = document.createElement('a');
    a.href = `/api/templates/${templateUuid}/tables/${blockName}/excel?type=block`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBlockImportExcel = async (blockName: string, file: File, columns: Array<{name: string; label: string; fieldType?: string; defaultValue?: string; options?: string[]}>) => {
    if (!templateUuid) return;
    setBlockImporting(prev => ({ ...prev, [blockName]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `/api/templates/${templateUuid}/tables/${blockName}/excel/parse?type=block`,
        { method: 'POST', body: formData }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Import thất bại');
      }
      const result = await response.json();
      setLocalBlockData(prev => ({ ...prev, [blockName]: result.rows }));
      toast({ title: 'Import thành công', description: `Đã nhập ${result.count} mục vào block.` });
    } catch (err: any) {
      toast({ title: 'Lỗi import', description: err.message || 'Không thể đọc file Excel.', variant: 'destructive' });
    } finally {
      setBlockImporting(prev => ({ ...prev, [blockName]: false }));
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
    if (!fields || fields.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">No fields found for this template</p>
        </div>
      );
    }
    return fields.map((field) => {
      // row_group (table) fields are handled with a dialog, not a form input
      if (field.fieldType === 'row_group') {
        const rows = localTableData[field.name] || [];
        return (
          <div key={field.uuid} className="border border-blue-200 rounded-md p-3 bg-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{field.name}</span>
                {rows.length > 0 && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">{rows.length} dòng</Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => setOpenTableDialog(field.name)}
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

  const renderFormCard = (className = "") => (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader className="flex-shrink-0 pb-4">
        <CardTitle>Document Information</CardTitle>
        <CardDescription>Fill in the details for your document</CardDescription>
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
                  <div className="space-y-4">
                    {blockDefs.map((block: any) => {
                      const blockCols: Array<{name: string; label: string; fieldType?: string; defaultValue?: string; options?: string[]}> = block.columns || [];
                      const isImportingBlock = !!blockImporting[block.name];
                      return (
                        <div key={block.name} className="space-y-2">
                          {/* Hidden file input per block */}
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            ref={el => { blockFileInputRefs.current[block.name] = el; }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleBlockImportExcel(block.name, file, blockCols);
                              e.target.value = '';
                            }}
                          />
                          {/* Block header row with download/import buttons */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-purple-800">
                              {block.label || block.name}
                              {(localBlockData[block.name]?.length ?? 0) > 0 && (
                                <span className="ml-2 text-purple-500">
                                  ({localBlockData[block.name].length} mục)
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleBlockDownloadExcel(block.name)}
                                disabled={blockCols.length === 0}
                                className="h-6 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50"
                                title="Tải Excel mẫu"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Tải mẫu
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => blockFileInputRefs.current[block.name]?.click()}
                                disabled={isImportingBlock || blockCols.length === 0}
                                className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="Import từ Excel"
                              >
                                {isImportingBlock ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Upload className="h-3 w-3 mr-1" />
                                )}
                                Import
                              </Button>
                            </div>
                          </div>
                          <ChorusBlockSection
                            blockName={block.name}
                            label={block.label || block.name}
                            columns={blockCols}
                            instances={localBlockData[block.name] || []}
                            onChange={(instances) =>
                              setLocalBlockData(prev => ({ ...prev, [block.name]: instances }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4 flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => setLocation('/templates')}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || isLoading} className="gap-2">
              {isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Saving...</>) : (<><Save className="h-4 w-4" />Save Document</>)}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );

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
        {previewMode === 'interactive' && templateUuid ? (
          <InteractivePreview
            templateUuid={templateUuid}
            fieldValues={getInteractiveFieldValues()}
            onFieldChange={handleInteractiveFieldChange}
            documentName={form.watch('name') || ''}
            onNameChange={handleInteractiveNameChange}
            renderMode={interactiveRenderMode}
            onRenderModeChange={handleInteractiveRenderModeChange}
            onManualRender={handleManualRender}
            isRendering={previewLoading}
            onSave={handleSaveFromInteractive}
            isSaving={isSubmitting}
            onTableClick={(tableName) => setOpenTableDialog(tableName)}
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
            <BreadcrumbItem><BreadcrumbLink href="/templates">Templates</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/documents">Documents</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink>Create Document</BreadcrumbLink></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Create New Document</h1>
          {!isLoading && template && (
            <p className="mt-1 text-gray-500">Based on template: <span className="font-medium">{template.name}</span></p>
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

      {/* Table data dialogs for row_group fields (local mode — no documentUuid yet) */}
      {templateUuid && (fields || []).filter(f => f.fieldType === 'row_group').map(field => (
        <TableDataDialog
          key={field.name}
          open={openTableDialog === field.name}
          onOpenChange={(open) => setOpenTableDialog(open ? field.name : null)}
          templateUuid={templateUuid}
          tableName={field.name}
          localRows={localTableData[field.name] || []}
          onSaveLocal={(name, rows) => setLocalTableData(prev => ({ ...prev, [name]: rows }))}
        />
      ))}
    </div>
  );
};

export default DocumentCreatePage;
