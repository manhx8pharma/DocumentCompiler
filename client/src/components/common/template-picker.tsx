import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, X, Loader2, CheckSquare } from 'lucide-react';

interface Template {
  uuid: string;
  name: string;
  category?: string;
}

interface TemplatePickerProps {
  selectedTemplates: string[];
  onSelectionChange: (templateUuids: string[]) => void;
  pageSize?: number;
}

interface TemplatesResponse {
  templates: Template[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function TemplatePicker({ 
  selectedTemplates, 
  onSelectionChange,
  pageSize = 8
}: TemplatePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTemplateNames, setSelectedTemplateNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ['/api/templates', 'picker', debouncedSearch, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      
      const response = await fetch(`/api/templates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const templates = data?.templates || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;
  const totalTemplates = pagination?.total || 0;

  useEffect(() => {
    templates.forEach(t => {
      if (selectedTemplates.includes(t.uuid)) {
        setSelectedTemplateNames(prev => new Map(prev).set(t.uuid, t.name));
      }
    });
  }, [templates, selectedTemplates]);

  const toggleTemplate = (templateUuid: string, templateName: string) => {
    if (selectedTemplates.includes(templateUuid)) {
      onSelectionChange(selectedTemplates.filter(id => id !== templateUuid));
      setSelectedTemplateNames(prev => {
        const newMap = new Map(prev);
        newMap.delete(templateUuid);
        return newMap;
      });
    } else {
      onSelectionChange([...selectedTemplates, templateUuid]);
      setSelectedTemplateNames(prev => new Map(prev).set(templateUuid, templateName));
    }
  };

  const selectAllOnPage = () => {
    const allUuids = templates.map(t => t.uuid);
    const combined = [...selectedTemplates, ...allUuids];
    const newSelection = combined.filter((id, index) => combined.indexOf(id) === index);
    onSelectionChange(newSelection);
    
    templates.forEach(t => {
      setSelectedTemplateNames(prev => new Map(prev).set(t.uuid, t.name));
    });
  };

  const deselectAllOnPage = () => {
    const currentUuids = templates.map(t => t.uuid);
    onSelectionChange(selectedTemplates.filter(id => !currentUuids.includes(id)));
  };

  const selectAllMatching = async () => {
    if (!totalTemplates) return;
    
    setIsSelectingAll(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('limit', totalTemplates.toString());
      
      const response = await fetch(`/api/templates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      const result: TemplatesResponse = await response.json();
      
      if (result.templates) {
        const allUuids = result.templates.map(t => t.uuid);
        const combined = [...selectedTemplates, ...allUuids];
        const newSelection = combined.filter((id, index) => combined.indexOf(id) === index);
        onSelectionChange(newSelection);
        
        result.templates.forEach(t => {
          setSelectedTemplateNames(prev => new Map(prev).set(t.uuid, t.name));
        });
      }
    } finally {
      setIsSelectingAll(false);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
    setSelectedTemplateNames(new Map());
  };

  const removeSelected = (uuid: string) => {
    onSelectionChange(selectedTemplates.filter(id => id !== uuid));
    setSelectedTemplateNames(prev => {
      const newMap = new Map(prev);
      newMap.delete(uuid);
      return newMap;
    });
  };

  const selectedOnCurrentPage = templates.filter(t => selectedTemplates.includes(t.uuid)).length;
  const allSelectedOnPage = selectedOnCurrentPage === templates.length && templates.length > 0;

  const selectedNotOnPage = selectedTemplates.filter(
    uuid => !templates.some(t => t.uuid === uuid)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">Filter by Templates</label>
        {selectedTemplates.length > 0 && (
          <Badge variant="secondary" className="flex items-center gap-1">
            {selectedTemplates.length} selected
            <button onClick={clearAll} className="ml-1 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search templates..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {selectedNotOnPage.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <div className="text-xs text-blue-700 mb-1">Selected from other pages:</div>
          <div className="flex flex-wrap gap-1">
            {selectedNotOnPage.slice(0, 5).map(uuid => (
              <Badge key={uuid} variant="outline" className="text-xs flex items-center gap-1">
                {selectedTemplateNames.get(uuid) || 'Template'}
                <button onClick={() => removeSelected(uuid)} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedNotOnPage.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{selectedNotOnPage.length - 5} more
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="border rounded-lg">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-page"
                checked={allSelectedOnPage}
                onCheckedChange={() => allSelectedOnPage ? deselectAllOnPage() : selectAllOnPage()}
              />
              <label htmlFor="select-page" className="text-xs text-gray-600 cursor-pointer">
                Page
              </label>
            </div>
            {totalTemplates > pageSize && (
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAllMatching}
                disabled={isSelectingAll}
                className="h-6 text-xs px-2"
              >
                {isSelectingAll ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckSquare className="h-3 w-3 mr-1" />
                )}
                All {totalTemplates}
              </Button>
            )}
          </div>
          {pagination && (
            <span className="text-xs text-gray-500">
              {totalTemplates} templates
            </span>
          )}
        </div>

        <div className="max-h-48 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">
              {debouncedSearch ? 'No templates found' : 'No templates available'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {templates.map((template) => (
                <label
                  key={template.uuid}
                  className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    id={template.uuid}
                    checked={selectedTemplates.includes(template.uuid)}
                    onCheckedChange={() => toggleTemplate(template.uuid, template.name)}
                  />
                  <span className="text-sm truncate" title={template.name}>
                    {template.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-7 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
