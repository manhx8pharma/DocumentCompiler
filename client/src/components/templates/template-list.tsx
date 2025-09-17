import React from 'react';
import TemplateListItem from './template-list-item';
import { Template } from '@shared/schema';

interface TemplateListProps {
  templates: Template[];
  onUseTemplate: (templateUuid: string) => void;
  onPreviewTemplate: (templateUuid: string) => void;
  onEditTemplate?: (templateUuid: string) => void;
  onDuplicateTemplate?: (templateUuid: string) => void;
  onDeleteTemplate?: (templateUuid: string) => void;
  onExportExcel?: (templateUuid: string) => void;
  onBatchCreate?: (templateUuid: string) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({
  templates,
  onUseTemplate,
  onPreviewTemplate,
  onEditTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onExportExcel,
  onBatchCreate,
}) => {
  if (templates.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-600">No templates found</h3>
        <p className="mt-2 text-sm text-gray-500">Upload a new template to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden rounded-md">
      <ul className="divide-y divide-gray-200">
        {templates.map((template) => (
          <TemplateListItem
            key={template.id}
            template={template}
            onUseTemplate={onUseTemplate}
            onPreviewTemplate={onPreviewTemplate}
            onEditTemplate={onEditTemplate}
            onDuplicateTemplate={onDuplicateTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onExportExcel={onExportExcel}
            onBatchCreate={onBatchCreate}
          />
        ))}
      </ul>
    </div>
  );
};

export default TemplateList;
