import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, Download, CheckCircle, XCircle, AlertCircle, Edit, Eye, Calendar, FileDown, GripVertical, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BatchCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: number | null;
  templateName?: string;
}

interface BatchResult {
  message: string;
  total: number;
  created: number;
  failed: number;
  documents: any[];
  errors?: { row: number; error: string }[];
}

interface DocumentPreview {
  name: string;
  fields: { fieldName: string; fieldValue: string }[];
  status: 'pending' | 'approved' | 'rejected';
}

interface ExportDateRange {
  startDate: string;
  endDate: string;
}

interface SortableItemProps {
  id: string;
  index: number;
  doc: DocumentPreview;
  isSelected: boolean;
  onSelect: () => void;
}

function SortableItem({ id, index, doc, isSelected, onSelect }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 border rounded cursor-pointer transition-colors ${
        isSelected 
          ? 'border-blue-500 bg-blue-50' 
          : 'hover:bg-gray-50'
      } ${isDragging ? 'shadow-lg' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{doc.name}</span>
            <Badge 
              variant={doc.status === 'approved' ? 'default' : doc.status === 'rejected' ? 'destructive' : 'secondary'}
            >
              {doc.status === 'approved' ? 'Đã duyệt' : doc.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {doc.fields?.length || 0} trường dữ liệu
          </p>
        </div>
      </div>
    </div>
  );
}

const BatchCreateModal: React.FC<BatchCreateModalProps> = ({
  isOpen,
  onClose,
  templateId,
  templateName = 'template'
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [documentPreviews, setDocumentPreviews] = useState<DocumentPreview[]>([]);
  const [currentStep, setCurrentStep] = useState<'upload' | 'review' | 'create' | 'export'>('upload');
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number>(0);
  const [exportDateRange, setExportDateRange] = useState<ExportDateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0] // today
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Modal dragging functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    // Prevent dragging outside viewport with more flexible boundaries
    const maxX = window.innerWidth - 300;
    const maxY = window.innerHeight - 100;
    
    setModalPosition({
      x: Math.max(-300, Math.min(maxX, newX)),
      y: Math.max(-50, Math.min(maxY, newY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDocumentPreviews((items) => {
        const oldIndex = items.findIndex((item, index) => `item-${index}` === active.id);
        const newIndex = items.findIndex((item, index) => `item-${index}` === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Update selected index if needed
        if (selectedPreviewIndex === oldIndex) {
          setSelectedPreviewIndex(newIndex);
        } else if (selectedPreviewIndex > oldIndex && selectedPreviewIndex <= newIndex) {
          setSelectedPreviewIndex(selectedPreviewIndex - 1);
        } else if (selectedPreviewIndex < oldIndex && selectedPreviewIndex >= newIndex) {
          setSelectedPreviewIndex(selectedPreviewIndex + 1);
        }

        return newItems;
      });
    }
  };

  const exportExcelMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/templates/${templateId}/export-excel`);
      if (!response.ok) {
        throw new Error('Failed to export Excel template');
      }
      return response.blob();
    }
  });

  // Parse Excel để preview trước khi tạo văn bản
  const parseExcelMutation = useMutation({
    mutationFn: async (data: { templateId: number; file: File }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      
      const response = await fetch(`/api/templates/${data.templateId}/parse-excel`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to parse Excel file: ${errorText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setDocumentPreviews(data.documents.map((doc: any) => ({
        ...doc,
        status: 'pending' as const
      })));
      setCurrentStep('review');
      
      toast({
        title: "Phân tích Excel thành công",
        description: `Tìm thấy ${data.total} văn bản để xem trước`,
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi phân tích Excel",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định",
        variant: "destructive",
      });
    }
  });

  // Xuất dữ liệu văn bản theo thời gian
  const exportDocumentsMutation = useMutation({
    mutationFn: async (data: { templateId: number; startDate: string; endDate: string }) => {
      console.log('EXPORT_DOCUMENTS: Starting export with data:', data);
      const response = await fetch(`/api/templates/${data.templateId}/export-documents?startDate=${data.startDate}&endDate=${data.endDate}`);
      console.log('EXPORT_DOCUMENTS: Response status:', response.status);
      console.log('EXPORT_DOCUMENTS: Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('EXPORT_DOCUMENTS: Error response:', errorText);
        throw new Error(`Failed to export documents data: ${errorText}`);
      }
      
      const blob = await response.blob();
      console.log('EXPORT_DOCUMENTS: Blob received, size:', blob.size);
      return blob;
    },
    onSuccess: (blob) => {
      console.log('EXPORT_DOCUMENTS: Success callback called with blob size:', blob.size);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Documents_${templateName}_${exportDateRange.startDate}_to_${exportDateRange.endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Thành công",
        description: "Dữ liệu văn bản đã được xuất ra file Excel",
      });
    },
    onError: (error) => {
      console.error('EXPORT_DOCUMENTS: Error callback called with error:', error);
      toast({
        title: "Lỗi xuất dữ liệu",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định",
        variant: "destructive",
      });
    }
  });



  // Mutation cho tạo documents trực tiếp từ dữ liệu đã parse
  const directCreateMutation = useMutation({
    mutationFn: async (data: { templateId: number; documents: DocumentPreview[] }) => {
      console.log('DIRECT_CREATE: Starting direct creation with data:', data);
      
      const response = await fetch(`/api/templates/${data.templateId}/create-from-parsed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documents: data.documents
        }),
      });
      
      console.log('DIRECT_CREATE: Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('DIRECT_CREATE: Error response:', errorText);
        throw new Error(`Failed to create documents: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('DIRECT_CREATE: Success result:', result);
      return result;
    },
    onSuccess: (data: BatchResult) => {
      console.log('DIRECT_CREATE: Success callback with data:', data);
      
      toast({
        title: "Thành công",
        description: `Đã tạo ${data.created} văn bản thành công`,
      });
      
      // Update preview data to show created documents count
      setResult(data);
      setCurrentStep('create');
      
      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error) => {
      console.error('DIRECT_CREATE: Error callback with error:', error);
      toast({
        title: "Lỗi tạo văn bản",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định",
        variant: "destructive",
      });
    }
  });

  const batchCreateMutation = useMutation({
    mutationFn: async ({ templateId, file }: { templateId: number; file: File }) => {
      console.log('BATCH_CREATE: Starting mutation with templateId:', templateId, 'file:', file.name);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiRequest('POST', `/api/templates/${templateId}/batch-create`, formData);
      const result = await response.json();
      console.log('BATCH_CREATE: Response received:', result);
      return result;
    },
    onSuccess: (data: BatchResult) => {
      console.log('BATCH_CREATE: Success callback called with data:', data);
      setResult(data);
      setCurrentStep('create');
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      
      toast({
        title: "Tạo văn bản hàng loạt hoàn tất",
        description: `Đã tạo thành công ${data.created}/${data.total} văn bản`,
      });
    },
    onError: (error) => {
      console.error('BATCH_CREATE: Error callback called with error:', error);
      toast({
        title: "Lỗi tạo văn bản hàng loạt",
        description: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định",
        variant: "destructive",
      });
    }
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    );
    
    if (excelFile) {
      setFile(excelFile);
    } else {
      toast({
        title: "File không hợp lệ",
        description: "Vui lòng chọn file Excel (.xlsx hoặc .xls)",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = async () => {
    if (!templateId) return;

    try {
      const blob = await exportExcelMutation.mutateAsync(templateId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Template_${templateName}_DataEntry.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Lỗi xuất Excel",
        description: "Không thể xuất file Excel. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  };

  const handleParseExcel = () => {
    if (!templateId || !file) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn file Excel trước khi phân tích",
        variant: "destructive",
      });
      return;
    }
    parseExcelMutation.mutate({ templateId, file });
  };

  const handleBatchCreate = () => {
    if (!templateId || !file) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn file Excel trước khi tạo văn bản",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Starting batch create with templateId:', templateId, 'file:', file.name);
    batchCreateMutation.mutate({ templateId, file });
  };

  const handleExportDocuments = () => {
    if (!templateId) return;
    exportDocumentsMutation.mutate({
      templateId,
      startDate: exportDateRange.startDate,
      endDate: exportDateRange.endDate
    });
  };

  const handleUpdateDocumentPreview = (index: number, field: string, value: string) => {
    setDocumentPreviews(prev => prev.map((doc, i) => 
      i === index 
        ? {
            ...doc,
            fields: doc.fields.map(f => 
              f.fieldName === field ? { ...f, fieldValue: value } : f
            )
          }
        : doc
    ));
  };

  const handleApproveDocument = (index: number) => {
    setDocumentPreviews(prev => prev.map((doc, i) => 
      i === index ? { ...doc, status: 'approved' as const } : doc
    ));
  };

  const handleRejectDocument = (index: number) => {
    setDocumentPreviews(prev => prev.map((doc, i) => 
      i === index ? { ...doc, status: 'rejected' as const } : doc
    ));
  };

  const handleCreateApprovedDocuments = () => {
    console.log('DIRECT_CREATE: Button clicked, checking approved documents');
    const approvedDocuments = documentPreviews.filter(doc => doc.status === 'approved');
    
    console.log('DIRECT_CREATE: Approved documents count:', approvedDocuments.length);
    console.log('DIRECT_CREATE: Total documents:', documentPreviews.length);
    
    if (approvedDocuments.length === 0) {
      toast({
        title: "Thông báo",
        description: "Không có văn bản nào được phê duyệt để tạo",
        variant: "destructive",
      });
      return;
    }

    if (!templateId) {
      toast({
        title: "Lỗi",
        description: "Không tìm thấy template ID",
        variant: "destructive",
      });
      return;
    }
    
    console.log('DIRECT_CREATE: Starting direct creation for template:', templateId);
    console.log('DIRECT_CREATE: Documents to create:', approvedDocuments);
    
    // Gọi mutation để tạo documents trực tiếp
    directCreateMutation.mutate({
      templateId,
      documents: approvedDocuments
    });
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setDocumentPreviews([]);
    setCurrentStep('upload');
    setSelectedPreviewIndex(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        style={{
          transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        <DialogHeader 
          className="cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5 text-gray-400" />
            <Upload className="h-5 w-5" />
            Quản lý văn bản hàng loạt - {templateName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={currentStep} onValueChange={(value) => setCurrentStep(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload & Parse
            </TabsTrigger>
            <TabsTrigger value="review" disabled={documentPreviews.length === 0} className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Review & Edit
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Tạo văn bản
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <FileDown className="h-4 w-4" />
              Xuất dữ liệu
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Upload & Parse Excel */}
          <TabsContent value="upload" className="space-y-6">
            <div className="space-y-4">
              {/* Step 1: Download Excel Template */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                      1
                    </div>
                    Tải xuống file Excel mẫu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">
                    Tải xuống file Excel mẫu để nhập dữ liệu cho các văn bản cần tạo hàng loạt.
                  </p>
                  <Button 
                    onClick={handleExportExcel}
                    disabled={exportExcelMutation.isPending}
                    className="w-full"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    {exportExcelMutation.isPending ? 'Đang tạo file Excel...' : 'Tải xuống Excel mẫu'}
                  </Button>
                </CardContent>
              </Card>

              {/* Step 2: Upload Excel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    Upload file Excel đã điền dữ liệu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDragOver
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {file ? (
                      <div className="space-y-2">
                        <FileSpreadsheet className="mx-auto h-8 w-8 text-green-600" />
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFile(null)}
                        >
                          Chọn file khác
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          Kéo thả file Excel vào đây hoặc
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Chọn file
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              setFile(files[0]);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {file && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        onClick={handleParseExcel}
                        disabled={parseExcelMutation.isPending}
                        className="flex-1"
                      >
                        {parseExcelMutation.isPending ? 'Đang phân tích...' : 'Phân tích và Preview'}
                      </Button>
                      <Button
                        onClick={handleBatchCreate}
                        disabled={batchCreateMutation.isPending}
                        variant="outline"
                        className="flex-1"
                      >
                        {batchCreateMutation.isPending ? 'Đang tạo...' : 'Tạo trực tiếp'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 2: Review & Edit Documents */}
          <TabsContent value="review" className="space-y-6">
            {documentPreviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Document List */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Danh sách văn bản ({documentPreviews.length})</span>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <GripVertical className="h-4 w-4" />
                        <span>Kéo thả để sắp xếp</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto">
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={documentPreviews.map((_, index) => `item-${index}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {documentPreviews.map((doc, index) => (
                            <SortableItem
                              key={`item-${index}`}
                              id={`item-${index}`}
                              index={index}
                              doc={doc}
                              isSelected={selectedPreviewIndex === index}
                              onSelect={() => setSelectedPreviewIndex(index)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </CardContent>
                </Card>

                {/* Document Editor */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Chỉnh sửa: {documentPreviews[selectedPreviewIndex]?.name}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveDocument(selectedPreviewIndex)}
                          disabled={documentPreviews[selectedPreviewIndex]?.status === 'approved'}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Duyệt
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectDocument(selectedPreviewIndex)}
                          disabled={documentPreviews[selectedPreviewIndex]?.status === 'rejected'}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Từ chối
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto">
                    {documentPreviews[selectedPreviewIndex] && (
                      <div className="space-y-3">
                        {documentPreviews[selectedPreviewIndex].fields.map((field, fieldIndex) => (
                          <div key={fieldIndex}>
                            <Label htmlFor={`field-${fieldIndex}`} className="text-sm font-medium">
                              {field.fieldName}
                            </Label>
                            <Textarea
                              id={`field-${fieldIndex}`}
                              value={field.fieldValue}
                              onChange={(e) => handleUpdateDocumentPreview(selectedPreviewIndex, field.fieldName, e.target.value)}
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Chưa có dữ liệu để preview. Vui lòng upload file Excel trước.</p>
                </CardContent>
              </Card>
            )}

            {documentPreviews.length > 0 && (
              <div className="flex justify-between">
                <div className="text-sm text-gray-500">
                  Đã duyệt: {documentPreviews.filter(doc => doc.status === 'approved').length} / {documentPreviews.length}
                </div>
                <Button 
                  onClick={handleCreateApprovedDocuments}
                  disabled={directCreateMutation.isPending}
                >
                  {directCreateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    "Tạo văn bản đã duyệt"
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Create Documents */}
          <TabsContent value="create" className="space-y-6">
            {result ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Đã hoàn tất tạo văn bản hàng loạt: {result.created} thành công / {result.total} tổng cộng
                  </AlertDescription>
                </Alert>

                {result.created > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-green-600">Văn bản đã tạo thành công ({result.created})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {result.documents.map((doc, index) => (
                          <div key={index} className="p-2 bg-green-50 border border-green-200 rounded">
                            <p className="text-sm font-medium">{doc.name}</p>
                            <p className="text-xs text-green-600">ID: {doc.id}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result.errors && result.errors.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-red-600">Lỗi khi tạo văn bản ({result.errors.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {result.errors.map((error, index) => (
                          <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-800">Dòng {error.row}: {error.error}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Chưa có dữ liệu tạo văn bản. Vui lòng upload và xử lý file Excel trước.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab 4: Export Documents Data */}
          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Xuất dữ liệu văn bản theo khoảng thời gian
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Xuất toàn bộ dữ liệu văn bản được tạo từ template này trong khoảng thời gian chỉ định.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Từ ngày</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={exportDateRange.startDate}
                      onChange={(e) => setExportDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Đến ngày</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={exportDateRange.endDate}
                      onChange={(e) => setExportDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleExportDocuments}
                  disabled={exportDocumentsMutation.isPending}
                  className="w-full"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {exportDocumentsMutation.isPending ? 'Đang xuất dữ liệu...' : 'Xuất dữ liệu ra Excel'}
                </Button>
                
                <div className="text-xs text-gray-500">
                  File Excel sẽ chứa thông tin chi tiết của tất cả văn bản được tạo từ template "{templateName}" 
                  trong khoảng thời gian từ {exportDateRange.startDate} đến {exportDateRange.endDate}.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default BatchCreateModal;