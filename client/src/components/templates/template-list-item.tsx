import React from 'react';
import { MoreVertical, FileText, Eye, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface TemplateListItemProps {
  template: Template;
  onUseTemplate: (templateUuid: string) => void;
  onPreviewTemplate: (templateUuid: string) => void;
  onEditTemplate?: (templateUuid: string) => void;
  onDuplicateTemplate?: (templateUuid: string) => void;
  onDeleteTemplate?: (templateUuid: string) => void;
  onExportExcel?: (templateUuid: string) => void;
  onBatchCreate?: (templateUuid: string) => void;
}

const TemplateListItem: React.FC<TemplateListItemProps> = ({
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
    <li className="px-6 py-4 flex items-center">
      <div className="min-w-0 flex-1 flex items-center">
        <div className="flex-shrink-0">
          <FileText className="h-10 w-10 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1 px-4">
          <div>
            <div className="flex items-center">
              <p className="text-sm font-medium text-primary truncate">{template.name}</p>
              <Badge variant={template.category as any} className="ml-2">
                {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500 truncate">{template.description}</p>
          </div>
        </div>
      </div>
      <div className="ml-4 flex-shrink-0 flex items-center space-x-4">
        <div className="text-sm text-gray-500">
          <span>Created: {formatDate(template.createdAt)}</span>
          <span className="mx-2">•</span>
          <span>Fields: {template.fieldCount}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreviewTemplate(template.uuid)}
        >
          Preview
        </Button>
        <Button
          size="sm"
          onClick={() => onUseTemplate(template.uuid)}
        >
          Use
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              {onExportExcel && (
                <DropdownMenuItem onClick={() => onExportExcel(template.uuid)} className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Xuất Excel mẫu
                </DropdownMenuItem>
              )}
              {onBatchCreate && (
                <DropdownMenuItem onClick={() => onBatchCreate(template.uuid)} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Tạo văn bản hàng loạt
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {(onExportExcel || onBatchCreate) && (onEditTemplate || onDuplicateTemplate) && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuGroup>
              {onEditTemplate && (
                <DropdownMenuItem onClick={() => onEditTemplate(template.uuid)}>
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicateTemplate && (
                <DropdownMenuItem onClick={() => onDuplicateTemplate(template.uuid)}>
                  Duplicate
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
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
};

export default TemplateListItem;
