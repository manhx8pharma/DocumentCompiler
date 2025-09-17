import React from 'react';
import { FileText, MoreVertical, Eye, Edit, Copy, Trash2, FileSpreadsheet, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/utils';
import { Template } from '@shared/schema';

interface TemplateCardProps {
  template: Template;
  onUseTemplate: (templateUuid: string) => void;
  onPreviewTemplate: (templateUuid: string) => void;
  onEditTemplate?: (templateUuid: string) => void;
  onDuplicateTemplate?: (templateUuid: string) => void;
  onDeleteTemplate?: (templateUuid: string) => void;
  onExportExcel?: (templateUuid: string) => void;
  onBatchCreate?: (templateUuid: string) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onUseTemplate,
  onPreviewTemplate,
  onEditTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onExportExcel,
  onBatchCreate,
}) => {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-500" />
            <Badge variant={template.category as any} className="ml-2">
              {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
                <MoreVertical className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                {onExportExcel && (
                  <DropdownMenuItem onClick={() => onExportExcel(template.uuid)}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    <span>Xuất Excel mẫu</span>
                  </DropdownMenuItem>
                )}
                {onBatchCreate && (
                  <DropdownMenuItem onClick={() => onBatchCreate(template.uuid)}>
                    <Upload className="mr-2 h-4 w-4" />
                    <span>Tạo văn bản hàng loạt</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              {(onExportExcel || onBatchCreate) && (onEditTemplate || onDuplicateTemplate) && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuGroup>
                {onEditTemplate && (
                  <DropdownMenuItem onClick={() => onEditTemplate(template.uuid)}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Edit</span>
                  </DropdownMenuItem>
                )}
                {onDuplicateTemplate && (
                  <DropdownMenuItem onClick={() => onDuplicateTemplate(template.uuid)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Duplicate</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              {onDeleteTemplate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onDeleteTemplate(template.uuid)}
                    className="text-red-600 focus:text-red-500"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">{template.name}</h3>
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{template.description}</p>
        <div className="mt-4">
          <div className="text-xs text-gray-500">
            <span>Created: {formatDate(template.createdAt)}</span>
            <span className="mx-2">•</span>
            <span>Fields: {template.fieldCount}</span>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 px-5 py-3">
        <div className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-900 p-0 h-auto"
            onClick={() => onPreviewTemplate(template.uuid)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-blue-700 p-0 h-auto"
            onClick={() => onUseTemplate(template.uuid)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Create Document
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
