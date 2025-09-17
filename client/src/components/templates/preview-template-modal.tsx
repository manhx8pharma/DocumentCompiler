import React, { useState, useEffect, useRef } from 'react';
import { Eye, Download, Grip } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Template, TemplateField } from '@shared/schema';
import Draggable from 'react-draggable';

interface PreviewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string | null;
  onUseTemplate: (templateUuid: string) => void;
}

const PreviewTemplateModal: React.FC<PreviewTemplateModalProps> = ({
  isOpen,
  onClose,
  templateId,
  onUseTemplate,
}) => {
  const { toast } = useToast();
  const [previewHtml, setPreviewHtml] = useState<string>('');

  const { data: template, isLoading: templateLoading } = useQuery<Template>({
    queryKey: templateId ? [`/api/templates/uuid/${templateId}`] : ['template-placeholder'],
    enabled: isOpen && templateId !== null,
  });

  const { data: fields, isLoading: fieldsLoading } = useQuery<TemplateField[]>({
    queryKey: templateId ? [`/api/templates/uuid/${templateId}/fields`] : ['template-fields-placeholder'],
    enabled: isOpen && templateId !== null,
  });

  // Fetch preview HTML
  useEffect(() => {
    if (isOpen && templateId) {
      fetch(`/api/templates/uuid/${templateId}/preview`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load preview');
          return res.text();
        })
        .then(html => {
          setPreviewHtml(html);
        })
        .catch(error => {
          console.error('Preview error:', error);
          toast({
            title: "Error",
            description: "Failed to load template preview.",
            variant: "destructive",
          });
        });
    }
  }, [isOpen, templateId, toast]);

  const handleDownload = async () => {
    if (!templateId) return;
    
    try {
      const response = await fetch(`/api/templates/uuid/${templateId}/download`);
      if (!response.ok) throw new Error('Failed to download file');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = template?.name ? `${template.name}.docx` : 'template.docx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download template.",
        variant: "destructive",
      });
    }
  };

  const handleUseTemplate = () => {
    if (templateId) {
      onUseTemplate(templateId);
    }
  };

  const isLoading = templateLoading || fieldsLoading;
  const dialogRef = useRef(null);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Draggable handle=".drag-handle" bounds="body" nodeRef={dialogRef}>
        <DialogContent 
          ref={dialogRef} 
          className="sm:max-w-2xl md:max-w-4xl lg:max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-lg shadow-lg"
          aria-describedby="template-preview-description"
        >
          <DialogHeader className="pb-4 border-b cursor-move drag-handle">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Eye className="h-6 w-6 text-blue-600" />
                {isLoading ? (
                  <Skeleton className="h-6 w-60" />
                ) : (
                  template?.name || 'Template Preview'
                )}
              </DialogTitle>
              <Grip className="h-5 w-5 text-gray-400" />
            </div>
            <DialogDescription id="template-preview-description" className="text-base text-gray-600">
              Preview of the template with highlighted placeholder fields.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-4 flex-1 overflow-auto">
            <div className="mb-4 flex justify-between items-center">
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <>
                    <Badge variant={template?.category as any}>
                      {template?.category && template.category.charAt(0).toUpperCase() + template.category.slice(1)}
                    </Badge>
                    <span className="ml-2 text-sm text-gray-500">
                      {fields?.length || 0} fields
                    </span>
                  </>
                )}
              </div>
              <div>
                <Button 
                  variant="secondary" 
                  onClick={handleDownload}
                  disabled={isLoading}
                  className="rounded-md shadow-sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 h-[min(50vh,400px)] overflow-y-auto font-mono text-sm">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : (
                <div 
                  className="whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          </div>
          
          <div className="mt-5 pt-4 border-t flex flex-col sm:flex-row justify-end items-center gap-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="rounded-md border border-gray-300 hover:bg-gray-50 transition-colors w-full sm:w-auto"
            >
              Close
            </Button>
            <Button 
              onClick={handleUseTemplate} 
              disabled={isLoading} 
              className="bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-all w-full sm:w-auto"
            >
              Create Document
            </Button>
          </div>
        </DialogContent>
      </Draggable>
    </Dialog>
  );
};

export default PreviewTemplateModal;
