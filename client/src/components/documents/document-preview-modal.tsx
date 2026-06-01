import React, { useState, useEffect, useRef } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, Eye, Grip } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import Draggable from 'react-draggable';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: {
    templateUuid: string;
    name: string;
    fields: { fieldName: string; fieldValue: string }[];
  } | null;
  onConfirm?: () => void;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  documentData,
  onConfirm
}) => {
  const { toast } = useToast();
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  
  // Fetch document preview when modal opens
  useEffect(() => {
    const fetchPreview = async () => {
      if (!isOpen || !documentData) return;
      
      setIsLoading(true);
      setError(null);
      setDocumentUrl(null);
      
      try {
        console.log('Fetching document preview with data:', documentData);
        
        const response = await fetch('/api/documents/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(documentData),
        });
        
        if (!response.ok) {
          console.error('Failed to fetch preview:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(errorText || 'Failed to generate document preview');
        }
        
        const data = await response.json();
        console.log('Preview data received:', data);
        
        if (data.previewHtml) {
          setPreviewHtml(data.previewHtml);
        } else {
          throw new Error('No preview content returned');
        }
      } catch (error) {
        console.error('Error fetching document preview:', error);
        setError(error instanceof Error ? error.message : 'Failed to load preview');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPreview();
  }, [isOpen, documentData]);
  
  // Handler to save the document to database and download it
  const handleGenerateDocument = async () => {
    if (!documentData) return;
    
    setIsGenerating(true);
    
    try {
      console.log('Creating document and saving to database:', documentData);
      
      // Use the document creation endpoint to save to database
      const saveResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentData),
      });
      
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        console.error('Server error response:', errorText);
        let errorMessage = 'Failed to save document';
        
        try {
          // Try to parse the error as JSON to get a better message
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch (e) {
          // If it's not valid JSON, use the raw error text
          errorMessage = errorText;
        }
        
        throw new Error(errorMessage);
      }
      
      // Get the saved document details with download URL
      const savedDocument = await saveResponse.json();
      console.log('Document saved successfully:', savedDocument);
      
      // Download the document using the download URL
      const downloadResponse = await fetch(savedDocument.downloadUrl);
      
      if (!downloadResponse.ok) {
        throw new Error('Failed to download the saved document');
      }
      
      // Get document as blob and download it
      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const filename = documentData.name.endsWith('.docx') ? 
        documentData.name : 
        `${documentData.name}.docx`;
        
      // Create download link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Document saved to database and downloaded successfully!",
        variant: "default"
      });
      
      setDocumentUrl(savedDocument.downloadUrl); // Store URL for reference
      
      // Optional callback
      if (onConfirm) {
        onConfirm();
      }
      
    } catch (error) {
      console.error('Document creation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate document. Please try again.",
        variant: "destructive",
      });
      setError(error instanceof Error ? error.message : 'Failed to generate document');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Handler to download the generated document
  const handleDownloadDocument = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };
  
  // Original callback for backward compatibility
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };
  
  const nodeRef = useRef(null);
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Draggable handle=".drag-handle" bounds="body" nodeRef={nodeRef}>
        <DialogContent 
          ref={nodeRef} 
          className="sm:max-w-2xl md:max-w-4xl lg:max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-lg shadow-lg"
          aria-describedby="document-preview-description"
        >
          <DialogHeader className="pb-4 border-b cursor-move drag-handle">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <FileText className="h-6 w-6 text-blue-600" />
                Document Preview
              </DialogTitle>
              <Grip className="h-5 w-5 text-gray-400" />
            </div>
            <DialogDescription id="document-preview-description" className="text-base text-gray-600">
              {documentData ? `Preview of "${documentData.name}" before saving to database.` : 'Loading preview...'}
            </DialogDescription>
          </DialogHeader>
        
          <div className="flex-1 overflow-hidden bg-gray-50 border rounded-md shadow-sm my-4">
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-64 mb-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full mt-6" />
                <Skeleton className="h-4 w-full mt-6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : error ? (
              <div className="p-6 flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
                <h3 className="text-lg font-medium mb-2 text-red-600">Error Generating Preview</h3>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            ) : (
              <div 
                className="p-6 h-[min(60vh,500px)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                style={{ 
                  lineHeight: '1.6',
                  fontSize: '14px'
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }} 
              />
            )}
          </div>
          
          <div className="mt-5 pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="rounded-md border border-gray-300 hover:bg-gray-50 transition-colors w-full sm:w-auto"
            >
              Cancel
            </Button>
            
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
              {/* Document has been generated and can be downloaded */}
              {documentUrl && (
                <Button 
                  variant="default"
                  onClick={handleDownloadDocument}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-md shadow-sm transition-all w-full sm:w-auto"
                >
                  <Download className="h-5 w-5" />
                  Download Document
                </Button>
              )}
              
              {/* Generate button - either creates for the first time or regenerates */}
              <Button 
                variant="default"
                onClick={handleGenerateDocument}
                disabled={isLoading || isGenerating || !!error}
                className={`gap-2 ${documentUrl ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'} text-white font-medium px-6 py-2 rounded-md shadow-sm transition-all w-full sm:w-auto`}
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin mr-1">&#9696;</span>
                    Generating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    {documentUrl ? 'Regenerate Document' : 'Save & Download Document'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Draggable>
    </Dialog>
  );
};

export default DocumentPreviewModal;