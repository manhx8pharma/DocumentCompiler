import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudUpload, Grip } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Draggable from 'react-draggable';

interface UploadTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  category: z.enum(["legal", "financial", "hr", "marketing", "other"]),
  description: z.string().optional(),
  file: z.instanceof(File).refine((file) => {
    return file.size <= 10 * 1024 * 1024; // 10MB
  }, "File size must be less than 10MB")
    .refine((file) => {
      return file.name.endsWith('.docx');
    }, "Only DOCX files are allowed")
});

type FormValues = z.infer<typeof formSchema>;

const UploadTemplateModal: React.FC<UploadTemplateModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const nodeRef = useRef(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      category: 'legal',
      description: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsUploading(true);
    
    try {
      if (!data.file) {
        throw new Error("Please select a file to upload");
      }
      
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('category', data.category);
      if (data.description) {
        formData.append('description', data.description);
      }
      formData.append('file', data.file);
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(
          errorData.message || 
          (errorData.errors && errorData.errors.length > 0 ? errorData.errors[0].message : 'Failed to upload template')
        );
      }
      
      toast({
        title: "Success",
        description: "Template uploaded successfully!",
      });
      
      // Invalidate templates query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      
      // Reset form and close modal
      form.reset();
      onClose();
      
      // Force refresh the templates list
      window.location.reload();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload template. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue('file', file, { shouldValidate: true });
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Draggable handle=".drag-handle" bounds="body" nodeRef={nodeRef}>
        <DialogContent 
          ref={nodeRef} 
          className="w-[95vw] max-w-[95vw] sm:max-w-lg md:max-w-2xl rounded-lg p-4 sm:p-6 overflow-auto max-h-[90vh] bg-white shadow-lg"
          onPointerDownCapture={(e) => e.stopPropagation()}
          aria-describedby="upload-template-description"
        >
          <div className="drag-handle cursor-move absolute top-0 left-0 right-0 h-10 flex items-center justify-center">
            <Grip className="h-5 w-5 text-gray-400" />
          </div>
          
          <DialogHeader className="pb-4 mt-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <CloudUpload className="h-6 w-6 text-blue-600" />
              Upload Template
            </DialogTitle>
            <DialogDescription id="upload-template-description" className="text-base text-gray-600">
              Upload a DOCX file to create a new template. The system will scan for placeholders using double curly braces format.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Template Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Employment Contract" 
                        className="w-full px-3 py-2 rounded-md"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Category</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full rounded-md">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="financial">Financial</SelectItem>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of the template"
                        className="resize-none w-full px-3 py-2 rounded-md"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="file"
                render={({ field: { value, onChange, name, ...fieldProps } }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Template File</FormLabel>
                    <FormControl>
                      <div className="mt-1 flex justify-center px-4 sm:px-6 py-4 sm:py-5 border-2 border-gray-300 border-dashed rounded-md">
                        <div className="space-y-2 text-center">
                          <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="flex flex-col sm:flex-row items-center justify-center text-sm text-gray-600">
                            <label
                              htmlFor="file-upload"
                              className="relative cursor-pointer bg-white rounded-md font-medium text-primary hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                            >
                              <span>Upload a file</span>
                              <input
                                id="file-upload"
                                type="file"
                                className="sr-only"
                                onChange={handleFileChange}
                                accept=".docx"
                                {...fieldProps}
                              />
                            </label>
                            <p className="pl-1 mt-1 sm:mt-0">or drag and drop</p>
                          </div>
                          <p className="text-xs text-gray-500">
                            DOCX format only, 10MB max
                          </p>
                          {value && (
                            <p className="mt-2 text-sm text-gray-600 break-all">
                              Selected: {value.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />
              
              <DialogFooter className="flex flex-col sm:flex-row gap-3 sm:gap-2 mt-6 pt-4 border-t border-gray-200">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white order-1 sm:order-2"
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Uploading...
                    </span>
                  ) : 'Upload Template'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Draggable>
    </Dialog>
  );
};

export default UploadTemplateModal;