/**
 * BlockDataPage — dedicated full-page editor for chorus block instances.
 * Route: /document/:documentUuid/block/:blockName
 *
 * Loads existing block instances via GET /api/documents/:uuid/tables/:blockName
 * (same endpoint as table data — chorus block rows are stored in document_table_data).
 * Saves via PUT /api/documents/:uuid/tables/:blockName.
 *
 * Excel features:
 *  - "Tải Excel" → GET /api/documents/:uuid/tables/:blockName/excel (downloads current data or blank template)
 *  - "Import Excel" → POST /api/documents/:uuid/tables/:blockName/excel (parse + save, replaces all instances)
 */

import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Layers, Loader2, Save, Download, Upload, FileDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ChorusBlockSection } from "@/components/chorus-block-section";
import { exportRowsToExcel } from "@/lib/excel";

interface BlockColumn {
  name: string;
  label: string;
  fieldType?: 'text' | 'checklist';
  defaultValue?: string;
  options?: string[];
}

interface BlockDataResponse {
  tableName: string;
  label: string;
  columns: BlockColumn[];
  rows: Array<Record<string, string>>;
}

export default function BlockDataPage() {
  const [, params] = useRoute("/document/:documentUuid/block/:blockName");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentUuid = params?.documentUuid;
  const blockName = params?.blockName;

  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, error } = useQuery<BlockDataResponse>({
    queryKey: ["/api/documents", documentUuid, "tables", blockName],
    queryFn: () =>
      fetch(`/api/documents/${documentUuid}/tables/${blockName}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load block data");
        return r.json();
      }),
    enabled: !!documentUuid && !!blockName,
  });

  const columns: BlockColumn[] = data?.columns ?? [];
  const [instances, setInstances] = useState<Array<Record<string, string>>>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && data) {
      setInstances(data.rows.length > 0 ? data.rows.map((r) => ({ ...r })) : []);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/documents/${documentUuid}/tables/${blockName}`, {
        rows: instances,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/documents", documentUuid, "tables", blockName],
      });
      toast({
        title: "Đã lưu",
        description: `Dữ liệu block "${data?.label || blockName}" đã được lưu.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể lưu dữ liệu block.",
        variant: "destructive",
      });
    },
  });

  const handleDownloadExcel = () => {
    const a = document.createElement("a");
    a.href = `/api/documents/${documentUuid}/tables/${blockName}/excel`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportCurrentData = async () => {
    if (columns.length === 0 || instances.length === 0) return;
    setIsExporting(true);
    try {
      await exportRowsToExcel(columns, instances, data?.label || blockName || "block");
    } catch (err: any) {
      toast({
        title: "Lỗi xuất Excel",
        description: err.message || "Không thể tạo file Excel.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/documents/${documentUuid}/tables/${blockName}/excel`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import thất bại");
      }
      const result = await response.json();
      setInstances(result.rows);
      setInitialized(true);
      queryClient.invalidateQueries({
        queryKey: ["/api/documents", documentUuid, "tables", blockName],
      });
      toast({
        title: "Import thành công",
        description: `Đã nhập ${result.count} mục từ Excel.`,
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

  const handleBack = () => {
    setLocation(`/document-update/${documentUuid}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>Không thể tải dữ liệu block. Vui lòng thử lại.</p>
        <Button className="mt-4" variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImportExcel}
      />

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
            <Layers className="h-5 w-5 text-purple-600" />
            <h1 className="text-lg font-semibold text-purple-900">
              {data.label || blockName}
            </h1>
            <span className="text-sm text-gray-500">
              ({instances.length} mục)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Download saved Excel template */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownloadExcel}
            disabled={columns.length === 0}
            className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
          >
            <Download className="h-3.5 w-3.5" />
            Tải Excel mẫu
          </Button>

          {/* Export current in-memory instances (unsaved state) */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportCurrentData}
            disabled={isExporting || columns.length === 0 || instances.length === 0}
            className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
            title="Xuất dữ liệu hiện tại ra Excel (kể cả chưa lưu)"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xuất...
              </>
            ) : (
              <>
                <FileDown className="h-3.5 w-3.5" /> Xuất dữ liệu
              </>
            )}
          </Button>

          {/* Import Excel */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || columns.length === 0}
            className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang nhập...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> Import Excel
              </>
            )}
          </Button>

          {/* Save */}
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {columns.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Layers className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Block này chưa có biến nào được định nghĩa.</p>
              <p className="text-sm mt-1">
                Kiểm tra lại template để đảm bảo block có chứa {"{%varName%}"} bên trong.
              </p>
            </div>
          ) : (
            <ChorusBlockSection
              blockName={blockName ?? ""}
              label={data.label || blockName || ""}
              columns={columns}
              instances={instances}
              onChange={setInstances}
            />
          )}
        </div>
      </div>
    </div>
  );
}
