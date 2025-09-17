import React, { useState, useEffect } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { Document } from '@shared/schema';
// No longer need hash-id functions with UUID-based identification

const DocumentPreviewPage: React.FC = () => {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [location, setLocation] = useLocation();
  const [, params] = useRoute('/document-preview/:id');
  const documentId = params?.id || null;

  // Fetch document details
  const { 
    data: document, 
    isLoading: isLoadingDocument,
    error: documentError,
    isError: isDocumentError
  } = useQuery<Document>({
    queryKey: ['/api/documents', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      
      // Using UUID-based route for documents
      const response = await fetch(`/api/documents/uuid/${documentId}`);
      
      if (response.status === 404) {
        // Fall back to legacy ID-based route if UUID route fails
        console.log('Document not found by UUID, trying legacy ID route');
        const legacyResponse = await fetch(`/api/documents/${documentId}`);
        
        if (legacyResponse.status === 404) {
          throw new Error('Document not found');
        }
        
        if (!legacyResponse.ok) {
          console.error(`Error fetching document: ${legacyResponse.status} ${legacyResponse.statusText}`);
          throw new Error('Failed to fetch document');
        }
        
        return legacyResponse.json();
      }
      
      if (!response.ok) {
        console.error(`Error fetching document: ${response.status} ${response.statusText}`);
        throw new Error('Failed to fetch document');
      }
      
      return response.json();
    },
    enabled: !!documentId,
    retry: (failureCount, error) => {
      // Don't retry if document not found (404)
      if (error instanceof Error && error.message === 'Document not found') {
        return false;
      }
      // Otherwise retry up to 2 times
      return failureCount < 2;
    }
  });

  // Fetch document preview HTML
  const { 
    data: previewHtml, 
    isLoading: isLoadingPreview,
    error: previewError,
    isError: isPreviewError
  } = useQuery<string>({
    queryKey: ['/api/documents/preview', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');
      
      // Try UUID-based preview first
      let response = await fetch(`/api/documents/uuid/${documentId}/preview`);
      
      // Fall back to legacy ID-based route if UUID route fails
      if (response.status === 404) {
        console.log('Document preview not found with UUID, trying legacy route');
        response = await fetch(`/api/documents/${documentId}/preview`);
        
        if (response.status === 404) {
          throw new Error('Document preview not found');
        }
      }
      
      if (!response.ok) {
        console.error(`Error fetching preview: ${response.status} ${response.statusText}`);
        throw new Error('Failed to fetch document preview');
      }
      
      const html = await response.text();
      return html;
    },
    enabled: !!documentId && !isDocumentError, // Only fetch preview if document exists
    retry: (failureCount, error) => {
      // Don't retry if document preview not found
      if (error instanceof Error && error.message === 'Document preview not found') {
        return false;
      }
      // Otherwise retry up to 2 times
      return failureCount < 2;
    }
  });

  const isLoading = isLoadingDocument || isLoadingPreview;

  // Handle document download
  const handleDownload = async () => {
    if (!documentId) return;
    
    try {
      setIsDownloading(true);
      
      // Try UUID-based download first
      let response = await fetch(`/api/documents/uuid/${documentId}/download`);
      
      // Fall back to legacy ID-based route if UUID route fails
      if (response.status === 404) {
        console.log('Document download route not found with UUID, trying legacy route');
        response = await fetch(`/api/documents/${documentId}/download`);
      }
      
      if (!response.ok) throw new Error('Failed to download document');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const filename = document?.name && document.name.endsWith('.docx') 
        ? document.name 
        : `${document?.name || 'document'}.docx`;
      
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Document downloaded successfully",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle back to documents
  const handleBackToDocuments = () => {
    setLocation('/documents');
  };

  // If no document ID is provided, redirect to documents page
  useEffect(() => {
    if (!documentId) {
      setLocation('/documents');
    }
  }, [documentId, setLocation]);



  // Create document error message based on the error
  const getErrorMessage = () => {
    if (documentError instanceof Error) {
      if (documentError.message === 'Document not found') {
        return {
          title: 'Document Not Found',
          description: 'The document you are looking for does not exist or may have been deleted. Please go back to the documents page and try again.',
        };
      }
    }
    return {
      title: 'Error Loading Document',
      description: 'There was an error loading this document. Please try again later or contact support if the problem persists.',
    };
  };

  // Redirect to documents page after delay when document not found
  useEffect(() => {
    if (isDocumentError && documentError instanceof Error && documentError.message === 'Document not found') {
      const timer = setTimeout(() => {
        toast({
          title: 'Redirecting to Documents',
          description: 'You are being redirected to the documents page.',
        });
        setLocation('/documents');
      }, 5000); // 5 second delay before redirect
      
      return () => clearTimeout(timer);
    }
  }, [isDocumentError, documentError, setLocation, toast]);

  return (
    <div className="py-6 px-4 sm:px-6 md:px-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleBackToDocuments}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </Button>
          
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            {isLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              document?.name || 'Document Preview'
            )}
          </h1>
        </div>
        
        {!isDocumentError && (
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={isLoading || isDownloading || isDocumentError}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isDownloading ? 'Downloading...' : 'Download Document'}
            </Button>
          </div>
        )}
      </div>
      
      {/* Error message when document not found or error */}
      {isDocumentError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{getErrorMessage().title}</AlertTitle>
          <AlertDescription>
            {getErrorMessage().description}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Document details card */}
      {!isLoading && !isDocumentError && document && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Document Name</p>
                <p className="text-base font-medium">{document.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Created</p>
                <p className="text-base">{formatDate(document.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <p className="text-base flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Saved to Database</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Document preview */}
      {!isDocumentError && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader className="bg-gray-50 border-b px-6 py-4">
            <CardTitle className="text-lg font-medium">Document Preview</CardTitle>
            <CardDescription>
              Preview how your document will look when downloaded
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
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
                {isPreviewError ? (
                  <div className="flex flex-col items-center justify-center p-8">
                    <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Preview Unavailable</h3>
                    <p className="text-gray-500 text-center mb-4">
                      We couldn't generate a preview for this document. You can still download it to view its contents.
                    </p>
                  </div>
                ) : (
                  <div className="w-full max-w-6xl mx-auto">
                    <div 
                      className="bg-white border shadow-sm rounded overflow-hidden mx-auto"
                      style={{
                        width: 'min(210mm, 100%)',
                        height: '80vh', // Fixed height for scrolling
                        padding: '3mm',
                        boxSizing: 'border-box',
                        margin: '0 auto',
                        position: 'relative',
                        boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div 
                        className="document-content h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                        style={{ 
                          padding: '0',
                          lineHeight: '1.6',
                          fontSize: '14px'
                        }}
                        dangerouslySetInnerHTML={{ __html: previewHtml || '' }} 
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentPreviewPage;