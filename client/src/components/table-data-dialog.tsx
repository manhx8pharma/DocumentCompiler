/**
 * TableDataDialog — modal for entering table row data for a document.
 *
 * Opens when the user clicks "Nhập bảng [TABLE_LABEL]" on document-create.
 * Displays a spreadsheet-like grid with columns from the template table definition.
 * Saves rows via PUT /api/documents/:uuid/tables/:name.
 * Also works in "local" mode (no documentUuid yet) where data is passed back via onSave.
 *
 * Features:
 *  - 95% viewport size, no page-level horizontal scrollbar
 *  - Download Excel (with current data) for offline editing
 *  - Import Excel to replace current rows
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Table2, Download, Upload, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TableColumn {
  name: string;
  label: string;
}

interface TableDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateUuid: string;
  tableName: string;
  tableLabel?: string;
  documentUuid?: string;
  localRows?: Array<Record<string, string>>;
  onSaveLocal?: (tableName: string, rows: Array<Record<string, string>>) => void;
}

export function TableDataDialog({
  open,
  onOpenChange,
  templateUuid,
  tableName,
  tableLabel,
  documentUuid,
  localRows,
  onSaveLocal,
}: TableDataDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const DEFAULT_COL_WIDTH = 160;
  const getColWidth = (name: string) => columnWidths[name] ?? DEFAULT_COL_WIDTH;

  const startResize = (colName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getColWidth(colName);

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(20, startWidth + ev.clientX - startX);
      setColumnWidths((prev) => ({ ...prev, [colName]: newWidth }));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const docEndpointEnabled = open && !!documentUuid;
  const templateEndpointEnabled = open && !documentUuid;

  const { data: docTableData } = useQuery<{
    tableName: string;
    label: string;
    columns: TableColumn[];
    rows: Array<Record<string, string>>;
  }>({
    queryKey: ["/api/documents", documentUuid, "tables", tableName],
    queryFn: () =>
      fetch(`/api/documents/${documentUuid}/tables/${tableName}`).then((r) =>
        r.json()
      ),
    enabled: docEndpointEnabled,
  });

  const { data: templateTableDef } = useQuery<{
    tableName: string;
    label: string;
    columns: TableColumn[];
    position: number;
  }>({
    queryKey: ["/api/templates", templateUuid, "tables", tableName],
    queryFn: () =>
      fetch(`/api/templates/${templateUuid}/tables/${tableName}`).then((r) =>
        r.json()
      ),
    enabled: templateEndpointEnabled,
  });

  const tableDef = documentUuid ? docTableData : templateTableDef;
  const columns: TableColumn[] = tableDef?.columns ?? [];
  const displayLabel = tableLabel || tableDef?.label || tableName;

  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!open) {
      setInitialized(false);
      return;
    }
    if (initialized) return;

    if (documentUuid && tableDef) {
      setRows(
        (tableDef as any).rows?.length > 0
          ? (tableDef as any).rows.map((r: any) => ({ ...r }))
          : columns.length > 0
          ? [emptyRow(columns)]
          : [{}]
      );
      setInitialized(true);
    } else if (!documentUuid && localRows !== undefined) {
      setRows(
        localRows.length > 0
          ? localRows.map((r) => ({ ...r }))
          : columns.length > 0
          ? [emptyRow(columns)]
          : [{}]
      );
      setInitialized(true);
    } else if (!documentUuid && columns.length > 0) {
      setRows([emptyRow(columns)]);
      setInitialized(true);
    }
  }, [open, initialized, documentUuid, tableDef, localRows, columns]);

  function emptyRow(cols: TableColumn[]): Record<string, string> {
    const row: Record<string, string> = {};
    cols.forEach((c) => (row[c.name] = ""));
    return row;
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow(columns)]);

  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  const updateCell = (rowIdx: number, colName: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colName]: value };
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/documents/${documentUuid}/tables/${tableName}`, {
        rows,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/documents", documentUuid, "tables", tableName],
      });
      toast({
        title: "Đã lưu",
        description: `Dữ liệu bảng ${displayLabel} đã được lưu.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể lưu dữ liệu bảng.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (documentUuid) {
      saveMutation.mutate();
    } else if (onSaveLocal) {
      onSaveLocal(tableName, rows);
      onOpenChange(false);
    }
  };

  const handleDownloadExcel = () => {
    const url = documentUuid
      ? `/api/documents/${documentUuid}/tables/${tableName}/excel`
      : `/api/templates/${templateUuid}/tables/${tableName}/excel`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportExcel = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const url = documentUuid
        ? `/api/documents/${documentUuid}/tables/${tableName}/excel`
        : `/api/templates/${templateUuid}/tables/${tableName}/excel/parse`;

      const response = await fetch(url, { method: "POST", body: formData });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import thất bại");
      }

      const result = await response.json();
      setRows(result.rows);
      setInitialized(true);

      if (documentUuid) {
        queryClient.invalidateQueries({
          queryKey: ["/api/documents", documentUuid, "tables", tableName],
        });
      }

      toast({
        title: "Import thành công",
        description: `Đã nhập ${result.count} dòng từ Excel.`,
      });
    } catch (err: any) {
      toast({
        title: "Lỗi import",
        description: err.message || "Không thể đọc file Excel.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  if (columns.length === 0 && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="h-5 w-5" />
              {displayLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center text-muted-foreground text-sm">
            Chưa có cột nào được định nghĩa cho bảng này.
            <br />
            Vui lòng cấu hình cột trong trang quản lý template trước.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-5 py-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Table2 className="h-5 w-5 text-primary" />
              Nhập dữ liệu — {displayLabel}
              <span className="text-sm font-normal text-muted-foreground">
                ({columns.length} cột)
              </span>
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadExcel}
                className="gap-1.5 text-xs h-8"
                title="Tải file Excel với dữ liệu hiện tại để chỉnh sửa offline"
              >
                <Download className="h-3.5 w-3.5" />
                Tải Excel mẫu
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="gap-1.5 text-xs h-8"
                title="Upload file Excel đã điền để nhập dữ liệu"
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isImporting ? "Đang nhập..." : "Import Excel"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </div>
          </div>
        </DialogHeader>

        {/* Table grid — scrolls independently */}
        <div className="flex-1 overflow-auto">
          <table
            className="text-sm border-collapse"
            style={{ tableLayout: "fixed", width: `${columns.reduce((s, c) => s + getColWidth(c.name), 0) + 80}px`, minWidth: "100%" }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              {columns.map((col) => (
                <col key={col.name} style={{ width: getColWidth(col.name) }} />
              ))}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
              <tr>
                <th className="px-2 py-2.5 text-xs text-muted-foreground text-center border-b border-r font-normal select-none">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-foreground border-b border-r last:border-r-0 select-none overflow-hidden"
                    style={{ position: "relative" }}
                  >
                    <span className="truncate block pr-2">
                      {col.label || col.name}
                      {col.label && col.label !== col.name && (
                        <span className="ml-1 text-muted-foreground font-normal opacity-60">
                          ({col.name})
                        </span>
                      )}
                    </span>
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 flex items-center justify-center cursor-col-resize group/resize z-10"
                      onMouseDown={(e) => startResize(col.name, e)}
                      title="Kéo để thay đổi độ rộng cột"
                    >
                      <div className="w-px h-4 bg-border group-hover/resize:bg-blue-400 group-hover/resize:w-0.5 transition-all" />
                    </div>
                  </th>
                ))}
                <th className="border-b" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-muted/20 group transition-colors"
                >
                  <td className="px-2 text-center text-xs text-muted-foreground border-b border-r font-mono">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="border-b border-r last:border-r-0 p-0 overflow-hidden"
                    >
                      <Input
                        value={row[col.name] ?? ""}
                        onChange={(e) =>
                          updateCell(rowIdx, col.name, e.target.value)
                        }
                        className="border-0 rounded-none h-9 text-sm focus-visible:ring-inset focus-visible:ring-1 bg-transparent w-full"
                        placeholder={col.label || col.name}
                      />
                    </td>
                  ))}
                  <td className="border-b text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={() => removeRow(rowIdx)}
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-4 py-10 text-center text-muted-foreground text-sm"
                  >
                    Chưa có dữ liệu. Nhấn "+ Thêm dòng" hoặc Import Excel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <button
            type="button"
            onClick={addRow}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" /> Thêm dòng
          </button>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 px-5 py-3 border-t bg-muted/20">
          <span className="text-sm text-muted-foreground mr-auto">
            {rows.length} dòng · {columns.length} cột
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveMutation.isPending ? "Đang lưu..." : "Lưu dữ liệu bảng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
