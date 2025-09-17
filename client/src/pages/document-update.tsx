import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, FileText, Eye, SplitSquareVertical, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useToast } from '@/hooks/use-toast';
import { Document, Template, TemplateField } from '@shared/schema';

const DocumentUpdatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute('/document-update/:documentUuid');
  const documentUuid = params?.documentUuid;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  // Fetch template details based on the document's templateId
  const { data: template, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ['/api/templates', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      
      // Try using UUID route first
      const isUuid = typeof templateId === 'string' && isNaN(Number(templateId));
      
      let response;
      if (isUuid) {
        response = await fetch(`/api/templates/uuid/${templateId}`);
        
        // If not found, fall back to legacy ID route
        if (response.status === 404) {
          response = await fetch(`/api/templates/${templateId}`);
        }
      } else {
        response = await fetch(`/api/templates/${templateId}`);
      }
      
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
    enabled: !!templateId,
  });

  // Fetch template fields
  const { data: templateFields, isLoading: templateFieldsLoading } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      
      // Try using UUID route first
      const isUuid = typeof templateId === 'string' && isNaN(Number(templateId));
      
      let response;
      if (isUuid) {
        response = await fetch(`/api/templates/uuid/${templateId}/fields`);
        
        // If not found, fall back to legacy ID route
        if (response.status === 404) {
          response = await fetch(`/api/templates/${templateId}/fields`);
        }
      } else {
        response = await fetch(`/api/templates/${templateId}/fields`);
      }
      
      if (!response.ok) throw new Error('Failed to fetch template fields');
      return response.json();
    },
    enabled: !!templateId,
  });

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
        // Add validation based on field type
        switch(field.type) {
          case 'number':
            schemaFields[field.name] = z.coerce.number().optional();
            break;
          case 'date':
            schemaFields[field.name] = z.string().optional();
            break;
          case 'email':
            schemaFields[field.name] = z.string().email("Invalid email address").optional();
            break;
          case 'select':
            schemaFields[field.name] = z.string().optional();
            break;
          default:
            schemaFields[field.name] = z.string().optional();
        }
        
        // If field is required, add appropriate validation
        if (field.required) {
          switch(field.type) {
            case 'number':
              schemaFields[field.name] = z.coerce.number({
                required_error: `${field.name} is required`,
                invalid_type_error: `${field.name} must be a number`,
              });
              break;
            case 'date':
              schemaFields[field.name] = z.string({
                required_error: `${field.name} is required`,
              });
              break;
            case 'select':
              schemaFields[field.name] = z.string({
                required_error: `${field.name} is required`,
              });
              break;
            default:
              schemaFields[field.name] = z.string({
                required_error: `${field.name} is required`,
              }).min(1, `${field.name} is required`);
          }
        }
      });
      
      setFormSchema(z.object(schemaFields));
    }
  }, [templateFields]);

  // Update form values when document fields are loaded
  useEffect(() => {
    if (document && documentFields) {
      // Create values object starting with the document name
      const values: Record<string, any> = {
        name: document.name || '',
      };
      
      // Add all document field values
      documentFields.forEach(field => {
        values[field.fieldName] = field.fieldValue;
      });
      
      console.log('Updating form with document fields:', values);
      form.reset(values);
      
      // Generate preview with the loaded values
      generatePreview();
    }
  }, [document, documentFields]);

  // Redirect to documents if no document ID
  useEffect(() => {
    if (!documentUuid) {
      setLocation('/documents');
    }
  }, [documentUuid, setLocation]);

  // Generate preview when form values change
  useEffect(() => {
    const subscription = form.watch(() => {
      generatePreview();
    });
    
    return () => subscription.unsubscribe();
  }, [form]);

  // Function to generate preview
  const generatePreview = async () => {
    if (!templateId || !showPreview) return;
    
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      
      // Get current form values
      const currentValues = form.getValues();
      
      // Format form data for preview
      const formFields = Object.entries(currentValues)
        .filter(([key]) => key !== 'name')
        .map(([key, value]) => ({
          fieldName: key,
          fieldValue: String(value || ''), // Ensure all values are strings and handle nulls
        }));
      
      // Prepare preview data
      const previewData = {
        templateUuid: templateId,
        name: currentValues.name || (document?.name || 'Document Update'),
        fields: formFields,
      };
      
      // Fetch preview HTML
      const response = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(previewData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate document preview');
      }
      
      const data = await response.json();
      
      if (data.previewHtml) {
        setPreviewHtml(data.previewHtml);
      } else {
        throw new Error('No preview content returned');
      }
    } catch (error) {
      console.error('Error fetching preview:', error);
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

  // Handle form submission
  const onSubmit = async (data: any) => {
    if (!templateId || !documentUuid) return;
    
    try {
      setIsSubmitting(true);
      
      // Format form data for submission
      const formFields = Object.entries(data)
        .filter(([key]) => key !== 'name')
        .map(([key, value]) => ({
          fieldName: key,
          fieldValue: String(value || ''),
        }));
      
      // Prepare document data
      const documentData = {
        name: data.name,
        fields: formFields,
      };
      
      // Update the document
      const response = await fetch(`/api/documents/${documentUuid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update document');
      }
      
      const updatedDocument = await response.json();
      console.log('Document updated successfully:', updatedDocument);
      
      // Show success message
      toast({
        title: "Success",
        description: "Document updated successfully!",
        variant: "default"
      });
      
      // Invalidate queries to refresh document list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentUuid] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents/fields', documentUuid] });
      
      // Generate preview with updated data
      generatePreview();
      
    } catch (error) {
      console.error('Document update error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-6 px-4 sm:px-6 md:px-8">
      {/* Breadcrumb navigation */}
      <div className="mb-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink>Edit Document</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      {/* Page header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Edit Document</h1>
          {!isLoading && document && (
            <p className="mt-1 text-gray-500">
              Editing: <span className="font-medium">{document.name}</span>
            </p>
          )}
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={togglePreview}
            className="gap-2"
          >
            <SplitSquareVertical className="h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </div>
      </div>
      
      {/* Main content area with form and preview */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Form panel */}
        <div className={`${showPreview ? 'lg:w-1/2' : 'w-full'} transition-all duration-300`}>
          <Card>
            <CardHeader>
              <CardTitle>Document Information</CardTitle>
              <CardDescription>
                Update the details for your document
              </CardDescription>
            </CardHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} ref={formRef}>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium">Document Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter document name"
                            className="w-full"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium text-sm mb-3 text-gray-500">Template Fields</h3>
                    
                    <ScrollArea className="h-[calc(100vh-20rem)]">
                      <div className="space-y-4 pr-4">
                        {isLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="space-y-2">
                              <Skeleton className="h-4 w-1/4" />
                              <Skeleton className="h-10 w-full" />
                            </div>
                          ))
                        ) : templateFields?.length === 0 ? (
                          <p className="text-sm text-gray-500">No fields to edit for this template.</p>
                        ) : (
                          templateFields?.map((field) => {
                            if (field.type === 'select') {
                              // Render select field - for now using simple text input as options are not in the current schema
                              // TODO: Add options support to template fields schema
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          {...formField}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            } else if (field.type === 'textarea') {
                              // Render textarea field
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          className="resize-y min-h-[100px]"
                                          {...formField}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            } else if (field.type === 'date') {
                              // Render date field
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="date"
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          {...formField}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            } else if (field.type === 'number') {
                              // Render number field
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          {...formField}
                                          onChange={(e) => {
                                            const value = e.target.value === "" ? "0" : e.target.value;
                                            formField.onChange(value);
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            } else if (field.type === 'email') {
                              // Render email input field
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Input
                                          type="email"
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          {...formField}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            } else {
                              // Render default text field as textarea for all other field types
                              return (
                                <FormField
                                  key={field.name}
                                  control={form.control}
                                  name={field.name}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium">
                                        {field.name}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder={field.placeholder || `Enter ${field.name}`}
                                          className="min-h-[100px]"
                                          {...formField}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              );
                            }
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
                
                <CardFooter className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation('/documents')}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Documents
                  </Button>
                  
                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Update Document
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>
        
        {/* Preview panel */}
        {showPreview && (
          <div className="lg:w-1/2 min-h-[600px]">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Document Preview
                </CardTitle>
                <CardDescription>
                  Preview how your document will look when generated
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 min-h-0 flex flex-col">
                {previewLoading ? (
                  <div className="flex-1 flex items-center justify-center p-12">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600"></div>
                  </div>
                ) : previewError ? (
                  <div className="flex-1 flex items-center justify-center p-12">
                    <div className="text-center max-w-md">
                      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <h3 className="font-medium text-lg mb-2">Preview Error</h3>
                      <p className="text-gray-600 mb-4">{previewError}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-auto flex justify-center">
                    <div 
                      className="a4-paper"
                      style={{
                        width: 'min(210mm, 95vw)',
                        minHeight: 'min(297mm, 80vh)',
                        aspectRatio: '210/297',
                        padding: '3mm',
                        backgroundColor: 'white',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
                        marginTop: '1rem',
                        marginBottom: '1rem'
                      }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUpdatePage;