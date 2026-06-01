import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, GripVertical, Table2, Save, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

interface TableColumn {
  name: string;
  label: string;
  fieldType?: 'text' | 'checklist';
  defaultValue?: string;
  options?: string[];
}

interface TemplateTable {
  id: string;
  templateUuid: string;
  name: string;
  label: string;
  columns: TableColumn[];
  position: number;
  blockType: string;
}

export default function TableColumnEditor() {
  const { uuid: templateUuid, name: tableName } = useParams<{ uuid: string; name: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tableDef, isLoading } = useQuery<TemplateTable>({
    queryKey: ['/api/templates', templateUuid, 'tables', tableName],
    queryFn: () => fetch(`/api/templates/${templateUuid}/tables/${tableName}`).then(r => r.json()),
  });

  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [tableLabel, setTableLabel] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [expandedCols, setExpandedCols] = useState<Set<number>>(new Set());

  if (tableDef && !initialized) {
    setColumns(tableDef.columns ?? []);
    setTableLabel(tableDef.label ?? tableName ?? '');
    setInitialized(true);
  }

  const isBlock = tableDef?.blockType === 'block';

  const toggleExpand = (idx: number) => {
    setExpandedCols(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const addColumn = useCallback(() => {
    setColumns(prev => {
      const next = [...prev, { name: '', label: '', fieldType: 'text' as const, defaultValue: '', options: [] }];
      return next;
    });
    setExpandedCols(prev => {
      const next = new Set(prev);
      next.add(columns.length);
      return next;
    });
  }, [columns.length]);

  const removeColumn = useCallback((idx: number) => {
    setColumns(prev => prev.filter((_, i) => i !== idx));
    setExpandedCols(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  }, []);

  const updateColumn = useCallback((idx: number, field: keyof TableColumn, value: any) => {
    setColumns(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'name' && !next[idx].label) {
        next[idx].label = value;
      }
      if (field === 'fieldType' && value === 'text') {
        next[idx].options = [];
      }
      return next;
    });
  }, []);

  const moveColumn = useCallback((idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= columns.length) return;
    setColumns(prev => {
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    setExpandedCols(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === idx) next.add(newIdx);
        else if (i === newIdx) next.add(idx);
        else next.add(i);
      });
      return next;
    });
  }, [columns.length]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const validColumns = columns
        .filter(c => c.name.trim())
        .map(col => {
          const saved: TableColumn = { name: col.name.trim(), label: col.label || col.name.trim() };
          if (isBlock) {
            saved.fieldType = col.fieldType || 'text';
            saved.defaultValue = col.defaultValue || '';
            if (col.fieldType === 'checklist') {
              saved.options = (col.options || []).filter(o => o.trim());
            } else {
              saved.options = [];
            }
          }
          return saved;
        });
      return apiRequest('PUT', `/api/templates/${templateUuid}/tables/${tableName}/columns`, {
        label: tableLabel,
        columns: validColumns,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates', templateUuid, 'tables'] });
      toast({ title: 'Đã lưu', description: 'Định nghĩa cột đã được cập nhật.' });
      navigate(`/template-preview/${templateUuid}`);
    },
    onError: (err: any) => {
      toast({ title: 'Lỗi', description: err.message || 'Không thể lưu.', variant: 'destructive' });
    },
  });

  const handleSave = () => {
    const invalidCols = columns.filter(c => !c.name.trim());
    if (invalidCols.length > 0) {
      toast({
        title: 'Tên biến không được để trống',
        description: 'Vui lòng đặt tên cho tất cả các biến hoặc xóa biến trống.',
        variant: 'destructive',
      });
      return;
    }
    const names = columns.map(c => c.name.trim());
    if (new Set(names).size !== names.length) {
      toast({ title: 'Tên biến bị trùng', description: 'Mỗi biến cần có tên duy nhất.', variant: 'destructive' });
      return;
    }
    if (isBlock) {
      for (const col of columns) {
        if (col.fieldType === 'checklist' && (!col.options || col.options.filter(o => o.trim()).length === 0)) {
          toast({
            title: 'Checklist thiếu lựa chọn',
            description: `Biến "${col.label || col.name}" là checklist nhưng chưa có lựa chọn nào.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }
    saveMutation.mutate();
  };

  const pageTitle = isBlock ? `Định nghĩa biến Block — ${tableName}` : `Định nghĩa cột bảng — ${tableName}`;
  const pageDesc = isBlock
    ? 'Thiết lập kiểu dữ liệu, giá trị mặc định và lựa chọn cho từng biến trong chorus block.'
    : 'Thiết lập các cột sẽ xuất hiện trong bảng Word được tạo ra.';
  const Icon = isBlock ? Layers : Table2;
  const addButtonLabel = isBlock ? 'Thêm biến' : 'Thêm cột';
  const emptyText = isBlock ? 'Chưa có biến nào. Nhấn "Thêm biến" để bắt đầu.' : 'Chưa có cột. Nhấn "Thêm cột" để bắt đầu.';
  const nameHint = isBlock ? 'ten_bien' : 'ho_ten';
  const labelHint = isBlock ? 'Tên biến' : 'Họ và tên';

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/template-preview/${templateUuid}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Icon className={`h-5 w-5 ${isBlock ? 'text-purple-600' : 'text-primary'}`} />
            {pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pageDesc}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Đang tải...</div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin {isBlock ? 'block' : 'bảng'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="tableLabel">Tên hiển thị</Label>
                <Input
                  id="tableLabel"
                  value={tableLabel}
                  onChange={e => setTableLabel(e.target.value)}
                  placeholder={tableName}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isBlock ? 'Danh sách biến' : 'Danh sách cột'}</CardTitle>
              <CardDescription>
                {isBlock
                  ? 'Mỗi biến tương ứng với {%varName%} trong block. Thứ tự ở đây là thứ tự hiển thị khi nhập liệu.'
                  : 'Thứ tự cột ở đây sẽ là thứ tự xuất hiện trong bảng Word.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {columns.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{emptyText}</p>
              )}
              {columns.map((col, idx) => (
                <div key={idx} className={`rounded-md border ${isBlock ? 'border-purple-200 bg-purple-50/30' : 'border-border'} overflow-hidden`}>
                  {/* Main row: move buttons + name/label + delete */}
                  <div className="flex items-center gap-2 p-2 group">
                    <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-70">
                      <button
                        type="button"
                        onClick={() => moveColumn(idx, -1)}
                        disabled={idx === 0}
                        className="text-xs leading-none disabled:opacity-20"
                        title="Lên"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveColumn(idx, 1)}
                        disabled={idx === columns.length - 1}
                        className="text-xs leading-none disabled:opacity-20"
                        title="Xuống"
                      >▼</button>
                    </div>
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Tên kỹ thuật (name)</Label>
                        <Input
                          value={col.name}
                          onChange={e => updateColumn(idx, 'name', e.target.value)}
                          placeholder={nameHint}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Tiêu đề hiển thị (label)</Label>
                        <Input
                          value={col.label}
                          onChange={e => updateColumn(idx, 'label', e.target.value)}
                          placeholder={labelHint}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isBlock && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpand(idx)}
                          className={`shrink-0 h-8 w-8 ${expandedCols.has(idx) ? 'text-purple-600' : 'text-muted-foreground'}`}
                          title="Cài đặt nâng cao"
                        >
                          {expandedCols.has(idx) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeColumn(idx)}
                        className="shrink-0 text-destructive hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Block-only: advanced fields (fieldType, defaultValue, options) */}
                  {isBlock && expandedCols.has(idx) && (
                    <div className="px-3 pb-3 pt-1 border-t border-purple-200 bg-white space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Kiểu dữ liệu</Label>
                          <Select
                            value={col.fieldType || 'text'}
                            onValueChange={val => updateColumn(idx, 'fieldType', val as 'text' | 'checklist')}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Văn bản (text)</SelectItem>
                              <SelectItem value="checklist">Checklist (đa lựa chọn)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(col.fieldType || 'text') === 'text' && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Giá trị mặc định</Label>
                            <Input
                              value={col.defaultValue || ''}
                              onChange={e => updateColumn(idx, 'defaultValue', e.target.value)}
                              placeholder="Để trống nếu không có"
                              className="h-8 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      {(col.fieldType || 'text') === 'checklist' && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Danh sách lựa chọn <span className="text-purple-500">(mỗi dòng một lựa chọn)</span>
                          </Label>
                          <Textarea
                            value={(col.options || []).join('\n')}
                            onChange={e => {
                              const opts = e.target.value.split('\n').map(v => v.trim()).filter(Boolean);
                              updateColumn(idx, 'options', opts);
                            }}
                            placeholder={"Lựa chọn 1\nLựa chọn 2\nLựa chọn 3"}
                            className="text-sm min-h-[80px] resize-none"
                            rows={4}
                          />
                          {(col.options || []).filter(o => o.trim()).length > 0 && (
                            <p className="text-xs text-purple-600">
                              {(col.options || []).filter(o => o.trim()).length} lựa chọn
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addColumn} className={`w-full mt-2 ${isBlock ? 'border-purple-300 text-purple-700 hover:bg-purple-50' : ''}`}>
                <Plus className="h-4 w-4 mr-1" />{addButtonLabel}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className={`flex-1 ${isBlock ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Đang lưu...' : `Lưu định nghĩa ${isBlock ? 'biến' : 'cột'}`}
            </Button>
            <Link href={`/template-preview/${templateUuid}`}>
              <Button variant="outline">Hủy</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
