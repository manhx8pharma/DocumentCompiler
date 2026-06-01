import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, XCircle, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface BatchCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  sessionId: string;
  templateUuid: string;
  fileName: string;
  totalDocuments: number;
  created: number;
  failed: number;
  documentUuids: string[];
  results?: { batchDocumentId: string; documentId: string; documentName: string; success: boolean }[];
  errors?: { batchDocumentId: string; documentName: string; error: string }[];
}

export function NewBatchCreateModal({ isOpen, onClose, templateId, templateName }: BatchCreateModalProps) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'result'>('upload');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Upload Excel file mutation - auto creates documents
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await apiRequest('POST', `/api/templates/${templateId}/upload-batch`, formData);
      return await res.json() as UploadResult;
    },
    onSuccess: (data: UploadResult) => {
      console.log('Upload and create successful:', data);
      setUploadResult(data);
      setCurrentStep('result');
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      
      if (data.created > 0) {
        toast({
          title: 'Tạo văn bản thành công',
          description: `Đã tạo ${data.created}/${data.totalDocuments} văn bản từ file Excel`,
        });
      } else {
        toast({
          title: 'Xử lý hoàn tất',
          description: data.message || 'File Excel đã được xử lý',
          variant: data.failed > 0 ? 'destructive' : 'default',
        });
      }
    },
    onError: (error: Error) => {
      console.error('Upload error:', error);
      toast({
        title: 'Upload thất bại',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Download all created documents mutation
  const downloadAllMutation = useMutation({
    mutationFn: async () => {
      if (!uploadResult?.documentUuids || uploadResult.documentUuids.length === 0) {
        throw new Error('Không có văn bản để tải');
      }
      
      const response = await fetch('/api/batch/download-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentUuids: uploadResult.documentUuids }),
      });
      
      if (!response.ok) {
        throw new Error('Không thể tải văn bản');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateName}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: 'Tải xuống thành công',
        description: 'Tất cả văn bản đã được tải xuống dưới dạng file ZIP',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Tải xuống thất bại',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: 'File không hợp lệ',
        description: 'Chỉ chấp nhận file Excel (.xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleClose = () => {
    setCurrentStep('upload');
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo văn bản hàng loạt - {templateName}</DialogTitle>
        </DialogHeader>

        {currentStep === 'upload' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <FileSpreadsheet className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">Upload file Excel</h3>
              <p className="text-gray-600 mb-6">
                Chọn file Excel chứa dữ liệu để tạo văn bản hàng loạt
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              <Button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="mx-auto"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Chọn file Excel
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'result' && uploadResult && (
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {uploadResult.created > 0 ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  Kết quả tạo văn bản
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">File</p>
                    <p className="font-medium">{uploadResult.fileName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tổng số</p>
                    <p className="font-medium">{uploadResult.totalDocuments || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Đã tạo</p>
                    <p className="font-medium text-green-600">{uploadResult.created || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Thất bại</p>
                    <p className="font-medium text-red-600">{uploadResult.failed || 0}</p>
                  </div>
                </div>

                {/* Success message */}
                {uploadResult.created > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-green-800">
                      Đã tạo thành công {uploadResult.created} văn bản. Bạn có thể xem chúng trong danh sách văn bản hoặc tải xuống ngay.
                    </p>
                  </div>
                )}

                {/* Error list */}
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-800 font-medium mb-2">Các lỗi xảy ra:</p>
                    <ul className="text-sm text-red-700 list-disc list-inside">
                      {uploadResult.errors.map((err, idx) => (
                        <li key={idx}>{err.documentName}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Created documents list */}
                {uploadResult.results && uploadResult.results.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-sm font-medium text-gray-700">Văn bản đã tạo:</p>
                    {uploadResult.results.map((result, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{result.documentName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex justify-center gap-4">
              {uploadResult.documentUuids && uploadResult.documentUuids.length > 0 && (
                <Button
                  onClick={() => downloadAllMutation.mutate()}
                  disabled={downloadAllMutation.isPending}
                  variant="outline"
                >
                  {downloadAllMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang tải xuống...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Tải xuống tất cả ({uploadResult.created})
                    </>
                  )}
                </Button>
              )}
              <Button onClick={handleClose}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}