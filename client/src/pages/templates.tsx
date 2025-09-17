import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TemplateFilters from '@/components/templates/template-filters';
import TemplateGrid from '@/components/templates/template-grid';
import TemplateList from '@/components/templates/template-list';
import UploadTemplateModal from '@/components/templates/upload-template-modal';
import PreviewTemplateModal from '@/components/templates/preview-template-modal';
import CreateDocumentModal from '@/components/documents/create-document-modal';
import { NewBatchCreateModal } from '@/components/templates/new-batch-create-modal';
import { useToast } from '@/hooks/use-toast';
import { Template } from '@shared/schema';

const TemplatesPage: React.FC = () => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  
  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isCreateDocumentModalOpen, setIsCreateDocumentModalOpen] = useState(false);
  const [isBatchCreateModalOpen, setIsBatchCreateModalOpen] = useState(false);
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');

  // Fetch templates
  const { data: templates = [], isLoading, isError } = useQuery<Template[]>({
    queryKey: ['/api/templates', searchQuery, categoryFilter, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      params.append('sort', sortOrder);
      
      const response = await fetch(`/api/templates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const filteredTemplates = templates;

  // Modal handlers
  const handleUploadTemplate = () => {
    setIsUploadModalOpen(true);
  };

  const handlePreviewTemplate = (templateUuid: string) => {
    // Navigate to template preview page using UUID
    window.location.href = `/template-preview/${templateUuid}`;
  };

  const handleUseTemplate = (templateUuid: string) => {
    // Navigate to document creation page using UUID
    window.location.href = `/document-create/${templateUuid}`;
  };

  const handleDeleteTemplate = async (templateUuid: string) => {
    try {
      // Ask user for action preference
      const action = window.confirm(
        'How would you like to handle this template?\n\nOK = Archive (recommended - keeps data safe)\nCancel = Permanently delete'
      );
      
      if (action) {
        // Archive template
        const response = await fetch(`/api/templates/uuid/${templateUuid}?archive=true`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to archive template');
        }
      } else {
        // Try permanent delete
        let response = await fetch(`/api/templates/uuid/${templateUuid}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          
          // If error mentions cascade delete, show confirmation dialog
          if (errorData.message && errorData.message.includes('cascade delete')) {
            const cascadeConfirm = window.confirm(
              `${errorData.message}\n\nDo you want to force delete this template and all related data? This action cannot be undone.`
            );
            
            if (cascadeConfirm) {
              // Try cascade delete
              response = await fetch(`/api/templates/uuid/${templateUuid}?cascade=true`, {
                method: 'DELETE',
              });
              
              if (!response.ok) {
                throw new Error('Failed to delete template with cascade');
              }
            } else {
              return; // User cancelled
            }
          } else {
            throw new Error(errorData.message || 'Failed to delete template');
          }
        }
      }
      
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      
      // Refetch templates
      window.location.reload();
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
      const response = await fetch(`/api/templates/uuid/${templateUuid}/export-excel`);
      if (!response.ok) {
        throw new Error('Failed to export Excel template');
      }

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

      toast({
        title: "Thành công",
        description: "File Excel đã được tải xuống",
      });
    } catch (error) {
      console.error('Export Excel error:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xuất file Excel. Vui lòng thử lại.",
        variant: "destructive",
      });
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
      {/* Page header */}
      <div className="px-4 sm:px-6 md:px-8 mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <div className="flex">
          <Button onClick={handleUploadTemplate}>
            <FileUp className="mr-2 h-5 w-5" />
            Upload Template
          </Button>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="px-4 sm:px-6 md:px-8 mb-6">
        <TemplateFilters
          onSearch={setSearchQuery}
          onCategoryChange={setCategoryFilter}
          onSortChange={setSortOrder}
          onViewChange={setViewMode}
          viewMode={viewMode}
        />
      </div>

      {/* Templates View */}
      <div className="px-4 sm:px-6 md:px-8">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-gray-500">Loading templates...</span>
          </div>
        ) : isError ? (
          <div className="flex justify-center items-center py-12">
            <span className="text-red-500">Error loading templates. Please try again.</span>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <TemplateGrid
              templates={filteredTemplates}
              onUseTemplate={handleUseTemplate}
              onPreviewTemplate={handlePreviewTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onExportExcel={handleExportExcel}
              onBatchCreate={handleBatchCreate}
            />
          ) : (
            <TemplateList
              templates={filteredTemplates}
              onUseTemplate={handleUseTemplate}
              onPreviewTemplate={handlePreviewTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onExportExcel={handleExportExcel}
              onBatchCreate={handleBatchCreate}
            />
          )
        )}
      </div>

      {/* Modals */}
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
