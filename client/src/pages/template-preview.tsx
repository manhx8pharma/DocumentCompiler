import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Eye, Download, FileUp, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useToast } from '@/hooks/use-toast';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { Template, TemplateField } from '@shared/schema';

const TemplatePreviewPage: React.FC = () => {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute('/template-preview/:templateUuid');
  const templateUuid = params?.templateUuid || null;
  
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch template details
  const { 
    data: template, 
    isLoading: templateLoading,
    error: templateError,
    isError: isTemplateError
  } = useQuery<Template>({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      
      const response = await fetch(`/api/templates/${templateUuid}`);
      
      if (response.status === 404) {
        throw new Error('Template not found');
      }
      
      if (!response.ok) {
        console.error(`Error fetching template: ${response.status} ${response.statusText}`);
        throw new Error('Failed to fetch template');
      }
      
      return response.json();
    },
    enabled: !!templateUuid,
    retry: (failureCount, error) => {
      // Don't retry if template not found (404)
      if (error instanceof Error && error.message === 'Template not found') {
        return false;
      }
      // Otherwise retry up to 2 times
      return failureCount < 2;
    }
  });

  // Fetch template fields
  const { 
    data: fields, 
    isLoading: fieldsLoading,
    error: fieldsError,
    isError: isFieldsError
  } = useQuery<TemplateField[]>({
    queryKey: ['/api/templates/fields', templateUuid],
    queryFn: async () => {
      if (!templateUuid) throw new Error('Template UUID is required');
      const response = await fetch(`/api/templates/${templateUuid}/fields`);
      
      if (response.status === 404) {
        throw new Error('Template fields not found');
      }
      
      if (!response.ok) {
        console.error(`Error fetching template fields: ${response.status} ${response.statusText}`);
        throw new Error('Failed to fetch template fields');
      }
      
      return response.json();
    },
    enabled: !!templateUuid && !isTemplateError,
    retry: (failureCount, error) => {
      // Don't retry if template fields not found
      if (error instanceof Error && error.message === 'Template fields not found') {
        return false;
      }
      // Otherwise retry up to 2 times
      return failureCount < 2;
    }
  });

  // State for preview load error
  const [previewError, setPreviewError] = useState<Error | null>(null);
  const [isPreviewError, setIsPreviewError] = useState(false);

  // Load preview HTML only if template exists
  useEffect(() => {
    async function loadPreview() {
      if (!templateUuid || isTemplateError) return;
      
      try {
        setIsLoading(true);
        setPreviewError(null);
        setIsPreviewError(false);
        
        const response = await fetch(`/api/templates/${templateUuid}/preview`);
        
        if (response.status === 404) {
          const error = new Error('Template preview not found');
          setPreviewError(error);
          setIsPreviewError(true);
          console.error('Failed to load template preview:', error);
          return;
        }
        
        if (!response.ok) {
          const error = new Error('Failed to load template preview');
          setPreviewError(error);
          setIsPreviewError(true);
          console.error(`Error loading preview: ${response.status} ${response.statusText}`);
          toast({
            title: "Error",
            description: "Failed to load template preview, but template information is available.",
            variant: "destructive",
          });
          return;
        }
        
        const html = await response.text();
        setPreviewHtml(html);
      } catch (error) {
        console.error('Failed to load template preview:', error);
        setPreviewError(error instanceof Error ? error : new Error('Unknown preview error'));
        setIsPreviewError(true);
        toast({
          title: "Error",
          description: "Failed to load template preview",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPreview();
  }, [templateUuid, toast, isTemplateError]);

  // Handle back to templates
  const handleBackToTemplates = () => {
    setLocation('/templates');
  };

  // Handle use template button
  const handleUseTemplate = () => {
    if (template && template.uuid) {
      // Use the template UUID
      window.location.href = `/document-create/${template.uuid}`;
    }
  };

  // Handle download template - trả về Word template file thay vì Excel
  const handleDownloadTemplate = async () => {
    if (!templateUuid) return;
    
    try {
      const response = await fetch(`/api/templates/${templateUuid}/download`);
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${template?.name || 'template'}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Template Word file downloaded successfully",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download template",
        variant: "destructive",
      });
    }
  };

  // If no template ID is provided, redirect to templates
  useEffect(() => {
    if (!templateUuid) {
      setLocation('/templates');
    }
  }, [templateUuid, setLocation]);

  // Create template error message based on the error
  const getErrorMessage = () => {
    if (templateError instanceof Error) {
      if (templateError.message === 'Template not found') {
        return {
          title: 'Template Not Found',
          description: 'The template you are looking for does not exist or may have been deleted. Please go back to the templates page and try again.',
        };
      }
    }
    return {
      title: 'Error Loading Template',
      description: 'There was an error loading this template. Please try again later or contact support if the problem persists.',
    };
  };

  // Redirect to templates page after delay when template not found
  useEffect(() => {
    if (isTemplateError && templateError instanceof Error && templateError.message === 'Template not found') {
      const timer = setTimeout(() => {
        toast({
          title: 'Redirecting to Templates',
          description: 'You are being redirected to the templates page.',
        });
        setLocation('/templates');
      }, 5000); // 5 second delay before redirect
      
      return () => clearTimeout(timer);
    }
  }, [isTemplateError, templateError, setLocation, toast]);
  
  // Combined loading state
  const isPageLoading = templateLoading || fieldsLoading || isLoading;

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
              <BreadcrumbLink>Template Preview</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      {/* Error message when template not found or error */}
      {isTemplateError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{getErrorMessage().title}</AlertTitle>
          <AlertDescription>
            {getErrorMessage().description}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Page header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleBackToTemplates}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Button>
          
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            {isPageLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              template?.name || 'Template Preview'
            )}
          </h1>
        </div>
        
        {!isTemplateError && (
          <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={isPageLoading}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Template
            </Button>
            
            <Button
              onClick={handleUseTemplate}
              disabled={isPageLoading}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Document
            </Button>
          </div>
        )}
      </div>
      
      {/* Template details */}
      {!isPageLoading && template && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Template Name</p>
                <p className="text-base font-medium">{template.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Category</p>
                <Badge 
                  variant="outline"
                  className={`bg-${getCategoryColor(template.category)}-50 text-${getCategoryColor(template.category)}-700 border-${getCategoryColor(template.category)}-200`}
                >
                  {template.category}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Last Updated</p>
                <p className="text-base">{formatDate(template.updatedAt)}</p>
              </div>
              {template.description && (
                <div className="col-span-full mt-2">
                  <p className="text-sm font-medium text-gray-500">Description</p>
                  <p className="text-base">{template.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Fields */}
      {!isPageLoading && fields && fields.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="bg-gray-50 border-b px-6 py-4">
            <CardTitle className="text-lg font-medium">Template Fields</CardTitle>
            <CardDescription>
              The following fields were detected in this template
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {fields.map((field) => (
                <div key={field.uuid} className="border rounded-md p-3 bg-gray-50">
                  <p className="font-medium text-sm">{field.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Field type: {field.type}</p>
                  {field.required && (
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 mt-2 text-xs">
                      Required
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Template preview */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="bg-gray-50 border-b px-6 py-4">
          <CardTitle className="text-lg font-medium">Template Preview</CardTitle>
          <CardDescription>
            Preview how your template looks with highlighted placeholders
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isPageLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-3/4 mb-4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full mt-6" />
              <Skeleton className="h-4 w-full mt-6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <div className="w-full p-4 bg-gray-100 min-h-[70vh]">
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
                    dangerouslySetInnerHTML={{ __html: previewHtml || '' }} 
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-gray-50 border-t px-6 py-4">
          <Button
            onClick={handleUseTemplate}
            disabled={isPageLoading}
            className="flex items-center gap-2 ml-auto"
          >
            <Plus className="h-4 w-4" />
            Create Document from Template
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TemplatePreviewPage;