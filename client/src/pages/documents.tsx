import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Eye, Trash2, Search, Plus, RefreshCw, Clipboard, Filter, Edit } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { Document, Template } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BulkDeleteModal } from '@/components/documents/bulk-delete-modal';

const DocumentsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Fetch documents
  const { data: documents = [], isLoading: isLoadingDocuments, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: ['/api/documents', searchQuery, templateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (templateFilter !== 'all') params.append('templateId', templateFilter);
      
      const response = await fetch(`/api/documents?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
  });

  // Fetch document statistics
  const { data: documentStats } = useQuery({
    queryKey: ['/api/documents/stats'],
    queryFn: async () => {
      const response = await fetch('/api/documents/stats');
      if (!response.ok) throw new Error('Failed to fetch document statistics');
      return response.json();
    },
  });

  // Fetch templates for filter dropdown
  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Handle document download
  const handleDownload = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.uuid}/download`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download document: ${response.status} - ${errorText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.name}.docx`;
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
        description: error instanceof Error ? error.message : "Failed to download document",
        variant: "destructive",
      });
    }
  };

  // Handle document preview in modal with A4 formatting
  const handlePreviewInModal = async (document: Document) => {
    try {
      setIsPreviewLoading(true);
      setPreviewDocument(document);
      setIsPreviewModalOpen(true);
      
      // Get document preview with A4 formatting
      const response = await fetch(`/api/documents/${document.uuid}/preview`);
      if (!response.ok) throw new Error('Failed to preview document');
      
      // Get the HTML content and apply additional A4 formatting if needed
      const html = await response.text();
      
      // Set the preview HTML for display
      setPreviewHtml(html);
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Error",
        description: "Failed to preview document",
        variant: "destructive",
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Handle document preview in new window
  const handleExternalPreview = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.uuid}/preview`);
      if (!response.ok) throw new Error('Failed to preview document');
      
      // Open preview in a new window
      const html = await response.text();
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
      } else {
        toast({
          title: "Warning",
          description: "Please allow pop-ups to view document preview",
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Error",
        description: "Failed to preview document",
        variant: "destructive",
      });
    }
  };

  // Handle document deletion
  const handleDelete = async (documentUuid: string) => {
    if (window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      try {
        const response = await fetch(`/api/documents/${documentUuid}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete document');
        
        toast({
          title: "Success",
          description: "Document deleted successfully",
        });
        
        // Refetch documents
        refetchDocuments();
        queryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
      } catch (error) {
        console.error('Delete error:', error);
        toast({
          title: "Error",
          description: "Failed to delete document",
          variant: "destructive",
        });
      }
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    refetchDocuments();
    queryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
  };

  const isDataLoading = isLoadingDocuments || isLoadingTemplates;
  const totalDocuments = documentStats?.total || 0;

  return (
    <div className="py-6">
      {/* Page header */}
      <div className="px-4 sm:px-6 md:px-8 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
            <p className="mt-1 text-sm text-gray-500">
              {totalDocuments} total document{totalDocuments !== 1 ? 's' : ''} stored in your database
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-2">
            <BulkDeleteModal>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <Trash2 className="h-4 w-4" />
                Bulk Delete
              </Button>
            </BulkDeleteModal>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="text-gray-600 flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="px-4 sm:px-6 md:px-8 mb-6">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
              <div className="flex-1 min-w-0">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Search documents by name..."
                    className="pl-10 pr-3 py-2"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Filter className="h-4 w-4 text-gray-400" />
                  </div>
                  <Select 
                    onValueChange={setTemplateFilter} 
                    defaultValue="all"
                  >
                    <SelectTrigger className="w-[220px] pl-9">
                      <SelectValue placeholder="Filter by template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Templates</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents table */}
      <div className="px-4 sm:px-6 md:px-8">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Document Name</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isDataLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600 mb-4"></div>
                        <p className="text-gray-500">Loading documents...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="h-12 w-12 text-gray-300 mb-4" />
                        <p className="text-lg font-medium text-gray-800 mb-1">No documents found</p>
                        <p className="text-gray-500 mb-6 max-w-md text-center">
                          {searchQuery || templateFilter !== 'all' 
                            ? "Try adjusting your search or filter criteria" 
                            : "Create a document from a template to get started"}
                        </p>
                        {searchQuery || templateFilter !== 'all' ? (
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSearchQuery('');
                              setTemplateFilter('all');
                            }}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Clear filters
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((document) => {
                    // Find template by UUID
                    const template = templates.find(t => t.uuid === document.templateId);
                    const templateName = template?.name || 'Unknown Template';
                    const templateCategory = template?.category || 'other';
                    
                    return (
                      <TableRow key={document.uuid || document.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                            <span className="truncate">{document.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline"
                              className={`bg-${getCategoryColor(templateCategory)}-50 text-${getCategoryColor(templateCategory)}-700 border-${getCategoryColor(templateCategory)}-200 px-2 py-1 text-xs`}
                            >
                              {templateCategory}
                            </Badge>
                            <span className="text-sm truncate">{templateName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(document.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.location.href = `/document-update/${document.uuid}`}
                                    className="h-8 w-8 p-0 flex items-center justify-center"
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit document</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(document)}
                                    className="h-8 w-8 p-0 flex items-center justify-center"
                                  >
                                    <Download className="h-4 w-4" />
                                    <span className="sr-only">Download</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Download document</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <span className="sr-only">Open menu</span>
                                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                                    <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                                  </svg>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => window.open(`/document-update/${document.uuid}`, '_blank')}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit in new window
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownload(document)}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(document.uuid)}
                                  className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Document Preview Modal */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-blue-600" />
              {previewDocument?.name}
            </DialogTitle>
            <DialogDescription>
              Preview of your saved document in A4 format
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 mt-4 flex justify-center">
            {isPreviewLoading ? (
              <div className="h-full w-full flex items-center justify-center p-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600"></div>
              </div>
            ) : (
              <div className="a4-preview-container h-[65vh] w-full flex justify-center">
                <div 
                  className="a4-paper bg-white border shadow-sm rounded overflow-hidden"
                  style={{
                    width: 'min(210mm, 95vw)',
                    height: '100%',
                    padding: '3mm',
                    boxSizing: 'border-box',
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
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsPreviewModalOpen(false)}
            >
              Close
            </Button>
            {previewDocument && (
              <Button
                onClick={() => previewDocument && handleDownload(previewDocument)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentsPage;