import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Search, RefreshCw, ChevronLeft, ChevronRight, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import TemplateGrid from '@/components/templates/template-grid';
import TemplateList from '@/components/templates/template-list';
import UploadTemplateModal from '@/components/templates/upload-template-modal';
import PreviewTemplateModal from '@/components/templates/preview-template-modal';
import CreateDocumentModal from '@/components/documents/create-document-modal';
import { NewBatchCreateModal } from '@/components/templates/new-batch-create-modal';
import { useToast } from '@/hooks/use-toast';
import { Template } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface TemplatesResponse {
  templates: Template[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  stats: {
    total: number;
    active: number;
    archived: number;
  };
}

const TemplatesPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isCreateDocumentModalOpen, setIsCreateDocumentModalOpen] = useState(false);
  const [isBatchCreateModalOpen, setIsBatchCreateModalOpen] = useState(false);
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [isHiddenDialogOpen, setIsHiddenDialogOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<TemplatesResponse>({
    queryKey: ['/api/templates', debouncedSearchQuery, categoryFilter, sortOrder, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.append('search', debouncedSearchQuery);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      params.append('sort', sortOrder);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      
      const response = await fetch(`/api/templates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const { data: hiddenData, isLoading: isLoadingHidden } = useQuery<TemplatesResponse>({
    queryKey: ['/api/templates', 'archived'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('archived', 'true');
      params.append('limit', '200');
      const response = await fetch(`/api/templates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch hidden templates');
      return response.json();
    },
    enabled: isHiddenDialogOpen,
  });

  const templates = data?.templates || [];
  const pagination = data?.pagination || { page: 1, limit: pageSize, total: 0 };
  const stats = data?.stats || { total: 0, active: 0, archived: 0 };
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const hiddenTemplates = hiddenData?.templates || [];

  const archiveMutation = useMutation({
    mutationFn: async (templateUuid: string) => {
      const res = await apiRequest('PUT', `/api/templates/${templateUuid}/archive`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Thành công", description: "Template đã được ẩn" });
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (templateUuid: string) => {
      const res = await apiRequest('PUT', `/api/templates/${templateUuid}/unarchive`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Thành công", description: "Template đã được hiện lại" });
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleCategoryChange = (category: string) => {
    setCategoryFilter(category);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: string) => {
    setSortOrder(sort);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setCurrentPage(1);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleUploadTemplate = () => {
    setIsUploadModalOpen(true);
  };

  const handlePreviewTemplate = (templateUuid: string) => {
    window.location.href = `/template-preview/${templateUuid}`;
  };

  const handleUseTemplate = (templateUuid: string) => {
    window.location.href = `/document-create/${templateUuid}`;
  };

  const handleArchiveTemplate = (templateUuid: string) => {
    const template = templates.find(t => t.uuid === templateUuid);
    const confirmHide = window.confirm(
      `Bạn có muốn ẩn template "${template?.name || ''}"? Template sẽ không hiển thị trong danh sách chính nhưng vẫn có thể hiện lại.`
    );
    if (confirmHide) {
      archiveMutation.mutate(templateUuid);
    }
  };

  const handleUnarchiveTemplate = (templateUuid: string) => {
    unarchiveMutation.mutate(templateUuid);
  };

  const handleDeleteTemplate = async (templateUuid: string) => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this template? This action cannot be undone.'
    );
    
    if (!confirmDelete) return;
    
    try {
      let response = await fetch(`/api/templates/${templateUuid}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 409 && errorData.documentCount > 0) {
          const forceConfirm = window.confirm(
            `This template has ${errorData.documentCount} linked document(s).\n\n${errorData.hint}\n\nDo you want to force delete?`
          );
          
          if (forceConfirm) {
            response = await fetch(`/api/templates/${templateUuid}?force=true`, {
              method: 'DELETE',
            });
            
            if (!response.ok) throw new Error('Failed to force delete template');
          } else {
            return;
          }
        } else {
          throw new Error(errorData.message || 'Failed to delete template');
        }
      }
      
      toast({ title: "Success", description: "Template deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = async (templateUuid: string) => {
    try {
      const response = await fetch(`/api/templates/${templateUuid}/export-excel`);
      if (!response.ok) throw new Error('Failed to export Excel template');

      const blob = await response.blob();
      const template = templates.find(t => t.uuid === templateUuid);
      const fileName = `Template_${template?.name || 'Unknown'}_DataEntry.xlsx`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Thành công", description: "File Excel đã được tải xuống" });
    } catch (error) {
      console.error('Export Excel error:', error);
      toast({ title: "Lỗi", description: "Không thể xuất file Excel. Vui lòng thử lại.", variant: "destructive" });
    }
  };

  const handleBatchCreate = (templateUuid: string) => {
    const template = templates.find(t => t.uuid === templateUuid);
    setSelectedTemplateUuid(templateUuid);
    setSelectedTemplateName(template?.name || '');
    setIsBatchCreateModalOpen(true);
  };

  return (
    <div className="py-6">
      <div className="px-4 sm:px-6 md:px-8 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
            <p className="mt-1 text-sm text-gray-500">
              {stats.active} template{stats.active !== 1 ? 's' : ''} đang hiện
              {stats.archived > 0 && (
                <span className="text-orange-500 ml-1">
                  • {stats.archived} đang ẩn
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-2">
            {stats.archived > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsHiddenDialogOpen(true)}
                className="text-orange-600 border-orange-200 hover:bg-orange-50 flex items-center gap-1"
              >
                <Eye className="h-4 w-4" />
                Hiện template ẩn ({stats.archived})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="text-gray-600 flex items-center gap-1"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleUploadTemplate}>
              <FileUp className="mr-2 h-5 w-5" />
              Upload Template
            </Button>
          </div>
        </div>
      </div>

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
                    placeholder="Search templates by name..."
                    className="pl-10 pr-3 py-2"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex space-x-2">
                <Select onValueChange={handleCategoryChange} value={categoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="financial">Financial</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select onValueChange={handleSortChange} value={sortOrder}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="latest">Latest</SelectItem>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="modified">Last Modified</SelectItem>
                  </SelectContent>
                </Select>
                
                <div className="flex items-center border border-gray-200 rounded-md bg-white">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`px-3 rounded-r-none ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}
                    onClick={() => setViewMode('grid')}
                  >
                    Grid
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`px-3 rounded-l-none ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
                    onClick={() => setViewMode('list')}
                  >
                    List
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 sm:px-6 md:px-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 rounded-full border-t-blue-600 mb-4"></div>
            <span className="text-gray-500">Loading templates...</span>
          </div>
        ) : isError ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-red-500">Error loading templates. Please try again.</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileUp className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-800 mb-1">No templates found</p>
            <p className="text-gray-500 mb-6 max-w-md text-center">
              {searchQuery || categoryFilter !== 'all' 
                ? "Try adjusting your search or filter criteria" 
                : "Upload a template to get started"}
            </p>
            {searchQuery || categoryFilter !== 'all' ? (
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setCurrentPage(1);
                }}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Clear filters
              </Button>
            ) : (
              <Button onClick={handleUploadTemplate}>
                <FileUp className="mr-2 h-5 w-5" />
                Upload Template
              </Button>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <TemplateGrid
                templates={templates}
                onUseTemplate={handleUseTemplate}
                onPreviewTemplate={handlePreviewTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onExportExcel={handleExportExcel}
                onBatchCreate={handleBatchCreate}
                onArchiveTemplate={handleArchiveTemplate}
              />
            ) : (
              <TemplateList
                templates={templates}
                onUseTemplate={handleUseTemplate}
                onPreviewTemplate={handlePreviewTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onExportExcel={handleExportExcel}
                onBatchCreate={handleBatchCreate}
                onArchiveTemplate={handleArchiveTemplate}
              />
            )}
            
            <div className="mt-6 border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Hiển thị</span>
                <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="24">24</SelectItem>
                    <SelectItem value="48">48</SelectItem>
                    <SelectItem value="96">96</SelectItem>
                  </SelectContent>
                </Select>
                <span>/ trang</span>
                <span className="mx-2 text-gray-400">|</span>
                <span>
                  Tổng: <strong>{pagination.total}</strong> template
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  Trang {currentPage} / {Math.max(1, totalPages)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage <= 1 || isLoading}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages || isLoading}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={isHiddenDialogOpen} onOpenChange={setIsHiddenDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-orange-500" />
              Template đang ẩn
            </DialogTitle>
            <DialogDescription>
              Danh sách các template đang bị ẩn. Nhấn "Hiện lại" để đưa template trở lại danh sách chính.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {isLoadingHidden ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-4 border-blue-200 rounded-full border-t-blue-600"></div>
                <span className="ml-2 text-gray-500">Đang tải...</span>
              </div>
            ) : hiddenTemplates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Không có template nào đang ẩn
              </div>
            ) : (
              hiddenTemplates.map((template) => (
                <div
                  key={template.uuid}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {template.name}
                      </p>
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {template.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {template.description || 'No description'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 flex items-center gap-1 flex-shrink-0"
                    onClick={() => handleUnarchiveTemplate(template.uuid)}
                    disabled={unarchiveMutation.isPending}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Hiện lại
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UploadTemplateModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
      
      <PreviewTemplateModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        templateId={selectedTemplateUuid}
        onUseTemplate={handleUseTemplate}
      />
      
      <CreateDocumentModal
        isOpen={isCreateDocumentModalOpen}
        onClose={() => setIsCreateDocumentModalOpen(false)}
        templateId={selectedTemplateUuid}
      />
      
      <NewBatchCreateModal
        isOpen={isBatchCreateModalOpen}
        onClose={() => setIsBatchCreateModalOpen(false)}
        templateId={selectedTemplateUuid || ''}
        templateName={selectedTemplateName}
      />
    </div>
  );
};

export default TemplatesPage;
