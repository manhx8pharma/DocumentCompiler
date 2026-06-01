/**
 * TableDataPage — dedicated full-page editor for table row data.
 * Route: /document/:documentUuid/table/:tableName
 *
 * Fetches column definitions + existing rows, lets the user add/edit/delete rows.
 * Saves via PUT /api/documents/:uuid/tables/:name.
 *
 * Features:
 *  - Download Excel (with current data) for offline editing
 *  - Import Excel to replace current rows
 */

import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Table2,
  Loader2,
  Download,
  Upload,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TableColumn {
  name: string;
  label: string;
}

interface TableDataResponse {
  tableName: string;
  label: string;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
}

export default function TableDataPage() {
  const [, params] = useRoute("/document/:documentUuid/table/:tableName");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentUuid = params?.documentUuid;
  const tableName = params?.tableName;

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

  const { data, isLoading, error } = useQuery<TableDataResponse>({
    queryKey: ["/api/documents", documentUuid, "tables", tableName],
    queryFn: () =>
      fetch(`/api/documents/${documentUuid}/tables/${tableName}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load table data");
        return r.json();
      }),
    enabled: !!documentUuid && !!tableName,
  });

  const columns: TableColumn[] = data?.columns ?? [];
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [initialized, setInitialized] = useState(false);

  function emptyRow(cols: TableColumn[]): Record<string, string> {
    const row: Record<string, string> = {};
    cols.forEach((c) => (row[c.name] = ""));
    return row;
  }

  useEffect(() => {
    if (!initialized && data) {
      setRows(
        data.rows.length > 0
          ? data.rows.map((r) => ({ ...r }))
          : columns.length > 0
          ? [emptyRow(columns)]
          : [{}]
      );
      setInitialized(true);
    }
  }, [data, initialized, columns]);

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
        description: `Dữ liệu bảng ${data?.label || tableName} đã được lưu.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể lưu dữ liệu bảng.",
        variant: "destructive",
      });
    },
  });

  const handleBack = () => {
    setLocation(`/document-update/${documentUuid}`);
  };

  const handleDownloadExcel = () => {
    const a = document.createElement("a");
    a.href = `/api/documents/${documentUuid}/tables/${tableName}/excel`;
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

      const response = await fetch(
        `/api/documents/${documentUuid}/tables/${tableName}/excel`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import thất bại");
      }

      const result = await response.json();
      setRows(result.rows);
      setInitialized(true);
      queryClient.invalidateQueries({
        queryKey: ["/api/documents", documentUuid, "tables", tableName],
      });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>Không thể tải dữ liệu bảng. Vui lòng thử lại.</p>
        <Button className="mt-4" variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Quay lại
        </Button>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Table2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">Chưa có cột nào được định nghĩa cho bảng này.</p>
        <p className="text-sm mt-1">
          Vui lòng cấu hình cột trong trang quản lý template trước.
        </p>
        <Button className="mt-4" variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại
          </Button>
          <div className="h-5 border-l border-gray-300" />
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-semibold">{data.label || tableName}</h1>
            <span className="text-sm text-gray-500">({columns.length} cột)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Download Excel */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="gap-1.5"
            title="Tải file Excel với dữ liệu hiện tại để chỉnh sửa offline"
          >
            <Download className="h-3.5 w-3.5" />
            Tải Excel mẫu
          </Button>

          {/* Import Excel */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="gap-1.5"
            title="Upload file Excel đã điền để nhập dữ liệu hàng loạt"
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

          <div className="h-5 border-l border-gray-200" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm hàng
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Lưu
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white">
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
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border-b border-r border-gray-200 select-none">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-r border-gray-200 select-none overflow-hidden"
                    style={{ position: "relative" }}
                  >
                    <span className="truncate block pr-2">
                      {col.label || col.name}
                      {col.label && col.label !== col.name && (
                        <span className="ml-1 text-gray-400 font-normal">
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
                      <div className="w-px h-4 bg-gray-300 group-hover/resize:bg-blue-400 group-hover/resize:w-0.5 transition-all" />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 border-b border-gray-200" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-blue-50/30 transition-colors group"
                >
                  <td className="px-3 py-1.5 text-center text-xs text-gray-400 border-b border-r border-gray-100 font-mono">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="border-b border-r border-gray-100 p-0 overflow-hidden"
                    >
                      <Input
                        value={row[col.name] ?? ""}
                        onChange={(e) =>
                          updateCell(rowIdx, col.name, e.target.value)
                        }
                        className="h-8 text-sm border-0 focus-visible:ring-1 focus-visible:ring-blue-400 bg-transparent rounded-none px-2 w-full"
                        placeholder={col.label || col.name}
                      />
                    </td>
                  ))}
                  <td className="py-1 border-b border-gray-100 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(rowIdx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1 rounded"
                      title="Xóa hàng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-4 py-10 text-center text-gray-400 text-sm"
                  >
                    Chưa có dữ liệu. Nhấn "Thêm hàng" hoặc Import Excel để bắt đầu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {rows.length} hàng · {columns.length} cột
          </p>
        )}
      </div>
    </div>
  );
}
