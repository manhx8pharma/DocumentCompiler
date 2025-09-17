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
import { Template, TemplateField } from '@shared/schema';

const DocumentCreatePage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute('/document-create/:templateUuid');
  const templateUuid = params?.templateUuid || null;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch template details
  const { data: template, isLoading: templateLoading, error: templateError } = useQuery<Template>({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      
      console.log(`Looking up template with UUID: ${templateUuid}`);
      const response = await fetch(`/api/templates/${templateUuid}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Template not found');
        }
        throw new Error('Failed to fetch template');
      }
      return response.json();
    },
    enabled: !!templateUuid,
  });

  // Fetch template fields
  const { data: fields, isLoading: fieldsLoading, error: fieldsError } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      
      console.log(`Fetching template fields for template UUID: ${templateUuid}`);
      const response = await fetch(`/api/templates/uuid/${templateUuid}/fields`);
      
      if (!response.ok) {
        console.error(`Error fetching template fields: ${response.status} ${response.statusText}`);
        throw new Error('Failed to fetch template fields');
      }
      
      const fieldsData = await response.json();
      console.log(`Loaded ${fieldsData.length} fields for template ${templateUuid}`);
      return fieldsData;
    },
    enabled: !!templateUuid,
  });

  // Create empty default values with common field names
  const createEmptyDefaults = (templateName?: string): Record<string, string> => {
    const defaults: Record<string, string> = {
      name: templateName ? `${templateName} - New Document` : '',
      // Initialize all common fields with empty strings
      clientName: '',
      projectTitle: '',
      projectDescription: '',
      startDate: '',
      endDate: '',
      budget: '',
      deliverables: '',
      timeline: '',
      firstName: '',
      lastName: '',
      email: '',
      address: '',
      company: '',
      position: '',
      phone: '',
      description: '',
      amount: '',
      date: '',
      notes: '',
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
    defaultValues: createEmptyDefaults(template?.name),
    mode: 'onChange',
  });
  
  const isLoading = templateLoading || fieldsLoading;

  // Update schema when fields change
  useEffect(() => {
    if (fields) {
      const schemaFields: Record<string, any> = {
        name: z.string().min(1, "Document name is required"),
      };
      
      fields.forEach(field => {
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
  }, [fields]);

  // Update form values when template or fields change
  useEffect(() => {
    if (template) {
      console.log('Form reset triggered with template:', template.name);
      
      // Create default values object
      const defaultValues = createEmptyDefaults(template.name);
      
      // Add default empty values for any template-specific fields
      if (fields && fields.length > 0) {
        console.log('Initializing form with fields:', fields.map(f => f.name));
        fields.forEach(field => {
          // Set empty string as default (select options not supported in new schema yet)
          defaultValues[field.name] = '';
        });
      }
      
      console.log('Resetting form with defaults:', defaultValues);
      form.reset(defaultValues);
    }
  }, [template, fields, form]);

  // Redirect to templates if no template UUID or template not found
  useEffect(() => {
    if (!templateUuid) {
      setLocation('/templates');
      return;
    }
    
    if (templateError && templateError instanceof Error) {
      toast({
        title: "Template Not Found",
        description: "The template you are looking for does not exist or may have been deleted. Redirecting to templates page.",
        variant: "destructive",
      });
      
      // Immediate redirect
      setLocation('/templates');
    }
  }, [templateUuid, templateError, setLocation, toast]);

  // Generate preview when form values change - real-time với debounce
  useEffect(() => {
    if (!templateUuid || !showPreview || !fields || fields.length === 0) return;
    
    const subscription = form.watch((value, { name, type }) => {
      // Skip initial render to avoid duplicate requests
      if (type === 'change' && name) {
        // Debounce preview generation
        const timeoutId = setTimeout(() => {
          generatePreview();
        }, 500); // Wait 500ms after user stops typing
        
        return () => clearTimeout(timeoutId);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [templateUuid, showPreview, fields, form]);
  
  // Generate preview when first loaded
  useEffect(() => {
    if (fields && fields.length > 0 && !isLoading) {
      generatePreview();
    }
  }, [fields, isLoading]);

  // Function to generate preview
  const generatePreview = async () => {
    if (!templateUuid || !showPreview) return;
    
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      
      // Get current form values
      const currentValues = form.getValues();
      
      // Format form data for preview - CHỈ GỬI CÁC TEMPLATE FIELDS THỰC TẾ
      const templateFieldNames = fields?.map(f => f.name) || [];
      const formFields = templateFieldNames.map(fieldName => ({
        fieldName,
        fieldValue: String(currentValues[fieldName] || ''),
      }));
      
      // Prepare preview data
      const previewData = {
        templateUuid,
        name: currentValues.name || (template?.name ? `${template.name} - New Document` : 'New Document'),
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
    if (!templateUuid) return;
    
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
        templateUuid,
        name: data.name,
        fields: formFields,
      };
      
      // Create the document
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create document');
      }
      
      const savedDocument = await response.json();
      console.log('Document created successfully:', savedDocument);
      
      // Show success message
      toast({
        title: "Success",
        description: "Document created and saved to database!",
        variant: "default"
      });
      
      // Invalidate queries to refresh document list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      
      // Navigate to the document list or the new document
      setLocation(`/document-preview/${savedDocument.uuid || savedDocument.id}`);
      
    } catch (error) {
      console.error('Document creation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create document. Please try again.",
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
              <BreadcrumbLink href="/templates">Templates</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink>Create Document</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      {/* Page header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Create New Document</h1>
          {!isLoading && template && (
            <p className="mt-1 text-gray-500">
              Based on template: <span className="font-medium">{template.name}</span>
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
                Fill in the details for your document
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
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-10 w-full" />
                            </div>
                          ))
                        ) : fields && fields.length > 0 ? (
                          fields.map((field) => {
                            switch (field.type) {
                              case 'text':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Textarea 
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
                                            className="min-h-[100px]"
                                            {...formField} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              case 'email':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="email"
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
                                            {...formField} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              case 'number':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number"
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
                                            {...formField}
                                            onChange={(e) => {
                                              const value = e.target.value === "" ? "" : e.target.value;
                                              formField.onChange(value);
                                            }}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              case 'date':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="date"
                                            {...formField} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              case 'select':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Input 
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
                                            {...formField} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              case 'textarea':
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Textarea 
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
                                            className="min-h-[100px]"
                                            {...formField} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                );
                              default:
                                return (
                                  <FormField
                                    key={field.uuid}
                                    control={form.control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        <FormLabel>{field.name}</FormLabel>
                                        <FormControl>
                                          <Textarea 
                                            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
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
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-gray-500">No fields found for this template</p>
                            {templateUuid && (
                              <p className="text-xs text-gray-400 mt-2">
                                Template UUID: {templateUuid} | Fields loaded: {fields ? fields.length : 'undefined'} | Loading: {fieldsLoading ? 'Yes' : 'No'}
                              </p>
                            )}
                            {fieldsError && (
                              <p className="text-xs text-red-400 mt-2">
                                Error: {fieldsError.message}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
                
                <CardFooter className="flex justify-between border-t pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation('/templates')}
                  >
                    Cancel
                  </Button>
                  
                  <Button
                    type="submit"
                    disabled={isSubmitting || isLoading}
                    className="gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Document
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
          <div className="lg:w-1/2 transition-all duration-300">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Document Preview</CardTitle>
                <CardDescription>
                  Preview how your document will look
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 p-0 border-t">
                {previewLoading ? (
                  <div className="h-full flex items-center justify-center p-12">
                    <div className="flex flex-col items-center">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600 mb-4"></div>
                      <p className="text-gray-500">Generating preview...</p>
                    </div>
                  </div>
                ) : previewError ? (
                  <div className="p-6 flex flex-col items-center justify-center text-center">
                    <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
                    <h3 className="text-lg font-medium mb-2 text-red-600">Error Generating Preview</h3>
                    <p className="text-sm text-gray-600">{previewError}</p>
                  </div>
                ) : (
                  <div className="w-full p-4 bg-gray-100 h-full">
                    <div className="w-full max-w-6xl mx-auto">
                      <div 
                        className="bg-white border shadow-sm rounded overflow-hidden mx-auto"
                        style={{
                          width: 'min(210mm, 100%)',
                          height: 'auto',
                          padding: '3mm',
                          boxSizing: 'border-box',
                          margin: '0 auto',
                          position: 'relative',
                          boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                          aspectRatio: '210/297',
                        }}
                      >
                        <div 
                          className="document-content h-full overflow-auto"
                          dangerouslySetInnerHTML={{ __html: previewHtml }} 
                        />
                      </div>
                    </div>
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

export default DocumentCreatePage;