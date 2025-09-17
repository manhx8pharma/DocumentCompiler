import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj instanceof Date && !isNaN(dateObj.getTime())
      ? formatDistanceToNow(dateObj, { addSuffix: true })
      : '';
  } catch {
    return '';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getCategoryColor(category: string): string {
  switch (category.toLowerCase()) {
    case 'legal':
      return 'bg-green-100 text-green-800';
    case 'financial':
      return 'bg-yellow-100 text-yellow-800';
    case 'hr':
      return 'bg-purple-100 text-purple-800';
    case 'marketing':
      return 'bg-pink-100 text-pink-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function extractPlaceholders(text: string): string[] {
  const regex = /{{([^{}]+)}}/g;
  const placeholders: string[] = [];
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    placeholders.push(match[1]);
  }
  
  return placeholders;
}

export function getInitials(name: string): string {
  if (!name) return '';
  
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
