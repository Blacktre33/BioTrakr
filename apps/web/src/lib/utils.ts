import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string
 */
export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsedDate)) return 'Invalid date';
  return format(parsedDate, formatStr);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsedDate)) return 'Invalid date';
  return formatDistanceToNow(parsedDate, { addSuffix: true });
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format a percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    operational: 'bg-success-500',
    maintenance: 'bg-warning-500',
    critical: 'bg-critical-500',
    offline: 'bg-gray-500',
    decommissioned: 'bg-gray-600',
    compliant: 'bg-success-500',
    non_compliant: 'bg-critical-500',
    pending_review: 'bg-warning-500',
    scheduled: 'bg-primary-500',
    in_progress: 'bg-accent-500',
    completed: 'bg-success-500',
    overdue: 'bg-critical-500',
    cancelled: 'bg-gray-500',
  };
  return colors[status] || 'bg-gray-500';
}

/**
 * Get priority color class
 */
export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'text-success-500 bg-success-500/20',
    medium: 'text-primary-400 bg-primary-500/20',
    high: 'text-warning-500 bg-warning-500/20',
    urgent: 'text-critical-500 bg-critical-500/20',
    critical: 'text-critical-500 bg-critical-500/20',
  };
  return colors[priority] || 'text-gray-400 bg-gray-500/20';
}

/**
 * Get risk level color
 */
export function getRiskColor(risk: string): string {
  const colors: Record<string, string> = {
    low: 'text-success-500',
    medium: 'text-warning-500',
    high: 'text-orange-500',
    critical: 'text-critical-500',
  };
  return colors[risk] || 'text-gray-400';
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate health score color
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 90) return 'text-success-500';
  if (score >= 70) return 'text-accent-400';
  if (score >= 50) return 'text-warning-500';
  return 'text-critical-500';
}

/**
 * Calculate progress bar color
 */
export function getProgressColor(value: number): string {
  if (value >= 90) return 'bg-success-500';
  if (value >= 70) return 'bg-accent-500';
  if (value >= 50) return 'bg-warning-500';
  return 'bg-critical-500';
}
