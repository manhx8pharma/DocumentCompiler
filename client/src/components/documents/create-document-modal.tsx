import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Edit, FileText, Eye, Grip, CheckCircle, Download, SplitSquareVertical, AlertCircle, Loader2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Template, TemplateField } from '@shared/schema';
import DocumentPreviewModal from './document-preview-modal';
import Draggable from 'react-draggable';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string | null;
}

const CreateDocumentModal = ({ isOpen, onClose, templateId }: CreateDocumentModalProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showRealtimePreview, setShowRealtimePreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [documentData, setDocumentData] = useState<{
    templateUuid: string;
    name: string;
    fields: { fieldName: string; fieldValue: string }[];
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch template details
  const { data: template, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ['/api/templates', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      const response = await fetch(`/api/templates/uuid/${templateId}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
    enabled: isOpen && templateId !== null,
  });

  // Fetch template fields
  const { data: fields, isLoading: fieldsLoading } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID is required');
      const response = await fetch(`/api/templates/uuid/${templateId}/fields`);
      if (!response.ok) throw new Error('Failed to fetch template fields');
      return response.json();
    },
    enabled: isOpen && templateId !== null,
  });

  // Dynamically generate form schema based on fields
  const [formSchema, setFormSchema] = useState<z.ZodObject<any>>(z.object({
    name: z.string().min(1, "Document name is required"),
  }));

  // Utility function to sanitize field names for use as object keys
  const sanitizeFieldName = (fieldName: string): string => {
    // Replace spaces, commas, and other special characters with underscores
    return fieldName.replace(/[^a-zA-Z0-9]/g, '_');
  };

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
        // Sanitize field name for use as object key in schema
        const fieldKey = field.name;
        
        // Add validation based on field type
        switch(field.fieldType) {
          case 'number':
            schemaFields[fieldKey] = z.coerce.number().optional();
            break;
          case 'date':
            schemaFields[fieldKey] = z.string().optional();
            break;
          case 'email':
            schemaFields[fieldKey] = z.string().email("Invalid email address").optional();
            break;
          case 'select':
            schemaFields[fieldKey] = z.string().optional();
            break;
          default:
            schemaFields[fieldKey] = z.string().optional();
        }
        
        // If field is required, add appropriate validation
        if (field.required) {
          switch(field.fieldType) {
            case 'number':
              schemaFields[fieldKey] = z.coerce.number({
                required_error: `${field.displayName} is required`,
                invalid_type_error: `${field.displayName} must be a number`,
              });
              break;
            case 'date':
              schemaFields[fieldKey] = z.string({
                required_error: `${field.displayName} is required`,
              });
              break;
            case 'select':
              schemaFields[fieldKey] = z.string({
                required_error: `${field.displayName} is required`,
              });
              break;
            default:
              schemaFields[fieldKey] = z.string({
                required_error: `${field.displayName} is required`,
              }).min(1, `${field.displayName} is required`);
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
          // If this is a select field with options, use the first one as default
          if (field.fieldType === 'select' && field.options) {
            const options = field.options.split(',').map(opt => opt.trim());
            defaultValues[field.name] = options.length > 0 ? options[0] : '';
          } else {
            // Otherwise just set empty string
            defaultValues[field.name] = '';
          }
        });
      }
      
      console.log('Resetting form with defaults:', defaultValues);
      form.reset(defaultValues);
    }
  }, [template, fields, form]);
  
  // Function to generate real-time preview
  const generateRealTimePreview = useCallback(async () => {
    if (!templateId || !showRealtimePreview) return;
    
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
      console.error('Error fetching real-time preview:', error);
      setPreviewError(error instanceof Error ? error.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [templateId, showRealtimePreview, form, template]);
  
  // Watch form values for real-time preview updates
  useEffect(() => {
    // Subscribe to form changes
    const subscription = form.watch(() => {
      // Debounce preview generation to avoid too many requests
      const timer = setTimeout(() => {
        generateRealTimePreview();
      }, 500); // 500ms debounce
      
      return () => clearTimeout(timer);
    });
    
    // Clean up subscription
    return () => subscription.unsubscribe();
  }, [form, generateRealTimePreview]);
  
  // Generate initial preview when form is ready
  useEffect(() => {
    if (fields && fields.length > 0 && !isLoading) {
      generateRealTimePreview();
    }
  }, [fields, isLoading, generateRealTimePreview]);

  // Handler for when "Preview Document" is clicked
  const handlePreviewClick = (data: any) => {
    if (!templateId) return;
    
    try {
      // Format form data for preview
      const formFields = Object.entries(data)
        .filter(([key]) => key !== 'name')
        .map(([key, value]) => ({
          fieldName: key,
          fieldValue: String(value || ''), // Ensure all values are strings and handle nulls
        }));
      
      console.log('Preview document with fields:', formFields);
      
      // Set document data for preview
      if (templateId) {
        setDocumentData({
          templateUuid: templateId,
          name: data.name,
          fields: formFields,
        });
      }
      
      // Open preview modal
      setShowPreview(true);
    } catch (error) {
      console.error('Error preparing document preview:', error);
      toast({
        title: "Error",
        description: "Failed to prepare document preview. Please check your inputs.",
        variant: "destructive",
      });
    }
  };

  // Final document creation after preview confirmation
  // Now this just handles cleanup after successful document generation in the preview modal
  const handleCreateDocument = () => {
    // Invalidate documents query to refresh the list
    queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    
    // Reset form and close modals
    form.reset();
    setShowPreview(false);
    onClose();
  };

  // Standard form submission (now used to show preview first)
  const onSubmit = async (data: any) => {
    handlePreviewClick(data);
  };
  
  // Toggle live preview
  const togglePreview = () => {
    setShowRealtimePreview(!showRealtimePreview);
    
    // If turning preview on, generate it
    if (!showRealtimePreview) {
      generateRealTimePreview();
    }
  };

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) onClose();
      }}>
        <Draggable handle=".drag-handle">
        <DialogContent 
          className="sm:max-w-3xl p-0 overflow-hidden rounded-lg shadow-xl border"
          aria-describedby="create-document-description"
        >
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 flex justify-between items-center drag-handle">
            <DialogTitle className="text-xl font-semibold text-blue-800">Create a Document</DialogTitle>
            <DialogDescription id="create-document-description" className="sr-only">
              Fill out the form to create a new document based on the selected template
            </DialogDescription>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="ghost" 
                className="gap-1 text-sm hover:bg-blue-200/50"
                onClick={togglePreview}
              >
                <SplitSquareVertical size={18} />
                {showRealtimePreview ? 'Hide Preview' : 'Show Preview'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 rounded-full h-8 w-8 p-0 flex items-center justify-center"
              >
                <span className="sr-only">Close</span>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} ref={formRef} className="p-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-base font-semibold text-gray-800">Document Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter document name"
                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-10 text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            
              <div className="flex-1 overflow-hidden flex flex-row gap-4">
                {/* Form Fields Section */}
                <div className={`${showRealtimePreview ? "w-1/2" : "w-full"} transition-all duration-300`}>
                  <ScrollArea className="border border-gray-200 rounded-md p-4 h-[min(60vh,500px)]">
                    <div className="space-y-5 px-2">
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="mb-4">
                          <Skeleton className="h-5 w-32 mb-2" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ))
                    ) : fields && fields.length > 0 ? (
                      fields.map((field) => {
                        switch (field.fieldType) {
                          case 'text':
                          case 'email':
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <FormControl>
                                      <Input 
                                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all"
                                        type={field.fieldType === 'email' ? 'email' : 'text'} 
                                        name={field.name}
                                        id={`field-${field.id}`}
                                        value={formField.value || ''}
                                        onChange={(e) => {
                                          // Using the change event directly for better handling of fields with special characters
                                          formField.onChange(e.target.value);
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                            
                          case 'textarea':
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all min-h-[100px]"
                                        name={field.name}
                                        id={`field-${field.id}`}
                                        value={formField.value || ''}
                                        onChange={(e) => {
                                          // Using the change event directly for better handling of fields with special characters
                                          formField.onChange(e.target.value);
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                            
                          case 'number':
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <FormControl>
                                      <div className="relative rounded-md">
                                        {field.name.toLowerCase().includes('price') || 
                                         field.name.toLowerCase().includes('salary') || 
                                         field.name.toLowerCase().includes('amount') ? (
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 sm:text-sm">$</span>
                                          </div>
                                        ) : null}
                                        <Input 
                                          type="number" 
                                          className={`rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all ${
                                            field.name.toLowerCase().includes('price') || 
                                            field.name.toLowerCase().includes('salary') || 
                                            field.name.toLowerCase().includes('amount') ? "pl-7" : ""
                                          }`}
                                          name={field.name}
                                          id={`field-${field.id}`}
                                          value={formField.value || ''}
                                          onChange={(e) => {
                                            // Explicitly convert empty value to empty string
                                            formField.onChange(e.target.value === "" ? "" : e.target.value);
                                          }}
                                        />
                                      </div>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                            
                          case 'date':
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <FormControl>
                                      <Input 
                                        type="date" 
                                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all"
                                        name={field.name}
                                        id={`field-${field.id}`}
                                        value={formField.value || ''}
                                        onChange={(e) => {
                                          // Using the change event directly for better handling of fields with special characters
                                          formField.onChange(e.target.value);
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                            
                          case 'select':
                            const options = field.options ? field.options.split(',').map(opt => opt.trim()) : [];
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <Select 
                                      onValueChange={formField.onChange} 
                                      defaultValue={formField.value || (options.length > 0 ? options[0] : '')}
                                      value={formField.value || ''}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all h-10">
                                          <SelectValue placeholder={`Select ${field.displayName}`} />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="rounded-md border-gray-200 shadow-md">
                                        {options.map((option, i) => (
                                          <SelectItem key={i} value={option} className="cursor-pointer hover:bg-blue-50">
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                            
                          default:
                            return (
                              <FormField
                                key={field.id}
                                control={form.control}
                                name={field.name}
                                render={({ field: formField }) => (
                                  <FormItem className="mb-1">
                                    <FormLabel className="text-sm font-medium text-gray-700">{field.displayName}</FormLabel>
                                    <FormControl>
                                      <Input 
                                        className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all"
                                        name={field.name}
                                        id={`field-${field.id}`}
                                        value={formField.value || ''}
                                        onChange={(e) => {
                                          // Using the change event directly for better handling of fields with special characters
                                          formField.onChange(e.target.value);
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            );
                        }
                      })
                    ) : (
                      <div className="py-10 text-center">
                        No fields found for this template.
                      </div>
                    )}
                    </div>
                  </ScrollArea>
                </div>
                
                {/* Real-time Preview Panel */}
                {showRealtimePreview && (
                  <div className="w-1/2 ml-2">
                    <div className="border border-gray-200 rounded-md p-4 h-[min(60vh,500px)] overflow-auto">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                          <FileText size={16} className="text-blue-600" />
                          Live Preview
                        </h3>
                        {previewLoading && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            Updating...
                          </span>
                        )}
                      </div>
                      
                      {previewError ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center p-4 rounded-md bg-red-50 max-w-md mx-auto">
                            <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                            <p className="text-red-600 text-sm font-medium">Error generating preview</p>
                            <p className="text-red-500 text-xs mt-1">{previewError}</p>
                          </div>
                        </div>
                      ) : previewLoading && !previewHtml ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Loader2 className="h-6 w-6 text-blue-500 mx-auto animate-spin mb-2" />
                            <p className="text-gray-600 text-sm">Generating preview...</p>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-5 pt-4 border-t flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose} 
                  className="mt-3 sm:mt-0 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || isLoading}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-md shadow-sm transition-all w-full sm:w-auto"
                >
                  <Eye className="h-5 w-5" />
                  {isSubmitting ? 'Processing...' : 'Preview Document'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
        </Draggable>
      </Dialog>

      {/* Document preview modal */}
      {documentData && (
        <DocumentPreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          documentData={documentData}
          onConfirm={handleCreateDocument}
        />
      )}
    </div>
  );
};

export default CreateDocumentModal;