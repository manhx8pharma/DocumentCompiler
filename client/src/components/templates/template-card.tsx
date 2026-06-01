import React from 'react';
import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  onArchiveTemplate?: (templateUuid: string) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onUseTemplate,
  onPreviewTemplate,
  onDeleteTemplate,
  onExportExcel,
  onBatchCreate,
  onArchiveTemplate,
}) => {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              {template.category}
            </Badge>
            {onArchiveTemplate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                onClick={() => onArchiveTemplate(template.uuid)}
                title="Ẩn template"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">
          {template.description || 'No description'}
        </p>
        <div className="text-xs text-gray-400">
          Created: {formatDate(template.createdAt)}
        </div>
      </div>
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 h-auto"
            onClick={() => onPreviewTemplate(template.uuid)}
          >
            Preview
          </Button>
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1 h-auto"
            onClick={() => onUseTemplate(template.uuid)}
          >
            Create Document
          </Button>
          {onBatchCreate && (
            <Button
              size="sm"
              className="bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1 h-auto"
              onClick={() => onBatchCreate(template.uuid)}
            >
              Batch Create
            </Button>
          )}
          {onExportExcel && (
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 h-auto"
              onClick={() => onExportExcel(template.uuid)}
            >
              Excel Template
            </Button>
          )}
          {onDeleteTemplate && (
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1 h-auto"
              onClick={() => onDeleteTemplate(template.uuid)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
