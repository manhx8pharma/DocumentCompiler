import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export interface BlockColumnDef {
  name: string;
  label: string;
  fieldType?: 'text' | 'checklist';
  defaultValue?: string;
  options?: string[];
}

interface ChorusBlockSectionProps {
  blockName: string;
  label: string;
  columns: BlockColumnDef[];
  instances: Array<Record<string, string>>;
  onChange: (instances: Array<Record<string, string>>) => void;
}

export function ChorusBlockSection({
  blockName,
  label,
  columns,
  instances,
  onChange,
}: ChorusBlockSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const addInstance = () => {
    const newInstance: Record<string, string> = {};
    columns.forEach(col => {
      newInstance[col.name] = col.defaultValue ?? '';
    });
    onChange([...instances, newInstance]);
  };

  const removeInstance = (idx: number) => {
    onChange(instances.filter((_, i) => i !== idx));
  };

  const updateInstance = (idx: number, fieldName: string, value: string) => {
    const updated = instances.map((inst, i) =>
      i === idx ? { ...inst, [fieldName]: value } : inst
    );
    onChange(updated);
  };

  const renderField = (col: BlockColumnDef, instance: Record<string, string>, idx: number) => {
    if (col.fieldType === 'checklist' && col.options && col.options.length > 0) {
      const raw = instance[col.name] || '';
      const selected = raw.split(';').map(v => v.trim()).filter(Boolean);
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {col.options.map(opt => {
            const id = `${blockName}-${col.name}-${idx}-${opt}`;
            return (
              <div key={opt} className="flex items-center gap-1.5">
                <Checkbox
                  id={id}
                  checked={selected.includes(opt)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selected, opt]
                      : selected.filter(v => v !== opt);
                    updateInstance(idx, col.name, next.join(';'));
                  }}
                />
                <label htmlFor={id} className="text-xs text-gray-700 cursor-pointer select-none">
                  {opt}
                </label>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <Input
        value={instance[col.name] || ''}
        onChange={(e) => updateInstance(idx, col.name, e.target.value)}
        placeholder={col.defaultValue ? `Mặc định: ${col.defaultValue}` : `Nhập ${(col.label || col.name).toLowerCase()}`}
        className="h-8 text-sm"
      />
    );
  };

  const displayLabel = label || blockName;

  return (
    <div className="border border-purple-200 rounded-md bg-purple-50">
      <div
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-900">{displayLabel}</span>
          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
            {instances.length} mục
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-100 h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              addInstance();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Thêm mục
          </Button>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-purple-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-purple-500" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {instances.length === 0 ? (
            <p className="text-xs text-purple-400 text-center py-2">
              Chưa có mục nào. Nhấn "Thêm mục" để thêm.
            </p>
          ) : (
            instances.map((instance, idx) => (
              <div
                key={idx}
                className="border border-purple-200 rounded bg-white p-3 space-y-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-700">Mục {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeInstance(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {columns.map(col => (
                    <div key={col.name} className="space-y-1">
                      <Label className="text-xs text-gray-600">
                        {col.label || col.name}
                        {col.fieldType === 'checklist' && (
                          <span className="ml-1 text-purple-500 text-xs">(checklist)</span>
                        )}
                      </Label>
                      {renderField(col, instance, idx)}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
