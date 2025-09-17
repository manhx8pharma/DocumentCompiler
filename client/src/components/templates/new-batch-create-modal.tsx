import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, XCircle, Eye, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface BatchCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
}

interface BatchDocument {
  uuid: string;
  rowIndex: number;
  documentName: string;
  status: 'pending' | 'approved' | 'rejected' | 'created';
  fields: { fieldName: string; fieldValue: string }[];
}

interface BatchSessionData {
  sessionId: string;
  templateId: number;
  templateName: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  documents: BatchDocument[];
}

export function NewBatchCreateModal({ isOpen, onClose, templateId, templateName }: BatchCreateModalProps) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'review' | 'create'>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [createdDocuments, setCreatedDocuments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Upload Excel file mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await apiRequest('POST', `/api/templates/uuid/${templateId}/upload-batch`, formData);
      return await res.json();
    },
    onSuccess: (data) => {
      console.log('Upload successful:', data);
      setSessionId(data.sessionId);
      setCurrentStep('review');
      toast({
        title: 'Upload thành công',
        description: `Đã xử lý ${data.totalDocuments} văn bản từ file Excel`,
      });
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

  // Get batch session data
  const { data: sessionData, refetch: refetchSession } = useQuery<BatchSessionData>({
    queryKey: ['batch-session', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const res = await apiRequest('GET', `/api/batch/${sessionId}`);
      return await res.json();
    },
    enabled: !!sessionId && currentStep === 'review',
  });

  // Update document status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ documentId, status }: { documentId: string; status: string }) => {
      const res = await apiRequest('PUT', `/api/batch/documents/${documentId}/status`, { status });
      return await res.json();
    },
    onSuccess: () => {
      refetchSession();
    },
  });

  // Create documents mutation
  const createDocumentsMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const res = await apiRequest('POST', `/api/batch/${sessionId}/create-documents`);
      return await res.json();
    },
    onSuccess: (data) => {
      console.log('Documents created:', data);
      setCreatedDocuments(data.documentUuids || []);
      toast({
        title: 'Tạo văn bản thành công',
        description: `Đã tạo ${data.created} văn bản, ${data.failed} thất bại`,
      });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setCurrentStep('create');
    },
    onError: (error: Error) => {
      toast({
        title: 'Tạo văn bản thất bại',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Download all created documents mutation
  const downloadAllMutation = useMutation({
    mutationFn: async () => {
      if (createdDocuments.length === 0) throw new Error('No documents to download');
      
      const response = await fetch('/api/batch/download-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentUuids: createdDocuments }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to download documents');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents-${new Date().toISOString().split('T')[0]}.zip`;
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

  const handleStatusUpdate = (documentId: string, status: 'approved' | 'rejected') => {
    updateStatusMutation.mutate({ documentId, status });
  };

  const handleCreateDocuments = () => {
    createDocumentsMutation.mutate();
  };

  const handleClose = () => {
    setCurrentStep('upload');
    setSessionId(null);
    setCreatedDocuments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const approvedCount = sessionData?.documents.filter(doc => doc.status === 'approved').length || 0;
  const rejectedCount = sessionData?.documents.filter(doc => doc.status === 'rejected').length || 0;

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

        {currentStep === 'review' && sessionData && (
          <div className="space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Thông tin batch</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">File</p>
                    <p className="font-medium">{sessionData.fileName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tổng số</p>
                    <p className="font-medium">{sessionData.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Đã duyệt</p>
                    <p className="font-medium text-green-600">{approvedCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Từ chối</p>
                    <p className="font-medium text-red-600">{rejectedCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents Review */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Duyệt văn bản
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        sessionData.documents.forEach(doc => {
                          if (doc.status === 'pending') {
                            handleStatusUpdate(doc.uuid, 'approved');
                          }
                        });
                      }}
                      disabled={updateStatusMutation.isPending}
                    >
                      Duyệt tất cả
                    </Button>
                    <Button
                      onClick={handleCreateDocuments}
                      disabled={approvedCount === 0 || createDocumentsMutation.isPending}
                    >
                      {createDocumentsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Tạo văn bản ({approvedCount})
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {sessionData.documents.map((doc) => (
                    <div
                      key={doc.uuid}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{doc.documentName}</h4>
                          <p className="text-sm text-gray-600">
                            Row {doc.rowIndex + 1} • {doc.fields.length} fields
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              doc.status === 'approved' ? 'default' :
                              doc.status === 'rejected' ? 'destructive' :
                              'secondary'
                            }
                          >
                            {doc.status === 'approved' ? 'Đã duyệt' :
                             doc.status === 'rejected' ? 'Từ chối' :
                             'Chờ duyệt'}
                          </Badge>
                          
                          {doc.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusUpdate(doc.uuid, 'approved')}
                                disabled={updateStatusMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusUpdate(doc.uuid, 'rejected')}
                                disabled={updateStatusMutation.isPending}
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Fields preview */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {doc.fields.slice(0, 4).map((field, idx) => (
                          <div key={idx} className="bg-gray-50 p-2 rounded">
                            <span className="font-medium text-gray-700">{field.fieldName}:</span>
                            <span className="ml-2">{field.fieldValue}</span>
                          </div>
                        ))}
                        {doc.fields.length > 4 && (
                          <div className="text-gray-500 italic">
                            +{doc.fields.length - 4} fields khác
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'create' && (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Hoàn thành!</h3>
            <p className="text-gray-600 mb-6">
              Các văn bản đã được tạo thành công. Bạn có thể xem chúng trong danh sách văn bản.
            </p>
            
            {createdDocuments.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-3">
                  Đã tạo thành công {createdDocuments.length} văn bản
                </p>
                <Button
                  onClick={() => downloadAllMutation.mutate()}
                  disabled={downloadAllMutation.isPending}
                  variant="outline"
                  className="mr-3"
                >
                  {downloadAllMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang tải xuống...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Tải xuống tất cả văn bản
                    </>
                  )}
                </Button>
              </div>
            )}
            
            <Button onClick={handleClose}>
              Đóng
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}